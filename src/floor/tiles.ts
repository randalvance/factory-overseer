// Tiles and the four directions between them, shared by the floor core and
// the views that draw it.

import type { Direction, Tile } from "./types"

export const DIRECTIONS: Direction[] = ["e", "w", "n", "s"]

const STEP: Record<Direction, Tile> = { e: { x: 1, y: 0 }, w: { x: -1, y: 0 }, n: { x: 0, y: -1 }, s: { x: 0, y: 1 } }

/** One key per tile, for maps and sets of tiles. */
export function tileKey(tile: Tile): string {
  return `${tile.x},${tile.y}`
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y
}

/** The neighbouring tile one step away in a direction. */
export function step(tile: Tile, dir: Direction): Tile {
  return { x: tile.x + STEP[dir].x, y: tile.y + STEP[dir].y }
}

export function opposite(dir: Direction): Direction {
  return ({ e: "w", w: "e", n: "s", s: "n" } as const)[dir]
}

/** The direction from one tile to another, when they are neighbours. */
export function directionBetween(from: Tile, to: Tile): Direction | undefined {
  return DIRECTIONS.find((dir) => sameTile(step(from, dir), to))
}
