import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { checkPaperLayoutBudget } from "./check-paper-layout-budget.mjs"

const baseline = JSON.parse(await readFile(new URL("../docs/performance/2026-11-07-hardware/measurements.json", import.meta.url), "utf8"))
function withinBudget() {
  const report = structuredClone(baseline)
  for (const run of report.runs) run.intervalsMs = [50, ...Array((run.requestedDurationMs - 50) / 10).fill(10)]
  return report
}

test("the unchanged reference baseline fails all six action budgets", () => {
  const { failures } = checkPaperLayoutBudget(baseline)
  assert.equal(failures.length, 6)
  assert.ok(failures.every((run) => run.over50ms === 1))
})

test("accepts exactly 50 ms from raw intervals, irrespective of stored summaries", () => {
  const { results, failures } = checkPaperLayoutBudget(withinBudget())
  assert.equal(failures.length, 0)
  assert.ok(results.every((run) => run.maxMs === 50 && run.over33ms === 1 && run.over50ms === 0))
})

test("a single interval just above 50 ms fails without rounding or tolerance", () => {
  const report = withinBudget()
  report.runs[1].intervalsMs[0] = 50.000001
  const { failures } = checkPaperLayoutBudget(report)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].phase, "growth")
  assert.equal(failures[0].maxMs, 50.000001)
})

test("rejects incomplete, duplicate, short, non-finite or software-rendered evidence", () => {
  const mutations = [
    (report) => { report.status = "running" },
    (report) => { report.runs.pop() },
    (report) => { report.runs[1] = report.runs[0] },
    (report) => { report.runs[1].intervalsMs = [10] },
    (report) => { report.runs[1].intervalsMs[0] = NaN },
    (report) => { report.acceleration.renderer = "Apple M5 Max (software)" },
    (report) => { report.settings.actionMs = 1000 },
  ]
  for (const mutate of mutations) {
    const report = withinBudget()
    mutate(report)
    assert.throws(() => checkPaperLayoutBudget(report), /Invalid reference evidence/)
  }
})
