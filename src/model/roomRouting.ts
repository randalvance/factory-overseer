import type { RoomConfiguration, RoomFactoryState, RoomTransition, Snapshot } from "./types"
import { validateRoomState, type RoomContractError } from "./roomValidation"

/** Directed BFS; configuration order breaks ties. Cycles and merges are valid. */
export function roomRoute(configuration: RoomConfiguration, from: string, to: string): RoomTransition[] | undefined {
  if (from === to) return []
  const queue = [{ room: from, path: [] as RoomTransition[] }]
  const seen = new Set([from])
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    for (const edge of configuration.transitions.filter((edge) => edge.from === current.room)) {
      const path = [...current.path, edge]
      if (edge.to === to) return path
      if (seen.has(edge.to)) continue
      seen.add(edge.to)
      queue.push({ room: edge.to, path })
    }
  }
  return undefined
}

/** Skipped snapshots may traverse several declared edges; unreachable updates are rejected atomically. */
export function validateRoomUpdate(previous: RoomFactoryState | undefined, candidate: RoomFactoryState): RoomContractError[] {
  const errors = validateRoomState(candidate)
  if (errors.length || !previous) return errors
  const before = new Map(previous.snapshot.tasks.map((task) => [task.id, task]))
  candidate.snapshot.tasks.forEach((task, i) => {
    const old = before.get(task.id)
    if (!old) return
    if (old.at.kind === "shipped" && (task.at.kind !== "shipped" || task.at.roomId !== old.at.roomId)) {
      errors.push({ path: `snapshot.tasks[${i}].at`, message: "Shipped tasks are terminal" })
    } else if (!roomRoute(candidate.configuration, old.at.roomId, task.at.roomId) &&
      !(candidate.configuration.rooms.every((room) => room.id !== old.at.roomId) &&
        roomRoute(previous.configuration, old.at.roomId, task.at.roomId))) {
      errors.push({ path: `snapshot.tasks[${i}].at`, message: `No declared route from ${old.at.roomId} to ${task.at.roomId}` })
    }
  })
  return errors
}

/** The existing sprite/tablet layer consumes the first assignment member. Shared-work visuals follow in #23. */
export function roomSnapshotForView(state: RoomFactoryState): Snapshot {
  return {
    agents: state.snapshot.agents,
    tasks: state.snapshot.tasks.map((task) => ({
      ...task,
      at: task.at.kind === "shipped" ? "shipped" :
        task.at.assignment ? { agent: task.at.assignment.agentIds[0]! } : "intake",
    })),
  }
}
