import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot } from "~/model/types"
import { layoutFloor } from "./layout"
import type { Tile } from "./types"
import { comingsAndGoings, wayIn } from "./walk"

const pipeline: Pipeline = { roles: ["implementer", "reviewer", "qa"] }

function agent(id: string, role: string): Agent {
  return { id, name: id, role, status: "idle" }
}

const twoImplementers: Snapshot = {
  agents: [agent("imp-1", "implementer"), agent("imp-2", "implementer"), agent("rev-1", "reviewer")],
  tasks: [],
}

function tiles(...pairs: [number, number][]): Tile[] {
  return pairs.map(([x, y]) => ({ x, y }))
}

// The door is at (2, 0); the first bay's aisle is column 3 and the reviewer's column 8.

describe("the way in", () => {
  const layout = layoutFloor(pipeline, twoImplementers)
  const station = (id: string) => layout.bays.flatMap((b) => b.stations).find((s) => s.agentId === id)!

  it.each([
    { who: "the back lane's agent", id: "imp-1", path: tiles([2, 0], [3, 0], [3, 1], [3, 2], [4, 2], [5, 2]) },
    { who: "a second lane's agent", id: "imp-2", path: tiles([2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [4, 5], [5, 5]) },
    {
      who: "an agent of a later bay",
      id: "rev-1",
      path: tiles([2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [8, 1], [8, 2], [9, 2], [10, 2]),
    },
  ])("takes $who from the door along the back wall, down the aisle before its bay and in to its tile", ({ id, path }) => {
    expect(wayIn(layout, station(id))).toEqual(path)
  })

  // Twenty tiles wide, the qa bay is in the band below, facing west: its bench
  // at (14, 13), its aisle the column before it the way its band runs, x = 16.
  it("takes an agent of a bay in the band below down the door's column, along the floor before the band, down its aisle and in", () => {
    const wrapped = layoutFloor(pipeline, { ...twoImplementers, agents: [...twoImplementers.agents, agent("qa-1", "qa")] }, undefined, { width: 20 })
    const qa = wrapped.bays[2]!.stations[0]!

    expect(wayIn(wrapped, qa)).toEqual([
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => ({ x: 2, y })),
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((x) => ({ x, y: 10 })),
      ...tiles([16, 11], [16, 12], [15, 12], [14, 12]),
    ])
  })

  // Thirty-two tiles wide, a fourth implementer's annex stands after the qa
  // bay at x = 19: its aisle is column 18, its one agent tile (20, 2).
  it("takes an agent of an annex along the back wall past every bay, down the annex's aisle and in", () => {
    const fourImplementersAndQa = [...twoImplementers.agents, agent("imp-3", "implementer"), agent("imp-4", "implementer"), agent("qa-1", "qa")]
    const withAnnex = layoutFloor(pipeline, { ...twoImplementers, agents: fourImplementersAndQa }, undefined, { width: 32 })
    const annexed = withAnnex.bays[3]!.stations[0]!

    expect(annexed).toMatchObject({ bay: "bay:implementer:1", agentId: "imp-4" })
    expect(wayIn(withAnnex, annexed)).toEqual([
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((x) => ({ x, y: 0 })),
      ...tiles([18, 1], [18, 2], [19, 2], [20, 2]),
    ])
  })
})

describe("who comes and goes", () => {
  it("finds everyone at their station on the first layout: nobody walks in", () => {
    const first = layoutFloor(pipeline, twoImplementers)
    expect(comingsAndGoings(undefined, first)).toEqual({ arrivals: [], departures: [] })
  })

  it("walks in an agent new to the next layout, and nobody else", () => {
    const before = layoutFloor(pipeline, { ...twoImplementers, agents: twoImplementers.agents.filter((a) => a.id !== "imp-2") })
    const after = layoutFloor(pipeline, twoImplementers, before)

    const { arrivals, departures } = comingsAndGoings(before, after)

    expect(arrivals.map((a) => [a.agentId, a.station.id])).toEqual([["imp-2", "station:implementer:1"]])
    expect(arrivals[0]!.wayIn).toEqual(wayIn(after, arrivals[0]!.station))
    expect(departures).toEqual([])
  })

  it("fades an agent that has left, and walks in the one who takes its lane", () => {
    const full = layoutFloor(pipeline, twoImplementers)
    const oneGone = layoutFloor(pipeline, { ...twoImplementers, agents: twoImplementers.agents.filter((a) => a.id !== "imp-2") }, full)
    const replaced = layoutFloor(
      pipeline,
      { ...twoImplementers, agents: [...oneGone.bays[0]!.stations.filter((s) => !s.vacant).map((s) => agent(s.agentId, "implementer")), agent("imp-3", "implementer"), agent("rev-1", "reviewer")] },
      oneGone,
    )

    expect(comingsAndGoings(full, oneGone)).toEqual({ arrivals: [], departures: ["imp-2"] })
    const { arrivals, departures } = comingsAndGoings(oneGone, replaced)
    expect(arrivals.map((a) => [a.agentId, a.station.lane])).toEqual([["imp-3", 1]])
    expect(departures).toEqual([])
  })
})
