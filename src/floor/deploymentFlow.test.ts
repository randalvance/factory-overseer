import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTiles, tileAfterSlide } from "./motion"
import { validateRoomUpdate } from "~/model/roomRouting"
import { entries, exits } from "./belts"
import { opposite, step, tileKey } from "./tiles"
import type { Layout, Tile } from "./types"

it.each([false, true])("carries incoming parcels across deployment before its truck exit (expanded=%s)", (expanded) => {
  const configuration = structuredClone(exampleRooms)
  if (!expanded) {
    configuration.rooms = configuration.rooms.filter((room) => ["intake", "review", "deployment"].includes(room.id))
    configuration.transitions = configuration.transitions.filter((edge) => edge.from === "review" && edge.to === "deployment")
  }
  const state: RoomFactoryState = { configuration, snapshot: {
    agents: configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: expanded && room.id === "implementation" ? 7 : 1 }, (_, i) => ({
        id: `${room.id}-${i}`, name: room.label, role: room.role, roomId: room.id, status: "idle" as const,
      }))),
    tasks: [{ id: "parcel", label: "Deploy", at: { kind: "room", roomId: "review", assignment: { agentIds: ["review-0"], completedAgentIds: [] } } }],
    humanRequests: [],
  } }
  const before = layoutConfiguredRooms(state, undefined, 28)
  // Hosts may skip intermediate observations; the physical line still has
  // to go through deployment's work surface on its way to the truck.
  const shipped = structuredClone(state)
  shipped.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
  const after = layoutConfiguredRooms(shipped, before)
  const motion = motionsFor(after, restingTiles(before), before)
  expect(motion.unrouted).toEqual([])
  const path = motion.toPlay[0]!.path
  const bench = after.bays.find((bay) => bay.id === "room:deployment")!.stations[0]!.bench
  const benchIndex = path.findIndex((tile) => tile.x === bench.x && tile.y === bench.y)
  const outletIndex = path.findIndex((tile) => tile.x === after.shippingDock!.outlet.x && tile.y === after.shippingDock!.outlet.y)
  expect(benchIndex, JSON.stringify({ bench, outlet: after.shippingDock!.outlet, path })).toBeGreaterThanOrEqual(0)
  expect(outletIndex).toBeGreaterThan(benchIndex)
})

it.each([24, 28, 37])("keeps every incoming deployment connection upstream of its agents at width %s", (width) => {
  for (const implementers of [1, 7]) for (const deployers of [1, 3, 7]) for (const extra of [0, 1, 3]) for (const reversed of [false, true]) {
    const configuration = structuredClone(exampleRooms)
    for (let i = 0; i < extra; i++) {
      const id = `qa-${i}`
      configuration.rooms.push({ id, label: id, role: "qa", kind: "work" })
      configuration.transitions.push({ id: `check-${i}`, from: "review", to: id, outcome: id },
        { id: `ready-${i}`, from: id, to: "deployment", outcome: "ready" })
    }
    if (reversed) configuration.rooms.reverse()
    const incoming = configuration.transitions.filter((edge) => edge.to === "deployment")
    const state: RoomFactoryState = { configuration, snapshot: {
      agents: configuration.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
        Array.from({ length: room.id === "implementation" ? implementers : room.id === "deployment" ? deployers : 1 }, (_, i) => ({
          id: `${room.id}-${i}`, name: room.label, role: room.role, roomId: room.id, status: "idle" as const,
        }))),
      tasks: incoming.map((edge) => ({ id: edge.id, label: edge.id, at: { kind: "room", roomId: edge.from, assignment: { agentIds: [`${edge.from}-0`], completedAgentIds: [] } } })),
      humanRequests: [],
    } }
    const context = JSON.stringify({ width, implementers, deployers, extra, reversed })
    const before = layoutConfiguredRooms(state, undefined, width)
    const afterState = structuredClone(state)
    for (const task of afterState.snapshot.tasks) task.at = { kind: "shipped", roomId: "deployment" }
    const after = layoutConfiguredRooms(afterState, before)
    const motions = motionsFor(after, restingTiles(before), before)
    expect(motions.unrouted, context).toEqual([])
    const benches = after.bays.find((bay) => bay.id === "room:deployment")!.stations.map((station) => station.bench)
    // Removing all deployment work surfaces must disconnect its input from
    // the truck, even without the task-specific route permissions.
    expect(canReachWithoutBenches(after, after.rooms!.find((room) => room.kind === "deployment")!.ports[0]!, after.shippingDock!.cargoTiles[0]!, benches), context).toBe(false)
    for (const motion of motions.toPlay) {
      expect(motion.path.some((point) => benches.some((bench) => bench.x === point.x && bench.y === point.y)), `${context} task ${motion.taskId}`).toBe(true)
    }
    for (const connection of after.routing!.connections.filter((connection) => connection.transition.to === "deployment")) {
      expect(connection.path.filter((point) => after.shippingDock!.connectorPath.some((tile) => tile.x === point.x && tile.y === point.y)), `${context} incoming ${connection.transition.id}`).toEqual([])
    }
  }
})

/** Directed physical belt reachability, with the work surfaces cut out. */
function canReachWithoutBenches(layout: Layout, start: Tile, finish: Tile, benches: Tile[]): boolean {
  const blocked = new Set(benches.map(tileKey))
  const edges = new Map<string, Set<string>>()
  const link = (from: Tile, to: Tile) => {
    if (blocked.has(tileKey(from)) || blocked.has(tileKey(to))) return
    const neighbors = edges.get(tileKey(from)) ?? new Set<string>()
    neighbors.add(tileKey(to)); edges.set(tileKey(from), neighbors)
  }
  for (const tile of layout.belts.flatMap((belt) => belt.tiles)) {
    for (const entry of entries(tile)) link(step(tile, opposite(entry)), tile)
    for (const exit of exits(tile)) link(tile, step(tile, exit))
  }
  const queue = [tileKey(start)], seen = new Set(queue)
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]!
    if (at === tileKey(finish)) return true
    for (const next of edges.get(at) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
  }
  return false
}


it("keeps an unrelated ride valid when a larger terminal is replaced under a new ID", () => {
  const state: RoomFactoryState = { configuration: structuredClone(exampleRooms), snapshot: {
    agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: room.kind === "deployment" ? 3 : 1 }, (_, index) => ({
        id: `${room.id}-${index}`, name: room.label, roomId: room.id, role: room.role, status: "working" as const,
      }))),
    tasks: [{ id: "moving", label: "Review", at: { kind: "room", roomId: "implementation", assignment: {
      agentIds: ["implementation-0"], completedAgentIds: [],
    } } }], humanRequests: [],
  } }
  const before = layoutConfiguredRooms(state, undefined, 24)
  state.snapshot.tasks[0]!.at = { kind: "room", roomId: "review", assignment: { agentIds: ["review-0"], completedAgentIds: [] } }
  const riding = layoutConfiguredRooms(state, before)
  const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
  const next = structuredClone(state)
  next.configuration.rooms = next.configuration.rooms.map((room) => room.kind === "deployment" ? { ...room, id: "deploy-v2" } : room)
  next.configuration.transitions = next.configuration.transitions.map((edge) => edge.to === "deployment" ? { ...edge, to: "deploy-v2" } : edge)
  next.snapshot.agents = next.snapshot.agents.map((agent) => agent.roomId === "deployment" ? { ...agent, id: `new-${agent.id}`, roomId: "deploy-v2" } : agent)
  expect(validateRoomUpdate(state, next)).toEqual([])
  const replaced = layoutConfiguredRooms(next, riding, 24, new Set(["moving"]))
  expect(replaced.rooms!.filter((room) => room.kind === "deployment")).toHaveLength(2)
  const current = replaced.rooms!.find((room) => room.id === "room:deploy-v2")!
  expect(replaced.shippingDock!.outlet.x).toBe(current.rect.x)
  expect(replaced.routing!.connections.find((connection) => connection.transition.id === "deploy")!.path.at(-1)).toEqual(current.ports[0])
  for (const tile of path) {
    const mapped = tileAfterSlide(riding, replaced, tile, "moving")!
    expect(mapped).toBeDefined()
    expect(motionsFor(replaced, { moving: mapped }, riding).unrouted, JSON.stringify({ tile, mapped })).toEqual([])
  }
})
