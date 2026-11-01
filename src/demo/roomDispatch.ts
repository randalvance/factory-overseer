import type { RoomFactoryState, RoomTaskLocation } from "~/model/types"

/** Demo host policy; the renderer continues to respect host assignments. */
export function destination(state: RoomFactoryState, roomId: string): RoomTaskLocation {
  const candidates = state.snapshot.agents.filter((agent) => agent.roomId === roomId &&
    (agent.status === "idle" || agent.status === "working" || agent.status === "done"))
  const loads = new Map<string, number>()
  // Count every participant, including completed work still held in this
  // room. Its bench is occupied until the host hands the task onward.
  for (const task of state.snapshot.tasks) {
    if (task.at.kind !== "room" || task.at.roomId !== roomId) continue
    for (const id of task.at.assignment?.agentIds ?? []) loads.set(id, (loads.get(id) ?? 0) + 1)
  }
  // Stable ties preserve host order. If loads tie, prefer an available
  // idle/done worker to one marked busy with work outside these task records.
  candidates.sort((a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0) ||
    Number(a.status === "working") - Number(b.status === "working"))
  const agent = candidates[0]
  return { kind: "room", roomId, ...(agent ? { assignment: { agentIds: [agent.id], completedAgentIds: [] } } : {}) }
}
