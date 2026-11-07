import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const phases = ["normal-steady", "growth", "reorganize", "large-steady"]
const isAction = (phase) => phase === "growth" || phase === "reorganize"
const software = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render|\bwarp\b/i
const framing = (phase) => isAction(phase) ? "camera preserved from initial 20-agent Fit all"
  : `explicit Fit all of ${phase === "normal-steady" ? 20 : 100}-agent layout`

/** Check #34's reference captures; derive the budget from raw, unclamped intervals. */
export function checkPaperLayoutBudget(report) {
  function require(condition, message) {
    if (!condition) throw new Error(`Invalid reference evidence: ${message}`)
  }
  require(report?.schemaVersion === 1 && report.status === "complete", "expected a complete schema-1 report")
  const settings = report.settings
  require(settings?.repetitions === 3 && settings.warmupMs === 15000 && settings.sampleMs === 10000 && settings.actionMs === 5000,
    "expected three repetitions, 15s warm-up, 10s steady captures and 5s action captures")
  require(settings.viewport?.width === 1280 && settings.viewport?.height === 800 && settings.dpr === 1, "expected 1280×800 at DPR 1")
  require(/Apple M5 Max/.test(report.device?.gpu ?? "") && report.device?.memory === "128 GB", "expected the M5 Max / 128 GB reference device")
  // Build mode is recorded by the operator; the companion profile records bundle hashes.
  require(/production/i.test(report.device?.buildMode ?? ""), "missing production-build metadata")
  const acceleration = report.acceleration
  require(acceleration?.verified === true && /Apple M5 Max/.test(acceleration.renderer ?? "") && !software.test(acceleration.renderer),
    "reference hardware renderer is not verified")
  require(/^enabled/.test(acceleration.webgl ?? "") && /^enabled/.test(report.gpu?.featureStatus?.webgl ?? ""), "WebGL is not enabled")
  require(Array.isArray(report.runs) && report.runs.length === 12, "expected all twelve captures")

  const results = report.runs.map((run, index) => {
    const phase = phases[index % phases.length], repetition = Math.floor(index / phases.length) + 1
    const name = `${repetition} ${phase}`, duration = isAction(phase) ? 5000 : 10000
    require(run.phase === phase && run.repetition === repetition, `missing or out-of-order capture ${name}`)
    require(run.requestedDurationMs === duration, `${name}: incorrect capture duration`)
    require(run.agents === (phase === "normal-steady" ? 20 : 100) && run.tasks === run.agents * 1.5, `${name}: incorrect workload`)
    require(run.environment?.dpr === 1 && run.environment?.visibility === "visible" && run.environment?.renderer === acceleration.renderer,
      `${name}: hardware, DPR or visibility differs`)
    require(run.framing?.elevationDegrees === 38 && run.framing.mode === framing(phase), `${name}: incorrect framing`)
    require(Array.isArray(run.errors) && run.errors.length === 0, `${name}: browser errors`)
    const intervals = run.intervalsMs
    require(Array.isArray(intervals) && intervals.length > 0 && intervals.every((value) => Number.isFinite(value) && value > 0), `${name}: missing or invalid raw intervals`)
    const elapsedMs = intervals.reduce((sum, value) => sum + value, 0)
    // Capture stops at the first RAF at or beyond its requested duration.
    require(elapsedMs >= duration && elapsedMs - duration < intervals.at(-1) + 1e-6, `${name}: raw intervals do not span the requested capture`)
    const sorted = [...intervals].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
    return { repetition, phase, frames: intervals.length, elapsedMs,
      fps: 1000 * intervals.length / elapsedMs,
      medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
      maxMs: sorted.at(-1), over33ms: intervals.filter((value) => value > 1000 / 30).length,
      over50ms: intervals.filter((value) => value > 50).length }
  })
  const failures = results.filter((run) => isAction(run.phase) && run.maxMs > 50)
  return { results, failures }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node tools/check-paper-layout-budget.mjs <measurements.json>")
    const { results, failures } = checkPaperLayoutBudget(JSON.parse(await readFile(process.argv[2], "utf8")))
    for (const result of results) console.log(JSON.stringify(result))
    console.log("Steady targets: normal 60 fps / large 30 fps; compare the raw cadence above with the baseline. Headless RAF cadence is not physical display throughput.")
    if (failures.length) {
      console.error(`FAIL: ${failures.length} action capture(s) exceed the strict 50 ms maximum.`)
      process.exitCode = 1
    } else console.log("PASS: every growth and Reorganize interval is at most 50 ms in all three five-second captures.")
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
