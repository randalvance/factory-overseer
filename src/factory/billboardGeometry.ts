import type { Rect, RoomFootprint } from "~/floor/types"

/** Shared by the physical sign and Fit All; intake attaches to the hopper's rear rim. */
export function roomBillboardPlacement(room: RoomFootprint, intake: Rect) {
  const { x, y, w } = room.rect
  if (room.kind === "intake") {
    return { width: 3.6, height: .74, x: intake.x + intake.w / 2, y: 3.1875 + .74 / 2, z: intake.y + intake.h / 2 - 1.2 }
  }
  const width = Math.min(w, 7) * .79, height = 1.12
  return { width, height, x: x + w / 2, y: 2.3525 + height / 2, z: y + .09 }
}
