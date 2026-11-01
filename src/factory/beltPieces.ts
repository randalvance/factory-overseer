// Which of the Blender-built belt pieces a belt tile is laid with, and how
// each is turned. A straight piece runs along its own +x; a corner enters
// along +x and turns to its left or its right; a junction is the straight
// through it with an arm, built on the piece's +z side, turned to each side
// boxes join from or leave by. Pure, so the laying is tested without a scene.

import { entries, exits, travelDirection } from "~/floor/belts"
import type { BeltTile, Direction } from "~/floor/types"

/** Whose surface a belt tile wears: the trunk's and the bays' belts' green, or the return belt's rust for rework. */
export type BeltSurface = "forward" | "rework"

type BeltShape = "belt-straight" | "belt-corner-left" | "belt-corner-right" | "belt-split" | "belt-merge"
/** The belt pieces in the GLB: each shape in both surfaces. */
export type BeltPieceName = BeltShape | `${BeltShape}-return`

/** A piece to place on a belt tile, turned about the vertical by its yaw. */
export interface BeltPlacement {
  piece: BeltPieceName
  yaw: number
}

/** The yaw that turns a piece's +x to run each way. */
const YAW: Readonly<Record<Direction, number>> = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }
/** The yaw that turns a piece's +z side to face each way. */
const SIDE_YAW: Readonly<Record<Direction, number>> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }
/** The way to the left of each way, seen from above with the back wall at the top. */
const LEFT_OF: Readonly<Record<Direction, Direction>> = { e: "n", n: "w", w: "s", s: "e" }
const OPPOSITE: Readonly<Record<Direction, Direction>> = { e: "w", w: "e", n: "s", s: "n" }

/** The pieces a belt tile is laid with, the straight or the corner first, then a junction's arms: those boxes join by, then those they leave by. */
export function beltPieces(tile: BeltTile, surface: BeltSurface): BeltPlacement[] {
  const place = (shape: BeltShape, yaw: number): BeltPlacement => ({ piece: surface === "rework" ? `${shape}-return` : shape, yaw })
  if (tile.kind === "corner") return [place(tile.to === LEFT_OF[tile.from] ? "belt-corner-left" : "belt-corner-right", YAW[tile.from])]
  const through = travelDirection(tile)
  const laid = [place("belt-straight", YAW[through])]
  // Boxes joining travel toward the tile, so the arm they join by is on the side they come from.
  for (const way of entries(tile)) if (way !== through) laid.push(place("belt-merge", SIDE_YAW[OPPOSITE[way]]))
  for (const way of exits(tile)) if (way !== through) laid.push(place("belt-split", SIDE_YAW[way]))
  return laid
}
