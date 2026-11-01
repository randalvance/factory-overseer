import type { Pipeline, Snapshot } from "./types"
import type { Room, RoomFactoryState, RoomTransition } from "./rooms"
import { validateRoomState } from "./roomValidation"

/**
 * Explicit migration aid, not an automatic change to the legacy renderer.
 * Includes late roles present in the snapshot after declared pipeline roles.
 */
export function migrateLegacyFactory(pipeline: Pipeline, snapshot: Snapshot, staging = true): RoomFactoryState {
  if (pipeline.roles.some((role) => !role.trim()) || new Set(pipeline.roles).size !== pipeline.roles.length) {
    throw new Error("Pipeline roles must be nonblank and unique")
  }
  const roles = [...new Set([...pipeline.roles, ...snapshot.agents.map((agent) => agent.role)])]
  const roomId = (role: string) => `role:${role}`
  const rooms: Room[] = [
    { id: "intake", label: "Intake", role: "intake", kind: "intake" },
    ...roles.map((role): Room => ({ id: roomId(role), label: role, role, kind: "work" })),
    ...(staging ? [{ id: "staging", label: "Human review", role: "human-review", kind: "work" } as const] : []),
    { id: "deployment", label: "Deployment", role: "deployment", kind: "deployment" },
  ]
  const transitions: RoomTransition[] = rooms.slice(1).map((room, i) => ({
    id: `forward:${room.id}`, from: rooms[i]!.id, to: room.id, outcome: "ready",
  }))
  const agents = snapshot.agents.map((agent) => ({ ...agent, roomId: roomId(agent.role) }))
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  const state: RoomFactoryState = {
    configuration: { rooms, transitions },
    snapshot: {
      agents,
      tasks: snapshot.tasks.map((task) => {
        if (typeof task.at === "object") {
          const agent = byId.get(task.at.agent)
          if (!agent) throw new Error(`Task ${task.id} references an absent agent; supply it as offline before migration`)
          return { ...task, at: { kind: "room", roomId: agent.roomId, assignment: { agentIds: [agent.id], completedAgentIds: [] } } }
        }
        if (task.at === "shipped") return { ...task, at: { kind: "shipped", roomId: "deployment" } }
        if (task.at === "staging" && !staging) throw new Error("Cannot migrate a task in staging when staging is disabled")
        return { ...task, at: { kind: "room", roomId: task.at } }
      }),
      humanRequests: [],
    },
  }
  const errors = validateRoomState(state)
  if (errors.length) throw new Error(errors.map(({ path, message }) => `${path}: ${message}`).join("\n"))
  return state
}
