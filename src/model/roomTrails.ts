import type { RoomFactoryState, RoomTaskLocation } from "./types"

export interface RoomTrailStop {
  roomId: string
  kind: RoomTaskLocation["kind"]
  /** Keep the observed name even if the host later removes or renames a room. */
  label: string
}
export type RoomTrails = Readonly<Record<string, readonly RoomTrailStop[]>>

/** Record room visits, not assignment edits or participant status changes. */
export function recordRoomTrails(before: RoomTrails, state: RoomFactoryState): RoomTrails {
  return Object.fromEntries(state.snapshot.tasks.map((task) => {
    const trail = before[task.id] ?? []
    const last = trail.at(-1)
    if (last?.roomId === task.at.roomId && last.kind === task.at.kind) return [task.id, trail]
    const roomName = state.configuration.rooms.find((room) => room.id === task.at.roomId)?.label ?? task.at.roomId
    const stop: RoomTrailStop = { roomId: task.at.roomId, kind: task.at.kind,
      label: task.at.kind === "shipped" ? `Shipped from ${roomName}` : roomName }
    return [task.id, [...trail, stop]]
  }))
}
