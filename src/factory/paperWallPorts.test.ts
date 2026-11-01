import { expect, it } from "vitest"
import type { BeltTile, Direction, RoomFootprint } from "~/floor/types"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import { paperJunctionPorts } from "./paperJunctions"
import { paperWallPortSide, paperWallPortTile } from "./paperWallPorts"

const room: RoomFootprint = { id: "room:test", label: "Test", kind: "work", rect: { x: 4, y: 6, w: 7, h: 5 }, door: { x: 6, y: 6 }, ports: [{ x: 4, y: 8 }, { x: 10, y: 8 }] }
const opposite: Record<Direction, Direction> = { n: "s", e: "w", s: "n", w: "e" }

it.each([4, 10].flatMap((x) => (["e", "w"] as const).map((dir) => ({ x, dir }))))("houses a side-wall straight $dir conveyor at x=$x without adding a route", ({ x, dir }) => {
  const tile: BeltTile = { kind: "straight", x, y: 8, dir }
  const result = paperWallPortTile(tile, [room])
  expect(result).toEqual({ kind: "junction", x, y: 8, dir, entries: [dir], exits: [dir] })
  expect(tile.kind).toBe("straight")
  expect(paperWallPortSide(tile, room)).toBe(x === 4 ? "left" : "right")
  if (result.kind === "junction") expect(new Set(paperJunctionPorts(result))).toEqual(new Set([dir, opposite[dir]]))
})

it.each([
  { x: 4, from: "e", to: "s" }, { x: 4, from: "n", to: "w" },
  { x: 10, from: "w", to: "n" }, { x: 10, from: "s", to: "e" },
] as const)("houses a side-wall $from → $to corner at x=$x with only its two physical ports", ({ x, from, to }) => {
  const tile: BeltTile = { kind: "corner", x, y: 8, from, to }
  const result = paperWallPortTile(tile, [room])
  expect(result).toEqual({ kind: "junction", x, y: 8, dir: to, entries: [from], exits: [to] })
  if (result.kind === "junction") expect(new Set(paperJunctionPorts(result))).toEqual(new Set([opposite[from], to]))
})

it("preserves junctions and does not open rear/front walls or side walls without a crossing", () => {
  const existing: BeltTile = { kind: "junction", x: 4, y: 8, dir: "s", entries: ["e", "n"], exits: ["s", "e"] }
  expect(paperWallPortTile(existing, [room])).toBe(existing)
  for (const tile of [
    { kind: "straight", x: 5, y: 6, dir: "s" },
    { kind: "straight", x: 5, y: 10, dir: "s" },
    { kind: "straight", x: 4, y: 8, dir: "s" },
    { kind: "corner", x: 4, y: 8, from: "n", to: "e" },
    { kind: "straight", x: 10, y: 8, dir: "n" },
    { kind: "straight", x: 5, y: 8, dir: "e" },
    { kind: "straight", x: 3, y: 8, dir: "e" },
    { kind: "straight", x: 11, y: 8, dir: "w" },
  ] satisfies BeltTile[]) {
    expect(paperWallPortTile(tile, [room])).toBe(tile)
    expect(paperWallPortSide(tile, room)).toBeUndefined()
  }
  const source: BeltTile = { kind: "straight", x: 4, y: 8, dir: "e" }
  expect(paperWallPortTile(source, [{ ...room, kind: "intake" }])).toBe(source)
  expect(paperWallPortTile(source, undefined)).toBe(source)
})

it.each([24, 28, 37].flatMap((width) => [1, 3, 7].map((count) => ({ width, count }))))("houses every real side passage at width $width with $count agents per room", ({ width, count }) => {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((entry) => entry.kind !== "intake").flatMap((entry) => Array.from({ length: count }, (_, i) => ({ id: `${entry.id}-${i}`, name: entry.label, roomId: entry.id, role: entry.role, status: "idle" as const }))),
    tasks: [], humanRequests: [],
  } }, undefined, width)
  const before = structuredClone(layout.belts)
  let passages = 0
  for (const entry of layout.rooms!.filter((entry) => entry.kind !== "intake")) for (const belt of layout.belts) for (const tile of belt.tiles) {
    if (!paperWallPortSide(tile, entry)) continue
    passages++
    const result = paperWallPortTile(tile, layout.rooms)
    expect(result.kind).toBe("junction")
    const incoming = tile.kind === "junction" ? tile.entries : [tile.kind === "straight" ? tile.dir : tile.from]
    const outgoing = tile.kind === "junction" ? tile.exits : [tile.kind === "straight" ? tile.dir : tile.to]
    expect(result).toMatchObject({ entries: incoming, exits: outgoing })
  }
  expect(passages).toBeGreaterThan(0)
  expect(layout.belts).toEqual(before)
})
