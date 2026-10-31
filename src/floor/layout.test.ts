import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { bayId, layoutFloor, stationed } from "./layout"
import { tileKey } from "./tiles"
import type { Belt, BeltTile, Layout } from "./types"

const pipeline: Pipeline = { roles: ["implementer", "reviewer", "qa"] }

function agent(id: string, role: string): Agent {
  return { id, name: id, role, status: "idle" }
}

function task(id: string, at: Task["at"]): Task {
  return { id, label: id, at }
}

const oneOfEach: Snapshot = {
  agents: [agent("imp-1", "implementer"), agent("rev-1", "reviewer"), agent("qa-1", "qa")],
  tasks: [],
}

function boxesByTask(layout: Layout) {
  return Object.fromEntries(layout.boxes.map((b) => [b.taskId, b]))
}

/** The belts that run between bays, which the additive rule says never move. */
function beltsBetweenBays(layout: Layout): Belt[] {
  return layout.belts.filter((b) => b.to !== "staging" && b.to !== "container")
}

/** Every belt tile by its key. */
function beltTiles(layout: Layout): Map<string, BeltTile> {
  return new Map(layout.belts.flatMap((b) => b.tiles).map((t) => [tileKey(t), t]))
}

describe("the first floor", () => {
  it("lays out the intake, one bay per declared role in order, the staging area and the container left to right", () => {
    const layout = layoutFloor(pipeline, oneOfEach)

    expect(layout.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa"])

    const left = [
      layout.intake.rect,
      ...layout.bays.map((b) => b.rect),
      layout.staging.rect,
      layout.container.rect,
    ]
    for (let i = 1; i < left.length; i++) {
      const before = left[i - 1]!
      const here = left[i]!
      expect(here.x).toBeGreaterThanOrEqual(before.x + before.w)
    }

    for (const bay of layout.bays) {
      expect(bay.stations).toHaveLength(1)
      const station = bay.stations[0]!
      expect(station.lane).toBe(0)
      expect(station.bench.y).toBe(layout.trunkRow)
      expect(station.agentTile).toEqual({ x: station.bench.x, y: layout.trunkRow - 1 })
    }
  })

  it("connects the intake, every bay, the staging area and the container with contiguous belts", () => {
    const layout = layoutFloor(pipeline, oneOfEach)
    const [imp, rev, qa] = layout.bays.map((b) => b.stations[0]!)
    const trunk = layout.belts.filter((b) => b.kind === "trunk")

    expect(trunk.map((b) => [b.from, b.to])).toEqual([
      ["intake", "bay:implementer"],
      ["bay:implementer", "bay:reviewer"],
      ["bay:reviewer", "bay:qa"],
      ["bay:qa", "staging"],
      ["staging", "container"],
    ])

    for (const belt of layout.belts) {
      expect(belt.tiles.length).toBeGreaterThan(0)
      for (let i = 1; i < belt.tiles.length; i++) {
        const a = belt.tiles[i - 1]!
        const b = belt.tiles[i]!
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
      }
      for (const tile of belt.tiles) {
        expect(["straight", "corner", "junction"]).toContain(tile.kind)
      }
    }

    // A bay is entered at the column before its bench and left at the one after.
    const first = (i: number) => trunk[i]!.tiles[0]!
    const last = (i: number) => trunk[i]!.tiles.at(-1)!
    expect(first(0)).toMatchObject({ x: layout.intake.rect.x + layout.intake.rect.w, y: layout.trunkRow })
    expect(last(0)).toMatchObject({ x: imp!.bench.x - 2, y: layout.trunkRow })
    expect(first(1)).toMatchObject({ x: imp!.bench.x + 2, y: layout.trunkRow })
    expect(last(1)).toMatchObject({ x: rev!.bench.x - 2, y: layout.trunkRow })
    expect(last(2)).toMatchObject({ x: qa!.bench.x - 2, y: layout.trunkRow })
    expect(last(3)).toMatchObject({ x: layout.staging.bench.x - 1, y: layout.trunkRow })
    expect(last(4)).toMatchObject(layout.container.mouth)
  })

  it("seats the one agent of each role at its bay's station", () => {
    const layout = layoutFloor(pipeline, oneOfEach)

    expect(layout.bays.map((b) => b.stations[0]!.agentId)).toEqual(["imp-1", "rev-1", "qa-1"])
    expect(layout.bays.map((b) => b.stations[0]!.vacant)).toEqual([false, false, false])
  })

  it("gives a declared role its bay before any agent arrives, with the trunk running through", () => {
    const layout = layoutFloor(pipeline, { agents: [agent("imp-1", "implementer"), agent("qa-1", "qa")], tasks: [] })

    expect(layout.bays.map((b) => [b.role, b.stations.length])).toEqual([
      ["implementer", 1],
      ["reviewer", 0],
      ["qa", 1],
    ])
    const through = layout.belts.find((b) => b.kind === "trunk" && b.from === bayId("implementer"))!
    expect(through.to).toBe(bayId("qa"))
    const reviewer = layout.bays[1]!.rect
    const inside = through.tiles.filter((t) => t.x >= reviewer.x && t.x < reviewer.x + reviewer.w)
    expect(inside).toHaveLength(reviewer.w)
  })

  it("places each box where its task's location says", () => {
    const layout = layoutFloor(pipeline, {
      ...oneOfEach,
      tasks: [
        task("t-new", "intake"),
        task("t-coding", { agent: "imp-1" }),
        task("t-review", "staging"),
        task("t-done", "shipped"),
      ],
    })
    const imp = layout.bays[0]!.stations[0]!
    const byTask = boxesByTask(layout)

    expect(byTask["t-new"]).toEqual({
      taskId: "t-new",
      tile: layout.intake.pile[0],
      spot: { kind: "intake", index: 0 },
    })
    expect(byTask["t-coding"]).toEqual({
      taskId: "t-coding",
      tile: imp.bench,
      spot: { kind: "bench", stationId: imp.id },
    })
    expect(byTask["t-review"]).toEqual({
      taskId: "t-review",
      tile: layout.staging.bench,
      spot: { kind: "staging", index: 0 },
    })
    expect(byTask["t-done"]).toEqual({
      taskId: "t-done",
      tile: layout.container.stack,
      spot: { kind: "container", index: 0 },
    })
    expect(layout.unplaced.taskIds).toEqual([])
  })

  it("queues extra tasks at one agent on the belt into its bay in array order, the first on the bench", () => {
    const layout = layoutFloor(pipeline, {
      ...oneOfEach,
      tasks: ["a", "b", "c", "d", "e"].map((id) => task(id, { agent: "imp-1" })),
    })
    const imp = layout.bays[0]!.stations[0]!
    const inbound = layout.belts.find((b) => b.kind === "trunk" && b.to === bayId("implementer"))!
    const byTask = boxesByTask(layout)

    expect(byTask["a"]!.spot).toEqual({ kind: "bench", stationId: imp.id })
    expect(byTask["b"]!.tile).toMatchObject({ x: imp.bench.x - 1, y: layout.trunkRow })
    expect(byTask["b"]!.spot).toEqual({ kind: "queue", stationId: imp.id, index: 1 })
    expect(byTask["c"]!.tile).toMatchObject({ x: imp.bench.x - 2, y: layout.trunkRow })

    // Behind the bay's split junction the trunk into the bay has two tiles; the queue piles up at its first.
    expect(inbound.tiles).toHaveLength(2)
    expect(byTask["d"]!.tile).toMatchObject({ x: inbound.tiles[0]!.x, y: layout.trunkRow })
    expect(byTask["e"]!.tile).toMatchObject({ x: inbound.tiles[0]!.x, y: layout.trunkRow })
    expect(byTask["e"]!.spot).toEqual({ kind: "queue", stationId: imp.id, index: 4 })
  })

  it("keeps every box awaiting review inside the staging area", () => {
    const layout = layoutFloor(pipeline, {
      ...oneOfEach,
      tasks: ["r1", "r2", "r3", "r4"].map((id) => task(id, "staging")),
    })
    const area = layout.staging.rect
    for (const box of layout.boxes) {
      expect(box.spot.kind).toBe("staging")
      expect(box.tile.x).toBeGreaterThanOrEqual(area.x)
      expect(box.tile.x).toBeLessThan(area.x + area.w)
      expect(box.tile.y).toBeGreaterThanOrEqual(area.y)
      expect(box.tile.y).toBeLessThan(area.y + area.h)
    }
    expect(boxesByTask(layout)["r1"]!.tile).toEqual(layout.staging.bench)
  })
})

describe("growing the floor", () => {
  it("reproduces a previous layout exactly when nothing changed", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    expect(layoutFloor(pipeline, oneOfEach, before)).toEqual(before)
  })

  it("appends a bay for a role that appears later; bays, stations and the belts between bays stay put, the ends slide right", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    const after = layoutFloor(
      { roles: [...pipeline.roles, "security"] },
      { ...oneOfEach, agents: [...oneOfEach.agents, agent("sec-1", "security")] },
      before,
    )

    expect(after.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa", "security"])
    expect(after.bays.slice(0, 3)).toEqual(before.bays)
    for (const belt of beltsBetweenBays(before)) {
      expect(after.belts.find((b) => b.id === belt.id)).toEqual(belt)
    }

    const newBay = after.bays[3]!
    const lastOld = before.bays[2]!
    expect(newBay.rect.x).toBeGreaterThanOrEqual(lastOld.rect.x + lastOld.rect.w)
    expect(newBay.rect.x + newBay.rect.w).toBeLessThanOrEqual(after.staging.rect.x)
    expect(newBay.stations[0]!.agentId).toBe("sec-1")

    const slide = after.staging.rect.x - before.staging.rect.x
    expect(slide).toBeGreaterThan(0)
    expect(after.container.rect.x - before.container.rect.x).toBe(slide)
    expect(after.bounds.w - before.bounds.w).toBe(slide)
  })

  it("keeps a late role at the end even when the pipeline now lists it mid-line", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    const after = layoutFloor(
      { roles: ["implementer", "reviewer", "security", "qa"] },
      { ...oneOfEach, agents: [...oneOfEach.agents, agent("sec-1", "security")] },
      before,
    )
    expect(after.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa", "security"])
    expect(after.bays.slice(0, 3)).toEqual(before.bays)
  })

  it("changes nothing already placed when another agent of an existing role arrives: every reserved tile stays as it was", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    const after = layoutFloor(pipeline, { ...oneOfEach, agents: [...oneOfEach.agents, agent("imp-2", "implementer")] }, before)

    const afterTiles = beltTiles(after)
    for (const [key, tile] of beltTiles(before)) expect(afterTiles.get(key)).toEqual(tile)
    for (const [i, bay] of before.bays.entries()) {
      expect(after.bays[i]!.rect).toMatchObject({ x: bay.rect.x, y: bay.rect.y, w: bay.rect.w })
      for (const [j, station] of bay.stations.entries()) expect(after.bays[i]!.stations[j]).toEqual(station)
    }
    expect(after.intake).toEqual(before.intake)
    expect(after.staging).toEqual(before.staging)
    expect(after.container).toEqual(before.container)
    expect(after.bounds.w).toBe(before.bounds.w)
  })

  it("gives an undeclared role a bay after the declared ones", () => {
    const layout = layoutFloor(pipeline, {
      ...oneOfEach,
      agents: [agent("ops-1", "ops"), ...oneOfEach.agents],
    })
    expect(layout.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa", "ops"])
    expect(layout.bays[3]!.stations[0]!.agentId).toBe("ops-1")
  })
})

describe("what the floor cannot place", () => {
  it("reports the tasks of anyone without a station", () => {
    const layout = layoutFloor(pipeline, {
      agents: oneOfEach.agents,
      tasks: [task("t-1", { agent: "imp-1" }), task("t-3", { agent: "ghost" })],
    })

    expect(layout.unplaced.taskIds).toEqual(["t-3"])
    expect(layout.boxes.map((b) => b.taskId)).toEqual(["t-1"])
  })
})

// Three implementers in the first bay, at x = 4 to 6: the split junction at
// (4, 3), the benches at x = 5 on rows 3, 6 and 9, the merge junction at (6, 3).

describe("lanes", () => {
  const threeImplementers: Snapshot = {
    agents: [agent("imp-1", "implementer"), agent("imp-2", "implementer"), agent("imp-3", "implementer"), agent("rev-1", "reviewer")],
    tasks: [],
  }

  it("lays out N agents of one role as N lanes stacking toward the camera, the first on the back lane", () => {
    const layout = layoutFloor(pipeline, threeImplementers)
    const bay = layout.bays[0]!

    expect(bay.stations.map((s) => [s.lane, s.agentId, s.bench, s.agentTile])).toEqual([
      [0, "imp-1", { x: 5, y: 3 }, { x: 5, y: 2 }],
      [1, "imp-2", { x: 5, y: 6 }, { x: 5, y: 5 }],
      [2, "imp-3", { x: 5, y: 9 }, { x: 5, y: 8 }],
    ])
    expect(bay.rect).toEqual({ x: 4, y: 2, w: 3, h: 8 })
    expect(layout.bounds.h).toBe(11)
  })

  it("splits the trunk into the lanes where it enters the bay and merges them back where it leaves", () => {
    const tiles = beltTiles(layoutFloor(pipeline, threeImplementers))
    const at = (x: number, y: number) => tiles.get(tileKey({ x, y }))

    // Both junctions are shaped for the return belt too: its drop down into the split, its riser up out of the merge.
    expect(at(4, 3)).toEqual({ kind: "junction", x: 4, y: 3, dir: "e", entries: ["e", "s"], exits: ["e", "s"] })
    expect(at(6, 3)).toEqual({ kind: "junction", x: 6, y: 3, dir: "e", entries: ["e", "n"], exits: ["e", "n"] })
    // Down the back of the bay, a junction at each further lane's bench row.
    expect(at(4, 4)).toEqual({ kind: "straight", x: 4, y: 4, dir: "s" })
    expect(at(4, 6)).toEqual({ kind: "junction", x: 4, y: 6, dir: "s", entries: ["s"], exits: ["e", "s"] })
    expect(at(4, 9)).toEqual({ kind: "junction", x: 4, y: 9, dir: "s", entries: ["s"], exits: ["e", "s"] })
    // Up the front of the bay, each lane joining.
    expect(at(6, 9)).toEqual({ kind: "junction", x: 6, y: 9, dir: "n", entries: ["e", "n"], exits: ["n"] })
    expect(at(6, 6)).toEqual({ kind: "junction", x: 6, y: 6, dir: "n", entries: ["e", "n"], exits: ["n"] })
    expect(at(6, 4)).toEqual({ kind: "straight", x: 6, y: 4, dir: "n" })
    expect(at(5, 6)).toBeUndefined()
  })

  it("queues a lane's extra tasks on its own stretch of the feeder, then on the trunk into the bay", () => {
    const layout = layoutFloor(pipeline, {
      ...threeImplementers,
      tasks: ["a", "b", "c", "d", "e", "f", "g"].map((id) => task(id, { agent: "imp-2" })),
    })
    const byTask = boxesByTask(layout)

    expect(byTask["a"]!.tile).toEqual({ x: 5, y: 6 })
    expect(["b", "c", "d", "e", "f", "g"].map((id) => byTask[id]!.tile)).toEqual([
      { x: 4, y: 6 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ])
  })

  it("leaves a removed agent's bench vacant, with its box still on it", () => {
    const before = layoutFloor(pipeline, threeImplementers)
    const after = layoutFloor(
      pipeline,
      {
        agents: threeImplementers.agents.filter((a) => a.id !== "imp-2"),
        tasks: [task("t-left", { agent: "imp-2" })],
      },
      before,
    )
    const bay = after.bays[0]!

    expect(bay.stations.map((s) => [s.lane, s.agentId, s.vacant])).toEqual([
      [0, "imp-1", false],
      [1, "imp-2", true],
      [2, "imp-3", false],
    ])
    expect(bay.rect).toEqual(before.bays[0]!.rect)
    expect(boxesByTask(after)["t-left"]).toEqual({
      taskId: "t-left",
      tile: { x: 5, y: 6 },
      spot: { kind: "bench", stationId: "station:implementer:1" },
    })
    expect(after.unplaced.taskIds).toEqual([])
  })

  it("gives a newcomer of the role the first vacant lane before building a new one", () => {
    const full = layoutFloor(pipeline, threeImplementers)
    const oneGone = layoutFloor(pipeline, { ...threeImplementers, agents: threeImplementers.agents.filter((a) => a.id !== "imp-2") }, full)
    const twoNew = layoutFloor(
      pipeline,
      { ...threeImplementers, agents: [...oneGone.bays[0]!.stations.filter((s) => !s.vacant).map((s) => agent(s.agentId, "implementer")), agent("imp-4", "implementer"), agent("imp-5", "implementer"), agent("rev-1", "reviewer")] },
      oneGone,
    )

    expect(twoNew.bays[0]!.stations.map((s) => [s.lane, s.agentId, s.vacant])).toEqual([
      [0, "imp-1", false],
      [1, "imp-4", false],
      [2, "imp-3", false],
      [3, "imp-5", false],
    ])
    expect(twoNew.bays[0]!.stations[3]!.bench).toEqual({ x: 5, y: 12 })
  })

  it("keeps a vacant bench for the box left on it: a newcomer gets a new lane until the host moves the box", () => {
    const full = layoutFloor(pipeline, threeImplementers)
    const without = threeImplementers.agents.filter((a) => a.id !== "imp-2")
    const oneGone = layoutFloor(pipeline, { agents: without, tasks: [task("t-left", { agent: "imp-2" })] }, full)
    const newcomer = layoutFloor(
      pipeline,
      { agents: [...without, agent("imp-4", "implementer")], tasks: [task("t-left", { agent: "imp-2" })] },
      oneGone,
    )

    expect(newcomer.bays[0]!.stations.map((s) => [s.lane, s.agentId, s.vacant])).toEqual([
      [0, "imp-1", false],
      [1, "imp-2", true],
      [2, "imp-3", false],
      [3, "imp-4", false],
    ])
    expect(boxesByTask(newcomer)["t-left"]!.tile).toEqual({ x: 5, y: 6 })

    const boxMoved = layoutFloor(
      pipeline,
      { agents: [...without, agent("imp-4", "implementer"), agent("imp-5", "implementer")], tasks: [task("t-left", { agent: "rev-1" })] },
      newcomer,
    )
    expect(boxMoved.bays[0]!.stations[1]).toMatchObject({ lane: 1, agentId: "imp-5", vacant: false })
  })

  it("keeps every tile a bay reserved when a lane is added to it", () => {
    const before = layoutFloor(pipeline, threeImplementers)
    const after = layoutFloor(pipeline, { ...threeImplementers, agents: [...threeImplementers.agents, agent("imp-4", "implementer")] }, before)

    const beforeTiles = beltTiles(before)
    const afterTiles = beltTiles(after)
    for (const [key, tile] of beforeTiles) expect(afterTiles.get(key)).toEqual(tile)
    expect(afterTiles.size).toBeGreaterThan(beforeTiles.size)
    expect(after.bays[0]!.stations.slice(0, 3)).toEqual(before.bays[0]!.stations)
    expect(after.bays.slice(1)).toEqual(before.bays.slice(1))
  })

  it("puts the door in the back wall, above the belt into the first bay", () => {
    const layout = layoutFloor(pipeline, oneOfEach)
    expect(layout.door).toEqual({ x: 2, y: 0 })
  })
})

describe("stationed", () => {
  const pipeline = { roles: ["implementer", "reviewer"] }
  const agents = [
    { id: "imp-1", name: "Ada", role: "implementer", status: "working" as const },
    { id: "rev-1", name: "Grace", role: "reviewer", status: "idle" as const },
  ]

  it("pairs every station with the agent at it", () => {
    const layout = layoutFloor(pipeline, { agents, tasks: [] })
    expect(stationed(layout, agents).map(({ station, agent }) => [station.role, agent?.id])).toEqual([
      ["implementer", "imp-1"],
      ["reviewer", "rev-1"],
    ])
  })

  it("pairs a station with no agent when the snapshot no longer has the one it seated", () => {
    const layout = layoutFloor(pipeline, { agents, tasks: [] })
    const without = agents.filter((agent) => agent.id !== "rev-1")
    expect(stationed(layout, without).map(({ agent }) => agent?.id)).toEqual(["imp-1", undefined])
  })

  it("has no station for a role with no agent yet", () => {
    const [ada] = agents
    const layout = layoutFloor(pipeline, { agents: [ada!], tasks: [] })
    expect(stationed(layout, [ada!]).map(({ station }) => station.role)).toEqual(["implementer"])
  })
})
