import { describe, expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { tileKey } from "./tiles"
import type { Layout, Tile } from "./types"
import { type Ground, nearestOpen, nextStroll, reachable, roamingGround, strollPath } from "./roam"

/** The example rooms with perRoom idle agents in every room but intake, and no work. */
function staffed(perRoom = 1): RoomFactoryState {
  return {
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
        Array.from({ length: perRoom }, (_, i) => ({ id: `${room.id}-${i}`, name: room.label, role: room.role, roomId: room.id, status: "idle" as const }))),
      tasks: [],
      humanRequests: [],
    },
  }
}

const inRect = (tile: Tile, rect: { x: number; y: number; w: number; h: number }) =>
  tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h
const tiles = (ground: Ground) => [...ground.open].map((key) => { const [x, y] = key.split(",").map(Number); return { x: x!, y: y! } })
const neighbours = (path: Tile[]) => path.every((tile, i) => i === 0 || Math.abs(tile.x - path[i - 1]!.x) + Math.abs(tile.y - path[i - 1]!.y) === 1)
const turns = (path: Tile[]) => path.filter((tile, i) => i >= 2 && (tile.x - path[i - 1]!.x !== path[i - 1]!.x - path[i - 2]!.x || tile.y - path[i - 1]!.y !== path[i - 1]!.y - path[i - 2]!.y)).length

describe("the open paper", () => {
  const layout = layoutConfiguredRooms(staffed(), undefined, 28)
  const ground = roamingGround(layout)

  it("keeps clear of every room, belt and the truck, and stays within the floor's rows, the road and the row before it included", () => {
    for (const tile of tiles(ground)) {
      for (const room of layout.rooms!) expect(inRect(tile, room.rect), `${tileKey(tile)} is inside ${room.id}`).toBe(false)
      for (const belt of layout.belts) for (const laid of belt.tiles) expect(tileKey(laid)).not.toBe(tileKey(tile))
      expect(inRect(tile, { ...layout.shippingDock!.bodyFootprint, x: Math.floor(layout.shippingDock!.bodyFootprint.x), w: 5 }), `${tileKey(tile)} is under the truck`).toBe(false)
      expect(tile.x).toBeGreaterThanOrEqual(0)
      expect(tile.x).toBeLessThan(layout.bounds.w)
      expect(tile.y).toBeGreaterThanOrEqual(0)
      expect(tile.y).toBeLessThan(layout.bounds.h)
    }
    expect(ground.open.has(tileKey({ x: 0, y: 0 }))).toBe(true)
    expect(ground.open.has(tileKey({ x: 14, y: layout.shippingDock!.streetY }))).toBe(true)
    expect(ground.open.has(tileKey({ x: 14, y: layout.bounds.h - 1 }))).toBe(true)
    expect(ground.open.has(tileKey({ x: 14, y: layout.bounds.h }))).toBe(false)
    const planning = layout.rooms!.find((room) => room.id === "room:planning")!
    expect(ground.open.has(tileKey({ x: planning.rect.x - 1, y: planning.rect.y + 1 }))).toBe(true)
    expect(ground.open.has(tileKey(planning.door))).toBe(false)
  })

  it("comes onto the floor at the road's west end", () => {
    expect(ground.entry).toEqual({ x: 0, y: layout.shippingDock!.streetY })
  })

  it("has a spot beside every room's door, in front of each bench column, at the hopper and by the truck, all on open paper", () => {
    for (const spot of ground.spots) expect(ground.open.has(tileKey(spot.tile)), `${spot.kind} at ${tileKey(spot.tile)} is open`).toBe(true)
    for (const room of layout.rooms!) {
      const roomId = room.id.slice(5)
      const benches = layout.bays.find((bay) => bay.id === room.id)!.stations
      if (room.kind === "intake") {
        const hopper = ground.spots.find((spot) => spot.roomId === roomId)!
        expect(hopper.kind).toBe("hopper")
        expect(hopper.tile.x).toBeGreaterThanOrEqual(room.rect.x)
        expect(hopper.tile.x).toBeLessThan(room.rect.x + room.rect.w)
        expect(hopper.tile.y).toBeGreaterThanOrEqual(room.rect.y + room.rect.h)
        expect(hopper.tile.y).toBeLessThan(room.rect.y + room.rect.h + 3)
        continue
      }
      const door = ground.spots.find((spot) => spot.roomId === roomId && spot.kind === "door")!
      expect(door, `a door spot for ${roomId}`).toBeDefined()
      expect(door.tile.y).toBe(room.rect.y)
      expect(Math.abs(door.tile.x - room.door.x)).toBeGreaterThanOrEqual(1)
      expect(Math.abs(door.tile.x - room.door.x)).toBeLessThanOrEqual(3)
      expect(inRect(door.tile, room.rect)).toBe(false)
      const front = ground.spots.filter((spot) => spot.roomId === roomId && spot.kind === "bench")
      expect(front.map((spot) => spot.tile.x)).toEqual(benches.map((station) => station.bench.x))
      for (const spot of front) {
        expect(spot.tile.y).toBeGreaterThanOrEqual(room.rect.y + room.rect.h)
        expect(spot.tile.y).toBeLessThan(room.rect.y + room.rect.h + 3)
      }
    }
    const truck = ground.spots.find((spot) => spot.kind === "truck")!
    expect(truck.tile).toEqual({ x: Math.floor(layout.shippingDock!.bodyFootprint.x) - 1, y: layout.shippingDock!.streetY })
  })

  it("gives a room a front spot per bench column as it grows, a door spot past the belt down its wall, and the hopper one forecourt", () => {
    const grown = roamingGround(layoutConfiguredRooms(staffed(3), layout, 28))
    expect(grown.spots.filter((spot) => spot.roomId === "implementation" && spot.kind === "bench")).toHaveLength(3)
    expect(grown.spots.filter((spot) => spot.roomId === "intake").map((spot) => spot.kind)).toEqual(["hopper"])
    for (const roomId of ["planning", "implementation", "review", "deployment"]) {
      expect(grown.spots.filter((spot) => spot.roomId === roomId && spot.kind === "door"), `${roomId} door`).toHaveLength(1)
    }
  })
})

describe("a stroll", () => {
  const layout = layoutConfiguredRooms(staffed(), undefined, 28)
  const ground = roamingGround(layout)

  it("joins two tiles with neighbouring open tiles, both ends included", () => {
    for (const spot of ground.spots) {
      const path = strollPath(ground, ground.entry!, spot.tile)
      expect(path, `a way to the ${spot.roomId} ${spot.kind}`).toBeDefined()
      expect(path![0]).toEqual(ground.entry)
      expect(path!.at(-1)).toEqual(spot.tile)
      expect(neighbours(path!)).toBe(true)
      for (const tile of path!) expect(ground.open.has(tileKey(tile))).toBe(true)
    }
  })

  it("goes straight for as long as it can: one turn across an open field, none along a row", () => {
    const field: Ground = { open: new Set(Array.from({ length: 100 }, (_, i) => tileKey({ x: i % 10, y: Math.floor(i / 10) }))), spots: [], entry: { x: 0, y: 0 } }
    const across = strollPath(field, { x: 0, y: 0 }, { x: 7, y: 4 })!
    expect(across).toHaveLength(12)
    expect(turns(across)).toBe(1)
    const along = strollPath(field, { x: 2, y: 3 }, { x: 8, y: 3 })!
    expect(along).toEqual([2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: 3 })))
    expect(strollPath(field, { x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }])
  })

  it("has no way across a belt, into a room or off the open paper", () => {
    const planning = layout.rooms!.find((room) => room.id === "room:planning")!
    expect(strollPath(ground, ground.entry!, planning.door)).toBeUndefined()
    expect(strollPath(ground, { x: -1, y: 0 }, ground.entry!)).toBeUndefined()
    const fenced: Ground = { open: new Set([tileKey({ x: 0, y: 0 }), tileKey({ x: 2, y: 0 })]), spots: [], entry: { x: 0, y: 0 } }
    expect(strollPath(fenced, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeUndefined()
    expect(reachable(fenced, { x: 0, y: 0 })).toEqual(new Set([tileKey({ x: 0, y: 0 })]))
    expect(reachable(fenced, { x: 1, y: 0 }).size).toBe(0)
  })
})

describe("the next stroll", () => {
  const layout = layoutConfiguredRooms(staffed(), undefined, 28)
  const ground = roamingGround(layout)

  it("goes to a spot a walk can reach, chosen by the number given, and never stays where it is", () => {
    const first = nextStroll(ground, ground.entry!, 0)!
    const last = nextStroll(ground, ground.entry!, .999)!
    expect(first.spot).toEqual(ground.spots[0])
    expect(last.spot).toEqual(ground.spots.at(-1))
    expect(first.spot).not.toEqual(last.spot)
    expect(nextStroll(ground, ground.entry!, .5)).toEqual(nextStroll(ground, ground.entry!, .5))
    for (const choice of [0, .25, .5, .75, .999]) {
      const stroll = nextStroll(ground, ground.entry!, choice)!
      expect(stroll.path[0]).toEqual(ground.entry)
      expect(stroll.path.at(-1)).toEqual(stroll.spot.tile)
      expect(neighbours(stroll.path)).toBe(true)
    }
  })

  it("leaves the room it is pausing at for another, unless no other room can be reached", () => {
    const door = ground.spots.find((spot) => spot.kind === "door")!
    for (const choice of [0, .3, .6, .999]) {
      const stroll = nextStroll(ground, door.tile, choice)!
      expect(stroll.spot.roomId).not.toBe(door.roomId)
    }
    const two = ground.spots.filter((spot) => spot.roomId === "implementation").slice(0, 2)
    const corridor: Ground = {
      open: new Set([tileKey({ x: 0, y: 0 }), tileKey({ x: 1, y: 0 }), tileKey({ x: 2, y: 0 })]),
      spots: [{ ...two[0]!, tile: { x: 0, y: 0 } }, { ...two[0]!, tile: { x: 2, y: 0 }, kind: "bench" }],
      entry: { x: 0, y: 0 },
    }
    expect(nextStroll(corridor, { x: 0, y: 0 }, 0)!.spot.tile).toEqual({ x: 2, y: 0 })
    expect(nextStroll({ ...corridor, spots: corridor.spots.slice(0, 1) }, { x: 0, y: 0 }, 0)).toBeUndefined()
    expect(nextStroll(corridor, { x: 9, y: 9 }, 0)).toBeUndefined()
  })
})

describe("the nearest open tile", () => {
  it("is the tile itself when open, else the closest open one, the farther back and the farther west first", () => {
    const layout = layoutConfiguredRooms(staffed(), undefined, 28)
    const ground = roamingGround(layout)
    expect(nearestOpen(ground, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    const planning = layout.rooms!.find((room) => room.id === "room:planning")!
    const near = nearestOpen(ground, { x: planning.rect.x, y: planning.rect.y })!
    expect(ground.open.has(tileKey(near))).toBe(true)
    expect(Math.abs(near.x - planning.rect.x) + Math.abs(near.y - planning.rect.y)).toBe(1)
    expect(nearestOpen({ open: new Set(), spots: [], entry: undefined }, { x: 0, y: 0 })).toBeUndefined()
  })

  it("stays pure: the layout is not changed by deriving its ground", () => {
    const layout: Layout = layoutConfiguredRooms(staffed(), undefined, 28)
    const before = structuredClone(layout)
    roamingGround(layout)
    nextStroll(roamingGround(layout), { x: 0, y: 0 }, .4)
    expect(layout).toEqual(before)
  })
})
