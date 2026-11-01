// What a view or a route needs to know about a belt tile beyond its shape.

import type { Belt, BeltTile, Direction } from "./types"

/**
 * The name a belt keeps when the floor is laid afresh, so that the belt laid
 * afresh can stand for the one before: a trunk's is the place it leaves,
 * since where it leads next may change; every other belt's is its id.
 */
export function beltName(belt: Belt): string {
  return belt.kind === "trunk" ? `trunk:${belt.from}` : belt.id
}

/** Whether a belt carries rework: the return belt itself, or a riser up to it or a drop down from it. */
export function carriesRework(belt: Belt): boolean {
  return belt.kind === "return" || belt.kind === "riser" || belt.kind === "drop"
}

/** The way boxes leave a belt tile: along a straight tile, out of a corner, on through a junction. */
export function travelDirection(tile: BeltTile): Direction {
  return tile.kind === "corner" ? tile.to : tile.dir
}

/** The way boxes travel as they enter the tile; for a junction, the way through. */
export function entryDirection(tile: BeltTile): Direction {
  return tile.kind === "corner" ? tile.from : tile.dir
}

/** Every way boxes can travel as they enter the tile: one for a straight or a corner, each entry of a junction. */
export function entries(tile: BeltTile): Direction[] {
  return tile.kind === "junction" ? tile.entries : [entryDirection(tile)]
}

/** Every way boxes can leave the tile: one for a straight or a corner, each exit of a junction. */
export function exits(tile: BeltTile): Direction[] {
  return tile.kind === "junction" ? tile.exits : [travelDirection(tile)]
}
