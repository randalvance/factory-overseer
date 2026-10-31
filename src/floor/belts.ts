// What a view needs to know about a belt tile beyond its shape.

import type { BeltTile, Direction } from "./types"

/** The way boxes leave a belt tile: along a straight tile, out of a corner, on through a junction. */
export function travelDirection(tile: BeltTile): Direction {
  return tile.kind === "corner" ? tile.to : tile.dir
}
