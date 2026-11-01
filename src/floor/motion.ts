// The motions to play for a snapshot: the tile path every box rides from
// where it is to where the layout now rests it, and the junctions to set on
// the way. Motions are derived from one snapshot to the next (ADR 0001) and
// are pure, like the rest of the floor core: no time, no renderer.
//
// Routes follow the belts: a box rolls onto a belt tile from the tile behind
// each of its entries and off along each of its exits. Inside the intake, the
// staging area and the container, boxes are carried, so any neighbouring
// tile there is reachable too, except the one the inspector stands on, and
// never against a belt. A box already in the container is there for good:
// when its resting place there changes, the container itself has moved, and
// the box appears where the container now is rather than riding after it.
// Where a box in transit is once the floor has been laid afresh and slid, as
// the overseer's Reorganize has it, is derived here too: the belt laid afresh
// that stands for the one it was riding.

import { beltName, entries, exits, travelDirection } from "./belts"
import { inContainer } from "./layout"
import { DIRECTIONS, directionBetween, opposite, sameTile, step, tileKey } from "./tiles"
import type { BeltTile, Direction, Layout, Rect, Tile } from "./types"

/** Where each box is, by task id: its resting tile, or the tile a box in transit is over. */
export type BoxTiles = Record<string, Tile>

export interface JunctionSetting {
  tile: Tile
  exit: Direction
}

export interface Motion {
  taskId: string
  /** From the tile the box is on to the tile it rests on next, every step a neighbour of the last. */
  path: Tile[]
  /** The junctions on the path and the exits they must be set toward before the box reaches them. */
  junctions: JunctionSetting[]
}

/** What a snapshot plays, and the boxes with no route to where they now rest, which appear there instead. */
export interface Motions {
  toPlay: Motion[]
  unrouted: string[]
}

/**
 * Where a tile of the previous layout's belts is once the floor has slid to
 * the next layout, as the overseer's Reorganize has it: the tile the same
 * number of tiles along the belt that stands for it there, by name, or that
 * belt's last tile when it is now shorter. None when no belt stands for it,
 * or the tile was on no belt.
 */
export function tileAfterSlide(previous: Layout, next: Layout, tile: Tile): Tile | undefined {
  for (const belt of previous.belts) {
    const index = belt.tiles.findIndex((t) => sameTile(t, tile))
    if (index < 0) continue
    const after = next.belts.find((b) => beltName(b) === beltName(belt))
    const there = after?.tiles[Math.min(index, after.tiles.length - 1)]
    if (there) return { x: there.x, y: there.y }
  }
  return undefined
}

/** Where every box rests in a layout: the state of the floor's boxes when nothing is in transit. */
export function restingTiles(layout: Layout): BoxTiles {
  return Object.fromEntries(layout.boxes.map((box) => [box.taskId, box.tile]))
}

export function motionsFor(layout: Layout, from: BoxTiles, previous?: Layout): Motions {
  const reach = routes(layout)
  const restedInContainer = new Map(previous ? inContainer(previous).map((box) => [box.taskId, box.tile] as const) : [])
  const junctions = new Map(
    layout.belts.flatMap((belt) => belt.tiles.filter((t) => t.kind === "junction").map((t) => [tileKey(t), t] as const)),
  )
  const toPlay: Motion[] = []
  const unrouted: string[] = []
  for (const box of layout.boxes) {
    const start = from[box.taskId]
    if (!start || sameTile(start, box.tile)) continue
    const settled = restedInContainer.get(box.taskId)
    if (settled && !sameTile(settled, box.tile)) continue
    const path = shortestPath(reach, { x: start.x, y: start.y }, box.tile)
    if (!path) {
      unrouted.push(box.taskId)
      continue
    }
    toPlay.push({ taskId: box.taskId, path, junctions: junctionsAlong(path, junctions) })
  }
  return { toPlay, unrouted }
}

/** Every tile a box can reach in one step from each tile, belts first so a route prefers riding to being carried. */
function routes(layout: Layout): Map<string, Tile[]> {
  const reach = new Map<string, Tile[]>()
  const link = (from: Tile, to: Tile) => {
    const next = reach.get(tileKey(from)) ?? []
    if (!next.some((t) => sameTile(t, to))) next.push({ x: to.x, y: to.y })
    reach.set(tileKey(from), next)
  }

  const beltTiles = new Map<string, BeltTile>()
  for (const belt of layout.belts) {
    for (const tile of belt.tiles) {
      beltTiles.set(tileKey(tile), tile)
      for (const entry of entries(tile)) link(step(tile, opposite(entry)), tile)
      for (const exit of exits(tile)) link(tile, step(tile, exit))
    }
  }

  /** A carried step may not leave or enter a belt tile against its travel direction. */
  const againstBelt = (tile: Tile, dir: Direction) => {
    const belt = beltTiles.get(tileKey(tile))
    return belt !== undefined && travelDirection(belt) === opposite(dir)
  }
  const carried = [layout.intake.rect, ...(layout.staging ? [layout.staging.rect] : []), layout.container.rect]
  const occupied = layout.staging ? [layout.staging.inspectorTile] : []
  const free = (tile: Tile) => !occupied.some((o) => sameTile(o, tile))
  for (const rect of carried) {
    for (const tile of tilesOf(rect)) {
      if (!free(tile)) continue
      for (const dir of DIRECTIONS) {
        const neighbour = step(tile, dir)
        if (!inside(rect, neighbour) || !free(neighbour)) continue
        if (againstBelt(tile, dir) || againstBelt(neighbour, dir)) continue
        link(tile, neighbour)
      }
    }
  }
  return reach
}

function tilesOf(rect: Rect): Tile[] {
  const tiles: Tile[] = []
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) tiles.push({ x, y })
  return tiles
}

function inside(rect: Rect, tile: Tile): boolean {
  return tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h
}

/** Breadth first from start to goal; the fewest tiles wins, belts before carrying on ties. */
function shortestPath(reach: Map<string, Tile[]>, start: Tile, goal: Tile): Tile[] | undefined {
  const cameFrom = new Map<string, Tile | null>([[tileKey(start), null]])
  const queue: Tile[] = [start]
  while (queue.length > 0) {
    const tile = queue.shift()!
    if (sameTile(tile, goal)) {
      const path: Tile[] = []
      for (let at: Tile | null = tile; at; at = cameFrom.get(tileKey(at)) ?? null) path.unshift(at)
      return path
    }
    for (const next of reach.get(tileKey(tile)) ?? []) {
      if (cameFrom.has(tileKey(next))) continue
      cameFrom.set(tileKey(next), tile)
      queue.push(next)
    }
  }
  return undefined
}

function junctionsAlong(path: Tile[], junctions: Map<string, BeltTile>): JunctionSetting[] {
  const settings: JunctionSetting[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const tile = path[i]!
    if (!junctions.has(tileKey(tile))) continue
    const exit = directionBetween(tile, path[i + 1]!)
    if (exit) settings.push({ tile: { x: tile.x, y: tile.y }, exit })
  }
  return settings
}
