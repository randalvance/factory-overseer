import { expect, it } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import type { BeltTile } from "~/floor/types"
import { exampleRooms } from "~/model/roomExamples"
import { paperWallPortTile } from "./paperWallPorts"
import { openPaperBeltTile } from "./paperJunctions"

it("shows the shared forward/rework corridor as open belts without changing its routes", () => {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").map((room) => ({
      id: room.id, name: room.label, roomId: room.id, role: room.role, status: "idle" as const,
    })), tasks: [], humanRequests: [],
  } }, undefined, 28)
  const before = structuredClone(layout.belts)
  const corridor = layout.belts.flatMap((belt) => belt.tiles).filter((tile) => tile.y === 10 && tile.x >= 9 && tile.x <= 15)
  expect(corridor).toHaveLength(7)
  for (const tile of corridor) {
    const drawn = paperWallPortTile(openPaperBeltTile(tile), layout.rooms)
    expect(drawn.kind).toBe("straight")
  }
  expect(layout.belts).toEqual(before)
})

it("draws a two-way bend once, while keeping a real three-port split enclosed", () => {
  const bend: BeltTile = { kind: "junction", x: 0, y: 0, dir: "w", entries: ["e", "n"], exits: ["w", "s"] }
  expect(openPaperBeltTile(bend)).toEqual({ kind: "corner", x: 0, y: 0, from: "n", to: "w" })
  const split: BeltTile = { kind: "junction", x: 1, y: 0, dir: "e", entries: ["e"], exits: ["e", "s"] }
  expect(openPaperBeltTile(split)).toBe(split)
})

it("retains a shadowed side-wall passage even where shared routes have only two ports", () => {
  const tile: BeltTile = { kind: "junction", x: 4, y: 8, dir: "e", entries: ["e", "w"], exits: ["e", "w"] }
  const room = { id: "room:test", label: "Test", kind: "work" as const, rect: { x: 4, y: 6, w: 7, h: 7 }, door: { x: 4, y: 6 }, ports: [{ x: 4, y: 8 }] }
  expect(paperWallPortTile(openPaperBeltTile(tile), [room]).kind).toBe("junction")
  expect(tile).toEqual({ kind: "junction", x: 4, y: 8, dir: "e", entries: ["e", "w"], exits: ["e", "w"] })
})
