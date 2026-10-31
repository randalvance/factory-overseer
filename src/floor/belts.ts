// What a view or a route needs to know about a belt tile beyond its shape.

import type { BeltTile, Direction } from "./types"

/** The way boxes leave a belt tile: along a straight tile, out of a corner, on through a junction. */
export function travelDirection(tile: BeltTile): Direction {
  return tile.kind === "corner" ? tile.to : tile.dir
}

/** The way boxes travel as they enter the tile. */
export function entryDirection(tile: BeltTile): Direction {
  return tile.kind === "corner" ? tile.from : tile.dir
}

/** Every way boxes can leave the tile: one for a straight or a corner, each exit of a junction. */
export function exits(tile: BeltTile): Direction[] {
  return tile.kind === "junction" ? tile.exits : [travelDirection(tile)]
}
