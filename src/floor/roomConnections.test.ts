import { expect, it } from "vitest"
import type { RoomTransition } from "~/model/types"
import type { Rect, RoomFootprint, Tile } from "./types"
import { routeRoomConnections } from "./roomConnections"

function room(id: string, x: number, y: number, w = 7, h = 6, west = false, kind: RoomFootprint["kind"] = "work"): RoomFootprint {
  const left = { x, y: y + 4 }, right = { x: x + w - 1, y: y + 4 }
  return { id: `room:${id}`, label: id, kind, rect: { x, y, w, h }, door: { x, y }, ports: west ? [right, left] : [left, right] }
}
const edge = (id: string, from: string, to: string): RoomTransition => ({ id, from, to, outcome: id })
const inside = (rect: Rect, tile: Tile) => tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y
const base = [room("a", 2, 3), room("b", 13, 3), room("c", 2, 12, 7, 6, true), room("deployment", 13, 22, 7, 7, true, "deployment")]

it("uses adjacent outside side-port cells and stays out of every room between endpoints", () => {
  const transitions = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ship", "c", "deployment")]
  const connections = routeRoomConnections(base, transitions, 24)
  for (const connection of connections) {
    const source = base.find((room) => room.id === `room:${connection.transition.from}`)!
    const target = base.find((room) => room.id === `room:${connection.transition.to}`)!
    const start = source.ports[1]!, finish = target.ports[0]!
    expect(connection.path[0]).toEqual(start)
    expect(connection.path.at(-1)).toEqual(finish)
    expect(connection.path[1]).toEqual({ x: start.x + (start.x === source.rect.x ? -1 : 1), y: start.y })
    expect(connection.path.at(-2)).toEqual({ x: finish.x + (finish.x === target.rect.x ? -1 : 1), y: finish.y })
    for (const tile of connection.path.slice(1, -1)) expect(base.some((room) => inside(room.rect, tile))).toBe(false)
    connection.path.forEach((tile, index) => {
      expect(tile.x).toBeGreaterThanOrEqual(0); expect(tile.x).toBeLessThan(24)
      expect(tile.y).toBeGreaterThanOrEqual(0); expect(tile.y).toBeLessThanOrEqual(base.at(-1)!.ports[1]!.y)
      if (index) expect(Math.abs(tile.x - connection.path[index - 1]!.x) + Math.abs(tile.y - connection.path[index - 1]!.y)).toBe(1)
    })
  }
})

it("detours around an unrelated room instead of crossing its front or rear walls", () => {
  const rooms = [room("a", 1, 3), room("obstacle", 11, 3), room("b", 21, 3), room("deployment", 10, 14, 7, 7, true, "deployment")]
  const path = routeRoomConnections(rooms, [edge("long", "a", "b")], 30)[0]!.path
  expect(path.some((tile) => tile.y !== path[0]!.y)).toBe(true)
  expect(path.some((tile) => inside(rooms[1]!.rect, tile))).toBe(false)
})

it("supports self loops, backward connections and shared straight corridors deterministically", () => {
  const transitions = [edge("z-return", "c", "a"), edge("a-forward", "a", "b"), edge("same-route", "a", "b"), edge("b-self", "b", "b"), edge("ship", "b", "deployment")]
  const original = routeRoomConnections(base, transitions, 24)
  expect(original.map((connection) => connection.transition.id)).toEqual(transitions.map((transition) => transition.id))
  expect(routeRoomConnections(base, transitions, 24)).toEqual(original)
  const reversed = routeRoomConnections([...base].reverse(), [...transitions].reverse(), 24)
  for (const connection of original) expect(reversed.find((other) => other.transition.id === connection.transition.id)!.path).toEqual(connection.path)
  expect(original[1]!.path).toEqual(original[2]!.path)
  expect(original.find((connection) => connection.transition.id === "b-self")!.path.length).toBeGreaterThan(7)
})

it("keeps all room traffic above the deployment exit and off its first loading tile", () => {
  const rooms = [room("a", 1, 3), room("b", 1, 12), room("deployment", 10, 12, 7, 7, true, "deployment")]
  const transitions = [edge("incoming", "b", "deployment"), edge("return", "b", "a"), edge("far", "a", "deployment")]
  const connections = routeRoomConnections(rooms, transitions, 24)
  const deployment = rooms.at(-1)!, stub = { x: deployment.rect.x - 1, y: deployment.ports[1]!.y }
  for (const { path } of connections) {
    expect(path.some((tile) => same(tile, stub))).toBe(false)
    expect(path.every((tile) => tile.y <= stub.y)).toBe(true)
  }
})

it("derives side entry heights from ports rather than a fixed station-row offset", () => {
  const rooms = base.map((value) => structuredClone(value))
  rooms[0]!.ports = rooms[0]!.ports.map((port) => ({ ...port, y: port.y - 1 }))
  const path = routeRoomConnections(rooms, [edge("varied", "a", "b")], 24)[0]!.path
  expect(path[0]!.y).toBe(rooms[0]!.rect.y + 3)
  expect(path.at(-1)!.y).toBe(rooms[1]!.rect.y + 4)
})

it("throws a clear error when the bounded exterior has no path", () => {
  const rooms = [room("a", 1, 3), room("barrier", 9, 0, 3, 30), room("deployment", 15, 12, 7, 7, true, "deployment")]
  expect(() => routeRoomConnections(rooms, [edge("blocked", "a", "deployment")], 24)).toThrow(/blocked.*a.*deployment.*no exterior path/i)
})

it("rejects rear ports and unknown endpoints instead of drawing ghost conveyors", () => {
  const invalid = base.map((value) => structuredClone(value))
  invalid[0]!.ports[1] = { x: invalid[0]!.rect.x + 2, y: invalid[0]!.rect.y }
  expect(() => routeRoomConnections(invalid, [edge("bad", "a", "b")], 24)).toThrow(/side.*port|port.*side/i)
  expect(() => routeRoomConnections(base, [edge("missing", "a", "unknown")], 24)).toThrow(/unknown/i)
})


it.each([24, 28, 37])("routes dense grown footprints through two-tile gaps at width %s", (width) => {
  const rooms: RoomFootprint[] = []
  let x = 1, y = 3, bottom = 3
  for (let i = 0; i < 11; i++) {
    const terminal = i === 10
    const w = terminal ? 7 : [7, 11, 15][i % 3]!, h = terminal ? 7 : 6 + i % 2 * 5
    if (x + w > width - 2) { x = 1; y = bottom + 3 }
    rooms.push(room(terminal ? "deployment" : `work-${i}`, x, y, w, h, terminal || i % 2 === 1, terminal ? "deployment" : "work"))
    x += w + 2; bottom = Math.max(bottom, y + h)
  }
  const transitions = rooms.slice(1).map((target, i) => edge(`forward-${i}`, rooms[i]!.id.slice(5), target.id.slice(5)))
  transitions.push(edge("far-return", "work-8", "work-1"), edge("loop", "work-5", "work-5"), edge("skip", "work-0", "work-9"))
  const connections = routeRoomConnections(rooms, transitions, width)
  expect(connections).toHaveLength(transitions.length)
  for (const { path } of connections) {
    for (const tile of path.slice(1, -1)) {
      expect(rooms.some((room) => inside(room.rect, tile)), JSON.stringify(tile)).toBe(false)
      expect(tile.x).toBeGreaterThanOrEqual(0); expect(tile.x).toBeLessThan(width)
    }
  }
})


it("protects the explicitly current terminal while an old terminal footprint is retained", () => {
  const rooms = [...base, room("new-deployment", 13, 34, 7, 7, true, "deployment")]
  const transitions = [edge("replacement", "b", "new-deployment")]
  const path = routeRoomConnections(rooms, transitions, 24, "new-deployment")[0]!.path
  expect(path.at(-1)).toEqual(rooms.at(-1)!.ports[0])
  expect(path.some((tile) => same(tile, { x: 12, y: 38 }))).toBe(false)
  expect(() => routeRoomConnections(rooms, transitions, 24, "missing")).toThrow(/current deployment.*missing/i)
  expect(() => routeRoomConnections(rooms, transitions, 24, "a")).toThrow(/current deployment.*a/i)
})
