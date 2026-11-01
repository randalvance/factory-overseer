// A scripted demo: the floor as a host would describe it one moment into a
// run, the changes the demo can make to it by hand, and one task's trip
// across the whole line. There is no runtime yet; the demo only shows what
// the floor core does.

import { AGENT_STATUSES, type AgentStatus } from "~/model/status"
import type { Agent, Pipeline, Snapshot, TaskLocation } from "~/model/types"

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
      { id: "t-37", label: "t-37", at: { agent: "imp-1" }, progress: 0.45 },
      { id: "t-38", label: "t-38", at: { agent: "imp-1" } },
      { id: "t-35", label: "t-35", at: { agent: "qa-1" } },
      { id: "t-31", label: "t-31", at: "staging" },
      { id: "t-29", label: "t-29", at: "shipped" },
      { id: "t-30", label: "t-30", at: "shipped" },
    ],
  },
}

/**
 * A new role joins the pipeline with one agent, and t-42 goes on to it: from
 * the intake to the first role to join, then from each of them to the next.
 */
export function withAnotherRole({ pipeline, snapshot }: DemoScript): DemoScript {
  const role = `role-${pipeline.roles.length + 1}`
  const agent: Agent = { id: `${role}-1`, name: role, role, status: "idle" }
  const joined: DemoScript = {
    pipeline: { roles: [...pipeline.roles, role] },
    snapshot: { ...snapshot, agents: [...snapshot.agents, agent] },
  }
  return withHandoffs(joined, [{ id: "t-42", to: { agent: agent.id } }])
}

/** What the cycled agent says in each status; in the rest it falls back to the status default. */
const SAID: Partial<Record<AgentStatus, string>> = {
  working: "Writing the parser",
  waiting: "Needs the API key",
  error: "The build is broken",
}

/** One agent takes the next status in the table, round and round, saying what it says in that status. */
export function withNextStatus({ pipeline, snapshot }: DemoScript, agentId: string): DemoScript {
  const agents = snapshot.agents.map((agent): Agent => {
    if (agent.id !== agentId) return agent
    const status = AGENT_STATUSES[(AGENT_STATUSES.indexOf(agent.status) + 1) % AGENT_STATUSES.length]!
    return { ...agent, status, activity: SAID[status] }
  })
  return { pipeline, snapshot: { ...snapshot, agents } }
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
 * The line at work, as a host would report it over successive snapshots:
 * t-37 goes to the reviewer, comes back as rework while t-38 goes on, and
 * goes again; t-41 comes in from the intake; the inspector rejects t-31 and
 * later passes it; t-38 reaches qa and comes back to the reviewer, around the
 * turn and back up it when the line wraps; and everything ships in the end.
 * Each entry is the handoffs of one snapshot.
 */
export const acrossTheLine: Handoff[][] = [
  [{ id: "t-37", to: { agent: "rev-1" } }],
  [
    { id: "t-38", to: { agent: "rev-1" } },
    { id: "t-37", to: { agent: "imp-1" } },
  ],
  [
    { id: "t-37", to: { agent: "rev-1" } },
    { id: "t-41", to: { agent: "imp-1" } },
  ],
  [
    { id: "t-31", to: { agent: "qa-1" } },
    { id: "t-35", to: "staging" },
  ],
  [{ id: "t-38", to: { agent: "qa-1" } }],
  [
    { id: "t-35", to: "shipped" },
    { id: "t-38", to: { agent: "rev-1" } },
  ],
  [
    { id: "t-31", to: "staging" },
    { id: "t-38", to: { agent: "qa-1" } },
  ],
  [{ id: "t-37", to: { agent: "qa-1" } }],
  [
    { id: "t-31", to: "shipped" },
    { id: "t-38", to: "staging" },
  ],
  [{ id: "t-37", to: "staging" }],
  [{ id: "t-38", to: "shipped" }],
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

/** The demo's state: the script as it stands, how many snapshots of the trip across the line have played, and how many implementers have been hired. */
export interface Demo {
  script: DemoScript
  step: number
  hired: number
}

export const atTheStart: Demo = { script: opening, step: 0, hired: 0 }

/** Who joins Ada as an implementer, in hiring order. */
const HIRES = ["Barbara", "Dennis", "Edsger", "Frances", "Hedy", "Ken", "Margaret", "Niklaus"]

/** Another implementer is hired and joins. */
export function withAnotherImplementer(demo: Demo): Demo {
  const hired = demo.hired + 1
  const name = HIRES[(hired - 1) % HIRES.length]!
  const agent: Agent = { id: `imp-${hired + 1}`, name, role: "implementer", status: "idle" }
  const { pipeline, snapshot } = demo.script
  return { ...demo, hired, script: { pipeline, snapshot: { ...snapshot, agents: [...snapshot.agents, agent] } } }
}

/** The implementer who joined last leaves. Ada goes last of all. */
export function withoutAnImplementer(demo: Demo): Demo {
  const { pipeline, snapshot } = demo.script
  const leaving = snapshot.agents.filter((agent) => agent.role === "implementer").at(-1)
  return { ...demo, script: { pipeline, snapshot: { ...snapshot, agents: snapshot.agents.filter((agent) => agent !== leaving) } } }
}

/** Play the next snapshot of the trip across the line, if any is left. */
export function nextHandoff(demo: Demo): Demo {
  const handoffs = acrossTheLine[demo.step]
  return handoffs ? { ...demo, script: withHandoffs(demo.script, handoffs), step: demo.step + 1 } : demo
}

export function tripOver(demo: Demo): boolean {
  return demo.step >= acrossTheLine.length
}
