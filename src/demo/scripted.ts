// A scripted demo: the floor as a host would describe it one moment into a
// run, the changes the demo can make to it by hand, and one task's trip
// across the whole line. There is no runtime yet; the demo only shows what
// the floor core does.

import type { Pipeline, Snapshot, TaskLocation } from "~/model/types"

export interface DemoScript {
  pipeline: Pipeline
  snapshot: Snapshot
}

export const opening: DemoScript = {
  pipeline: { roles: ["implementer", "reviewer", "qa"] },
  snapshot: {
    agents: [
      { id: "imp-1", name: "Ada", role: "implementer", status: "working", activity: "Writing the parser" },
      { id: "rev-1", name: "Grace", role: "reviewer", status: "idle" },
      { id: "qa-1", name: "Linus", role: "qa", status: "waiting", activity: "Needs a staging token" },
    ],
    tasks: [
      { id: "t-41", label: "t-41", at: "intake" },
      { id: "t-42", label: "t-42", at: "intake" },
      { id: "t-37", label: "t-37", at: { agent: "imp-1" } },
      { id: "t-38", label: "t-38", at: { agent: "imp-1" } },
      { id: "t-35", label: "t-35", at: { agent: "qa-1" } },
      { id: "t-31", label: "t-31", at: "staging" },
      { id: "t-29", label: "t-29", at: "shipped" },
      { id: "t-30", label: "t-30", at: "shipped" },
    ],
  },
}

/** A new role joins the pipeline with one agent, as a new session of a new kind would. */
export function withAnotherRole({ pipeline, snapshot }: DemoScript): DemoScript {
  const role = `role-${pipeline.roles.length + 1}`
  return {
    pipeline: { roles: [...pipeline.roles, role] },
    snapshot: { ...snapshot, agents: [...snapshot.agents, { id: `${role}-1`, name: role, role, status: "idle" }] },
  }
}

/** A new task arrives at the intake. */
export function withAnotherTask({ pipeline, snapshot }: DemoScript): DemoScript {
  const id = `t-${50 + snapshot.tasks.length}`
  return { pipeline, snapshot: { ...snapshot, tasks: [...snapshot.tasks, { id, label: id, at: "intake" }] } }
}

export interface Handoff {
  id: string
  to: TaskLocation
}

/**
 * One task, t-37, across the whole line, as a host would report it over
 * successive snapshots. Each entry is the handoffs of one snapshot; the other
 * tasks make way so t-37 waits once, in the staging pile, and never rides
 * through a box.
 */
export const acrossTheLine: Handoff[][] = [
  [{ id: "t-37", to: { agent: "rev-1" } }],
  [
    { id: "t-35", to: "staging" },
    { id: "t-37", to: { agent: "qa-1" } },
  ],
  [
    { id: "t-31", to: "shipped" },
    { id: "t-37", to: "staging" },
  ],
  [{ id: "t-35", to: "shipped" }],
  [{ id: "t-37", to: "shipped" }],
]

/** The handoffs of one snapshot. A handed-off task goes to the end of the list, so array order stays arrival order. */
export function withHandoffs({ pipeline, snapshot }: DemoScript, handoffs: Handoff[]): DemoScript {
  let tasks = snapshot.tasks
  for (const { id, to } of handoffs) {
    const task = tasks.find((t) => t.id === id)
    if (task) tasks = [...tasks.filter((t) => t.id !== id), { ...task, at: to }]
  }
  return { pipeline, snapshot: { ...snapshot, tasks } }
}

/** The demo's state: the script as it stands, and how many snapshots of the trip across the line have played. */
export interface Demo {
  script: DemoScript
  step: number
}

export const atTheStart: Demo = { script: opening, step: 0 }

/** Play the next snapshot of the trip across the line, if any is left. */
export function nextHandoff(demo: Demo): Demo {
  const handoffs = acrossTheLine[demo.step]
  return handoffs ? { script: withHandoffs(demo.script, handoffs), step: demo.step + 1 } : demo
}

export function tripOver(demo: Demo): boolean {
  return demo.step >= acrossTheLine.length
}
