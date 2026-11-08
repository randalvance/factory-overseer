import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTileAfterSlide } from "./motion"

function loaded(): RoomFactoryState {
  return { configuration: structuredClone(exampleRooms), snapshot: {
    agents: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `planner-${i}`, name: "Planner", role: "planner", roomId: "planning", status: "idle" as const })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `builder-${i}`, name: "Builder", role: "implementer", roomId: "implementation", status: "working" as const })),
    ],
    tasks: Array.from({ length: 15 }, (_, i) => ({ id: `task-${i}`, label: "Ready to implement", at: {
      kind: "room" as const, roomId: "implementation",
      ...(i < 5 ? { assignment: { agentIds: [`builder-${i}`], completedAgentIds: [] } } : {}),
    } })), humanRequests: [],
  } }
}

it("creates staging only for buffered work, stacks boxes and preserves the host graph", () => {
  const state = loaded()
  const beforeState = structuredClone(state)
  beforeState.snapshot.tasks = state.snapshot.tasks.slice(0, 5)
  const before = layoutConfiguredRooms(beforeState, undefined, 28)
  expect(before.rooms!.filter((room) => room.kind === "staging")).toEqual([])
  const after = layoutConfiguredRooms(state, before)
  const buffer = after.rooms!.find((room) => room.kind === "staging")!
  expect(buffer.label).toBe("IMPLEMENTATION STAGING")
  expect(after.routing!.buffers[buffer.id]).toBe("implementation")
  expect(after.bays.find((bay) => bay.id === buffer.id)!.stations).toEqual([])
  expect(after.routing!.configuration).toEqual(state.configuration)
  const storage = after.routing!.bufferStorage.implementation!
  const beltKeys = new Set(after.belts.flatMap((belt) => belt.tiles.map((tile) => JSON.stringify({ x: tile.x, y: tile.y }))))
  expect(beltKeys.has(JSON.stringify(storage.tip))).toBe(true)
  const boxes = after.boxes.slice(5)
  expect(boxes).toHaveLength(10)
  const stacks = new Map<string, number>()
  for (const box of boxes) {
    expect(beltKeys.has(JSON.stringify(box.tile))).toBe(false)
    expect(box.tile.x).toBeGreaterThan(buffer.rect.x)
    expect(box.tile.x).toBeLessThan(buffer.rect.x + buffer.rect.w - 1)
    expect(box.tile.y).toBeGreaterThanOrEqual(buffer.rect.y)
    expect(box.tile.y).toBeLessThan(buffer.rect.y + buffer.rect.h)
    const key = JSON.stringify(box.tile)
    stacks.set(key, (stacks.get(key) ?? 0) + 1)
  }
  expect([...stacks.values()]).toEqual([2, 2, 2, 2, 2])
  expect(after.rooms!.find((room) => room.id === "room:implementation")!.rect).not.toEqual(
    before.rooms!.find((room) => room.id === "room:implementation")!.rect)
})

it("keeps the final buffer departure routable, then removes staging and repacks", () => {
  const state = loaded()
  state.snapshot.tasks = [state.snapshot.tasks[5]!]
  const before = layoutConfiguredRooms(state, undefined, 28)
  state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["builder-0"], completedAgentIds: [] } }
  const leaving = layoutConfiguredRooms(state, before)
  const from = { "task-5": restingTileAfterSlide(before, leaving, "task-5")! }
  const motion = motionsFor(leaving, from, before)
  expect(motion.unrouted).toEqual([])
  expect(motion.toPlay).toHaveLength(1)
  expect(leaving.rooms!.some((room) => room.kind === "staging")).toBe(true)
  const riding = layoutConfiguredRooms(state, leaving, 28, new Set(["task-5"]))
  expect(riding.rooms!.some((room) => room.kind === "staging")).toBe(true)
  const settled = layoutConfiguredRooms(state, riding)
  expect(settled.rooms!.some((room) => room.kind === "staging")).toBe(false)
  expect(settled.boxes[0]!.spot.kind).toBe("bench")
})

it("buffers independent destinations separately and removes cancelled queues immediately", () => {
  const state = loaded()
  state.snapshot.tasks.push({ id: "review", label: "Awaiting review", at: { kind: "room", roomId: "review" } })
  const before = layoutConfiguredRooms(state, undefined, 24)
  expect(Object.values(before.routing!.buffers).sort()).toEqual(["implementation", "review"])
  state.snapshot.tasks = []
  const after = layoutConfiguredRooms(state, before)
  expect(after.rooms!.some((room) => room.kind === "staging")).toBe(false)
  expect(after.bounds.h).toBeLessThan(before.bounds.h)
})

it("takes buffered arrivals down the T tip and leaves other floor stacks in place on pickup", () => {
  const state = loaded()
  state.snapshot.tasks = state.snapshot.tasks.slice(5, 8)
  for (const task of state.snapshot.tasks) task.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["planner-0"], completedAgentIds: [] } }
  const before = layoutConfiguredRooms(state, undefined, 28)
  for (const task of state.snapshot.tasks) task.at = { kind: "room", roomId: "implementation" }
  const queued = layoutConfiguredRooms(state, before)
  const from = Object.fromEntries(before.boxes.map((box) => [box.taskId, restingTileAfterSlide(before, queued, box.taskId)!]))
  const motions = motionsFor(queued, from, before)
  expect(motions.unrouted).toEqual([])
  const tip = queued.routing!.bufferStorage.implementation!.tip
  expect(motions.toPlay.every((motion) => motion.path.some((tile) => tile.x === tip.x && tile.y === tip.y))).toBe(true)
  state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["builder-0"], completedAgentIds: [] } }
  const assigned = layoutConfiguredRooms(state, queued)
  expect(assigned.boxes.slice(1).map((box) => box.spot)).toEqual(queued.boxes.slice(1).map((box) => box.spot))
  const slid = Object.fromEntries(queued.boxes.map((box) => [box.taskId, restingTileAfterSlide(queued, assigned, box.taskId)!]))
  expect(motionsFor(assigned, slid, queued).toPlay.map((motion) => motion.taskId)).toEqual(["task-5"])
})
