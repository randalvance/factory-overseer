import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { step, opposite } from "./tiles"
import { entries, exits } from "./belts"
import { layoutConfiguredRooms } from "./configuredRooms"

it.each([24, 28, 37])("crosses building walls only at side ports at floor width %s", (width) => {
  for (const count of [1, 3, 4, 7]) for (const added of [0, 1, 3]) for (const reverse of [false, true]) {
    const configuration = structuredClone(exampleRooms)
    for (let i = 0; i < added; i++) {
      const id = `qa-${i}`
      configuration.rooms.push({ id, label: "QA", role: "qa", kind: "work" })
      configuration.transitions.push({ id: `check-${i}`, from: "review", to: id, outcome: id },
        { id: `ready-${i}`, from: id, to: "deployment", outcome: "ready" })
    }
    if (reverse) configuration.rooms.reverse()
    const state: RoomFactoryState = { configuration, snapshot: {
      agents: configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
        Array.from({ length: count }, (_, index) => ({ id: `${room.id}-${index}`, name: "Agent", role: room.role, roomId: room.id, status: "idle" as const }))),
      tasks: [], humanRequests: [],
    } }
    const layout = layoutConfiguredRooms(state, undefined, width)
    const belts = layout.belts.flatMap((belt) => belt.tiles)
    for (const { id, rect, ports, kind } of layout.rooms!) {
      if (kind === "intake") continue
      const inside = (tile: { x: number; y: number }) => tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h
      for (const tile of belts) {
        const neighbors = [...exits(tile).map((dir) => step(tile, dir)), ...entries(tile).map((dir) => step(tile, opposite(dir)))]
        for (const neighbor of neighbors) if (inside(tile) !== inside(neighbor)) {
          const crossing = inside(tile) ? tile : neighbor
          expect(neighbor.y, JSON.stringify({ width, count, added, reverse, room: id, tile, neighbor })).toBe(tile.y)
          expect(ports.some((port) => port.x === crossing.x && port.y === crossing.y)).toBe(true)
        }
      }
    }
    const deployment = layout.rooms!.find((room) => room.kind === "deployment")!
    const dock = layout.shippingDock!
    expect(dock.outlet).toEqual({ x: deployment.rect.x, y: deployment.rect.y + 5 })
    expect(dock.connectorPath[1]).toEqual({ x: deployment.rect.x - 1, y: deployment.rect.y + 5 })
    for (const tile of dock.connectorPath.slice(1)) expect(layout.rooms!.some(({ rect }) =>
      tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h),
      JSON.stringify({ width, count, added, reverse, tile })).toBe(false)
  }
})
