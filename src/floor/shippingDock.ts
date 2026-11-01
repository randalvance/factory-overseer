import type { Rect, Tile } from "./types"

export interface ShippingDock {
  /** Truck center. Its cab faces west and the open rear faces east. */
  x: number
  z: number
  streetY: number
  outlet: Tile
  rear: { x: number; z: number }
  cargoTiles: Tile[]
  connectorPath: Tile[]
  bodyFootprint: Rect
  footprint: Rect
}

const TRUCK_LENGTH = 3.7
const TRUCK_WIDTH = 2.4
const TRUCK_REAR_OFFSET = 1.626

/** Physical terminal dock, independent of meshes and materials. The raised
 * conveyor leaves the left wall on the first station row, then reaches the
 * truck's open rear on the foreground road. Blockers reserve rooms and belts.
 */
export function shippingDock(deployment: Rect, blockers: readonly Rect[] = [], routeBlockers: readonly Rect[] = blockers): ShippingDock {
  const outlet = { x: deployment.x, y: deployment.y + 3 }
  // A leftmost room still loads a truck fully inside the floor. Its exterior
  // belt turns below the house before joining this east-facing cargo opening.
  const approachX = Math.max(4, outlet.x)
  const x = approachX - 1.7
  // Keep the horizontal exit road in front of every room. Existing belts
  // can cross a loading conveyor at a real junction but cannot park under
  // the truck, so parking and routing have separate obstacle sets.
  let streetY = Math.ceil(Math.max(deployment.y + deployment.h, ...routeBlockers.map((rect) => rect.y + rect.h)) + 2)
  let bodyFootprint = truckRect(x, streetY)
  let collision = blockers.find((rect) => intersects(bodyFootprint, rect, .1))
  while (collision) {
    streetY = Math.ceil(collision.y + collision.h + .81)
    bodyFootprint = truckRect(x, streetY)
    collision = blockers.find((rect) => intersects(bodyFootprint, rect, .1))
  }
  const z = streetY + .5
  const cargoTiles = [{ x: approachX - 1, y: streetY }, { x: approachX - 2, y: streetY }]
  const exit = { x: outlet.x - 1, y: outlet.y }
  const bend = { x: approachX, y: streetY }
  // Parking reserves the full conservative footprint. The loading path
  // only avoids the actual shell: its open rear ends before the approach
  // column, so that column can approach the truck in one straight run.
  const shell = { ...bodyFootprint, w: x + TRUCK_REAR_OFFSET + .02 - bodyFootprint.x }
  const exterior = exteriorPath(exit, bend, [deployment, ...routeBlockers], shell)
  const connectorPath: Tile[] = [outlet, ...exterior, ...cargoTiles]
  return {
    x, z, streetY, outlet, cargoTiles, connectorPath,
    rear: { x: x + TRUCK_REAR_OFFSET, z },
    bodyFootprint, footprint: { ...bodyFootprint },
  }
}

function truckRect(x: number, streetY: number): Rect {
  return { x: x - TRUCK_LENGTH / 2, y: streetY + .5 - TRUCK_WIDTH / 2, w: TRUCK_LENGTH, h: TRUCK_WIDTH }
}

function intersects(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w > b.x - gap &&
    a.y < b.y + b.h + gap && a.y + a.h > b.y - gap
}

/** A short grid route around a crowded forecourt. The destination is outside
 * the real cargo shell but touches its conservative parking envelope.
 */
function exteriorPath(from: Tile, to: Tile, blockers: readonly Rect[], truck: Rect): Tile[] {
  const minX = Math.floor(Math.min(from.x, to.x, ...blockers.map((r) => r.x), truck.x)) - 3
  const maxX = Math.ceil(Math.max(from.x, to.x, ...blockers.map((r) => r.x + r.w), truck.x + truck.w)) + 3
  const minY = from.y
  const maxY = Math.max(to.y + 3, ...blockers.map((r) => Math.ceil(r.y + r.h) + 2))
  const key = (at: Tile) => at.x + "," + at.y
  const queue: Tile[] = [{ ...from }]
  const previous = new Map<string, Tile | undefined>([[key(from), undefined]])
  let index = 0
  while (index < queue.length) {
    const at = queue[index++]!
    if (at.x === to.x && at.y === to.y) {
      const path: Tile[] = [at]
      let prior = previous.get(key(at))
      while (prior) { path.push(prior); prior = previous.get(key(prior)) }
      return path.reverse()
    }
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const next = { x: at.x + dx!, y: at.y + dy! }
      if (next.x < minX || next.x > maxX || next.y < minY || next.y > maxY || previous.has(key(next))) continue
      const destination = next.x === to.x && next.y === to.y
      const square = { ...next, w: 1, h: 1 }
      if (blockers.some((rect) => intersects(square, rect)) || (!destination && intersects(square, truck))) continue
      previous.set(key(next), at); queue.push(next)
    }
  }
  // The perimeter outside every finite blocker provides an escape in normal
  // layouts. A sealed exit is a genuine layout error rather than a ghost belt.
  throw new Error("Deployment loading door has no clear path to its truck")
}
