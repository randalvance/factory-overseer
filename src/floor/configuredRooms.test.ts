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

it("fits five compact rooms into three columns at the paper demo width", () => {
  const value = state()
  const floor = layoutConfiguredRooms(value, undefined, 28)
  const rooms = floor.rooms!
  expect(rooms.map((room) => room.rect.w)).toEqual([7, 7, 7, 7, 7])
  expect(rooms.map((room) => room.rect.h)).toEqual([7, 7, 7, 7, 8])
  expect(new Set(rooms.slice(0, 3).map((room) => room.rect.y)).size).toBe(1)
  expect(rooms[3]!.rect.y - (rooms[0]!.rect.y + rooms[0]!.rect.h)).toBe(3)
  expect(rooms[3]!.rect.y).toBe(rooms[4]!.rect.y)
  expect(rooms.map((room) => room.id)).toEqual(exampleRooms.rooms.map((room) => `room:${room.id}`))
  expect(rooms.find((room) => room.id === "room:deployment")!.rect.x).toBe(6)
  expect(rooms.find((room) => room.id === "room:review")!.rect.x).toBe(15)
  expect(floor.belts.find((belt) => belt.id === "edge:deploy")!.kind).toBe("feeder")
  expect(floor.belts.find((belt) => belt.id === "edge:replan")!.kind).toBe("return")
  for (const room of rooms) {
    const station = floor.bays.find((bay) => bay.id === room.id)!.stations[0]!
    expect(station.bench.x).toBe(room.rect.x + 3)
    expect(station.bench.y).toBe(room.rect.y + 5)
  }
})

it("keeps every configured handoff and shipping continuous with three columns", () => {
  for (const transition of exampleRooms.transitions) {
    const value = state(transition.from)
    const before = layoutConfiguredRooms(value, undefined, 28)
    const after = layoutConfiguredRooms(move(value, transition.to), before)
    const motions = motionsFor(after, restingTiles(before), before)
    expect(motions.unrouted, transition.id).toEqual([])
    expect(motions.toPlay, transition.id).toHaveLength(1)
    const path = motions.toPlay[0]!.path
    path.forEach((tile, i) => {
      if (i) expect(Math.abs(tile.x - path[i - 1]!.x) + Math.abs(tile.y - path[i - 1]!.y), transition.id).toBe(1)
    })
  }
  const value = state("deployment")
  const before = layoutConfiguredRooms(value, undefined, 28)
  value.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
  const after = layoutConfiguredRooms(value, before)
  expect(motionsFor(after, restingTiles(before), before).unrouted).toEqual([])
  expect(after.boxes[0]!.tile).toEqual(after.container.stacks[0])
})

it("keeps room side belts clear of agents and reaches desks over a horizontal front bridge", () => {
  const value = state()
  const floor = layoutConfiguredRooms(value, undefined, 28)
  const tiles = floor.belts.flatMap((belt) => belt.tiles)
  for (const room of floor.rooms!) {
    const station = floor.bays.find((bay) => bay.id === room.id)!.stations[0]!
    expect(room.ports.map((port) => port.x).sort((a, b) => a - b)).toEqual([room.rect.x, room.rect.x + room.rect.w - 1])
    expect(tiles.some((tile) => tile.x === station.agentTile.x && tile.y === station.agentTile.y)).toBe(false)
    for (const dx of [-1, 1]) expect(tiles.some((tile) => tile.x === station.bench.x + dx && tile.y === station.bench.y)).toBe(true)
    expect(floor.routing!.queues[room.id.slice(5)]!.x).toBe(room.ports[0]!.x + Math.sign(room.ports[1]!.x - room.ports[0]!.x))
  }
  const intake = floor.rooms![0]!
  expect(floor.intake.rect.x + floor.intake.rect.w / 2).toBe(intake.rect.x + 1.5)
  expect(floor.intake.pile[0]!.x).toBe(intake.rect.x + 1)
})


it.each([24, 28, 37])("keeps mirrored and centered rooms, stations and routes inside width %s", (width) => {
  const floor = layoutConfiguredRooms(state(), undefined, width)
  const rooms = floor.rooms!
  for (const room of rooms) {
    expect(room.rect.x).toBeGreaterThanOrEqual(1)
    expect(room.rect.x + room.rect.w).toBeLessThanOrEqual(width - 2)
    const bay = floor.bays.find((bay) => bay.id === room.id)!
    expect(bay.rect.x).toBe(room.rect.x + 1)
    expect(room.door.x).toBe(room.ports[0]!.x)
    expect(room.ports.map((port) => port.x).sort((a, b) => a - b)).toEqual([room.rect.x, room.rect.x + room.rect.w - 1])
    expect(floor.routing!.queues[room.id.slice(5)]!.x).toBe(room.ports[0]!.x + Math.sign(room.ports[1]!.x - room.ports[0]!.x))
    for (const station of bay.stations) {
      expect(station.bench.x).toBe(room.rect.x + 3)
      expect(station.agentTile.x).toBe(station.bench.x)
    }
  }
  for (const belt of floor.belts) for (const tile of belt.tiles) {
    expect(tile.x).toBeGreaterThanOrEqual(0)
    expect(tile.x).toBeLessThan(width)
  }
  for (const transition of exampleRooms.transitions) {
    const before = layoutConfiguredRooms(state(transition.from), undefined, width)
    const after = layoutConfiguredRooms(state(transition.to), before)
    expect(motionsFor(after, restingTiles(before), before).unrouted, transition.id).toEqual([])
  }
})

it("keeps every in-flight position routable when a centered row fills", () => {
  const value = state("review")
  const before = layoutConfiguredRooms(value, undefined, 28)
  const next = move(value, "deployment")
  const riding = layoutConfiguredRooms(next, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  next.configuration.rooms.push({ id: "qa", label: "QA", role: "qa", kind: "work" })
  next.configuration.transitions.push({ id: "review-qa", from: "review", to: "qa", outcome: "needs-qa" })
  const grown = layoutConfiguredRooms(next, riding, 28, new Set(["task"]))
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, grown, tile, "task")!
    expect(mapped, JSON.stringify(tile)).toBeDefined()
    expect(motionsFor(grown, { task: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
})


it("connects neighboring side ports directly and keeps returns inside the rear service strip", () => {
  const floor = layoutConfiguredRooms(state(), undefined, 28)
  for (const id of ["plan", "implement", "deploy"]) {
    const connection = floor.routing!.connections.find((edge) => edge.transition.id === id)!
    const source = floor.rooms!.find((room) => room.id === `room:${connection.transition.from}`)!
    expect(new Set(connection.path.map((tile) => tile.y))).toEqual(new Set([source.rect.y + 5]))
  }
  for (const room of floor.rooms!) {
    const loop = floor.belts.find((belt) => belt.id === `${room.id}:loop`)!
    expect(loop.tiles.length).toBeGreaterThan(0)
    expect(loop.tiles.every((tile) => tile.y === room.rect.y + 2)).toBe(true)
    const interior = floor.belts.flatMap((belt) => belt.tiles).filter((tile) => tile.x > room.rect.x + 1 && tile.x < room.rect.x + room.rect.w - 2 && tile.y === room.rect.y + 4)
    expect(interior).toEqual([])
  }
})

it.each(["implementation", "review"])("returns shared %s work to another member and to its room queue", (roomId) => {
  const value = state(roomId)
  const role = value.snapshot.agents.find((agent) => agent.roomId === roomId)!.role
  value.snapshot.agents.push({ id: "second", name: "Second", roomId, role, status: "working" })
  value.snapshot.tasks[0]!.at = { kind: "room", roomId, assignment: { agentIds: [roomId + "-agent", "second"], completedAgentIds: [] } }
  const before = layoutConfiguredRooms(value, undefined, 28)
  const reassigned = structuredClone(value)
  reassigned.snapshot.tasks[0]!.at = { kind: "room", roomId, assignment: { agentIds: ["second"], completedAgentIds: [] } }
  const after = layoutConfiguredRooms(reassigned, before)
  expect(motionsFor(after, restingTiles(before), before).unrouted).toEqual([])
  const queued = structuredClone(value)
  queued.snapshot.tasks[0]!.at = { kind: "room", roomId }
  const waiting = layoutConfiguredRooms(queued, after)
  const motion = motionsFor(waiting, restingTiles(after), after)
  expect(motion.unrouted).toEqual([])
  const room = waiting.rooms!.find((room) => room.id === `room:${roomId}`)!
  expect(motion.toPlay[0]!.path.some((tile) => tile.y === room.rect.y + 2)).toBe(true)
  expect(motion.toPlay[0]!.path.every((tile) => tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h)).toBe(true)
  const assignedAgain = layoutConfiguredRooms(value, waiting)
  expect(motionsFor(assignedAgain, restingTiles(waiting), waiting).unrouted).toEqual([])
})

it("keeps an in-flight same-room return on its internal return during growth", () => {
  const value = state("review")
  value.snapshot.agents.push({ id: "second", name: "Second", roomId: "review", role: "reviewer", status: "working" })
  const before = layoutConfiguredRooms(value, undefined, 28)
  const queued = structuredClone(value)
  queued.snapshot.tasks[0]!.at = { kind: "room", roomId: "review" }
  const riding = layoutConfiguredRooms(queued, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  queued.snapshot.agents.push(...Array.from({ length: 4 }, (_, i) => ({ id: `new-${i}`, name: "New", roomId: "planning", role: "planner", status: "idle" as const })))
  const grown = layoutConfiguredRooms(queued, riding, 28, new Set(["task"]))
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, grown, tile, "task")!
    expect(mapped, JSON.stringify(tile)).toBeDefined()
    expect(motionsFor(grown, { task: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
})


it("keeps internal conveyors off the walls except the two side ports", () => {
  const floor = layoutConfiguredRooms(state(), undefined, 28)
  const tiles = floor.belts.flatMap((belt) => belt.tiles)
  for (const room of floor.rooms!) {
    for (const x of [room.rect.x, room.rect.x + room.rect.w - 1]) {
      const occupiedWall = tiles.filter((tile) => tile.x === x && tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h)
      expect(occupiedWall.map((tile) => tile.y)).toEqual([room.rect.y + 5])
    }
    const flow = Math.sign(room.ports[1]!.x - room.ports[0]!.x)
    for (let y = room.rect.y + 2; y <= room.rect.y + 5; y++) {
      expect(tiles.some((tile) => tile.x === room.ports[0]!.x + flow && tile.y === y)).toBe(true)
    }
  }
})


it("packs an outdoor intake beside the work rooms without reserving a full room", () => {
  const value = state()
  value.snapshot.agents = value.snapshot.agents.filter((agent) => agent.roomId !== "intake")
  value.snapshot.tasks[0]!.at = { kind: "room", roomId: "intake" }
  const floor = layoutConfiguredRooms(value, undefined, 28)
  const intake = floor.rooms!.find((room) => room.kind === "intake")!
  expect(intake.rect.w).toBe(4)
  expect(intake.rect.h).toBe(6)
  expect(floor.bays.find((bay) => bay.id === intake.id)!.stations).toEqual([])
  expect(floor.boxes[0]!.tile).toEqual(floor.intake.pile[0])
  expect(floor.rooms!.filter((room) => room.rect.y === intake.rect.y).map((room) => room.id)).toEqual([
    "room:intake", "room:planning", "room:implementation",
  ])
  for (const destination of ["planning", "implementation"]) {
    const after = layoutConfiguredRooms(move(value, destination), floor)
    expect(motionsFor(after, restingTiles(floor), floor).unrouted, destination).toEqual([])
  }
})

it("keeps outdoor intake rides on belts when an explicit intake worker arrives", () => {
  const value = state()
  value.snapshot.agents = value.snapshot.agents.filter((agent) => agent.roomId !== "intake")
  value.snapshot.tasks[0]!.at = { kind: "room", roomId: "intake" }
  const before = layoutConfiguredRooms(value, undefined, 28)
  const next = move(value, "implementation")
  const riding = layoutConfiguredRooms(next, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  next.snapshot.agents.push({ id: "router", name: "Router", role: "router", roomId: "intake", status: "idle" })
  const staffed = layoutConfiguredRooms(next, riding, 28, new Set(["task"]))
  expect(staffed.rooms!.find((room) => room.kind === "intake")!.rect.w).toBe(7)
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, staffed, tile, "task")!
    expect(mapped, JSON.stringify(tile)).toBeDefined()
    expect(motionsFor(staffed, { task: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
})


it("starts the outdoor intake with one outward conveyor and branches downstream", () => {
  const value = state()
  value.snapshot.agents = value.snapshot.agents.filter((agent) => agent.roomId !== "intake")
  value.snapshot.tasks[0]!.at = { kind: "room", roomId: "intake" }
  const floor = layoutConfiguredRooms(value, undefined, 28)
  const source = floor.intake.pile[0]!
  const tiles = floor.belts.flatMap((belt) => belt.tiles)
  const at = (x: number, y: number) => tiles.find((tile) => tile.x === x && tile.y === y)
  expect(at(source.x - 1, source.y)).toBeUndefined()
  expect(at(source.x, source.y - 1)).toBeUndefined()
  expect(at(source.x, source.y + 1)).toBeUndefined()
  expect(at(source.x, source.y)).toMatchObject({ kind: "straight", dir: "e" })
  const outgoing = floor.routing!.connections.filter((edge) => edge.transition.from === "intake")
  expect(outgoing.some((edge) => edge.path.some((tile) => {
    const branch = at(tile.x, tile.y)
    return tile.x > source.x && branch?.kind === "junction" && branch.entries.includes("e") && branch.exits.length > 1
  }))).toBe(true)
  expect(floor.belts.filter((belt) => belt.id.startsWith("room:intake:")).map((belt) => belt.id)).toEqual(["room:intake:source"])
  for (const destination of ["planning", "implementation"]) {
    const next = layoutConfiguredRooms(move(value, destination), floor)
    const motion = motionsFor(next, restingTiles(floor), floor)
    expect(motion.unrouted, destination).toEqual([])
    expect(motion.toPlay[0]!.path.slice(0, 2)).toEqual([source, { x: source.x + 1, y: source.y }])
  }
})
