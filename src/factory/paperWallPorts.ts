import type { BeltTile, RoomFootprint } from "~/floor/types"

/** Rear-wall passages use the same dark paper housing as a junction, even
 * when the logical route is straight or turning. This is only a rendering
 * representation: it preserves every incoming/outgoing travel direction.
 */
export function paperWallPortTile(tile: BeltTile, rooms: readonly RoomFootprint[] | undefined): BeltTile {
  const inRearWall = rooms?.some(({ kind, rect }) => kind !== "intake" && tile.y === rect.y && tile.x >= rect.x && tile.x < rect.x + rect.w)
  if (!inRearWall || tile.kind === "junction") return tile
  const entry = tile.kind === "straight" ? tile.dir : tile.from
  const exit = tile.kind === "straight" ? tile.dir : tile.to
  return { kind: "junction", x: tile.x, y: tile.y, dir: exit, entries: [entry], exits: [exit] }
}
