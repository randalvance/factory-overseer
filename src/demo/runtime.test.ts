import { describe, expect, it } from "vitest"
import type { AgentStatus } from "~/model/status"
import { tasksAt } from "~/model/tasks"
import type { Snapshot, TaskLocation } from "~/model/types"
import {
  type Runtime,
  type RuntimeTask,
  nextBeat,
  nextRole,
  opening,
  reworkable,
  snapshotOf,
  withAgent,
  withRework,
  withTask,
  withTrouble,
  withoutAgent,
} from "./runtime"

const statusOf = (runtime: Runtime, agentId: string): AgentStatus | undefined => snapshotOf(runtime).agents.find((a) => a.id === agentId)?.status
const activityOf = (runtime: Runtime, agentId: string): string | undefined => snapshotOf(runtime).agents.find((a) => a.id === agentId)?.activity
const whereIs = (runtime: Runtime, taskId: string): TaskLocation | undefined => snapshotOf(runtime).tasks.find((t) => t.id === taskId)?.at
const progressOf = (runtime: Runtime, taskId: string): number | undefined => snapshotOf(runtime).tasks.find((t) => t.id === taskId)?.progress
/** The tasks at an agent, in queue order. */
const queueAt = (runtime: Runtime, agentId: string): string[] => tasksAt(snapshotOf(runtime).tasks, agentId).map((t) => t.id)
const beats = (runtime: Runtime, n: number): Runtime => {
  let state = runtime
  for (let i = 0; i < n; i++) state = nextBeat(state)
  return state
}

describe("the runtime's opening", () => {
  it("reports the opening floor as a host would: three agents at work and eight tasks along the line", () => {
    const snapshot = snapshotOf(opening())
    expect(snapshot.agents.map((a) => [a.id, a.name, a.role, a.status, a.activity])).toEqual([
      ["imp-1", "Ada", "implementer", "working", "Writing the parser"],
      ["rev-1", "Grace", "reviewer", "idle", undefined],
      ["qa-1", "Linus", "qa", "waiting", "Needs a staging token"],
    ])
    expect(snapshot.tasks.map((t) => [t.id, t.at, t.progress])).toEqual([
      ["t-41", "intake", undefined],
      ["t-42", "intake", undefined],
      ["t-37", { agent: "imp-1" }, 2 / 3],
      ["t-38", { agent: "imp-1" }, undefined],
      ["t-35", { agent: "qa-1" }, undefined],
      ["t-31", "staging", undefined],
      ["t-29", "shipped", undefined],
      ["t-30", "shipped", undefined],
    ])
  })

  it("hands out snapshots of nothing but what a host reports", () => {
    const snapshot: Snapshot = snapshotOf(beats(opening(), 3))
    for (const agent of snapshot.agents) expect(Object.keys(agent).every((key) => ["id", "name", "role", "status", "activity"].includes(key))).toBe(true)
    for (const task of snapshot.tasks) expect(Object.keys(task).every((key) => ["id", "label", "at", "progress"].includes(key))).toBe(true)
  })
})

describe("a beat of the runtime", () => {
  it("advances the work on every bench and hands finished work on to the next role, the agent showing it is done", () => {
    const after = nextBeat(opening())
    expect(whereIs(after, "t-37")).toEqual({ agent: "rev-1" })
    expect(statusOf(after, "imp-1")).toBe("done")
    expect(statusOf(after, "rev-1")).toBe("working")
    expect(activityOf(after, "rev-1")).toBe("Reading the diff")
    // The next beat, Ada is at work on the next box in her queue.
    expect(statusOf(nextBeat(after), "imp-1")).toBe("working")
    expect(progressOf(nextBeat(after), "t-38")).toBe(1 / 3)
  })

  it("hands the intake's tasks, in arrival order, to whoever in the first role has a clear bench, and keeps the rest on the pile", () => {
    // Ada's bench is never clear: t-38 waits behind t-37 and takes its place.
    const alone = nextBeat(opening())
    expect(queueAt(alone, "imp-1")).toEqual(["t-38"])
    expect(whereIs(alone, "t-41")).toBe("intake")
    // With Barbara hired as an implementer, and Ada still at work on t-37, t-41 goes to Barbara's clear bench; t-42 waits for one.
    const hired = withAgent(opening(), "implementer")
    const shared = nextBeat({ ...hired, tasks: hired.tasks.map((t) => (t.id === "t-37" ? { ...t, beatsDone: 0 } : t)) })
    expect(queueAt(shared, "imp-2")).toEqual(["t-41"])
    expect(queueAt(shared, "imp-1")).toEqual(["t-37", "t-38"])
    expect(whereIs(shared, "t-42")).toBe("intake")
  })

  it("holds finished work on the bench, the agent done, while the queue it is bound for is full, and hands it on once there is room", () => {
    const reviewing = (id: string, beatsDone: number): RuntimeTask => ({ id, label: id, at: { agent: "rev-1" }, role: "reviewer", beatsDone })
    const busy: Runtime = { ...opening(), tasks: [...opening().tasks, reviewing("t-33", 1), reviewing("t-34", 0)] }
    const first = nextBeat(busy)
    expect(whereIs(first, "t-37")).toEqual({ agent: "imp-1" })
    expect(statusOf(first, "imp-1")).toBe("done")
    expect(progressOf(first, "t-37")).toBe(1)
    // Grace finished t-33 at that beat and handed it on, so there is room now.
    const second = nextBeat(first)
    expect(queueAt(second, "rev-1")).toEqual(["t-34", "t-37"])
    expect(statusOf(second, "imp-1")).toBe("done")
    expect(statusOf(beats(busy, 3), "imp-1")).toBe("working")
  })

  it("keeps an agent in trouble from its work until the spell is over", () => {
    const first = nextBeat(opening())
    expect(statusOf(first, "qa-1")).toBe("waiting")
    expect(progressOf(first, "t-35")).toBeUndefined()
    const second = nextBeat(first)
    expect(statusOf(second, "qa-1")).toBe("working")
    expect(progressOf(second, "t-35")).toBe(1 / 2)
  })

  it("has the inspector pass what has waited long enough, and now and then hand it back to the last bay as rework", () => {
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const inspected = beats(opening(seed), 2)
      outcomes.add(JSON.stringify(whereIs(inspected, "t-31")))
    }
    expect(outcomes).toEqual(new Set([JSON.stringify("shipped"), JSON.stringify({ agent: "qa-1" })]))
  })

  it("now and then sends finished work back a bay as rework instead of on, where there is room for it", () => {
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      // t-37 reaches Grace at the first beat and is finished there at the third, in the runs where no trouble holds it up; Ada's queue has room for it by then.
      const reviewed = beats(opening(seed), 3)
      if (JSON.stringify(whereIs(reviewed, "t-37")) === JSON.stringify({ agent: "rev-1" })) continue
      if (JSON.stringify(whereIs(nextBeat(opening(seed)), "t-37")) !== JSON.stringify({ agent: "rev-1" })) continue
      outcomes.add(JSON.stringify(whereIs(reviewed, "t-37")))
    }
    expect(outcomes).toEqual(new Set([JSON.stringify({ agent: "qa-1" }), JSON.stringify({ agent: "imp-1" })]))
  })

  it("now and then sends work finished at the first bay across to another lane of it as rework", () => {
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      // Barbara's bench is clear; t-37 is finished at Ada on the first beat, unless trouble holds her up.
      const first = nextBeat(withAgent(opening(seed), "implementer"))
      if (JSON.stringify(whereIs(first, "t-37")) === JSON.stringify({ agent: "imp-1" })) continue
      outcomes.add(JSON.stringify(whereIs(first, "t-37")))
    }
    expect(outcomes).toEqual(new Set([JSON.stringify({ agent: "rev-1" }), JSON.stringify({ agent: "imp-2" })]))
  })

  it("now and then has an agent at work run into trouble, waiting or in error, which holds for a second beat", () => {
    const seen = new Set<AgentStatus>()
    for (let seed = 1; seed <= 40; seed++) {
      let state = opening(seed)
      let before = statusOf(state, "imp-1")
      for (let beat = 1; beat <= 8; beat++) {
        state = nextBeat(state)
        const status = statusOf(state, "imp-1")
        if ((status === "waiting" || status === "error") && status !== before) {
          seen.add(status)
          expect(statusOf(nextBeat(state), "imp-1")).toBe(status)
        }
        before = status
      }
    }
    expect(seen).toEqual(new Set(["waiting", "error"]))
  })

  it("has a new task arrive at the intake every few beats, while the floor is not too full", () => {
    const quiet: Runtime = { ...opening(), tasks: [] }
    expect(snapshotOf(beats(quiet, 3)).tasks).toEqual([])
    expect(snapshotOf(beats(quiet, 4)).tasks).toEqual([{ id: "t-43", label: "t-43", at: "intake" }])
    // Seven on the floor and nobody to work them: the inspector ships one, and six is still too full for another to arrive.
    const full: Runtime = withTask({ ...opening(), agents: [] })
    expect(snapshotOf(beats(full, 4)).tasks).toHaveLength(9)
  })

  it("plays the same way every time for the same seed", () => {
    expect(snapshotOf(beats(opening(3), 12))).toEqual(snapshotOf(beats(opening(3), 12)))
  })

  it("skips a role nobody is left to do, and sends work on to the inspector after the last", () => {
    let state = withoutAgent(opening(), "rev-1")
    state = beats(state, 2)
    // Grace is on her way out; t-37, finished at Ada on the first beat, went straight on to qa.
    expect(whereIs(state, "t-37")).toEqual({ agent: "qa-1" })
  })
})

describe("the control panel's hands on the runtime", () => {
  it("adds an agent of a role in the pipeline, named in hiring order", () => {
    const first = withAgent(opening(), "reviewer")
    const second = withAgent(first, "qa")
    expect(snapshotOf(second).agents.slice(3)).toEqual([
      { id: "rev-2", name: "Barbara", role: "reviewer", status: "idle" },
      { id: "qa-3", name: "Dennis", role: "qa", status: "idle" },
    ])
  })

  it("adds a role to the pipeline before the last, with its first agent, and work goes on through it", () => {
    const role = nextRole(opening().pipeline)
    expect(role).toBe("role-4")
    const joined = withAgent(opening(), role)
    expect(joined.pipeline.roles).toEqual(["implementer", "reviewer", "role-4", "qa"])
    expect(snapshotOf(joined).agents.at(-1)).toEqual({ id: "role-4-2", name: "Barbara", role: "role-4", status: "idle" })
    // t-37 is finished at Grace on the third beat and goes on to the new role, for the opening's seed.
    expect(whereIs(beats(joined, 3), "t-37")).toEqual({ agent: "role-4-2" })
  })

  it("takes an agent off the floor: offline this beat, departed the next, its work handed to whoever can take it", () => {
    const leaving = withoutAgent(opening(), "imp-1")
    expect(statusOf(leaving, "imp-1")).toBe("offline")
    expect(activityOf(leaving, "imp-1")).toBeUndefined()
    const departed = nextBeat(leaving)
    expect(snapshotOf(departed).agents.map((a) => a.id)).toEqual(["rev-1", "qa-1"])
    // Nobody else implements, so both go on to Grace, whose queue had room for two.
    expect(queueAt(departed, "rev-1")).toEqual(["t-37", "t-38"])
    // With Barbara beside her, Ada's work goes across to Barbara's lane instead, as far as there is room.
    const shared = nextBeat(withoutAgent(withAgent(opening(), "implementer"), "imp-1"))
    expect(queueAt(shared, "imp-2")).toEqual(["t-37", "t-38"])
  })

  it("leaves the work of a departed agent on the vacant bench while nobody has room for it, and hands it on when someone has", () => {
    const reviewing = (id: string): RuntimeTask => ({ id, label: id, at: { agent: "rev-1" }, role: "reviewer", beatsDone: 0 })
    const full: Runtime = { ...withoutAgent(opening(), "imp-1"), tasks: [...opening().tasks, reviewing("t-33"), reviewing("t-34")] }
    const departed = nextBeat(full)
    expect(snapshotOf(departed).agents.map((a) => a.id)).toEqual(["rev-1", "qa-1"])
    expect(whereIs(departed, "t-37")).toEqual({ agent: "imp-1" })
    // Grace finishes t-33 at the next beat; t-37 takes its place in her queue.
    expect(queueAt(nextBeat(departed), "rev-1")).toEqual(["t-34", "t-37"])
  })

  it("adds a task at the intake, numbered on from the last", () => {
    const more = withTask(withTask(opening()))
    expect(snapshotOf(more).tasks.slice(-2)).toEqual([
      { id: "t-43", label: "t-43", at: "intake" },
      { id: "t-44", label: "t-44", at: "intake" },
    ])
  })

  it.each([
    { task: "t-35", where: "at qa", back: { agent: "rev-1" } },
    { task: "t-31", where: "at the staging area", back: { agent: "qa-1" } },
  ])("forces rework on $task $where: it goes back to the bay before, last in that queue", ({ task, back }) => {
    expect(reworkable(opening(), task)).toBe(true)
    const sent = withRework(opening(), task)
    expect(whereIs(sent, task)).toEqual(back)
    expect(snapshotOf(sent).tasks.at(-1)?.id).toBe(task)
  })

  it.each([
    { task: "t-37", where: "at the only lane of the first bay" },
    { task: "t-41", where: "at the intake" },
    { task: "t-29", where: "shipped" },
  ])("cannot force rework on $task $where, with nowhere to go back to", ({ task }) => {
    expect(reworkable(opening(), task)).toBe(false)
    expect(snapshotOf(withRework(opening(), task))).toEqual(snapshotOf(opening()))
  })

  it("forces rework on a task at the first bay across to another lane of it, when there is one", () => {
    const twoLanes = withAgent(opening(), "implementer")
    expect(reworkable(twoLanes, "t-37")).toBe(true)
    expect(whereIs(withRework(twoLanes, "t-37"), "t-37")).toEqual({ agent: "imp-2" })
  })

  it("cannot force rework into a full queue: the box would have nowhere to wait", () => {
    const full = withRework(withRework(opening(), "t-35"), "t-31")
    expect(queueAt(full, "rev-1")).toEqual(["t-35"])
    expect(queueAt(full, "qa-1")).toEqual(["t-31"])
    // Another on Linus's bench fills his queue: nothing more can come back from the staging area.
    const crowded: Runtime = { ...full, tasks: [...full.tasks, { id: "t-36", label: "t-36", at: { agent: "qa-1" }, role: "qa", beatsDone: 0 }, { id: "t-39", label: "t-39", at: "staging", role: "qa", beatsDone: 0 }] }
    expect(reworkable(crowded, "t-39")).toBe(false)
    expect(snapshotOf(withRework(crowded, "t-39"))).toEqual(snapshotOf(crowded))
  })

  it.each([{ status: "waiting" as const }, { status: "error" as const }])("forces $status on an agent this beat and the next, with something said about it", ({ status }) => {
    const troubled = withTrouble(opening(), "imp-1", status)
    expect(statusOf(troubled, "imp-1")).toBe(status)
    expect(activityOf(troubled, "imp-1")).toBeTruthy()
    expect(statusOf(nextBeat(troubled), "imp-1")).toBe(status)
    // The spell over, Ada finishes t-37 that beat.
    expect(statusOf(beats(troubled, 2), "imp-1")).toBe("done")
  })
})
