// A scripted snapshot for the demo: the floor as a host would describe it one
// moment into a run, plus the two changes the demo can make to it by hand.
// There is no runtime yet; the demo only shows what the floor core does.

import type { Pipeline, Snapshot } from "~/model/types"

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
