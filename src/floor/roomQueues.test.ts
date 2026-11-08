import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTileAfterSlide, tileAfterSlide } from "./motion"
import { sameTile } from "./tiles"
import type { Layout, Tile } from "./types"

function queuedState(stationIndex: number, assigned = true): RoomFactoryState {
  const configuration = structuredClone(exampleRooms)
  const at = { kind: "room" as const, roomId: "implementation",
    ...(assigned ? { assignment: { agentIds: [`implementation-${stationIndex}`], completedAgentIds: [] } } : {}),
  }
  return { configuration, snapshot: {
    agents: configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: room.id === "implementation" ? 7 : 1 }, (_, index) => ({
        id: `${room.id}-${index}`, roomId: room.id, role: room.role, name: room.label, status: "idle" as const,
      }))),
    tasks: [
      { id: "occupied", label: "Already at the station", at },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `incoming-${index}`, label: "Incoming work", at: { kind: "room" as const, roomId: "intake" },
      })),
    ],
    humanRequests: [],
  } }
}

function receive(state: RoomFactoryState) {
  const assignment = state.snapshot.tasks[0]!.at
  for (const task of state.snapshot.tasks.slice(1)) task.at = structuredClone(assignment)
}

function destination(layout: Layout) {
  return layout.rooms!.find((room) => room.id === "room:implementation")!
}

function insideDestination(layout: Layout, tile: Tile) {
  const { rect } = destination(layout)
  return tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h
}

it.each([28, 37])("parks incoming station queues before any work surface or return lap at width %s", (width) => {
  for (const stationIndex of [0, 3, 6]) {
    const state = queuedState(stationIndex)
    const before = layoutConfiguredRooms(state, undefined, width)
    receive(state)
    const after = layoutConfiguredRooms(state, before)
    const motions = motionsFor(after, slidResting(before, after), before)
    const benches = after.bays.find((bay) => bay.id === "room:implementation")!.stations.map((station) => station.bench)
    const inlet = destination(after).ports[0]!
    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay).toHaveLength(12)
    for (const motion of motions.toPlay) {
      const context = JSON.stringify({ width, stationIndex, task: motion.taskId })
      expect(motion.path.some((tile) => benches.some((bench) => sameTile(tile, bench))), context).toBe(false)
      expect(motion.path.filter((tile) => insideDestination(after, tile)).every((tile) => tile.y >= inlet.y), context).toBe(true)
    }
    expect(after.rooms!.some((room) => room.kind === "staging")).toBe(true)
    expect(after.boxes.slice(1).every((box) => box.spot.kind === "queue")).toBe(true)

    state.snapshot.tasks.shift()
    const advanced = layoutConfiguredRooms(state, after)
    expect(advanced.boxes[0]!.spot.kind).toBe("bench")
    expect(motionsFor(advanced, slidResting(after, advanced), after).unrouted).toEqual([])
  }
})

it.each([28, 37])("parks unassigned arrivals in staging without a work-room lap at width %s", (width) => {
  const state = queuedState(0, false)
  const before = layoutConfiguredRooms(state, undefined, width)
  receive(state)
  const after = layoutConfiguredRooms(state, before)
  const motions = motionsFor(after, slidResting(before, after), before)
  const inlet = destination(after).ports[0]!
  expect(motions.unrouted).toEqual([])
  expect(motions.toPlay).toHaveLength(12)
  for (const motion of motions.toPlay) {
    const interior = motion.path.filter((tile) => insideDestination(after, tile))
    expect(interior.every((tile) => tile.y === inlet.y), motion.taskId).toBe(true)
    expect(interior.length, motion.taskId).toBeLessThanOrEqual(2)
  }
})

it("keeps queued arrivals and queue advancement routable through growth and Reorganize", () => {
  const state = queuedState(6)
  const before = layoutConfiguredRooms(state, undefined, 28)
  receive(state)
  const riding = layoutConfiguredRooms(state, before)
  const incoming = state.snapshot.tasks.slice(1).map((task) => task.id)
  const ride = motionsFor(riding, slidResting(before, riding), before).toPlay.find((motion) => motion.taskId === incoming.at(-1))!
  const grownState = structuredClone(state)
  for (let index = 7; index < 10; index++) grownState.snapshot.agents.push({
    id: `implementation-${index}`, roomId: "implementation", role: "implementer", name: "New implementer", status: "idle",
  })
  const grown = layoutConfiguredRooms(grownState, riding, 28, new Set(incoming))
  for (const tile of ride.path) {
    const mapped = tileAfterSlide(riding, grown, tile, ride.taskId)!
    expect(mapped).toBeDefined()
    expect(motionsFor(grown, { [ride.taskId]: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }

  // Keep the assigned agent, compact its old third-row station into the first row,
  // and preserve all queued boxes as they slide to the new inlet.
  grownState.snapshot.agents = grownState.snapshot.agents.filter((agent) =>
    agent.roomId !== "implementation" || agent.id === "implementation-6")
  const compacted = layoutConfiguredRooms(grownState, grown, 28, new Set(), true)
  const remapped = Object.fromEntries(grown.boxes.map((box) => [box.taskId, restingTileAfterSlide(grown, compacted, box.taskId)!]))
  expect(Object.values(remapped).every(Boolean)).toBe(true)
  expect(motionsFor(compacted, remapped, grown).unrouted).toEqual([])
  grownState.snapshot.tasks.shift()
  const advanced = layoutConfiguredRooms(grownState, compacted)
  expect(advanced.boxes[0]!.spot.kind).toBe("bench")
  expect(motionsFor(advanced, slidResting(compacted, advanced), compacted).unrouted).toEqual([])
})

/** The view glides the old resting places before starting a new ride. */
function slidResting(previous: ReturnType<typeof layoutConfiguredRooms>, next: ReturnType<typeof layoutConfiguredRooms>) {
  return Object.fromEntries(previous.boxes.map((box) => [box.taskId, restingTileAfterSlide(previous, next, box.taskId) ?? box.tile]))
}
