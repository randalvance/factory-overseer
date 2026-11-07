import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// Resolve the source-map reader already installed with the current Vite toolchain.
// No new application dependency is needed for this diagnostic script.
const { TraceMap, originalPositionFor } = createRequire(import.meta.resolve("vite"))("@jridgewell/trace-mapping")
function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
function httpUrl(name) {
  const url = new URL(required(name))
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`${name} must be an HTTP(S) URL without credentials`)
  return url
}
const cdp = httpUrl("PAPER_CDP_URL"), base = httpUrl("PAPER_BASE_URL")
const outputDir = resolve(required("PAPER_MEASURE_DIR"))
const buildDir = resolve(process.env.PAPER_BUILD_DIR ?? "/tmp/factory-overseer-paper-benchmark")
const settings = { warmupMs: 15000, actionMs: 5000, samplingIntervalUs: 1000, viewport: { width: 1280, height: 800 }, dpr: 1 }
await mkdir(outputDir, { recursive: true })
if ((await readdir(outputDir)).length) throw new Error("PAPER_MEASURE_DIR must be empty")
const hash = (value) => createHash("sha256").update(value).digest("hex")
const git = (...args) => execFileSync("git", args, { encoding: "utf8" })
const issue = Number(process.env.PAPER_ISSUE ?? 33)
if (!Number.isSafeInteger(issue) || issue < 1) throw new Error("PAPER_ISSUE must be a positive integer")
const report = { schemaVersion: 1, issue, startedAt: new Date().toISOString(), status: "running", settings,
  source: { revision: git("rev-parse", "HEAD").trim(), dirtyPaths: git("status", "--porcelain=v1").trim().split("\n").filter(Boolean),
    trackedDiffSha256: hash(git("diff", "--binary", "HEAD")) }, bundles: [], profiles: [] }
const save = () => writeFile(join(outputDir, "profile-summary.json"), JSON.stringify(report, null, 2) + "\n")
await save()
async function endpoint() {
  const { address } = await lookup(cdp.hostname)
  const url = new URL("/json/version", cdp)
  url.hostname = address.includes(":") ? `[${address}]` : address
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`)
  const version = await response.json(), socket = new URL(version.webSocketDebuggerUrl)
  socket.hostname = url.hostname; socket.port = url.port
  return socket.href
}
const maps = new Map()
function location(frame) {
  const map = maps.get(frame.url)
  const original = map && frame.lineNumber >= 0 ? originalPositionFor(map, { line: frame.lineNumber + 1, column: Math.max(frame.columnNumber, 0) }) : undefined
  let source = original?.source ?? frame.url
  if (source?.startsWith("file:")) source = relative(process.cwd(), fileURLToPath(source))
  return { function: original?.name || frame.functionName || "(anonymous)", source: source || "(runtime)",
    line: original?.line ?? frame.lineNumber + 1, column: original?.column ?? frame.columnNumber,
    mapped: Boolean(original?.source) }
}
function summarize(profile, windowMs = Infinity) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node])), parents = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id)
  const functions = new Map(), locations = new Map()
  for (const node of profile.nodes) {
    const entry = location(node.callFrame), key = JSON.stringify(entry)
    locations.set(node.id, key)
    if (!functions.has(key)) functions.set(key, { ...entry, selfMs: 0, inclusiveMs: 0 })
  }
  if (profile.samples?.length !== profile.timeDeltas?.length) throw new Error("CPU profile samples and deltas do not match")
  const totals = { sampleCount: 0, sampledMs: 0, javascriptMs: 0, idleMs: 0, garbageCollectionMs: 0, unattributedMs: 0 }
  for (let i = 0; i < profile.samples.length; i++) {
    if (totals.sampledMs >= windowMs) break
    const id = profile.samples[i], ms = Math.min(profile.timeDeltas[i] / 1000, windowMs - totals.sampledMs), node = nodes.get(id)
    if (!node) throw new Error(`CPU profile refers to missing node ${id}`)
    totals.sampleCount++
    totals.sampledMs += ms
    functions.get(locations.get(id)).selfMs += ms
    const stack = new Set(), visited = new Set()
    let current = id, javascript = false
    while (current !== undefined && !visited.has(current)) {
      visited.add(current)
      stack.add(locations.get(current))
      javascript ||= Boolean(nodes.get(current)?.callFrame.url)
      current = parents.get(current)
    }
    for (const key of stack) functions.get(key).inclusiveMs += ms
    const name = node.callFrame.functionName
    if (name === "(idle)") totals.idleMs += ms
    else if (name === "(garbage collector)") totals.garbageCollectionMs += ms
    else if (javascript) totals.javascriptMs += ms
    else totals.unattributedMs += ms
  }
  const entries = [...functions.values()].filter((entry) => !["(root)", "(idle)"].includes(entry.function))
  const top = (field) => entries.filter((entry) => entry[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, 20)
  return { wallDurationMs: Math.min((profile.endTime - profile.startTime) / 1000, windowMs), ...totals, topSelf: top("selfMs"), topInclusive: top("inclusiveMs") }
}
async function assertNoInput(page) {
  const inputs = await page.evaluate(() => window.__paperBenchmarkInputs)
  if (inputs.length) throw new Error(`Trusted page input invalidated the run: ${JSON.stringify(inputs)}`)
}
let browser, context
try {
  browser = await chromium.connectOverCDP(await endpoint())
  const browserSession = await browser.newBrowserCDPSession()
  report.browser = await browserSession.send("Browser.getVersion")
  const { gpu } = await browserSession.send("SystemInfo.getInfo")
  report.gpu = { devices: gpu.devices.map(({ vendorId, deviceId, vendorString, deviceString, driverVendor, driverVersion }) => ({ vendorId, deviceId, vendorString, deviceString, driverVendor, driverVersion })),
    renderer: gpu.auxAttributes?.glRenderer, vendor: gpu.auxAttributes?.glVendor, featureStatus: gpu.featureStatus }
  await browserSession.detach()
  context = await browser.newContext({ viewport: settings.viewport, deviceScaleFactor: settings.dpr })
  context.setDefaultTimeout(120000)
  await context.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }))
  const page = await context.newPage(), errors = [], furnishings = new Set()
  await page.addInitScript(() => {
    window.__paperBenchmarkInputs = []
    for (const type of ["wheel", "keydown", "pointerdown", "touchstart", "pointermove"]) {
      addEventListener(type, (event) => {
        if (!event.isTrusted || (type === "pointermove" && !event.buttons)) return
        if (window.__paperBenchmarkInputs.length < 20) window.__paperBenchmarkInputs.push({ type, atMs: performance.now() })
      }, { capture: true, passive: true })
    }
  })
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()} ${message.location().url}`) })
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`))
  page.on("response", (response) => {
    if (!response.ok()) errors.push(`response: ${response.status()} ${response.url()}`)
    if (/\/assets\/models\/room-themes\/[^/]+\.glb$/.test(new URL(response.url()).pathname) && response.ok()) furnishings.add(response.url())
  })
  await page.bringToFront()
  await page.goto(new URL("/e2e/fixtures/paper.html", base).href, { waitUntil: "networkidle" })
  await page.waitForSelector('[data-drawn="1"]')
  if (furnishings.size !== 4) throw new Error(`Expected four furnishing GLBs, got ${furnishings.size}`)
  report.renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2"), debug = gl.getExtension("WEBGL_debug_renderer_info")
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
  if (/swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render|\bwarp\b/i.test(report.renderer) ||
      !/apple|nvidia|geforce|radeon|\bamd\b|intel|adreno|mali|powervr/i.test(report.renderer) || !/^enabled/.test(report.gpu.featureStatus?.webgl ?? "")) throw new Error("Hardware WebGL not verified")
  // Hash the served bundle in the browser, then verify the local map belongs to it.
  const bundles = await page.evaluate(async () => Promise.all([...document.scripts].filter((script) => script.src).map(async (script) => {
    const response = await fetch(script.src)
    if (!response.ok) throw new Error(`Cannot read bundle: ${script.src}`)
    const bytes = await response.arrayBuffer(), digest = await crypto.subtle.digest("SHA-256", bytes)
    return { url: script.src, sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("") }
  })))
  for (const bundle of bundles) {
    const path = new URL(bundle.url).pathname.replace(/^\//, ""), local = join(buildDir, path)
    const bytes = await readFile(local), mapPath = `${local}.map`, mapBytes = await readFile(mapPath)
    if (hash(bytes) !== bundle.sha256) throw new Error(`Served bundle differs from local build: ${path}`)
    maps.set(bundle.url, new TraceMap(JSON.parse(mapBytes.toString("utf8")), pathToFileURL(mapPath).href))
    report.bundles.push({ url: bundle.url, file: path, sha256: bundle.sha256, sourceMapFile: `${path}.map`, sourceMapSha256: hash(mapBytes) })
  }
  await save()
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim() === "Fit all")
    if (!button || button.disabled) throw new Error("Fit all is unavailable")
    button.click() // Synthetic host action; trusted human input remains an invalidation.
  })
  await page.waitForTimeout(settings.warmupMs)
  const session = await context.newCDPSession(page)
  await session.send("Profiler.enable")
  await session.send("Profiler.setSamplingInterval", { interval: settings.samplingIntervalUs })
  for (const [phase, action] of [["growth", "Grow to 100 agents"], ["reorganize", "Reorganize"]]) {
    await assertNoInput(page)
    if (errors.length) throw new Error(errors.join("\n"))
    if (await page.getByRole("alert").count()) throw new Error("Fixture reports a routing/validation alert")
    await session.send("Profiler.start")
    const actionTiming = await page.evaluate(({ action, duration }) => new Promise((resolve, reject) => {
      let frame, timer, timeout, settled = false
      function finish(error, value) {
        if (settled) return
        settled = true; cancelAnimationFrame(frame); clearTimeout(timer); clearTimeout(timeout)
        document.removeEventListener("visibilitychange", onVisibility)
        if (error) reject(new Error(error)); else resolve(value)
      }
      const onVisibility = () => { if (document.visibilityState !== "visible") finish("Profile tab became hidden") }
      document.addEventListener("visibilitychange", onVisibility)
      if (document.visibilityState !== "visible") return finish("Profile tab is hidden")
      timeout = setTimeout(() => finish("Profile action timed out"), duration + 30000)
      frame = requestAnimationFrame(() => {
        if (settled) return
        if (window.__paperBenchmarkInputs.length) return finish(`Trusted page input invalidated the run: ${JSON.stringify(window.__paperBenchmarkInputs)}`)
        const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.trim() === action)
        if (!button || button.disabled) return finish(`Action unavailable: ${action}`)
        const started = performance.now()
        button.click()
        const dispatched = performance.now()
        timer = setTimeout(() => {
          if (window.__paperBenchmarkInputs.length) return finish(`Trusted page input invalidated the run: ${JSON.stringify(window.__paperBenchmarkInputs)}`)
          finish(undefined, { startedAtPerformanceMs: started, dispatchDurationMs: dispatched - started, observedDurationMs: performance.now() - started })
        }, Math.max(0, duration - (dispatched - started)))
      })
    }), { action, duration: settings.actionMs })
    const { profile } = await session.send("Profiler.stop")
    await assertNoInput(page)
    const file = `${phase}.cpuprofile`
    await writeFile(join(outputDir, file), JSON.stringify(profile) + "\n")
    report.profiles.push({ phase, action, actionTiming, rawProfile: file, ...summarize(profile), firstSecond: summarize(profile, 1000) })
    await save()
    if (errors.length) throw new Error(errors.join("\n"))
    if (await page.getByRole("alert").count()) throw new Error("Fixture reports a routing/validation alert")
    const counts = await page.getByLabel("Counts", { exact: true }).innerText()
    if (!counts.includes("100 agents") || !counts.includes("150 in flight")) throw new Error(`Unexpected workload: ${counts}`)
    console.log(JSON.stringify({ phase, topSelf: report.profiles.at(-1).topSelf.slice(0, 3) }))
    if (phase === "growth") await page.waitForTimeout(settings.warmupMs)
  }
  await session.send("Profiler.disable")
  await session.detach()
  report.method = "Trusted page input invalidates the run; Fit all is invoked once before warm-up, and its pose is preserved through growth/Reorganize. Separate diagnostic run; CPU sampling perturbs timing. Self time assigns each sample delta to its leaf function; inclusive time assigns it to every distinct function on the sampled stack (recursive occurrences counted once). The firstSecond summary clips sample deltas at 1000 ms from CPU profile start; it includes a small pre-action CDP/evaluate/RAF scheduling interval. Original source locations use matching production source maps. JavaScript includes samples with a script frame on the stack; idle, GC and unattributed samples are reported separately. These are sampling estimates, not exact function durations, GPU execution measurements, or replacement baseline frame rates. Raw Chrome CPU profiles are retained."
  report.status = "complete"; report.finishedAt = new Date().toISOString()
  await save()
} catch (error) {
  report.status = "failed"; report.failure = { message: error.message, at: new Date().toISOString() }
  await save()
  throw error
} finally {
  await context?.close()
  // connectOverCDP close disconnects the transport rather than quitting native Chrome.
  await browser?.close()
}
