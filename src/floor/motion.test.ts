import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot, TaskLocation } from "~/model/types"
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

/** The trunk row's tiles from one column to another along the first band. */
function trunkEastward(fromX: number, toX: number): Tile[] {
  return Array.from({ length: toX - fromX + 1 }, (_, i) => ({ x: fromX + i, y: 3 }))
}

/** The floor for the next snapshot, laid out additively on the floor before it. */
function nextSnapshot(before: Layout, tasks: Record<string, TaskLocation>): Layout {
  return layoutFloor(pipeline, snapshot(tasks), before)
}

// The first floor: intake on tiles 0 to 1, the implementer's bench at x = 5,
// the reviewer's at x = 10, the qa's at x = 15, the staging bench at x = 20
// and the container's mouth at x = 24 with its first stack at x = 25, all on
// the trunk row y = 3.

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

  it("ships a box the host hands straight from the last bay to shipped over the staging bench and on into the container, the staging area still on", () => {
    const atQa = layoutFloor(pipeline, snapshot({ "t-1": { agent: "qa-1" } }))
    const shipped = nextSnapshot(atQa, { "t-1": "shipped" })

    const motions = motionsFor(shipped, restingTiles(atQa))

    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(trunkEastward(15, 25))
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 16, y: 3 }, exit: "e" },
      { tile: { x: 21, y: 3 }, exit: "e" },
    ])
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
})

// Rework: up the riser past the bay's merge junction, right to left along
// the return belt on row 1, down the drop into the target bay's split
// junction, and on to the bench.

describe("rework rides the return belt", () => {
  it("carries a task handed back from the reviewer up to the return belt, along it and down into the implementer's bay", () => {
    const before = layoutFloor(pipeline, snapshot({ "t-1": { agent: "rev-1" } }))
    const after = nextSnapshot(before, { "t-1": { agent: "imp-1" } })

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(
      tiles([10, 3], [11, 3], [11, 2], [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [4, 2], [4, 3], [5, 3]),
    )
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 11, y: 3 }, exit: "n" },
      { tile: { x: 11, y: 1 }, exit: "w" },
      { tile: { x: 9, y: 1 }, exit: "w" },
      { tile: { x: 6, y: 1 }, exit: "w" },
      { tile: { x: 4, y: 1 }, exit: "s" },
      { tile: { x: 4, y: 3 }, exit: "e" },
    ])
  })

  it("drops rework into the split junction and on down the feeder to a second lane", () => {
    const twoLanes = (tasks: Record<string, TaskLocation>): Snapshot => {
      const base = snapshot(tasks)
      return { ...base, agents: [base.agents[0]!, { id: "imp-2", name: "imp-2", role: "implementer", status: "idle" }, ...base.agents.slice(1)] }
    }
    const before = layoutFloor(pipeline, twoLanes({ "t-1": { agent: "rev-1" } }))
    const after = layoutFloor(pipeline, twoLanes({ "t-1": { agent: "imp-2" } }), before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.toPlay[0]!.path.slice(-5)).toEqual(tiles([4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [5, 6]).slice(-5))
    expect(motions.toPlay[0]!.junctions.slice(-2)).toEqual([
      { tile: { x: 4, y: 3 }, exit: "s" },
      { tile: { x: 4, y: 6 }, exit: "e" },
    ])
  })

  it("re-routes a box riding forward through a bay when it is handed back: over that bay's bench, up its riser and back", () => {
    const atImp = layoutFloor(pipeline, snapshot({ "t-1": { agent: "imp-1" } }))
    const atQa = nextSnapshot(atImp, { "t-1": { agent: "qa-1" } })
    const backAtImp = nextSnapshot(atQa, { "t-1": { agent: "imp-1" } })

    // Reported half way along the belt into the reviewer's bay.
    const motions = motionsFor(backAtImp, { "t-1": { x: 7, y: 3 } })

    expect(motions.toPlay[0]!.path.slice(0, 6)).toEqual(tiles([7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [11, 2]))
    expect(motions.toPlay[0]!.path.at(-1)).toEqual({ x: 5, y: 3 })
  })

  it("keeps forward handoffs on the trunk once the return belt is there", () => {
    const atReviewer = layoutFloor(pipeline, snapshot({ "t-1": { agent: "rev-1" } }))
    const back = nextSnapshot(atReviewer, { "t-1": { agent: "imp-1" } })
    const forwardAgain = nextSnapshot(back, { "t-1": { agent: "rev-1" } })

    const motions = motionsFor(forwardAgain, restingTiles(back))

    expect(motions.toPlay[0]!.path).toEqual(tiles([5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]))
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

describe("rework from the staging area", () => {
  it("rides a task the inspector rejects up the staging area's riser, along the return belt and down into the qa bay", () => {
    const awaitingReview = layoutFloor(pipeline, snapshot({ "t-1": "staging" }))
    const rejected = nextSnapshot(awaitingReview, { "t-1": { agent: "qa-1" } })

    const motions = motionsFor(rejected, restingTiles(awaitingReview))

    expect(motions.toPlay[0]!.path).toEqual(
      tiles([20, 3], [21, 3], [21, 2], [21, 1], [20, 1], [19, 1], [18, 1], [17, 1], [16, 1], [15, 1], [14, 1], [14, 2], [14, 3], [15, 3]),
    )
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 21, y: 3 }, exit: "n" },
      { tile: { x: 16, y: 1 }, exit: "w" },
      { tile: { x: 14, y: 1 }, exit: "s" },
      { tile: { x: 14, y: 3 }, exit: "e" },
    ])
  })

  it("still ships from the staging bench straight on into the container", () => {
    const awaitingReview = layoutFloor(pipeline, snapshot({ "t-1": "staging" }))
    const shipped = nextSnapshot(awaitingReview, { "t-1": "shipped" })

    const motions = motionsFor(shipped, restingTiles(awaitingReview))

    expect(motions.toPlay[0]!.path).toEqual(tiles([20, 3], [21, 3], [22, 3], [23, 3], [24, 3], [25, 3]))
    expect(motions.toPlay[0]!.junctions).toEqual([{ tile: { x: 21, y: 3 }, exit: "e" }])
  })
})

describe("with the staging area switched off", () => {
  it("rides from the last station straight into the container", () => {
    const atQa = layoutFloor(pipeline, snapshot({ "t-1": { agent: "qa-1" } }), undefined, { staging: false })
    const shipped = layoutFloor(pipeline, snapshot({ "t-1": "shipped" }), atQa, { staging: false })

    const motions = motionsFor(shipped, restingTiles(atQa))

    expect(motions.toPlay[0]!.path).toEqual(tiles([15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [20, 3]))
    expect(motions.unrouted).toEqual([])
  })

  it("keeps a box already in the container where the container now is: no ride, and no route missing", () => {
    const shipped = layoutFloor(pipeline, snapshot({ "t-1": "shipped" }))
    const switchedOff = layoutFloor(pipeline, snapshot({ "t-1": "shipped" }), shipped, { staging: false })

    expect(restingTiles(shipped)["t-1"]).toEqual({ x: 25, y: 3 })
    expect(restingTiles(switchedOff)["t-1"]).toEqual({ x: 20, y: 3 })
    expect(motionsFor(switchedOff, restingTiles(shipped), shipped)).toEqual({ toPlay: [], unrouted: [] })
  })

  it("still rides a box on its way into the container the rest of the way when the container stays put", () => {
    const awaitingReview = layoutFloor(pipeline, snapshot({ "t-1": "staging" }))
    const shipped = layoutFloor(pipeline, snapshot({ "t-1": "shipped" }), awaitingReview)
    const stillShipped = layoutFloor(pipeline, snapshot({ "t-1": "shipped" }), shipped)

    const motions = motionsFor(stillShipped, { "t-1": { x: 23, y: 3 } }, shipped)

    expect(motions.toPlay[0]!.path).toEqual(tiles([23, 3], [24, 3], [25, 3]))
  })
})

// Twenty tiles wide, the line wraps: the implementer's and the reviewer's
// bays are in the first band, the trunk turns down column 19 at the edge, and
// the qa bay (its bench at x = 14 on row 13), the staging area and the
// container run westward along the band below. Rework from there rises in
// column 18 beside the trunk's way down, across it at (18, 3), to the first
// band's return belt.

describe("across a turn", () => {
  const twentyWide = { width: 20 }
  const wrapped = (tasks: Record<string, TaskLocation>, before?: Layout): Layout =>
    layoutFloor(pipeline, snapshot(tasks), before, twentyWide)

  it("rides the trunk through the turn to a bay in the band below, the crossing set to let it through", () => {
    const before = wrapped({ "t-1": { agent: "rev-1" } })
    const after = wrapped({ "t-1": { agent: "qa-1" } }, before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(
      tiles([10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [19, 4], [19, 5], [19, 6], [19, 7], [19, 8], [19, 9], [19, 10], [19, 11], [19, 12], [19, 13], [18, 13], [17, 13], [16, 13], [15, 13], [14, 13]),
    )
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 11, y: 3 }, exit: "e" },
      { tile: { x: 18, y: 3 }, exit: "e" },
      { tile: { x: 15, y: 13 }, exit: "w" },
    ])
  })

  it("rides rework from the band below up the turn, across the trunk, and along the band above's return belt to an earlier bay", () => {
    const before = wrapped({ "t-1": { agent: "qa-1" } })
    const after = wrapped({ "t-1": { agent: "imp-1" } }, before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(
      tiles(
        [14, 13], [13, 13], [13, 12], [13, 11], [14, 11], [15, 11], [16, 11], [17, 11], [18, 11],
        [18, 10], [18, 9], [18, 8], [18, 7], [18, 6], [18, 5], [18, 4], [18, 3], [18, 2], [18, 1],
        [17, 1], [16, 1], [15, 1], [14, 1], [13, 1], [12, 1], [11, 1], [10, 1], [9, 1], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1],
        [4, 2], [4, 3], [5, 3],
      ),
    )
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 13, y: 13 }, exit: "n" },
      { tile: { x: 13, y: 11 }, exit: "e" },
      { tile: { x: 15, y: 11 }, exit: "e" },
      { tile: { x: 18, y: 3 }, exit: "n" },
      { tile: { x: 11, y: 1 }, exit: "w" },
      { tile: { x: 9, y: 1 }, exit: "w" },
      { tile: { x: 6, y: 1 }, exit: "w" },
      { tile: { x: 4, y: 1 }, exit: "s" },
      { tile: { x: 4, y: 3 }, exit: "e" },
    ])
  })
})

// Thirty-two tiles wide, the line stays on one band however it grows: a bay
// appended after the qa's stands at x = 19, its bench at (20, 3), and the
// ends stand past it. Band 0's return belt runs west along y = 1.

describe("the line grows while it runs", () => {
  const wide = { width: 32 }
  const more = (ids: string[], role: string): Agent[] => ids.map((id) => ({ id, name: id, role, status: "idle" }))
  /** The floor for a pipeline with these agents beside one of each role, laid additively on the floor before it. */
  const grownBy = (roles: Pipeline, extra: Agent[]) => (tasks: Record<string, TaskLocation>, before?: Layout): Layout => {
    const base = snapshot(tasks)
    return layoutFloor(roles, { ...base, agents: [...base.agents, ...extra] }, before, wide)
  }
  const withAnnex = grownBy(pipeline, more(["imp-2", "imp-3", "imp-4"], "implementer"))
  const withSecurity = grownBy({ roles: ["implementer", "reviewer", "security", "qa"] }, more(["sec-1"], "security"))

  it("rides from the intake along the trunk past every bay to a bench in the implementers' annex", () => {
    const before = withAnnex({ "t-1": "intake" })
    const after = withAnnex({ "t-1": { agent: "imp-4" } }, before)

    const motions = motionsFor(after, restingTiles(before))

    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(trunkEastward(1, 20))
    expect(motions.toPlay[0]!.junctions).toEqual(
      [4, 6, 9, 11, 14, 16, 19].map((x) => ({ tile: { x, y: 3 }, exit: "e" })),
    )
  })

  it("rides a handoff on to the reviewer from the annex behind it along the line: up the annex's riser, along the return belt and down into the reviewer's bay", () => {
    const before = withAnnex({ "t-1": { agent: "imp-4" } })
    const after = withAnnex({ "t-1": { agent: "rev-1" } }, before)

    const motions = motionsFor(after, restingTiles(before))

    expect(before.belts.some((belt) => belt.kind === "return")).toBe(false)
    expect(motions.unrouted).toEqual([])
    expect(motions.toPlay[0]!.path).toEqual(
      tiles([20, 3], [21, 3], [21, 2], [21, 1], [20, 1], [19, 1], [18, 1], [17, 1], [16, 1], [15, 1], [14, 1], [13, 1], [12, 1], [11, 1], [10, 1], [9, 1], [9, 2], [9, 3], [10, 3]),
    )
    expect(motions.toPlay[0]!.junctions).toEqual([
      { tile: { x: 21, y: 3 }, exit: "n" },
      { tile: { x: 21, y: 1 }, exit: "w" },
      { tile: { x: 19, y: 1 }, exit: "w" },
      { tile: { x: 16, y: 1 }, exit: "w" },
      { tile: { x: 14, y: 1 }, exit: "w" },
      { tile: { x: 11, y: 1 }, exit: "w" },
      { tile: { x: 9, y: 1 }, exit: "s" },
      { tile: { x: 9, y: 3 }, exit: "e" },
    ])
  })

  it("rides on along the trunk to a late role's bay at the end of the line, and back along the return belt, laid for it, to the role after it in the pipeline", () => {
    const first = layoutFloor(pipeline, snapshot({ "t-1": { agent: "rev-1" } }), undefined, wide)
    const atSecurity = withSecurity({ "t-1": { agent: "sec-1" } }, first)
    const atQa = withSecurity({ "t-1": { agent: "qa-1" } }, atSecurity)

    const forward = motionsFor(atSecurity, restingTiles(first))
    const back = motionsFor(atQa, restingTiles(atSecurity))

    expect(atSecurity.bays.map((bay) => bay.id)).toEqual(["bay:implementer", "bay:reviewer", "bay:qa", "bay:security"])
    expect(forward.toPlay[0]!.path).toEqual(trunkEastward(10, 20))
    expect(forward.toPlay[0]!.junctions).toEqual([11, 14, 16, 19].map((x) => ({ tile: { x, y: 3 }, exit: "e" })))
    expect(atSecurity.belts.some((belt) => belt.kind === "return")).toBe(false)
    expect(atQa.belts.some((belt) => belt.kind === "return")).toBe(true)
    expect(back.unrouted).toEqual([])
    expect(back.toPlay[0]!.path).toEqual(
      tiles([20, 3], [21, 3], [21, 2], [21, 1], [20, 1], [19, 1], [18, 1], [17, 1], [16, 1], [15, 1], [14, 1], [14, 2], [14, 3], [15, 3]),
    )
    expect(back.toPlay[0]!.junctions).toEqual([
      { tile: { x: 21, y: 3 }, exit: "n" },
      { tile: { x: 21, y: 1 }, exit: "w" },
      { tile: { x: 19, y: 1 }, exit: "w" },
      { tile: { x: 16, y: 1 }, exit: "w" },
      { tile: { x: 14, y: 1 }, exit: "s" },
      { tile: { x: 14, y: 3 }, exit: "e" },
    ])
  })
})
