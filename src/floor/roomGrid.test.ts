import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTileAfterSlide, restingTiles, tileAfterSlide } from "./motion"
import type { Layout } from "./types"

function state(count: number, roomId = "implementation"): RoomFactoryState {
  const configuration = structuredClone(exampleRooms)
  return { configuration, snapshot: {
    agents: configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: room.id === roomId ? count : 1 }, (_, i) => ({
        id: `${room.id}-${i}`, roomId: room.id, role: room.role, name: `${room.label} ${i + 1}`, status: "working" as const,
      }))),
    tasks: [{ id: "task", label: "Shared task", at: { kind: "room", roomId,
      assignment: { agentIds: [`${roomId}-0`], completedAgentIds: [] } } }],
    humanRequests: [],
  } }
}
const stations = (layout: Layout, roomId = "implementation") => layout.bays.find((bay) => bay.id === `room:${roomId}`)!.stations
const room = (layout: Layout, roomId = "implementation") => layout.rooms!.find((room) => room.id === `room:${roomId}`)!
function assign(value: RoomFactoryState, ids: string[], roomId = "implementation") {
  value.snapshot.tasks[0]!.at = { kind: "room", roomId, assignment: { agentIds: ids, completedAgentIds: [] } }
}

it.each([1, 2, 3, 4, 6, 7])("fills %s agents left-to-right in three-column rows without squeezing desks", (count) => {
  for (const width of [24, 28, 37]) {
    const layout = layoutConfiguredRooms(state(count), undefined, width)
    const footprint = room(layout).rect
    expect(footprint.w).toBe(7 + (Math.min(count, 3) - 1) * 4)
    expect(footprint.h).toBe(7 + (Math.ceil(count / 3) - 1) * 5)
    expect(layout.bounds.w).toBe(width)
    stations(layout).forEach((station, index) => {
      expect(station.bench).toEqual({ x: footprint.x + 3 + index % 3 * 4, y: footprint.y + 5 + Math.floor(index / 3) * 5 })
      expect(station.agentTile).toEqual({ x: station.bench.x, y: station.bench.y - 1 })
      expect(layout.belts.flatMap((belt) => belt.tiles).some((tile) => tile.x === station.agentTile.x && tile.y === station.agentTile.y)).toBe(false)
    })
    for (const candidate of layout.rooms!) {
      expect(candidate.rect.x).toBeGreaterThanOrEqual(1)
      expect(candidate.rect.x + candidate.rect.w).toBeLessThanOrEqual(width - 2)
    }
  }
})

it("preserves station order and identities, reuses vacancies, and compacts only on Reorganize", () => {
  const value = state(7)
  const original = layoutConfiguredRooms(value, undefined, 28)
  const first = stations(original)
  value.snapshot.agents = value.snapshot.agents.filter((agent) => !["implementation-1", "implementation-4"].includes(agent.id)).reverse()
  const removed = layoutConfiguredRooms(value, original)
  expect(stations(removed).map((station) => station.id)).toEqual(first.map((station) => station.id))
  expect(stations(removed).map((station) => station.bench)).toEqual(first.map((station) => station.bench))
  expect(stations(removed).filter((station) => station.vacant).map((station) => station.agentId)).toEqual(["implementation-1", "implementation-4"])
  value.snapshot.agents.push({ id: "new", name: "New", roomId: "implementation", role: "implementer", status: "idle" })
  const joined = layoutConfiguredRooms(value, removed)
  expect(stations(joined)[1]).toMatchObject({ id: first[1]!.id, agentId: "new", vacant: false })
  expect(room(joined).rect).toEqual(room(original).rect)
  const compacted = layoutConfiguredRooms(value, joined, 28, new Set(), true)
  expect(stations(compacted).map((station) => station.agentId)).toEqual(["implementation-0", "new", "implementation-2", "implementation-3", "implementation-5", "implementation-6"])
  expect(stations(compacted).map((station) => station.id)).toEqual(first.filter((_, index) => index !== 4).map((station) => station.id))
  expect(room(compacted).rect.h).toBe(12)
})

it.each(["implementation", "review", "deployment"])("routes shared %s work between every column and row with one box", (roomId) => {
  const value = state(7, roomId)
  let layout = layoutConfiguredRooms(value, undefined, 28)
  for (const index of [2, 6, 1, 5, 0, 4, 3]) {
    assign(value, [`${roomId}-${index}`, `${roomId}-${(index + 1) % 7}`], roomId)
    const next = layoutConfiguredRooms(value, layout)
    expect(next.boxes).toHaveLength(1)
    expect(next.boxes[0]!.tile).toEqual(stations(next, roomId)[index]!.bench)
    expect(motionsFor(next, restingTiles(layout), layout).unrouted).toEqual([])
    layout = next
  }
  value.snapshot.tasks[0]!.at = { kind: "room", roomId }
  let next = layoutConfiguredRooms(value, layout)
  expect(motionsFor(next, restingTiles(layout), layout).unrouted).toEqual([])
  layout = next
  assign(value, [`${roomId}-6`], roomId)
  next = layoutConfiguredRooms(value, layout)
  expect(motionsFor(next, restingTiles(layout), layout).unrouted).toEqual([])
  if (roomId === "deployment") {
    value.snapshot.tasks[0]!.at = { kind: "shipped", roomId }
    const shipped = layoutConfiguredRooms(value, next)
    expect(motionsFor(shipped, restingTiles(next), next).unrouted).toEqual([])
    expect(shipped.shippingDock!.outlet.x).toBe(room(shipped, roomId).rect.x)
  }
})

it("reaches a later row and every column from room queues, then advances station queues", () => {
  const value = state(7)
  value.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation" }
  let queued = layoutConfiguredRooms(value, undefined, 28)
  for (const index of [0, 1, 2, 3, 5, 6]) {
    const assigned = structuredClone(value)
    assign(assigned, [`implementation-${index}`])
    assigned.snapshot.tasks.push({ ...structuredClone(assigned.snapshot.tasks[0]!), id: "queued" })
    const occupied = layoutConfiguredRooms(assigned, queued)
    expect(motionsFor(occupied, restingTiles(queued), queued).unrouted).toEqual([])
    assigned.snapshot.tasks.shift()
    const advanced = layoutConfiguredRooms(assigned, occupied)
    expect(motionsFor(advanced, restingTiles(occupied), occupied).unrouted).toEqual([])
    expect(advanced.boxes).toHaveLength(1)
    queued = layoutConfiguredRooms(value, advanced)
  }
})

it.each(["planning", "implementation", "review", "deployment"])("keeps every ride position routable as %s fills columns then adds rows", (growingRoom) => {
  const original = state(1)
  original.snapshot.tasks[0]!.at = { kind: "room", roomId: "intake" }
  const before = layoutConfiguredRooms(original, undefined, 28)
  const value = structuredClone(original)
  assign(value, ["implementation-0"])
  let riding = layoutConfiguredRooms(value, before)
  let path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  for (const count of [2, 3, 4, 6, 7]) {
    const members = state(count, growingRoom).snapshot.agents
    value.snapshot.agents = members
    const grown = layoutConfiguredRooms(value, riding, 28, new Set(["task"]))
    path = path.map((tile) => {
      const mapped = tileAfterSlide(riding, grown, tile, "task")!
      expect(mapped, JSON.stringify({ growingRoom, count, tile })).toBeDefined()
      expect(motionsFor(grown, { task: mapped }, riding).unrouted, JSON.stringify({ growingRoom, count, tile, mapped })).toEqual([])
      return mapped
    })
    expect(grown.boxes).toHaveLength(1)
    expect(restingTileAfterSlide(riding, grown, "task")).toEqual(stations(grown)[0]!.bench)
    riding = grown
  }
})


it("keeps each declared transition routable between full grids at the minimum floor width", () => {
  const value = state(7)
  value.snapshot.agents = value.configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
    Array.from({ length: 7 }, (_, i) => ({ id: `${room.id}-${i}`, name: `Agent ${i}`, roomId: room.id, role: room.role, status: "working" as const })))
  for (const edge of value.configuration.transitions) {
    value.snapshot.tasks[0]!.at = edge.from === "intake" ? { kind: "room", roomId: edge.from } :
      { kind: "room", roomId: edge.from, assignment: { agentIds: [`${edge.from}-6`], completedAgentIds: [] } }
    const before = layoutConfiguredRooms(value, undefined, 24)
    assign(value, [`${edge.to}-6`], edge.to)
    const after = layoutConfiguredRooms(value, before)
    const motions = motionsFor(after, restingTiles(before), before)
    expect(motions.unrouted, edge.id).toEqual([])
    expect(motions.toPlay).toHaveLength(1)
    const unrelated = after.rooms!.filter((room) => ![edge.from, edge.to].includes(room.id.slice(5)))
    expect(motions.toPlay[0]!.path.some((tile) => unrelated.some(({ rect }) =>
      tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h)), edge.id).toBe(false)
  }
})

it("remaps a same-room return during compaction from three columns to one", () => {
  const value = state(7)
  assign(value, ["implementation-6"])
  const before = layoutConfiguredRooms(value, undefined, 28)
  assign(value, ["implementation-0"])
  const riding = layoutConfiguredRooms(value, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  value.snapshot.agents = value.snapshot.agents.filter((agent) => agent.roomId !== "implementation" || agent.id === "implementation-0")
  const compacted = layoutConfiguredRooms(value, riding, 28, new Set(["task"]), true)
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, compacted, tile, "task")!
    expect(mapped, JSON.stringify(tile)).toBeDefined()
    expect(motionsFor(compacted, { task: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
  expect(compacted.boxes).toHaveLength(1)
  expect(stations(compacted)).toHaveLength(1)
})
