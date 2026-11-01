// The demo's control panel: its own controls beside the factory, apart from
// the factory's HUD. The clock the runtime beats to, and hands on the floor:
// an agent added by role, or of a role the pipeline has not got, removed, or
// forced into trouble; a task added or sent back as rework; the camera asked
// to focus on an agent or follow a task. The panel exists to push the
// factory around, so it reaches the runtime only through its controls and
// the factory only through its handle.

import { useState } from "react"
import type { FactoryHandle } from "~/factory/Factory"
import { placeText } from "~/model/trails"
import type { Snapshot } from "~/model/types"
import { type Runtime, nextBeat, nextRole, reworkable, withAgent, withRework, withTask, withTrouble, withoutAgent } from "./runtime"

export interface ControlPanelProps {
  runtime: Runtime
  /** The runtime as the factory sees it: what the panel offers a hand on. */
  snapshot: Snapshot
  playing: boolean
  speed: number
  /** The factory's handle, once it is ready. */
  factory: FactoryHandle | undefined
  /** A control's hand on the runtime, or the next beat of it. */
  onChange: (change: (runtime: Runtime) => Runtime) => void
  onPlaying: (playing: boolean) => void
  onSpeed: (speed: number) => void
  /** Any further controls the demo puts beside these. */
  children?: React.ReactNode
}

/** The role option for one the pipeline has not got: the next role name, declared before the last. */
const A_NEW_ROLE = "new"
const SLOWEST = 0.5
const FASTEST = 4
const SPEED_STEP = 0.5

/** The demo's hands on its runtime and its factory, in a row over the floor. */
export function ControlPanel({ runtime, snapshot, playing, speed, factory, onChange, onPlaying, onSpeed, children }: ControlPanelProps) {
  const [roleChoice, setRoleChoice] = useState(runtime.pipeline.roles[0] ?? A_NEW_ROLE)
  const [agentChoice, setAgentChoice] = useState<string>()
  const [taskChoice, setTaskChoice] = useState<string>()
  const { agents } = snapshot
  /** The tasks still on the floor; what has shipped is beyond a hand. */
  const tasks = snapshot.tasks.filter((task) => task.at !== "shipped")
  // Once whoever or whatever was chosen has left the floor, the first agent, or the first task at a bench, stands in.
  const agent = agents.find((a) => a.id === agentChoice) ?? agents[0]
  const task = tasks.find((t) => t.id === taskChoice) ?? tasks.find((t) => typeof t.at === "object") ?? tasks[0]
  const role = roleChoice === A_NEW_ROLE ? nextRole(runtime.pipeline) : roleChoice

  return (
    <div className="demo-controls" role="group" aria-label="Control panel">
      <span className="demo-cluster">
        <button type="button" onClick={() => onPlaying(!playing)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => onChange(nextBeat)}>
          Next beat
        </button>
        <label>
          Speed
          <input type="range" min={SLOWEST} max={FASTEST} step={SPEED_STEP} value={speed} aria-label="Speed" onChange={(e) => onSpeed(Number(e.target.value))} />
          {speed}×
        </label>
      </span>
      <span className="demo-cluster">
        <select aria-label="Role" value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)}>
          {runtime.pipeline.roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={A_NEW_ROLE}>a new role</option>
        </select>
        <button type="button" onClick={() => onChange((r) => withAgent(r, role))}>
          Add agent
        </button>
      </span>
      <span className="demo-cluster">
        <select aria-label="Agent" value={agent?.id ?? ""} onChange={(e) => setAgentChoice(e.target.value)} disabled={!agent}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}, {a.role}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => agent && onChange((r) => withoutAgent(r, agent.id))} disabled={!agent}>
          Remove agent
        </button>
        <button type="button" onClick={() => agent && onChange((r) => withTrouble(r, agent.id, "waiting"))} disabled={!agent}>
          Force waiting
        </button>
        <button type="button" onClick={() => agent && onChange((r) => withTrouble(r, agent.id, "error"))} disabled={!agent}>
          Force error
        </button>
        <button type="button" onClick={() => agent && factory?.focus({ agent: agent.id })} disabled={!agent || !factory}>
          Focus on agent
        </button>
      </span>
      <span className="demo-cluster">
        <button type="button" onClick={() => onChange(withTask)}>
          Add task
        </button>
        <select aria-label="Task" value={task?.id ?? ""} onChange={(e) => setTaskChoice(e.target.value)} disabled={!task}>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id}, {placeText(t.at, agents)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => task && onChange((r) => withRework(r, task.id))} disabled={!task || !reworkable(runtime, task.id)}>
          Force rework
        </button>
        <button type="button" onClick={() => task && factory?.focus({ task: task.id })} disabled={!task || !factory}>
          Follow task
        </button>
      </span>
      {children && <span className="demo-cluster">{children}</span>}
    </div>
  )
}
