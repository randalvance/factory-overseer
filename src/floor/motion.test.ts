import { describe, expect, it } from "vitest"
import type { Pipeline, Snapshot, TaskLocation } from "~/model/types"
import { layoutFloor } from "./layout"
import { motionsFor, restingTiles } from "./motion"
import type { Layout, Tile } from "./types"

const pipeline: Pipeline = { roles: ["implementer", "reviewer", "qa"] }

/** One agent per role, and the tasks in the order given, which is queue order. */
function snapshot(tasks: Record<string, TaskLocation>): Snapshot {
  return {
    agents: [
      { id: "imp-1", name: "imp-1", role: "implementer", status: "idle" },
      { id: "rev-1", name: "rev-1", role: "reviewer", status: "idle" },
      { id: "qa-1", name: "qa-1", role: "qa", status: "idle" },
    ],
    tasks: Object.entries(tasks).map(([id, at]) => ({ id, label: id, at })),
  }
}

function tiles(...pairs: [number, number][]): Tile[] {
  return pairs.map(([x, y]) => ({ x, y }))
}

/** The floor for the next snapshot, laid out additively on the floor before it. */
function nextSnapshot(before: Layout, tasks: Record<string, TaskLocation>): Layout {
  return layoutFloor(pipeline, snapshot(tasks), before)
}

// The first floor: intake on tiles 0 to 1, the implementer's bench at x = 5,
// the reviewer's at x = 10, the qa's at x = 15, the staging bench at x = 20
// and the container's mouth at x = 24 with the stack at x = 25, all on the
// trunk row y = 3.

describe("a handoff rides the trunk", () => {
  it("carries a task from one station's bench to the next bay's bench, tile by tile", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": { agent: "imp-1" } }))
    const after = nextSnapshot(before, { "t-1": { agent: "rev-1" } })

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay.map((m) => m.taskId)).toEqual(["t-1"])
    expect(motions.toPlay[0]!.path).toEqual(tiles([5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]))
  })

  it("sets the bay's merge junction toward the trunk and the next bay's split junction toward its lane before the box leaves", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": { agent: "imp-1" } }))
    const after = nextSnapshot(before, { "t-1": { agent: "rev-1" } })

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 6, y: 3 }, exit: "e" },
      { tile: { x: 9, y: 3 }, exit: "e" },
    ])
    const merge = after.belts.flatMap((b) => b.tiles).find((t) => t.x === 6 && t.y === 3)
    expect(merge).toEqual({ kind: "junction", x: 6, y: 3, dir: "e", entries: ["e", "n"], exits: ["e", "n"] })
  })
})

describe("the ends of the line", () => {
  it("rolls a task from its intake pile tile onto the first belt and up to the first bench", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": "intake" }))
    const after = nextSnapshot(before, { "t-1": { agent: "imp-1" } })

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay[0]!.path).toEqual(tiles([1, 3], [2, 3], [3, 3], [4, 3], [5, 3]))
  })

  it("rides from the last station to the staging bench, and from there into the container's stack", () => {
    const atQa = layoutFloor(pipeline, snapshot({ "t-1": { agent: "qa-1" } }))
    const awaitingReview = nextSnapshot(atQa, { "t-1": "staging" })
    const shipped = nextSnapshot(awaitingReview, { "t-1": "shipped" })

    const toStaging = motionsFor(awaitingReview, restingTiles(atQa))
    const toContainer = motionsFor(shipped, restingTiles(awaitingReview))

    expect(toStaging.toPlay[0]!.path).toEqual(tiles([15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [20, 3]))
    expect(toContainer.toPlay[0]!.path).toEqual(tiles([20, 3], [21, 3], [22, 3], [23, 3], [24, 3], [25, 3]))
  })

  it("carries a second box awaiting review onto the shelf before the bench, then onto the bench when it frees", () => {
    const atQa = layoutFloor(pipeline, snapshot({ "t-1": "staging", "t-2": { agent: "qa-1" } }))
    const bothWaiting = nextSnapshot(atQa, { "t-1": "staging", "t-2": "staging" })
    const firstShipped = nextSnapshot(bothWaiting, { "t-2": "staging", "t-1": "shipped" })

    const arrival = motionsFor(bothWaiting, restingTiles(atQa))
    const advance = motionsFor(firstShipped, restingTiles(bothWaiting))

    expect(arrival.toPlay.map((m) => m.taskId)).toEqual(["t-2"])
    expect(arrival.toPlay[0]!.path).toEqual(tiles([15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [19, 2]))
    expect(advance.toPlay.find((m) => m.taskId === "t-2")!.path).toEqual(tiles([19, 2], [19, 3], [20, 3]))
  })

  it("piles a third box awaiting review on the same shelf, where it stays while the second advances", () => {
    const threeWaiting = layoutFloor(pipeline, snapshot({ "t-1": "staging", "t-2": "staging", "t-3": "staging" }))
    const firstShipped = nextSnapshot(threeWaiting, { "t-2": "staging", "t-3": "staging", "t-1": "shipped" })

    const motions = motionsFor(firstShipped, restingTiles(threeWaiting))

    expect(restingTiles(threeWaiting)["t-3"]).toEqual({ x: 19, y: 2 })
    expect(motions.toPlay.map((m) => m.taskId).sort()).toEqual(["t-1", "t-2"])
    expect(motions.unrouted).toEqual([])
  })
})

describe("queueing at a station", () => {
  it("rolls the queue forward in order when the bench frees", () => {
    const three = layoutFloor(pipeline, snapshot({ a: { agent: "imp-1" }, b: { agent: "imp-1" }, c: { agent: "imp-1" } }))
    const aHandedOff = nextSnapshot(three, { b: { agent: "imp-1" }, c: { agent: "imp-1" }, a: { agent: "rev-1" } })

    const motions = motionsFor(aHandedOff, restingTiles(three))
    const paths = Object.fromEntries(motions.toPlay.map((m) => [m.taskId, m.path]))

    expect(paths["b"]).toEqual(tiles([4, 3], [5, 3]))
    expect(paths["c"]).toEqual(tiles([3, 3], [4, 3]))
    expect(paths["a"]![0]).toEqual({ x: 5, y: 3 })
  })
})

describe("a box already in transit", () => {
  it("re-routes from the tile it is over when a new snapshot hands it on", () => {
    const atImp = layoutFloor(pipeline, snapshot({ "t-1": { agent: "imp-1" } }))
    const atQa = nextSnapshot(atImp, { "t-1": { agent: "qa-1" } })

    // Reported half way along the belt to the reviewer's bay.
    const motions = motionsFor(atQa, { "t-1": { x: 7, y: 3 } })

    expect(motions.toPlay[0]!.path).toEqual(
      tiles([7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3]),
    )
  })
})

describe("what stays put", () => {
  it("plays nothing for a task that keeps its place or that is new to the floor", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": { agent: "imp-1" } }))
    const after = nextSnapshot(before, { "t-1": { agent: "imp-1" }, "t-2": "intake" })

    expect(motionsFor(after, restingTiles(before))).toEqual({ toPlay: [], unrouted: [] })
  })

  it("reports rework, a task handed back to an earlier role, as unrouted until the return belt exists", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": { agent: "rev-1" } }))
    const after = nextSnapshot(before, { "t-1": { agent: "imp-1" } })

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay).toEqual([])
    expect(motions.unrouted).toEqual(["t-1"])
  })
})

describe("a bay with lanes", () => {
  const twoImplementers = (tasks: Record<string, TaskLocation>): Snapshot => {
    const base = snapshot(tasks)
    return { ...base, agents: [base.agents[0]!, { id: "imp-2", name: "imp-2", role: "implementer", status: "idle" }, ...base.agents.slice(1)] }
  }

  it("routes a box bound for the second lane's agent through the split junction, down the feeder and onto its bench", () => {
    const before = layoutFloor(pipeline, twoImplementers({ "t-1": "intake" }))
    const after = layoutFloor(pipeline, twoImplementers({ "t-1": { agent: "imp-2" } }), before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay[0]!.path).toEqual(tiles([1, 3], [2, 3], [3, 3], [4, 3], [4, 4], [4, 5], [4, 6], [5, 6]))
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 4, y: 3 }, exit: "s" },
      { tile: { x: 4, y: 6 }, exit: "e" },
    ])
  })

  it("collects a handoff from the second lane up the front of the bay and on along the trunk", () => {
    const before = layoutFloor(pipeline, twoImplementers({ "t-1": { agent: "imp-2" } }))
    const after = layoutFloor(pipeline, twoImplementers({ "t-1": { agent: "rev-1" } }), before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay[0]!.path).toEqual(tiles([5, 6], [6, 6], [6, 5], [6, 4], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]))
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 6, y: 6 }, exit: "n" },
      { tile: { x: 6, y: 3 }, exit: "e" },
      { tile: { x: 9, y: 3 }, exit: "e" },
    ])
  })
})
