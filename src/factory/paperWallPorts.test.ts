import { expect, it } from "vitest"
import type { BeltTile, Direction, RoomFootprint } from "~/floor/types"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import { paperJunctionPorts } from "./paperJunctions"
import { paperWallPortTile } from "./paperWallPorts"

const room: RoomFootprint = { id: "room:test", label: "Test", kind: "work", rect: { x: 4, y: 6, w: 7, h: 5 }, door: { x: 6, y: 6 }, ports: [] }
const directions: Direction[] = ["n", "e", "s", "w"]
const opposite: Record<Direction, Direction> = { n: "s", e: "w", s: "n", w: "e" }

it.each(directions)("houses a rear-wall straight %s conveyor without adding a route", (dir) => {
  const tile: BeltTile = { kind: "straight", x: 5, y: 6, dir }
  const result = paperWallPortTile(tile, [room])
  expect(result).toEqual({ kind: "junction", x: 5, y: 6, dir, entries: [dir], exits: [dir] })
  expect(tile.kind).toBe("straight")
  if (result.kind === "junction") expect(new Set(paperJunctionPorts(result))).toEqual(new Set([dir, opposite[dir]]))
})

it.each([["n", "e"], ["e", "s"], ["s", "w"], ["w", "n"]] as const)("houses a rear-wall %s → %s corner with only its two physical ports", (from, to) => {
  const tile: BeltTile = { kind: "corner", x: 5, y: 6, from, to }
  const result = paperWallPortTile(tile, [room])
  expect(result).toEqual({ kind: "junction", x: 5, y: 6, dir: to, entries: [from], exits: [to] })
  if (result.kind === "junction") expect(new Set(paperJunctionPorts(result))).toEqual(new Set([opposite[from], to]))
})

it("preserves existing junctions and leaves outdoor, side-wall and interior tiles unchanged", () => {
  const existing: BeltTile = { kind: "junction", x: 5, y: 6, dir: "s", entries: ["s", "e"], exits: ["s", "w"] }
  expect(paperWallPortTile(existing, [room])).toBe(existing)
  for (const tile of [
    { kind: "straight", x: 4, y: 7, dir: "e" },
    { kind: "straight", x: 5, y: 8, dir: "s" },
    { kind: "straight", x: 3, y: 6, dir: "s" },
    { kind: "straight", x: 11, y: 6, dir: "s" },
  ] satisfies BeltTile[]) expect(paperWallPortTile(tile, [room])).toBe(tile)
  const source: BeltTile = { kind: "straight", x: 5, y: 6, dir: "e" }
  expect(paperWallPortTile(source, [{ ...room, kind: "intake" }])).toBe(source)
  expect(paperWallPortTile(source, undefined)).toBe(source)
})

it.each([24, 28, 37].flatMap((width) => [1, 3, 7].map((count) => ({ width, count }))))("houses every real rear-wall passage at width $width with $count agents per room", ({ width, count }) => {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((entry) => entry.kind !== "intake").flatMap((entry) => Array.from({ length: count }, (_, i) => ({ id: `${entry.id}-${i}`, name: entry.label, roomId: entry.id, role: entry.role, status: "idle" as const }))),
    tasks: [], humanRequests: [],
  } }, undefined, width)
  const before = structuredClone(layout.belts)
  let passages = 0
  for (const entry of layout.rooms!.filter((entry) => entry.kind !== "intake")) for (const belt of layout.belts) for (const tile of belt.tiles) {
    if (tile.y !== entry.rect.y || tile.x < entry.rect.x || tile.x >= entry.rect.x + entry.rect.w) continue
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
