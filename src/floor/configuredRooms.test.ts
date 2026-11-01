import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import { validateRoomUpdate, roomRoute } from "~/model/roomRouting"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTileAfterSlide, restingTiles, tileAfterSlide } from "./motion"

function state(roomId = "intake"): RoomFactoryState {
  return {
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-agent", name: room.label, role: room.role, roomId: room.id, status: "working" })),
      tasks: [{ id: "task", label: "Task", at: { kind: "room", roomId, assignment: { agentIds: [roomId + "-agent"], completedAgentIds: [] } } }],
      humanRequests: [],
    },
  }
}
function move(value: RoomFactoryState, roomId: string) {
  const next = structuredClone(value)
  next.snapshot.tasks[0]!.at = { kind: "room", roomId, assignment: { agentIds: [roomId + "-agent"], completedAgentIds: [] } }
  return next
}
it.each([["intake", "planning"], ["intake", "implementation"], ["planning", "implementation"], ["implementation", "planning"], ["implementation", "review"], ["review", "deployment"]])("routes %s → %s along continuous belts", (from, to) => {
  const original = state(from)
  const before = layoutConfiguredRooms(original)
  const next = move(original, to)
  expect(validateRoomUpdate(original, next)).toEqual([])
  const after = layoutConfiguredRooms(next, before)
  const motion = motionsFor(after, restingTiles(before), before)
  expect(motion.unrouted).toEqual([])
  expect(motion.toPlay).toHaveLength(1)
  const path = motion.toPlay[0]!.path
  path.forEach((tile, i) => {
    if (i) expect(Math.abs(tile.x - path[i - 1]!.x) + Math.abs(tile.y - path[i - 1]!.y)).toBe(1)
  })
  const intermediateRooms = after.rooms!.filter((room) => !["room:" + from, "room:" + to].includes(room.id))
  expect(path.some((tile) => intermediateRooms.some((room) => tile.x >= room.rect.x && tile.x < room.rect.x + room.rect.w && tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h))).toBe(false)
})

it("rejects an undeclared handoff and accepts skipped observations over a declared path", () => {
  const original = state("review")
  expect(validateRoomUpdate(original, move(original, "planning"))[0]!.message).toContain("No declared route")
  expect(validateRoomUpdate(state("intake"), move(state("intake"), "deployment"))).toEqual([])
  expect(roomRoute(exampleRooms, "intake", "deployment")!.map((edge) => edge.id)).toEqual(["skip-plan", "review", "deploy"])
})

it("waits in an unstaffed destination and then assigns its first arriving agent", () => {
  const original = state()
  const before = layoutConfiguredRooms(original)
  const waiting = move(original, "planning")
  waiting.snapshot.agents = waiting.snapshot.agents.filter((agent) => agent.roomId !== "planning")
  waiting.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning" }
  const queued = layoutConfiguredRooms(waiting, before)
  expect(queued.boxes[0]!.tile).toEqual(queued.routing!.queues.planning)
  expect(motionsFor(queued, restingTiles(before), before).unrouted).toEqual([])
  const staffed = move(original, "planning")
  const assigned = layoutConfiguredRooms(staffed, queued)
  expect(motionsFor(assigned, restingTiles(queued), queued).unrouted).toEqual([])
})

it("shares room connections across many agents and preserves queues", () => {
  const value = state("implementation")
  value.snapshot.agents.push(...Array.from({ length: 7 }, (_, i) => ({ id: "extra-" + i, name: "Extra", role: "implementer", roomId: "implementation", status: "idle" as const })))
  const first = value.snapshot.tasks[0]!
  value.snapshot.tasks.push({ ...structuredClone(first), id: "queued" })
  const layout = layoutConfiguredRooms(value)
  expect(layout.routing!.connections).toHaveLength(exampleRooms.transitions.length)
  expect(layout.bays.find((bay) => bay.id === "room:implementation")!.stations).toHaveLength(8)
  expect(layout.boxes[1]!.spot.kind).toBe("queue")
  const completed = structuredClone(value)
  completed.snapshot.tasks.shift()
  const next = layoutConfiguredRooms(completed, layout)
  expect(motionsFor(next, restingTiles(layout), layout).unrouted).toEqual([])
})

it("ships from deployment and refuses to reopen shipped work", () => {
  const value = state("deployment")
  const before = layoutConfiguredRooms(value)
  const shipped = structuredClone(value)
  shipped.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
  const after = layoutConfiguredRooms(shipped, before)
  expect(motionsFor(after, restingTiles(before), before).unrouted).toEqual([])
  expect(validateRoomUpdate(shipped, value)[0]!.message).toContain("terminal")
})

it("remaps in-flight boxes after growth, keeping the selected connection", () => {
  const value = state()
  const before = layoutConfiguredRooms(value)
  const next = move(value, "implementation")
  const riding = layoutConfiguredRooms(next, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  const current = path[Math.floor(path.length / 2)]!
  next.snapshot.agents.push(...Array.from({ length: 4 }, (_, i) => ({ id: "router-" + i, name: "Router", role: "router", roomId: "intake", status: "idle" as const })))
  const grown = layoutConfiguredRooms(next, riding, 24, new Set(["task"]))
  const mapped = tileAfterSlide(riding, grown, current)!
  expect(mapped).toBeDefined()
  expect(motionsFor(grown, { task: mapped }, riding).unrouted).toEqual([])
  const oldHolder = restingTileAfterSlide(before, grown, "task")!
  expect(oldHolder).not.toEqual(grown.boxes[0]!.tile)
})

it("retains an obsolete connection until its box lands, then removes it", () => {
  const value = state()
  const before = layoutConfiguredRooms(value)
  const next = move(value, "implementation")
  const riding = layoutConfiguredRooms(next, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  const current = path[Math.floor(path.length / 2)]!
  next.configuration.transitions = next.configuration.transitions.filter((edge) => edge.id !== "skip-plan")
  const retained = layoutConfiguredRooms(next, riding, 24, new Set(["task"]))
  expect(retained.routing!.connections.some((connection) => connection.transition.id.startsWith("retired:") && connection.transition.from === "intake" && connection.transition.to === "implementation")).toBe(true)
  const mapped = tileAfterSlide(riding, retained, current)!
  expect(motionsFor(retained, { task: mapped }, riding).unrouted).toEqual([])
  const settled = layoutConfiguredRooms(next, retained)
  expect(settled.routing!.connections.some((connection) => connection.transition.id.includes("skip-plan"))).toBe(false)
})

it("handles a configured intermediate room and a self-loop without renderer changes", () => {
  const value = state("review")
  value.configuration.rooms.splice(4, 0, { id: "qa", label: "QA", role: "qa", kind: "work" })
  value.configuration.transitions = value.configuration.transitions.filter((edge) => edge.id !== "deploy")
  value.configuration.transitions.push(
    { id: "review-qa", from: "review", to: "qa", outcome: "approved" },
    { id: "qa-deploy", from: "qa", to: "deployment", outcome: "ready" },
    { id: "qa-again", from: "qa", to: "qa", outcome: "retry" },
  )
  const before = layoutConfiguredRooms(value)
  const after = layoutConfiguredRooms(move(value, "deployment"), before)
  expect(motionsFor(after, restingTiles(before), before).unrouted).toEqual([])
  expect(after.routing!.connections).toHaveLength(8)
})

it("keeps retired IDs stable across snapshots and handles an edge retargeted under the same ID", () => {
  const original = state()
  const before = layoutConfiguredRooms(original)
  const next = move(original, "implementation")
  const riding = layoutConfiguredRooms(next, before)
  const motion = motionsFor(riding, restingTiles(before), before).toPlay[0]!
  next.configuration.transitions.find((edge) => edge.id === "skip-plan")!.to = "review"
  const retained = layoutConfiguredRooms(next, riding, 24, new Set(["task"]))
  const again = layoutConfiguredRooms(next, retained, 24, new Set(["task"]))
  expect(again.routing!.connections.map((connection) => connection.transition.id)).toEqual(retained.routing!.connections.map((connection) => connection.transition.id))
  expect(again.routing!.taskEdges.task![0]).toContain("retired:")
  const current = motion.path[Math.floor(motion.path.length / 2)]!
  expect(motionsFor(again, { task: tileAfterSlide(riding, again, current)! }, riding).unrouted).toEqual([])
})

it("moves a task out while atomically removing its old room, retaining the outgoing belt until arrival", () => {
  const original = state("planning")
  const before = layoutConfiguredRooms(original)
  const next = move(original, "implementation")
  next.snapshot.agents = next.snapshot.agents.filter((agent) => agent.roomId !== "planning")
  next.configuration.rooms = next.configuration.rooms.filter((room) => room.id !== "planning")
  next.configuration.transitions = next.configuration.transitions.filter((edge) => edge.from !== "planning" && edge.to !== "planning")
  expect(validateRoomUpdate(original, next)).toEqual([])
  const after = layoutConfiguredRooms(next, before)
  expect(after.rooms!.some((room) => room.id === "room:planning")).toBe(true)
  expect(motionsFor(after, restingTiles(before), before).unrouted).toEqual([])
  const settled = layoutConfiguredRooms(next, after)
  expect(settled.rooms!.some((room) => room.id === "room:planning")).toBe(false)
})

it.each([["intake", "planning"], ["intake", "implementation"], ["implementation", "planning"], ["review", "deployment"]])("keeps every in-flight position routable during growth on %s → %s", (from, to) => {
  const original = state(from)
  const before = layoutConfiguredRooms(original)
  const next = move(original, to)
  const riding = layoutConfiguredRooms(next, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  next.snapshot.agents.push(...Array.from({ length: 6 }, (_, i) => ({ id: "growth-" + i, name: "Growth", role: "router", roomId: "intake", status: "idle" as const })))
  const grown = layoutConfiguredRooms(next, riding, 24, new Set(["task"]))
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, grown, tile, "task")!
    expect(mapped, JSON.stringify(tile)).toBeDefined()
    expect(motionsFor(grown, { task: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
})
