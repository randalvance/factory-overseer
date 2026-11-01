import { expect, it } from "vitest"
import { layoutFloor, reorganizedFloor, roomGeometryChanged } from "./layout"
import { motionsFor, restingTileAfterSlide, restingTiles, tileAfterSlide } from "./motion"
import { comingsAndGoings, wayIn } from "./walk"
import type { Agent, Snapshot } from "~/model/types"
import type { Layout, Rect } from "./types"

const pipeline = { roles: ["implementer", "reviewer", "qa", "empty"] }
const agent = (id: string, role = "implementer"): Agent => ({ id, name: id, role, status: "idle" })
const opening = (): Snapshot => ({ agents: [agent("a"), agent("reviewer", "reviewer")], tasks: [{ id: "task", label: "Task", at: { agent: "a" } }] })
const lay = (snapshot: Snapshot, previous?: Layout) => layoutFloor(pipeline, snapshot, previous, { width: 24, roomLayout: true })
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

it("lays distinct rooms for intake, each role including empty ones, review and deployment", () => {
  const layout = lay(opening())
  expect(layout.rooms).toHaveLength(7)
  expect(layout.rooms!.find((room) => room.id === "bay:empty")).toBeDefined()
  for (const room of layout.rooms!) {
    expect(room.rect.x).toBeGreaterThanOrEqual(0)
    expect(room.rect.x + room.rect.w).toBeLessThanOrEqual(24)
    for (const other of layout.rooms!) if (other.id !== room.id) expect(overlaps(room.rect, other.rect)).toBe(false)
    expect(room.ports).toHaveLength(4)
  }
})

it("expands one room beyond three agents without annexes and preserves earlier rows", () => {
  const snapshot = opening()
  const before = lay(snapshot)
  snapshot.agents.push(...Array.from({ length: 6 }, (_, i) => agent("extra-" + i, "reviewer")))
  const after = lay(snapshot, before)
  expect(after.bays.filter((bay) => bay.role === "reviewer")).toHaveLength(1)
  expect(after.bays.find((bay) => bay.role === "reviewer")!.stations).toHaveLength(7)
  expect(after.rooms!.find((room) => room.id === "bay:reviewer")!.rect.h).toBeGreaterThan(before.rooms!.find((room) => room.id === "bay:reviewer")!.rect.h)
  for (const id of ["intake", "bay:implementer"]) {
    expect(after.rooms!.find((room) => room.id === id)).toEqual(before.rooms!.find((room) => room.id === id))
  }
  expect(after.unplaced.taskIds).toEqual([])
  for (const room of after.rooms!) for (const other of after.rooms!) {
    if (room.id !== other.id) expect(overlaps(room.rect, other.rect)).toBe(false)
  }
  expect(roomGeometryChanged(before, after)).toBe(true)
})

it("repeated snapshots and agent removal retain geometry and occupied orphaned benches", () => {
  const snapshot = opening()
  const before = lay(snapshot)
  expect(lay(snapshot, before)).toEqual(before)
  snapshot.agents = snapshot.agents.filter((agent) => agent.id !== "a")
  const vacant = lay(snapshot, before)
  expect(vacant.rooms).toEqual(before.rooms)
  expect(vacant.boxes).toEqual(before.boxes)
  expect(vacant.bays[0]!.stations[0]!.vacant).toBe(true)
  expect(roomGeometryChanged(before, vacant)).toBe(false)
  snapshot.agents.push(agent("replacement"))
  const next = lay(snapshot, vacant)
  expect(next.bays[0]!.stations).toHaveLength(2)
  expect(next.boxes[0]!.tile).toEqual(before.boxes[0]!.tile)
})

it("reuses an unoccupied vacancy and compacts only when explicitly reorganized", () => {
  const snapshot = opening()
  snapshot.agents.push(agent("b"), agent("c"), agent("d"))
  const before = lay(snapshot)
  snapshot.agents = snapshot.agents.filter((agent) => agent.id !== "b")
  const after = lay(snapshot, before)
  expect(after.rooms).toEqual(before.rooms)
  snapshot.agents.push(agent("replacement"))
  const reused = lay(snapshot, after)
  expect(reused.bays[0]!.stations.find((station) => station.agentId === "replacement")!.id).toBe(before.bays[0]!.stations[1]!.id)
  snapshot.agents = snapshot.agents.filter((agent) => agent.id === "a" || agent.role === "reviewer")
  const compact = reorganizedFloor(pipeline, snapshot, reused)
  expect(compact.rooms![1]!.rect.h).toBeLessThan(reused.rooms![1]!.rect.h)
  expect(compact.boxes.map((box) => box.taskId)).toEqual(["task"])
})

it("entry paths start at each room door, stay inside it and avoid benches", () => {
  const snapshot = opening()
  snapshot.agents.push(...Array.from({ length: 5 }, (_, i) => agent("x" + i)))
  const layout = lay(snapshot)
  for (const bay of layout.bays) for (const station of bay.stations) {
    const room = layout.rooms!.find((room) => room.id === bay.id)!
    const path = wayIn(layout, station)
    expect(path[0]).toEqual(room.door)
    expect(path.at(-1)).toEqual(station.agentTile)
    path.forEach((tile, i) => {
      expect(tile.x >= room.rect.x && tile.x < room.rect.x + room.rect.w && tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h).toBe(true)
      expect(bay.stations.some((other) => other.bench.x === tile.x && other.bench.y === tile.y)).toBe(false)
      if (i) expect(Math.abs(tile.x - path[i - 1]!.x) + Math.abs(tile.y - path[i - 1]!.y)).toBe(1)
    })
  }
})

it("keeps task queues and routes both forward and back through belt openings", () => {
  const snapshot = opening()
  snapshot.tasks.push({ id: "queued", label: "Queued", at: { agent: "a" } })
  const before = lay(snapshot)
  expect(before.boxes[1]!.spot.kind).toBe("queue")
  snapshot.tasks[0]!.at = { agent: "reviewer" }
  const after = lay(snapshot, before)
  const motion = motionsFor(after, restingTiles(before), before)
  expect(motion.unrouted).toEqual([])
  expect(motion.toPlay.find((motion) => motion.taskId === "task")!.path.length).toBeGreaterThan(2)
  snapshot.tasks[0]!.at = { agent: "a" }
  const returned = lay(snapshot, after)
  expect(motionsFor(returned, restingTiles(after), after).unrouted).toEqual([])
})

it("maps a box in flight onto the rebuilt belt when a room grows", () => {
  const snapshot = opening()
  const before = lay(snapshot)
  snapshot.tasks[0]!.at = { agent: "reviewer" }
  const moving = lay(snapshot, before)
  const path = motionsFor(moving, restingTiles(before), before).toPlay[0]!.path
  const tile = path[Math.floor(path.length / 2)]!
  snapshot.agents.push(...Array.from({ length: 5 }, (_, i) => agent("new" + i)))
  const grown = lay(snapshot, moving)
  const mapped = tileAfterSlide(moving, grown, tile)!
  expect(mapped).toBeDefined()
  expect(motionsFor(grown, { task: mapped }, moving).unrouted).toEqual([])
  expect(comingsAndGoings(moving, grown).arrivals).toHaveLength(5)
})

it("rejects floor widths that cannot fit rooms and their belt turns", () => {
  expect(() => layoutFloor(pipeline, opening(), undefined, { width: 12, roomLayout: true })).toThrow("at least 18")
})

it("rides from the old holder after a simultaneous handoff and resize", () => {
  const snapshot = opening()
  const before = lay(snapshot)
  snapshot.agents.push(agent("new"))
  snapshot.tasks[0]!.at = { agent: "reviewer" }
  const after = lay(snapshot, before)
  const start = restingTileAfterSlide(before, after, "task")!
  expect(start).not.toEqual(after.boxes[0]!.tile)
  const motion = motionsFor(after, { task: start }, before)
  expect(motion.unrouted).toEqual([])
  expect(motion.toPlay[0]!.path.length).toBeGreaterThan(2)
})
