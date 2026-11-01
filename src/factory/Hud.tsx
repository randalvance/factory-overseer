// The HUD over the canvas: the header with its counts and its two buttons,
// and the card for whatever the overseer clicked. React owns it, like the
// shell around the canvas (ADR 0004); nothing here touches the scene.

import type { ReactNode } from "react"
import { counts } from "~/model/counts"
import { type AgentStatus, type StatusStyle, bubbleText } from "~/model/status"
import { tasksAt } from "~/model/tasks"
import { type Trails, placeText, whereText } from "~/model/trails"
import type { Snapshot, Subject } from "~/model/types"

export interface HudProps {
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
export function Hud({ snapshot, trails, riding, styles, picked, ready, onClose, onFitAll, onReorganize }: HudProps) {
  const tally = counts(snapshot)
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
        <BoxCard taskId={picked.task} snapshot={snapshot} trails={trails} riding={riding.has(picked.task)} onClose={onClose} />
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
  const onBench = tasksAt(snapshot.tasks, id)[0]
  return (
    <Card title={agent.name} onClose={onClose}>
      <dt>Role</dt>
      <dd>{agent.role}</dd>
      <dt>Status</dt>
      <dd>{agent.status}</dd>
      <dt>Activity</dt>
      <dd>{bubbleText(agent.status, agent.activity, styles) ?? "none"}</dd>
      <dt>Task</dt>
      <dd>{onBench?.label ?? "none"}</dd>
    </Card>
  )
}

/** A box's label, where it is, and its trail this session. Nothing once the task is off the floor. */
function BoxCard({
  taskId,
  snapshot,
  trails,
  riding,
  onClose,
}: {
  taskId: string
  snapshot: Snapshot
  trails: Trails
  riding: boolean
  onClose: () => void
}) {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  if (!task) return null
  const trail = trails[taskId] ?? [task.at]
  return (
    <Card title={task.label} onClose={onClose}>
      <dt>Where</dt>
      <dd>{whereText(task, snapshot, riding ? "riding" : "arrived")}</dd>
      <dt>Trail</dt>
      <dd>{trail.map((place) => placeText(place, snapshot.agents)).join(" → ")}</dd>
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
