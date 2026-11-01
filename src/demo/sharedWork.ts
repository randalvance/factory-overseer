import type { RoomFactoryState } from "~/model/types"
import { needsHuman } from "./humanAttention"

/** Demo host policy, deliberately outside the renderer. */
export function implementationReady(state: RoomFactoryState, taskId: string): boolean {
  const task = state.snapshot.tasks.find((task) => task.id === taskId)
  if (!task || needsHuman(state, taskId)) return false
  if (task.at.kind !== "room" || task.at.roomId !== "implementation") return true
  const group = task.at.assignment
  return !!group && group.agentIds.every((id) => group.completedAgentIds.includes(id))
}

export function changeParticipant(state: RoomFactoryState, taskId: string, agentId: string, action: "complete" | "fail" | "remove"): RoomFactoryState {
  const task = state.snapshot.tasks.find((task) => task.id === taskId)
  if (needsHuman(state, taskId) || task?.at.kind !== "room" || !task.at.assignment?.agentIds.includes(agentId)) return state
  const at = task.at
  const group = at.assignment!
  const agentIds = action === "remove" ? group.agentIds.filter((id) => id !== agentId) : group.agentIds
  const completedAgentIds = action === "complete"
    ? [...new Set([...group.completedAgentIds, agentId])]
    : group.completedAgentIds.filter((id) => id !== agentId)
  return { ...state, snapshot: { ...state.snapshot,
    tasks: state.snapshot.tasks.map((item) => item.id !== taskId ? item : { ...item, at: {
      kind: "room", roomId: at.roomId,
      ...(agentIds.length ? { assignment: { agentIds, completedAgentIds } } : {}),
    } }),
    agents: state.snapshot.agents.map((agent) => agent.id !== agentId ? agent : {
      ...agent, status: action === "fail" ? "error" : action === "complete" ? "done" : "idle",
    }),
  } }
}
