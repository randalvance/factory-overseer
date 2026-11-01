import { describe, expect, it } from "vitest"
import { type Trails, placeText, recordTrails, whereText } from "./trails"
import type { Snapshot, Task } from "./types"

const agents: Snapshot["agents"] = [
  { id: "imp-1", name: "Ada", role: "implementer", status: "working" },
  { id: "rev-1", name: "Grace", role: "reviewer", status: "idle" },
]
const snapshotWith = (tasks: Task[]): Snapshot => ({ agents, tasks })
const task = (id: string, where: Task["at"]): Task => ({ id, label: id, at: where })

describe("the trail a task leaves this session", () => {
  it("starts where the task is first seen", () => {
    expect(recordTrails({}, snapshotWith([task("t-1", "intake"), task("t-2", { agent: "imp-1" })]))).toEqual({
      "t-1": ["intake"],
      "t-2": [{ agent: "imp-1" }],
    })
  })

  it("grows by each place the task is seen at next, and not by a snapshot that leaves it where it was", () => {
    let trails: Trails = recordTrails({}, snapshotWith([task("t-1", "intake")]))
    trails = recordTrails(trails, snapshotWith([task("t-1", { agent: "imp-1" })]))
    trails = recordTrails(trails, snapshotWith([task("t-1", { agent: "imp-1" })]))
    trails = recordTrails(trails, snapshotWith([task("t-1", { agent: "rev-1" })]))
    trails = recordTrails(trails, snapshotWith([task("t-1", { agent: "imp-1" })]))

    expect(trails).toEqual({ "t-1": ["intake", { agent: "imp-1" }, { agent: "rev-1" }, { agent: "imp-1" }] })
  })

  it("drops the trail of a task no longer in the snapshot, and leaves the trails given alone", () => {
    const before = recordTrails({}, snapshotWith([task("t-1", "intake"), task("t-2", "intake")]))
    const after = recordTrails(before, snapshotWith([task("t-2", { agent: "imp-1" })]))

    expect(after).toEqual({ "t-2": ["intake", { agent: "imp-1" }] })
    expect(before).toEqual({ "t-1": ["intake"], "t-2": ["intake"] })
  })
})

describe("a place in words", () => {
  it("names the intake, the staging area, shipped, and an agent by name and role", () => {
    expect(placeText("intake", agents)).toBe("the intake")
    expect(placeText("staging", agents)).toBe("the staging area")
    expect(placeText("shipped", agents)).toBe("shipped")
    expect(placeText({ agent: "imp-1" }, agents)).toBe("Ada, implementer")
  })

  it("names an agent the snapshot no longer has by its id", () => {
    expect(placeText({ agent: "imp-9" }, agents)).toBe("imp-9")
  })
})

describe("where a task is, in words", () => {
  const onBench = task("t-1", { agent: "imp-1" })
  const next = task("t-2", { agent: "imp-1" })
  const second = task("t-3", { agent: "imp-1" })
  const atIntake = task("t-4", "intake")
  const atStaging = task("t-5", "staging")
  const shipped = task("t-6", "shipped")
  const snapshot = snapshotWith([onBench, next, second, atIntake, atStaging, shipped])

  it.each([
    { task: onBench, text: "on Ada's bench" },
    { task: next, text: "in Ada's queue, next" },
    { task: second, text: "in Ada's queue, 2nd" },
    { task: atIntake, text: "in the intake" },
    { task: atStaging, text: "in the staging area, awaiting review" },
    { task: shipped, text: "shipped, in the container" },
  ])("says $task.id is $text", ({ task, text }) => {
    expect(whereText(task, snapshot)).toBe(text)
  })

  it.each([
    { task: onBench, text: "riding to Ada's bench" },
    { task: next, text: "riding to Ada's queue" },
    { task: atStaging, text: "riding to the staging area" },
    { task: shipped, text: "riding to the container" },
  ])("says $task.id is $text while its box still rides", ({ task, text }) => {
    expect(whereText(task, snapshot, "riding")).toBe(text)
  })
})
