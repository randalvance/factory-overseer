import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
function duration(name, fallback, minimum = 1000, maximum = 120000) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  return value
}
function httpUrl(name) {
  const url = new URL(required(name))
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`${name} must be an HTTP(S) URL without credentials`)
  return url
}
const cdp = httpUrl("PAPER_CDP_URL")
const base = httpUrl("PAPER_BASE_URL")
const outputDir = resolve(required("PAPER_MEASURE_DIR"))
const device = JSON.parse(await readFile(required("PAPER_DEVICE_FILE"), "utf8"))
if (!device || Array.isArray(device) || typeof device !== "object") throw new Error("PAPER_DEVICE_FILE must contain a metadata object")
const settings = {
  repetitions: duration("PAPER_REPETITIONS", 3, 1, 10),
  warmupMs: duration("PAPER_WARMUP_MS", 15000),
  sampleMs: duration("PAPER_SAMPLE_MS", 10000),
  actionMs: duration("PAPER_ACTION_MS", 5000),
  viewport: { width: 1280, height: 800 }, dpr: 1,
}
await mkdir(outputDir, { recursive: true })
if ((await readdir(outputDir)).length) throw new Error("PAPER_MEASURE_DIR must be empty; historical evidence is never overwritten")
const hash = (value) => createHash("sha256").update(value).digest("hex")
const git = (...args) => execFileSync("git", args, { encoding: "utf8" })
const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
const source = {
  revision: git("rev-parse", "HEAD").trim(),
  dirtyPaths: git("status", "--porcelain=v1").trim().split("\n").filter(Boolean),
  trackedDiffSha256: hash(git("diff", "--binary", "HEAD")),
  lockfileSha256: hash(await readFile("bun.lock")),
  untracked: await Promise.all(untracked.map(async (path) => ({ path, sha256: hash(await readFile(path)) }))),
}
const issue = Number(process.env.PAPER_ISSUE ?? 33)
if (!Number.isSafeInteger(issue) || issue < 1) throw new Error("PAPER_ISSUE must be a positive integer")
const report = { schemaVersion: 1, issue, startedAt: new Date().toISOString(), status: "running", settings, device, source, runs: [] }
const save = () => writeFile(join(outputDir, "measurements.json"), JSON.stringify(report, null, 2) + "\n")
await save()

// Chrome rejects non-local Host names. Resolve the container's host alias to an IP.
async function endpoint() {
  const { address } = await lookup(cdp.hostname)
  const url = new URL("/json/version", cdp)
  url.hostname = address.includes(":") ? `[${address}]` : address
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`)
  const version = await response.json()
  const socket = new URL(version.webSocketDebuggerUrl)
  socket.hostname = url.hostname
  socket.port = url.port
  return socket.href
}
function summary(intervals) {
  if (!intervals.length) throw new Error("No frame intervals captured")
  const sorted = [...intervals].sort((a, b) => a - b)
  const total = intervals.reduce((sum, value) => sum + value, 0)
  const middle = Math.floor(sorted.length / 2)
  return { frames: intervals.length, elapsedMs: total, meanMs: total / intervals.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1), fps: 1000 * intervals.length / total,
    over33ms: intervals.filter((value) => value > 1000 / 30).length,
    over50ms: intervals.filter((value) => value > 50).length }
}
const furnishings = ["lab-specimen-cabinet", "foundry-press", "factory-parts-organizer", "fabrication-paper-cutter"]
const software = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render|\bwarp\b/i
function hardware(renderer, gpu) {
  const knownGpu = /apple|nvidia|geforce|radeon|\bamd\b|intel|adreno|mali|powervr/i.test(renderer)
  const webgl = gpu.featureStatus?.webgl
  if (software.test(renderer) || !knownGpu || !/^enabled/.test(webgl ?? "")) {
    throw new Error(`Hardware WebGL not verified: renderer=${renderer}; webgl=${webgl}`)
  }
  return { verified: true, renderer, webgl, method: "Unmasked renderer identifies a GPU, excludes known software renderers, and CDP reports WebGL enabled" }
}
async function assertNoInput(page) {
  const inputs = await page.evaluate(() => window.__paperBenchmarkInputs)
  if (inputs.length) throw new Error(`Trusted page input invalidated the run: ${JSON.stringify(inputs)}`)
}
let browser, context
try {
  browser = await chromium.connectOverCDP(await endpoint())
  const session = await browser.newBrowserCDPSession()
  report.browser = await session.send("Browser.getVersion")
  const { gpu } = await session.send("SystemInfo.getInfo")
  const pick = (object, keys) => Object.fromEntries(keys.filter((key) => object?.[key] !== undefined).map((key) => [key, object[key]]))
  report.gpu = { devices: gpu.devices.map((entry) => pick(entry, ["vendorId", "deviceId", "vendorString", "deviceString", "driverVendor", "driverVersion"])),
    auxAttributes: pick(gpu.auxAttributes, ["glRenderer", "glVendor", "glVersion", "displayType", "glImplementationParts"]), featureStatus: gpu.featureStatus }
  await session.detach()
  await save()
  context = await browser.newContext({ viewport: settings.viewport, deviceScaleFactor: settings.dpr })
  context.setDefaultTimeout(120000)
  // The browser may request an auxiliary icon that the benchmark fixture does not provide.
  await context.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }))
  for (let repetition = 1; repetition <= settings.repetitions; repetition++) {
    for (const large of [false, true]) {
      const page = await context.newPage()
      await page.addInitScript(() => {
        window.__paperBenchmarkInputs = []
        for (const type of ["wheel", "keydown", "pointerdown", "touchstart", "pointermove"]) {
          addEventListener(type, (event) => {
            if (!event.isTrusted || (type === "pointermove" && !event.buttons)) return
            if (window.__paperBenchmarkInputs.length < 20) window.__paperBenchmarkInputs.push({ type, atMs: performance.now() })
          }, { capture: true, passive: true })
        }
      })
      const errors = [], assets = new Set()
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
      page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()} ${message.location().url}:${message.location().lineNumber}`) })
      page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`))
      page.on("response", (response) => {
        if (response.status() < 200 || response.status() >= 300) errors.push(`response: ${response.status()} ${response.request().resourceType()} ${response.url()}`)
        for (const name of furnishings) if (new URL(response.url()).pathname.endsWith(`/room-themes/${name}.glb`) && response.ok()) assets.add(name)
      })
      await page.bringToFront()
      const fixture = new URL("/e2e/fixtures/paper.html", base)
      if (large) fixture.search = "large"
      await page.goto(fixture.href, { waitUntil: "networkidle" })
      await page.waitForSelector('[data-drawn="1"]')
      if (assets.size !== furnishings.length) throw new Error(`Expected four furnishing GLBs, received ${[...assets].join(", ")}`)
      const environment = await page.evaluate(() => {
        const canvas = document.querySelector("canvas"), gl = canvas?.getContext("webgl2")
        if (!gl) throw new Error("No WebGL2 canvas")
        const debug = gl.getExtension("WEBGL_debug_renderer_info")
        return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          userAgent: navigator.userAgent, dpr: devicePixelRatio, visibility: document.visibilityState }
      })
      report.acceleration = hardware(environment.renderer, report.gpu)
      if (environment.dpr !== settings.dpr) throw new Error("Unexpected device pixel ratio")
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim() === "Fit all")
        if (!button || button.disabled) throw new Error("Fit all is unavailable")
        button.click() // Synthetic host action; trusted human input remains an invalidation.
      })
      await page.waitForTimeout(settings.warmupMs)
      async function capture(phase, action, agents) {
        await assertNoInput(page)
        if (errors.length) throw new Error(errors.join("\n"))
        if (await page.getByRole("alert").count()) throw new Error("Fixture reports a routing/validation alert")
        const beforeDraws = await page.getByRole("img", { name: "Factory floor" }).getAttribute("data-drawn")
        const durationMs = action ? settings.actionMs : settings.sampleMs
        const measured = await page.evaluate(({ durationMs, action, beforeDraws }) => new Promise((resolve, reject) => {
          const intervals = [], resourceSamples = []
          let previous, start, actionTiming, lastMetric = window.samples.at(-1), skipMetric = true, stopped = false, frameId
          const onVisibility = () => { if (document.visibilityState !== "visible") fail("Benchmark tab became hidden") }
          const timeout = setTimeout(() => fail("Frame capture timed out"), durationMs + 30000)
          function cleanup() { stopped = true; clearTimeout(timeout); cancelAnimationFrame(frameId); document.removeEventListener("visibilitychange", onVisibility) }
          function fail(message) { cleanup(); reject(new Error(message)) }
          document.addEventListener("visibilitychange", onVisibility)
          function frame(time) {
            if (stopped) return
            if (window.__paperBenchmarkInputs.length) return fail(`Trusted page input invalidated the run: ${JSON.stringify(window.__paperBenchmarkInputs)}`)
            if (!action && document.querySelector("[data-drawn]")?.getAttribute("data-drawn") !== beforeDraws) return fail("Layout changed during a steady measurement")
            if (document.visibilityState !== "visible") return fail("Benchmark tab is hidden")
            if (previous !== undefined) intervals.push(time - previous)
            previous = time
            if (start === undefined) {
              start = time
              if (action) {
                const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim() === action)
                if (!button || button.disabled) return fail(`Action unavailable: ${action}`)
                const began = performance.now()
                button.click()
                actionTiming = { dispatchedAfterStartMs: began - start, dispatchDurationMs: performance.now() - began }
              }
            }
            const metric = window.samples.at(-1)
            if (metric && metric !== lastMetric) {
              lastMetric = metric
              // A 30-frame bucket can straddle the sample boundary; omit the first.
              if (skipMetric) skipMetric = false
              else resourceSamples.push({ atMs: time - start, ...metric })
            }
            if (time - start < durationMs) frameId = requestAnimationFrame(frame)
            else { cleanup(); resolve({ intervalsMs: intervals, resourceSamples, actionTiming, startedAtPerformanceMs: start }) }
          }
          frameId = requestAnimationFrame(frame)
        }), { durationMs, action, beforeDraws })
        await assertNoInput(page)
        if (errors.length) throw new Error(errors.join("\n"))
        if (await page.getByRole("alert").count()) throw new Error("Fixture reports a routing/validation alert")
        const counts = await page.getByLabel("Counts", { exact: true }).innerText()
        if (!counts.includes(`${agents} agents`) || !counts.includes(`${agents * 1.5} in flight`)) throw new Error(`Unexpected workload: ${counts}`)
        const afterDraws = await page.getByRole("img", { name: "Factory floor" }).getAttribute("data-drawn")
        if (!action && afterDraws !== beforeDraws) throw new Error("Layout changed during a steady measurement")
        if (action && afterDraws === beforeDraws) throw new Error(`Action did not draw: ${action}`)
        const canvas = await page.locator("canvas").evaluate((element) => ({ cssWidth: element.clientWidth, cssHeight: element.clientHeight,
          drawingBufferWidth: element.width, drawingBufferHeight: element.height, rect: element.getBoundingClientRect().toJSON() }))
        const screenshot = `${repetition}-${phase}.png`
        const run = { repetition, phase, agents, tasks: agents * 1.5, requestedDurationMs: durationMs, environment, canvas, counts,
          framing: { elevationDegrees: 38, mode: large ? "explicit Fit all of 100-agent layout" : phase === "normal-steady" ? "explicit Fit all of 20-agent layout" : "camera preserved from initial 20-agent Fit all",
            limitation: "Visible viewport only. Screenshot records the framing; this is not a claim that all stations or tasks are visible." },
          summary: summary(measured.intervalsMs), ...measured, screenshot, errors: [...errors] }
        report.runs.push(run)
        await save()
        await page.screenshot({ path: join(outputDir, screenshot) })
        await assertNoInput(page)
        console.log(JSON.stringify({ repetition, phase, ...run.summary }))
      }
      await capture(large ? "large-steady" : "normal-steady", undefined, large ? 100 : 20)
      if (!large) {
        await capture("growth", "Grow to 100 agents", 100)
        await page.waitForLoadState("networkidle")
        await page.waitForTimeout(settings.warmupMs)
        await capture("reorganize", "Reorganize", 100)
      }
      await page.close()
    }
  }
  report.aggregate = Object.fromEntries(["normal-steady", "large-steady", "growth", "reorganize"].map((phase) => [phase,
    summary(report.runs.filter((run) => run.phase === phase).flatMap((run) => run.intervalsMs))]))
  report.method = { inputGuard: "Trusted page wheel/key/pointer/touch input invalidates warm-up and capture. Fit all is invoked once before warm-up; growth/Reorganize preserve that pose. Steady captures reject layout redraws.", frameIntervals: "Unclamped requestAnimationFrame timestamp deltas; browser frame cadence, not isolated CPU/GPU render duration",
    resourceMetrics: "Existing onRenderMetrics buckets sampled every 30 rendered frames; first bucket per capture discarded because it may cross the capture boundary",
    textureBytes: "Estimated source texture bytes only; excludes shadow maps, framebuffers and driver allocations",
    actionTiming: "DOM click dispatch timing only; synchronous layout/rebuild stalls are included in raw frame intervals",
    percentiles: "Median uses the middle value/pair; p95 uses nearest rank. Aggregate pools raw intervals across repetitions.",
    targets: { "normal-steady": 60, "large-steady": 30 },
    limitations: "Benchmark fixtures render working agents and stationary assigned/queued tasks. This does not benchmark a live host or all possible task traffic." }
  report.status = "complete"
  report.finishedAt = new Date().toISOString()
  await save()
} catch (error) {
  report.status = "failed"
  report.failure = { message: error.message, at: new Date().toISOString() }
  await save()
  throw error
} finally {
  await context?.close()
  // For connectOverCDP, close disconnects the transport; it does not send Browser.close.
  await browser?.close()
}
