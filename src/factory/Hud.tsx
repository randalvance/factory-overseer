// The HUD over the canvas: the header with its counts and its two buttons,
// and the card for whatever the overseer clicked. React owns it, like the
// shell around the canvas (ADR 0004); nothing here touches the scene.

import { type ReactNode, useEffect, useState } from "react"
import { counts } from "~/model/counts"
import { type AgentStatus, type StatusStyle, bubbleText } from "~/model/status"
import { tasksAt } from "~/model/tasks"
import { type Trails, placeText, whereText } from "~/model/trails"
import type { RoomFactoryState, RoomTask, Snapshot, Subject } from "~/model/types"

export interface HudProps {
  roomState?: RoomFactoryState
  snapshot: Snapshot
  trails: Trails
  /** The tasks whose boxes are still riding to where the snapshot puts them. */
  riding: ReadonlySet<string>
  /** What each status looks like, for the activity of an agent that reports none of its own. */
  styles: Readonly<Record<AgentStatus, StatusStyle>>
  /** What the overseer clicked, for its card. */
  picked: Subject | undefined
  /** Whether the factory has drawn its first snapshot, which the buttons wait for. */
  ready: boolean
  onClose: () => void
  onFitAll: () => void
  onReorganize: () => void
}

/** The header with the counts and the Fit all and Reorganize buttons, and the card for what the overseer clicked, if anything. */
export function Hud({ snapshot, roomState, trails, riding, styles, picked, ready, onClose, onFitAll, onReorganize }: HudProps) {
  const tally = counts(snapshot)
  const [roomTrails, setRoomTrails] = useState<Record<string, string[]>>({})
  useEffect(() => {
    if (!roomState) return
    setRoomTrails((before) => Object.fromEntries(roomState.snapshot.tasks.map((task) => {
      const label = roomPlace(task, roomState)
      const trail = before[task.id] ?? []
      return [task.id, trail.at(-1) === label ? trail : [...trail, label]]
    })))
  }, [roomState])
  return (
    <div className="factory-hud">
      <header className="factory-hud-header">
        <span className="factory-hud-counts" aria-label="Counts">
          <span>{tally.agents} agents</span>
          <span>{tally.inFlight} in flight</span>
          <span>{tally.awaitingReview} awaiting review</span>
          <span>{tally.shipped} shipped</span>
        </span>
        <span className="factory-hud-actions">
          <button type="button" onClick={onFitAll} disabled={!ready}>
            Fit all
          </button>
          <button type="button" onClick={onReorganize} disabled={!ready}>
            Reorganize
          </button>
        </span>
      </header>
      {picked && "agent" in picked && <AgentCard id={picked.agent} snapshot={snapshot} styles={styles} onClose={onClose} />}
      {picked && "task" in picked && (
        <BoxCard roomState={roomState} roomTrail={roomTrails[picked.task]} taskId={picked.task} snapshot={snapshot} trails={trails} riding={riding.has(picked.task)} onClose={onClose} />
      )}
    </div>
  )
}

/** An agent's name, role, status, activity and the task on its bench. Nothing once the agent has left. */
function AgentCard({
  id,
  snapshot,
  styles,
  onClose,
}: {
  id: string
  snapshot: Snapshot
  styles: Readonly<Record<AgentStatus, StatusStyle>>
  onClose: () => void
}) {
  const agent = snapshot.agents.find((a) => a.id === id)
  if (!agent) return null
  const associated = snapshot.assignments
    ? snapshot.tasks.filter((task) => snapshot.assignments?.[task.id]?.agentIds.includes(id))
    : tasksAt(snapshot.tasks, id)
  return (
    <Card title={agent.name} onClose={onClose}>
      <dt>Role</dt>
      <dd>{agent.role}</dd>
      <dt>Status</dt>
      <dd>{agent.status}</dd>
      <dt>Activity</dt>
      <dd>{bubbleText(agent.status, agent.activity, styles) ?? "none"}</dd>
      <dt>Task</dt>
      <dd>{associated.map((task) => `${task.label}${snapshot.assignments?.[task.id]?.completedAgentIds.includes(id) ? " (complete)" : ""}`).join(", ") || "none"}</dd>
    </Card>
  )
}

/** A box's label, where it is, and its trail this session. Nothing once the task is off the floor. */
function BoxCard({
  roomState,
  roomTrail,
  taskId,
  snapshot,
  trails,
  riding,
  onClose,
}: {
  roomState?: RoomFactoryState
  roomTrail?: string[]
  taskId: string
  snapshot: Snapshot
  trails: Trails
  riding: boolean
  onClose: () => void
}) {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  if (!task) return null
  const trail = trails[taskId] ?? [task.at]
  const roomTask = roomState?.snapshot.tasks.find((task) => task.id === taskId)
  return (
    <Card title={task.label} onClose={onClose}>
      <dt>Where</dt>
      <dd>{roomTask && roomState ? `${riding ? "Riding to " : ""}${roomPlace(roomTask, roomState)}` : whereText(task, snapshot, riding ? "riding" : "arrived")}</dd>
      {roomTask?.at.kind === "room" && roomTask.at.assignment && <>
        <dt>Participants</dt>
        <dd><ul>{roomTask.at.assignment.agentIds.map((id) => <li key={id}>
          {roomState!.snapshot.agents.find((agent) => agent.id === id)?.name ?? id}: {roomTask.at.kind === "room" && roomTask.at.assignment!.completedAgentIds.includes(id) ? "complete" : roomState!.snapshot.agents.find((agent) => agent.id === id)?.status}
        </li>)}</ul></dd>
        <dt>Join</dt><dd>{roomTask.at.assignment.completedAgentIds.length}/{roomTask.at.assignment.agentIds.length} complete · host controls handoff</dd>
      </>}
      <dt>Trail</dt>
      <dd>{roomState ? roomTrail?.join(" → ") : trail.map((place) => placeText(place, snapshot.agents)).join(" → ")}</dd>
    </Card>
  )
}

function Card({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="factory-card" aria-label={`Card for ${title}`}>
      <h2>{title}</h2>
      <button type="button" className="factory-card-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <dl>{children}</dl>
    </aside>
  )
}

function roomPlace(task: RoomTask, state: RoomFactoryState): string {
  const label = state.configuration.rooms.find((room) => room.id === task.at.roomId)?.label ?? task.at.roomId
  if (task.at.kind === "shipped") return `Shipped from ${label}`
  const members = task.at.assignment?.agentIds
  return members ? `${label} — ${members.map((id) => state.snapshot.agents.find((agent) => agent.id === id)?.name ?? id).join(" + ")}` : `${label} — waiting for assignment`
}
