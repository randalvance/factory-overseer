import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { layoutConfiguredRooms } from "./configuredRooms"
import { motionsFor, restingTiles, tileAfterSlide } from "./motion"
import type { Layout, Tile } from "./types"

function state(extraRooms = 0, assigned = true): RoomFactoryState {
  const configuration = structuredClone(exampleRooms)
  for (let i = 0; i < extraRooms; i++) {
    const id = `qa-${i}`
    configuration.rooms.push({ id, label: `QA ${i}`, role: "qa", kind: "work" })
    configuration.transitions.push({ id: `extra-${i}`, from: "review", to: id, outcome: `qa-${i}` },
      { id: `ready-${i}`, from: id, to: "deployment", outcome: "ready" })
  }
  return { configuration, snapshot: {
    agents: configuration.rooms.filter((room) => room.kind !== "intake").map((room) => ({
      id: room.id + "-agent", name: room.label, roomId: room.id, role: room.role, status: "working",
    })),
    tasks: [0, 1].map((i) => ({ id: `task-${i}`, label: "Ship me", at: { kind: "room", roomId: "deployment",
      ...(assigned ? { assignment: { agentIds: ["deployment-agent"], completedAgentIds: [] } } : {}) } })),
    humanRequests: [],
  } }
}

function shipped(value: RoomFactoryState) {
  const next = structuredClone(value)
  for (const task of next.snapshot.tasks) task.at = { kind: "shipped", roomId: "deployment" }
  return next
}

function assertContiguous(path: Tile[]) {
  for (let i = 1; i < path.length; i++) expect(Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y)).toBe(1)
}

function assertDockClear(layout: Layout) {
  const dock = layout.shippingDock!
  const others = layout.rooms!.filter((room) => room.kind !== "deployment")
  assertContiguous(dock.connectorPath)
  for (const tile of dock.connectorPath) {
    expect(others.some((room) => tile.x >= room.rect.x && tile.x < room.rect.x + room.rect.w && tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h), JSON.stringify(tile)).toBe(false)
    expect(tile.x, JSON.stringify(tile)).toBeGreaterThanOrEqual(0)
    expect(tile.x, JSON.stringify(tile)).toBeLessThan(layout.bounds.w)
  }
  const physical = new Set(layout.belts.flatMap((belt) => belt.tiles.map((tile) => `${tile.x},${tile.y}`)))
  for (const tile of dock.connectorPath) expect(physical.has(`${tile.x},${tile.y}`), JSON.stringify(tile)).toBe(true)
}

it.each([true, false])("ships from deployment assigned=%s through its left-side outlet and into both truck cargo spaces", (assigned) => {
  for (const width of [24, 28, 37]) {
    const original = state(0, assigned)
    const before = layoutConfiguredRooms(original, undefined, width)
    const after = layoutConfiguredRooms(shipped(original), before)
    assertDockClear(after)
    const motions = motionsFor(after, restingTiles(before), before)
    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay).toHaveLength(2)
    for (const motion of motions.toPlay) {
      assertContiguous(motion.path)
      expect(motion.path).toContainEqual(after.shippingDock!.outlet)
      expect(motion.path.at(-1)).toEqual(after.boxes.find((box) => box.taskId === motion.taskId)!.tile)
    }
  }
})

it("keeps the truck and real loading conveyor clear when more rooms fill its forecourt", () => {
  for (const width of [24, 28, 37]) for (const count of [1, 2, 3, 6]) {
    const original = state(count)
    let before: Layout
    try { before = layoutConfiguredRooms(original, undefined, width) } catch (error) { throw new Error(`width ${width}, rooms ${count}`, { cause: error }) }
    const after = layoutConfiguredRooms(shipped(original), before)
    assertDockClear(after)
    expect(motionsFor(after, restingTiles(before), before).unrouted, `width ${width}, rooms ${count}`).toEqual([])
  }
})

it("keeps every shipping position routable through growth and Reorganize", () => {
  for (const compact of [false, true]) {
    const original = state(1)
    const before = layoutConfiguredRooms(original, undefined, 28)
    const next = shipped(original)
    const riding = layoutConfiguredRooms(next, before)
    const motions = motionsFor(riding, restingTiles(before), before)
    next.snapshot.agents.push(...Array.from({ length: 4 }, (_, i) => ({ id: `extra-${i}`, name: "Extra", role: "deployer", roomId: "deployment", status: "idle" as const })))
    if (compact) next.configuration.rooms.reverse()
    let grown: Layout
    try { grown = layoutConfiguredRooms(next, riding, 28, new Set(next.snapshot.tasks.map((task) => task.id)), compact) } catch (error) { throw new Error(`compact ${compact}`, { cause: error }) }
    assertDockClear(grown)
    for (const motion of motions.toPlay) for (const tile of motion.path) {
      const mapped = tileAfterSlide(riding, grown, tile, motion.taskId)!
      expect(mapped, JSON.stringify({ compact, tile })).toBeDefined()
      const from = { ...restingTiles(grown), [motion.taskId]: mapped }
      const resumed = motionsFor(grown, from, riding)
      expect(resumed.unrouted, JSON.stringify({ compact, tile, mapped })).toEqual([])
      const target = grown.boxes.find((box) => box.taskId === motion.taskId)!.tile
      const previousCargo = riding.boxes.find((box) => box.taskId === motion.taskId)!.tile
      if ((mapped.x !== target.x || mapped.y !== target.y) && (mapped.x !== previousCargo.x || mapped.y !== previousCargo.y)) {
        expect(resumed.toPlay.some((ride) => ride.taskId === motion.taskId), JSON.stringify({ compact, tile, mapped, target })).toBe(true)
      }
    }
  }
})


it("exits the left side of the first station row and keeps the old front-center spur empty", () => {
  const layout = layoutConfiguredRooms(state(), undefined, 28)
  const dock = layout.shippingDock!
  const deployment = layout.rooms!.find((room) => room.kind === "deployment")!
  expect(dock.outlet).toEqual({ x: deployment.rect.x, y: deployment.rect.y + 3 })
  expect(dock.connectorPath[1]).toEqual({ x: dock.outlet.x - 1, y: dock.outlet.y })
  expect(layout.belts.some((belt) => belt.id === "room:deployment:ship")).toBe(false)
  const formerSpur = { x: deployment.rect.x + Math.floor(deployment.rect.w / 2), y: deployment.rect.y + deployment.rect.h - 2 }
  expect(layout.belts.flatMap((belt) => belt.tiles).some((tile) => tile.x === formerSpur.x && tile.y === formerSpur.y)).toBe(false)
  expect(dock.connectorPath.slice(-2)).toEqual(dock.cargoTiles)
})


it("keeps terminal rides from every grid row on real belts when deployment compacts", () => {
  for (const width of [24, 28, 37]) {
    const original = state()
    original.snapshot.agents.push(...Array.from({ length: 6 }, (_, i) => ({
      id: `deployer-${i}`, name: "Deployer", roomId: "deployment", role: "deployer", status: "working" as const,
    })))
    for (const task of original.snapshot.tasks) task.at = { kind: "room", roomId: "deployment", assignment: {
      agentIds: ["deployer-5"], completedAgentIds: [],
    } }
    const before = layoutConfiguredRooms(original, undefined, width)
    const next = shipped(original)
    const riding = layoutConfiguredRooms(next, before)
    const motions = motionsFor(riding, restingTiles(before), before)
    next.snapshot.agents = next.snapshot.agents.filter((agent) => agent.roomId !== "deployment" || agent.id === "deployment-agent")
    const compacted = layoutConfiguredRooms(next, riding, width, new Set(["task-0", "task-1"]), true)
    for (const motion of motions.toPlay) for (const tile of motion.path) {
      const mapped = tileAfterSlide(riding, compacted, tile, motion.taskId)!
      expect(mapped).toBeDefined()
      expect(motionsFor(compacted, { ...restingTiles(compacted), [motion.taskId]: mapped }, riding).unrouted,
        JSON.stringify({ width, tile, mapped })).toEqual([])
    }
  }
})


it.each([24, 28])("keeps nonshipping tasks on their selected route at loading crossings at width %s", (width) => {
  for (const growingRoom of ["deployment", "qa-1"]) {
    const original = state(2)
    original.snapshot.tasks = [{ id: "qa-task", label: "Review then QA", at: { kind: "room", roomId: "review",
      assignment: { agentIds: ["review-agent"], completedAgentIds: [] } } }]
    const before = layoutConfiguredRooms(original, undefined, width)
    const next = structuredClone(original)
    next.snapshot.tasks[0]!.at = { kind: "room", roomId: "qa-1", assignment: { agentIds: ["qa-1-agent"], completedAgentIds: [] } }
    const riding = layoutConfiguredRooms(next, before)
    const path = motionsFor(riding, restingTiles(before), before).toPlay[0]!.path
    const shared = path.filter((tile) => riding.shippingDock!.connectorPath.some((point) => point.x === tile.x && point.y === tile.y))
    expect(shared.length).toBeGreaterThan(0)
    next.snapshot.agents.push(...Array.from({ length: 6 }, (_, i) => ({ id: `new-${i}`, name: "New", roomId: growingRoom,
      role: growingRoom === "deployment" ? "deployer" : "qa", status: "idle" as const })))
    const grown = layoutConfiguredRooms(next, riding, width, new Set(["qa-task"]))
    for (const tile of shared) {
      const mapped = tileAfterSlide(riding, grown, tile, "qa-task")!
      expect(mapped).toBeDefined()
      const resumed = motionsFor(grown, { "qa-task": mapped }, riding)
      expect(resumed.unrouted, JSON.stringify({ width, growingRoom, tile, mapped })).toEqual([])
      expect(grown.boxes[0]!.spot.kind).toBe("bench")
    }
  }
})
