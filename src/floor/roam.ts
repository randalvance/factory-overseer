// Where the main agent's pet may roam, and how it gets about. It has no
// station: it strolls the open paper around the rooms, the gaps between them
// and the road, never across a belt, through a wall or under the truck, and
// pauses beside a room's door, in front of its benches, at the hopper or by
// the truck. Pure, like the rest of the floor core: the ground and the
// strolls are derived from a layout, and the view walks the sprite along
// them. Nothing here moves anything else on the floor.

import { DIRECTIONS, sameTile, step, tileKey } from "./tiles"
import type { Direction, Layout, Rect, Tile } from "./types"

/** A place the pet pauses at: beside a door, in front of a room's benches, at the hopper or by the truck. */
export interface Spot {
  tile: Tile
  /** The room the spot belongs to, by the host's id; "truck" for the truck. */
  roomId: string
  kind: "door" | "bench" | "hopper" | "truck"
}

/** The open paper of a layout and the spots on it. */
export interface Ground {
  /** Every tile the pet may stand on, by key. */
  open: ReadonlySet<string>
  spots: readonly Spot[]
  /** Where the pet comes onto the floor: the road's west end, or the first open tile. */
  entry: Tile | undefined
}

/** One walk from where the pet stands to a spot, tile centre to tile centre. */
export interface Stroll {
  spot: Spot
  /** From the tile it stands on to the spot's, each a neighbour of the last. */
  path: Tile[]
}

/** What the pet is up to, for its card. */
export type Whereabouts =
  | { kind: "walking"; spot: Spot }
  | { kind: "pausing"; spot: Spot }
  /** Nowhere to go from where it stands. */
  | { kind: "standing" }

/** Tiles walked, and extra tiles a turn counts as, so a stroll goes straight as long as it can. */
const STEP_COST = 2
const TURN_COST = 1

/**
 * The open paper of a layout: every tile within the floor, and the row in
 * front of it where the road runs, that no room, belt or truck is on. Rooms
 * are walls to their edge, the hopper's yard included; belts are never
 * crossed; the truck's whole body is kept clear.
 */
export function roamingGround(layout: Layout): Ground {
  const { bounds } = layout
  const blocked = new Set<string>()
  const block = (rect: Rect) => {
    for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.h); y++) {
      for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.w); x++) blocked.add(tileKey({ x, y }))
    }
  }
  for (const room of layout.rooms ?? []) block(room.rect)
  for (const belt of layout.belts) for (const tile of belt.tiles) blocked.add(tileKey(tile))
  if (layout.shippingDock) {
    block(layout.shippingDock.bodyFootprint)
    for (const tile of layout.shippingDock.cargoTiles) blocked.add(tileKey(tile))
  } else {
    block(layout.container.rect)
  }
  if (!layout.rooms) {
    block(layout.intake.rect)
    for (const bay of layout.bays) block(bay.rect)
    if (layout.staging) block(layout.staging.rect)
  }
  const open = new Set<string>()
  for (let y = bounds.y; y <= bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const key = tileKey({ x, y })
      if (!blocked.has(key)) open.add(key)
    }
  }
  return { open, spots: spotsOn(layout, open), entry: entryOn(layout, open) }
}

/**
 * The spots: beside each room's door, outside its side wall; in front of
 * each of its bench columns, on the first open row before the room; the
 * hopper's forecourt for an intake with no benches; and the road just past
 * the truck's cab. A spot a belt runs over is left out.
 */
function spotsOn(layout: Layout, open: ReadonlySet<string>): Spot[] {
  const spots: Spot[] = []
  const place = (tile: Tile, roomId: string, kind: Spot["kind"]) => {
    if (open.has(tileKey(tile)) && !spots.some((spot) => sameTile(spot.tile, tile))) spots.push({ tile, roomId, kind })
  }
  for (const room of layout.rooms ?? []) {
    const roomId = room.id.replace(/^room:/, "")
    const { rect } = room
    if (room.kind !== "intake") {
      // Beside the door, outside the side wall; past the belt when one runs down that wall.
      const outward = room.door.x <= rect.x ? -1 : 1
      const beside = [1, 2, 3].map((away) => ({ x: room.door.x + outward * away, y: rect.y })).find((tile) => open.has(tileKey(tile)))
      if (beside) place(beside, roomId, "door")
    }
    const benches = layout.bays.find((bay) => bay.id === room.id)?.stations.map((station) => station.bench.x) ?? []
    const middle = rect.x + Math.floor(rect.w / 2)
    // In front of each bench column; the hopper's forecourt is the column nearest the middle with open paper before it.
    const columns = benches.length ? [...new Set(benches)].sort((a, b) => a - b) :
      Array.from({ length: rect.w }, (_, i) => rect.x + i).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)
    for (const x of columns) {
      const front = [0, 1, 2].map((ahead) => ({ x, y: rect.y + rect.h + ahead })).find((tile) => open.has(tileKey(tile)))
      if (!front) continue
      place(front, roomId, room.kind === "intake" && !benches.length ? "hopper" : "bench")
      if (!benches.length) break
    }
  }
  const dock = layout.shippingDock
  if (dock) place({ x: Math.floor(dock.bodyFootprint.x) - 1, y: dock.streetY }, "truck", "truck")
  return spots
}

/** The road's west end, the row in front of the floor from the west, the far corner, or any open tile. */
function entryOn(layout: Layout, open: ReadonlySet<string>): Tile | undefined {
  const { bounds } = layout
  const rows = [layout.shippingDock?.streetY, bounds.y + bounds.h, bounds.y].filter((y): y is number => y !== undefined)
  for (const y of rows) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) if (open.has(tileKey({ x, y }))) return { x, y }
  }
  for (let y = bounds.y; y <= bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) if (open.has(tileKey({ x, y }))) return { x, y }
  }
  return undefined
}

/**
 * The shortest stroll over the open paper from one tile to another, from
 * tile centre to tile centre, going straight for as long as it can: both
 * tiles included, or nothing when no open way joins them.
 */
export function strollPath(ground: Ground, from: Tile, to: Tile): Tile[] | undefined {
  if (!ground.open.has(tileKey(from)) || !ground.open.has(tileKey(to))) return undefined
  if (sameTile(from, to)) return [{ ...from }]
  interface Node { tile: Tile; heading: Direction | undefined; cost: number; previous: Node | undefined }
  const settled = new Set<string>()
  const stateKey = (tile: Tile, heading: Direction | undefined) => `${tileKey(tile)}:${heading ?? "-"}`
  // Costs are small integers, so a bucket per cost is the queue.
  const buckets: Node[][] = [[{ tile: from, heading: undefined, cost: 0, previous: undefined }]]
  for (let cost = 0; cost < buckets.length; cost++) {
    for (let i = 0; i < (buckets[cost]?.length ?? 0); i++) {
      const node = buckets[cost]![i]!
      const key = stateKey(node.tile, node.heading)
      if (settled.has(key)) continue
      settled.add(key)
      if (sameTile(node.tile, to)) {
        const path: Tile[] = []
        for (let at: Node | undefined = node; at; at = at.previous) path.push({ ...at.tile })
        return path.reverse()
      }
      for (const direction of DIRECTIONS) {
        const tile = step(node.tile, direction)
        if (!ground.open.has(tileKey(tile)) || settled.has(stateKey(tile, direction))) continue
        const next = node.cost + STEP_COST + (node.heading && node.heading !== direction ? TURN_COST : 0)
        ;(buckets[next] ??= []).push({ tile, heading: direction, cost: next, previous: node })
      }
    }
  }
  return undefined
}

/** Every open tile a walk from the tile can reach, the tile itself included; nothing when the tile is not open. */
export function reachable(ground: Ground, from: Tile): Set<string> {
  const seen = new Set<string>()
  if (!ground.open.has(tileKey(from))) return seen
  const queue = [from]
  seen.add(tileKey(from))
  for (let i = 0; i < queue.length; i++) {
    for (const direction of DIRECTIONS) {
      const tile = step(queue[i]!, direction)
      const key = tileKey(tile)
      if (ground.open.has(key) && !seen.has(key)) {
        seen.add(key)
        queue.push(tile)
      }
    }
  }
  return seen
}

/**
 * The next stroll from where the pet stands: to one of the spots a walk can
 * reach, somewhere other than where it is, chosen by a number from 0 up to
 * 1 so that the view can take its chances and a test can name its choice.
 * Nothing when no other spot can be reached.
 */
export function nextStroll(ground: Ground, from: Tile, choice: number): Stroll | undefined {
  const within = reachable(ground, from)
  const here = ground.spots.find((spot) => sameTile(spot.tile, from))
  const elsewhere = ground.spots.filter((spot) => within.has(tileKey(spot.tile)) && !sameTile(spot.tile, from) && (!here || spot.roomId !== here.roomId))
  const choices = elsewhere.length ? elsewhere : ground.spots.filter((spot) => within.has(tileKey(spot.tile)) && !sameTile(spot.tile, from))
  if (!choices.length) return undefined
  const spot = choices[Math.min(choices.length - 1, Math.max(0, Math.floor(choice * choices.length)))]!
  const path = strollPath(ground, from, spot.tile)
  return path && { spot, path }
}

/** The open tile nearest the tile, the tile itself when open, or nothing on a floor with no open paper. */
export function nearestOpen(ground: Ground, tile: Tile): Tile | undefined {
  if (ground.open.has(tileKey(tile))) return { ...tile }
  let best: Tile | undefined
  let bestDistance = Infinity
  for (const key of ground.open) {
    const [x, y] = key.split(",").map(Number) as [number, number]
    const distance = Math.abs(x - tile.x) + Math.abs(y - tile.y)
    if (distance < bestDistance || (distance === bestDistance && best && (y < best.y || (y === best.y && x < best.x)))) {
      best = { x, y }
      bestDistance = distance
    }
  }
  return best
}
