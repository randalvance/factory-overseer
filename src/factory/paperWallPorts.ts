import type { BeltTile, RoomFootprint } from "~/floor/types"
import { entries, exits } from "~/floor/belts"

/** Only actual belt travel across a left/right boundary opens a wall.
 * A vertical belt alongside that wall is not an entrance or exit.
 */
export function paperWallPortSide(tile: BeltTile, room: RoomFootprint): "left" | "right" | undefined {
  const { rect, kind } = room
  if (kind === "intake" || tile.y < rect.y || tile.y >= rect.y + rect.h) return undefined
  const incoming = entries(tile), outgoing = exits(tile)
  if (tile.x === rect.x && (incoming.includes("e") || outgoing.includes("w"))) return "left"
  if (tile.x === rect.x + rect.w - 1 && (incoming.includes("w") || outgoing.includes("e"))) return "right"
  return undefined
}

/** Side-wall passages use the dark paper housing even for straight/turning
 * routes. This only changes rendering; logical travel directions stay intact.
 */
export function paperWallPortTile(tile: BeltTile, rooms: readonly RoomFootprint[] | undefined): BeltTile {
  if (tile.kind === "junction" || !rooms?.some((room) => paperWallPortSide(tile, room))) return tile
  const entry = tile.kind === "straight" ? tile.dir : tile.from
  const exit = tile.kind === "straight" ? tile.dir : tile.to
  return { kind: "junction", x: tile.x, y: tile.y, dir: exit, entries: [entry], exits: [exit] }
}
