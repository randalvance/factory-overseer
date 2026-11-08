import type { RoomTransition } from "~/model/types"
import type { Direction, RoomFootprint, Tile } from "./types"
import { opposite, sameTile, step, tileKey } from "./tiles"

export interface ConnectionPath { transition: RoomTransition; path: Tile[] }
const DIRECTIONS: Direction[] = ["n", "e", "s", "w"]
const arc = (from: Tile, to: Tile) => `${tileKey(from)}>${tileKey(to)}`
const axis = (direction: Direction) => direction === "e" || direction === "w" ? 1 : 2

/** Side ports alone cross room boundaries. Search takes place entirely outside
 * every footprint; neither source nor destination gets a room-wide exemption.
 * Deployment is physically last, so room traffic can stay above its outlet
 * and cannot join the loading conveyor before passing a deployment station.
 */
export function routeRoomConnections(rooms: readonly RoomFootprint[], transitions: readonly RoomTransition[], width: number, terminalId?: string, sourceInlets: ReadonlySet<string> = new Set()): ConnectionPath[] {
  if (!Number.isInteger(width) || width < 1) throw new Error("Exterior room routing needs a positive integer width")
  if (!transitions.length) return []
  // Retired endpoints may include an old terminal while unrelated boxes
  // finish riding. Only the current terminal owns the protected loading spur.
  const terminal = rooms.find((room) => room.kind === "deployment" && (terminalId === undefined || room.id === `room:${terminalId}`))
  if (!terminal) throw new Error(terminalId === undefined ? "Exterior room routing needs a deployment room" :
    `Exterior room routing has no current deployment room ${terminalId}`)
  const outlet = sidePort(terminal, 1)
  const maxY = outlet.tile.y
  const byId = new Map(rooms.map((room) => [room.id.slice(5), room]))
  const blocked = new Set<string>()
  for (const { rect } of rooms) {
    for (let y = Math.max(0, rect.y); y < Math.min(rect.y + rect.h, maxY + 1); y++) {
      for (let x = Math.max(0, rect.x); x < Math.min(rect.x + rect.w, width); x++) blocked.add(tileKey({ x, y }))
    }
  }
  blocked.add(tileKey({ x: terminal.rect.x - 1, y: maxY }))
  const free = (tile: Tile) => tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y <= maxY && !blocked.has(tileKey(tile))
  const used = new Set<string>()
  const usedAxes = new Map<string, number>()
  const result = new Map<RoomTransition, ConnectionPath>()
  // Lane reuse must not make geometry depend on the order a host serializes
  // its graph. IDs choose construction order; returned connections retain host order.
  const ordered = [...transitions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  for (const transition of ordered) {
    const source = byId.get(transition.from), target = byId.get(transition.to)
    if (!source || !target) throw new Error(`Room connection ${transition.id} references unknown room ${!source ? transition.from : transition.to}`)
    const start = sidePort(source, sourceInlets.has(transition.id) ? 0 : 1), finish = sidePort(target, 0)
    const exterior = free(start.outside) && free(finish.outside)
      ? search(start.outside, finish.outside, start.outward, opposite(finish.outward), free, used, usedAxes)
      : undefined
    if (!exterior) throw new Error(`Room connection ${transition.id} (${transition.from} → ${transition.to}): no exterior path within floor width ${width}`)
    const path = [{ ...start.tile }, ...exterior, { ...finish.tile }]
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1]!, to = path[i]!
      used.add(arc(from, to))
      const along = from.x === to.x ? 2 : 1
      usedAxes.set(tileKey(from), (usedAxes.get(tileKey(from)) ?? 0) | along)
      usedAxes.set(tileKey(to), (usedAxes.get(tileKey(to)) ?? 0) | along)
    }
    result.set(transition, { transition, path })
  }
  return transitions.map((transition) => result.get(transition)!)
}

function sidePort(room: RoomFootprint, index: 0 | 1): { tile: Tile; outside: Tile; outward: Direction } {
  const tile = room.ports[index], { rect } = room
  if (!tile || !Number.isInteger(tile.x) || !Number.isInteger(tile.y) ||
    (tile.x !== rect.x && tile.x !== rect.x + rect.w - 1) || tile.y < rect.y || tile.y >= rect.y + rect.h) {
    throw new Error(`Room ${room.id} ${index ? "outlet" : "inlet"} must be a left or right side port`)
  }
  const outward = tile.x === rect.x ? "w" : "e"
  return { tile, outward, outside: { x: tile.x + (outward === "w" ? -1 : 1), y: tile.y } }
}

interface SearchNode {
  tile: Tile
  heading: Direction
  cost: number
  estimate: number
  serial: number
  previous?: SearchNode
}

/** Heading is part of a state so a short straight corridor wins over a zigzag.
 * Positive costs keep loops finite. The .92 heuristic is admissible even on
 * reused segments, whose discount is deliberately too small to justify detours.
 */
function search(start: Tile, finish: Tile, initial: Direction, final: Direction, free: (tile: Tile) => boolean,
  used: ReadonlySet<string>, usedAxes: ReadonlyMap<string, number>): Tile[] | undefined {
  const estimate = (tile: Tile) => (Math.abs(tile.x - finish.x) + Math.abs(tile.y - finish.y)) * .92
  const states = new Map<string, number>()
  const stateKey = (tile: Tile, heading: Direction) => `${tileKey(tile)},${heading}`
  const queue = new MinHeap()
  let serial = 0
  const first: SearchNode = { tile: start, heading: initial, cost: 0, estimate: estimate(start), serial: serial++ }
  queue.push(first); states.set(stateKey(start, initial), 0)
  while (queue.size) {
    const current = queue.pop()!
    if (states.get(stateKey(current.tile, current.heading)) !== current.cost) continue
    if (sameTile(current.tile, finish)) {
      const path: Tile[] = []
      for (let node: SearchNode | undefined = current; node; node = node.previous) path.push({ ...node.tile })
      return path.reverse()
    }
    for (const direction of DIRECTIONS) {
      const tile = step(current.tile, direction)
      if (!free(tile)) continue
      const existing = used.has(arc(current.tile, tile))
      const reverse = used.has(arc(tile, current.tile))
      const perpendicular = (usedAxes.get(tileKey(tile)) ?? 0) === (axis(direction) === 1 ? 2 : 1)
      const turn = direction !== current.heading ? .12 : 0
      const arrivalTurn = sameTile(tile, finish) && direction !== final ? .12 : 0
      const cost = current.cost + (existing ? .92 : reverse ? 1.12 : 1) + turn + arrivalTurn + (perpendicular ? .06 : 0)
      const id = stateKey(tile, direction)
      if (cost >= (states.get(id) ?? Infinity) - 1e-9) continue
      states.set(id, cost)
      queue.push({ tile, heading: direction, cost, estimate: cost + estimate(tile), serial: serial++, previous: current })
    }
  }
  return undefined
}

/** Stable binary heap keeps large grown factories off quadratic queue sorting. */
class MinHeap {
  private values: SearchNode[] = []
  get size() { return this.values.length }
  private before(a: SearchNode, b: SearchNode) {
    return a.estimate < b.estimate || (a.estimate === b.estimate && (a.cost > b.cost || (a.cost === b.cost && a.serial < b.serial)))
  }
  push(node: SearchNode) {
    this.values.push(node)
    let at = this.values.length - 1
    while (at) {
      const parent = Math.floor((at - 1) / 2)
      if (!this.before(node, this.values[parent]!)) break
      this.values[at] = this.values[parent]!
      at = parent
    }
    this.values[at] = node
  }
  pop(): SearchNode | undefined {
    const first = this.values[0], last = this.values.pop()
    if (!this.values.length || !last) return first
    let at = 0
    while (at * 2 + 1 < this.values.length) {
      const left = at * 2 + 1, right = left + 1
      const child = right < this.values.length && this.before(this.values[right]!, this.values[left]!) ? right : left
      if (!this.before(this.values[child]!, last)) break
      this.values[at] = this.values[child]!
      at = child
    }
    this.values[at] = last
    return first
  }
}
