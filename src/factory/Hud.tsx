// The HUD over the canvas: the header with its counts and its two buttons,
// and the card for whatever the overseer clicked. React owns it, like the
// shell around the canvas (ADR 0004); nothing here touches the scene.

import { type ReactNode, useEffect, useState } from "react"
import { counts } from "~/model/counts"
import { type AgentStatus, type StatusStyle, bubbleText } from "~/model/status"
import { recordRoomTrails, type RoomTrails, type RoomTrailStop } from "~/model/roomTrails"
import { humanRequestAgentIds } from "~/model/roomRouting"
import type { Whereabouts } from "~/floor/roam"
import type { HumanAttentionRequest, RoomFactoryState, RoomTask, Snapshot, Subject } from "~/model/types"

export interface HudProps {
  roomState: RoomFactoryState
  snapshot: Snapshot
  /** The tasks whose boxes are still riding to where the snapshot puts them. */
  riding: ReadonlySet<string>
  /** What each status looks like, for the activity of an agent that reports none of its own. */
  styles: Readonly<Record<AgentStatus, StatusStyle>>
  /** What the overseer clicked, for its card. */
  picked: Subject | undefined
  /** Where the main agent is going or pausing, for its card. */
  roaming?: { id: string; whereabouts: Whereabouts }
  /** Whether the factory has drawn its first snapshot, which the buttons wait for. */
  ready: boolean
  onClose: () => void
  onFitAll: () => void
  onReorganize: () => void
}

/** The header with the counts and the Fit all and Reorganize buttons, and the card for what the overseer clicked, if anything. */
export function Hud({ snapshot, roomState, riding, styles, picked, ready, roaming, onClose, onFitAll, onReorganize }: HudProps) {
  const tally = counts(snapshot)
  const [roomTrails, setRoomTrails] = useState<RoomTrails>({})
  useEffect(() => {
    setRoomTrails((before) => recordRoomTrails(before, roomState))
  }, [roomState])
  return (
    <div className="factory-hud">
      <header className="factory-hud-header">
        <span className="factory-hud-counts" aria-label="Counts">
          <span>{tally.agents} agents</span>
          <span>{tally.inFlight} in flight</span>
          <span>{roomState.snapshot.humanRequests.length} human {roomState.snapshot.humanRequests.length === 1 ? "request" : "requests"}</span>
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
      {picked && "agent" in picked && <AgentCard id={picked.agent} roomState={roomState} snapshot={snapshot} styles={styles}
        whereabouts={roaming?.id === picked.agent ? roaming.whereabouts : undefined} onClose={onClose} />}
      {picked && "task" in picked && (
        <BoxCard roomState={roomState} roomTrail={roomTrails[picked.task]} taskId={picked.task} riding={riding.has(picked.task)} onClose={onClose} />
      )}
    </div>
  )
}

/** An agent's name, role, status, activity and the task on its bench; the main agent's whereabouts on the floor instead of a room. Nothing once the agent has left. */
function AgentCard({
  id,
  roomState,
  snapshot,
  styles,
  whereabouts,
  onClose,
}: {
  id: string
  roomState: RoomFactoryState
  snapshot: Snapshot
  styles: Readonly<Record<AgentStatus, StatusStyle>>
  whereabouts: Whereabouts | undefined
  onClose: () => void
}) {
  const main = snapshot.mainAgent?.id === id ? snapshot.mainAgent : undefined
  const agent = snapshot.agents.find((a) => a.id === id) ?? main
  if (!agent) return null
  const roomAgent = roomState.snapshot.agents.find((agent) => agent.id === id)
  const requests = roomState.snapshot.humanRequests.filter((request) => humanRequestAgentIds(roomState.snapshot, request).includes(id)) ?? []
  const associated = snapshot.tasks.filter((task) => snapshot.assignments?.[task.id]?.agentIds.includes(id))
  return (
    <Card title={agent.name} onClose={onClose}>
      {roomAgent && <><dt>Room</dt><dd>{roomState.configuration.rooms.find((room) => room.id === roomAgent.roomId)?.label ?? roomAgent.roomId}</dd></>}
      {main && <><dt>Room</dt><dd>Roaming the floor</dd><dt>Whereabouts</dt><dd>{whereaboutsText(whereabouts, roomState)}</dd></>}
      <dt>Role</dt>
      <dd>{agent.role}</dd>
      <dt>Status</dt>
      <dd>{agent.status}</dd>
      <dt>Activity</dt>
      <dd>{bubbleText(agent.status, agent.activity, styles) ?? "none"}</dd>
      <HumanRequestContext requests={requests} />
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
  riding,
  onClose,
}: {
  roomState: RoomFactoryState
  roomTrail?: readonly RoomTrailStop[]
  taskId: string
  riding: boolean
  onClose: () => void
}) {
  const roomTask = roomState.snapshot.tasks.find((task) => task.id === taskId)
  if (!roomTask) return null
  const requests = roomState.snapshot.humanRequests.filter((request) => request.taskId === taskId ||
    (!request.taskId && roomTask.at.kind === "room" && request.roomId === roomTask.at.roomId && (!request.agentIds.length ||
      roomTask.at.assignment?.agentIds.some((id) => request.agentIds.includes(id))))) ?? []
  return (
    <Card title={roomTask.label} onClose={onClose}>
      <dt>Where</dt>
      <dd>{`${riding ? "Riding to " : ""}${roomPlace(roomTask, roomState)}`}</dd>
      {roomTask.at.kind === "room" && roomTask.at.assignment && <>
        <dt>Participants</dt>
        <dd><ul>{roomTask.at.assignment.agentIds.map((id) => <li key={id}>
          {roomState.snapshot.agents.find((agent) => agent.id === id)?.name ?? id}: {roomTask.at.kind === "room" && roomTask.at.assignment!.completedAgentIds.includes(id) ? "complete" : roomState.snapshot.agents.find((agent) => agent.id === id)?.status}
        </li>)}</ul></dd>
        <dt>Join</dt><dd>{roomTask.at.assignment.completedAgentIds.length}/{roomTask.at.assignment.agentIds.length} complete · host controls handoff</dd>
      </>}
      <HumanRequestContext requests={requests} />
      <dt>Trail</dt>
      <dd>{roomTrail?.map((stop) => stop.label).join(" → ")}</dd>
    </Card>
  )
}

function HumanRequestContext({ requests }: { requests: readonly HumanAttentionRequest[] }) {
  if (!requests.length) return null
  return <><dt>Human attention</dt><dd><ul aria-label="Active human requests">{requests.map((request) =>
    <li key={request.id}><strong>{request.kind === "question" ? "Question" : request.kind === "approval" ? "Approval" : "Help"}:</strong> {request.message}</li>,
  )}</ul></dd></>
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

/** Where the main agent is, by the label of the room whose door, benches or hopper it is at or going to. */
function whereaboutsText(whereabouts: Whereabouts | undefined, state: RoomFactoryState): string {
  if (!whereabouts || whereabouts.kind === "standing") return "Standing on the paper"
  const { spot } = whereabouts
  const label = state.configuration.rooms.find((room) => room.id === spot.roomId)?.label ?? spot.roomId
  const place = spot.kind === "door" ? `the ${label} door` : spot.kind === "bench" ? `the ${label} benches` :
    spot.kind === "hopper" ? `the ${label} hopper` : "the delivery truck"
  return whereabouts.kind === "walking" ? `Walking to ${place}` : `Pausing at ${place}`
}

function roomPlace(task: RoomTask, state: RoomFactoryState): string {
  const room = state.configuration.rooms.find((room) => room.id === task.at.roomId)
  const label = room?.label ?? task.at.roomId
  if (task.at.kind === "shipped") return `Shipped from ${label}`
  if (room?.kind === "intake") return label
  const members = task.at.assignment?.agentIds
  return members ? `${label} — ${members.map((id) => state.snapshot.agents.find((agent) => agent.id === id)?.name ?? id).join(" + ")}` : `${label} — waiting for assignment`
}
