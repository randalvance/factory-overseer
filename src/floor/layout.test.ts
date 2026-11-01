import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { carriesRework } from "./belts"
import { bayId, layoutFloor, stationed } from "./layout"
import { tileKey } from "./tiles"
import type { Belt, BeltTile, Layout, Rect } from "./types"

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

/** Everything placed before stays as it was, bar the two ends and the belts into and out of them (ADR 0002). */
function expectPlacedToStay(before: Layout, after: Layout) {
  expect(after.bays.slice(0, before.bays.length)).toEqual(before.bays)
  expect(after.intake).toEqual(before.intake)
  expect(after.door).toEqual(before.door)
  expect(after.bounds.w).toBe(before.bounds.w)
  for (const belt of beltsBetweenBays(before)) expect(after.belts.find((b) => b.id === belt.id)).toEqual(belt)
}

describe("the first floor", () => {
  it("lays out the intake, one bay per declared role in order, the staging area and the container left to right", () => {
    const layout = layoutFloor(pipeline, oneOfEach)

    expect(layout.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa"])

    const left = [
      layout.intake.rect,
      ...layout.bays.map((b) => b.rect),
      layout.staging!.rect,
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
      expect(station.bench.y).toBe(layout.bands[0]!.trunkRow)
      expect(station.agentTile).toEqual({ x: station.bench.x, y: layout.bands[0]!.trunkRow - 1 })
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
    expect(first(0)).toMatchObject({ x: layout.intake.rect.x + layout.intake.rect.w, y: layout.bands[0]!.trunkRow })
    expect(last(0)).toMatchObject({ x: imp!.bench.x - 2, y: layout.bands[0]!.trunkRow })
    expect(first(1)).toMatchObject({ x: imp!.bench.x + 2, y: layout.bands[0]!.trunkRow })
    expect(last(1)).toMatchObject({ x: rev!.bench.x - 2, y: layout.bands[0]!.trunkRow })
    expect(last(2)).toMatchObject({ x: qa!.bench.x - 2, y: layout.bands[0]!.trunkRow })
    expect(last(3)).toMatchObject({ x: layout.staging!.bench.x - 1, y: layout.bands[0]!.trunkRow })
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
      tile: layout.staging!.bench,
      spot: { kind: "staging", index: 0 },
    })
    expect(byTask["t-done"]).toEqual({
      taskId: "t-done",
      tile: layout.container.stacks[0],
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
    expect(byTask["b"]!.tile).toMatchObject({ x: imp.bench.x - 1, y: layout.bands[0]!.trunkRow })
    expect(byTask["b"]!.spot).toEqual({ kind: "queue", stationId: imp.id, index: 1 })
    expect(byTask["c"]!.tile).toMatchObject({ x: imp.bench.x - 2, y: layout.bands[0]!.trunkRow })

    // Behind the bay's split junction the trunk into the bay has two tiles; the queue piles up at its first.
    expect(inbound.tiles).toHaveLength(2)
    expect(byTask["d"]!.tile).toMatchObject({ x: inbound.tiles[0]!.x, y: layout.bands[0]!.trunkRow })
    expect(byTask["e"]!.tile).toMatchObject({ x: inbound.tiles[0]!.x, y: layout.bands[0]!.trunkRow })
    expect(byTask["e"]!.spot).toEqual({ kind: "queue", stationId: imp.id, index: 4 })
  })

  it("keeps every box awaiting review inside the staging area", () => {
    const layout = layoutFloor(pipeline, {
      ...oneOfEach,
      tasks: ["r1", "r2", "r3", "r4"].map((id) => task(id, "staging")),
    })
    const area = layout.staging!.rect
    for (const box of layout.boxes) {
      expect(box.spot.kind).toBe("staging")
      expect(box.tile.x).toBeGreaterThanOrEqual(area.x)
      expect(box.tile.x).toBeLessThan(area.x + area.w)
      expect(box.tile.y).toBeGreaterThanOrEqual(area.y)
      expect(box.tile.y).toBeLessThan(area.y + area.h)
    }
    expect(boxesByTask(layout)["r1"]!.tile).toEqual(layout.staging!.bench)
  })
})

describe("growing the floor", () => {
  it("reproduces a previous layout exactly when nothing changed", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    expect(layoutFloor(pipeline, oneOfEach, before)).toEqual(before)
  })

  it("appends a bay that fits in its band after the last bay, and moves the ends along the line past it", () => {
    const thirtyTwoWide = { width: 32 }
    const before = layoutFloor(pipeline, oneOfEach, undefined, thirtyTwoWide)
    const after = layoutFloor(
      { roles: [...pipeline.roles, "security"] },
      { ...oneOfEach, agents: [...oneOfEach.agents, agent("sec-1", "security")] },
      before,
      thirtyTwoWide,
    )

    expect(after.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa", "security"])
    expectPlacedToStay(before, after)
    expect(after.bays[3]).toMatchObject({ rect: { x: 19, y: 2, w: 3, h: 2 }, stations: [{ agentId: "sec-1" }] })
    expect(before.staging!.rect.x).toBe(19)
    expect(after.staging!.rect.x).toBe(24)
    expect(after.container.rect.x).toBe(29)
    expect(after.bands).toEqual(before.bands)
    expect(after.bounds).toEqual(before.bounds)
  })

  it("starts a new band for a bay that does not fit in the last bay's band, the ends after it, and leaves what came before as it was", () => {
    // Twenty-three wide with the staging area off, the container just fits after the qa bay; a bay there would not.
    const narrow = { width: 23, staging: false }
    const before = layoutFloor(pipeline, oneOfEach, undefined, narrow)
    const after = layoutFloor(
      { roles: [...pipeline.roles, "security"] },
      { ...oneOfEach, agents: [...oneOfEach.agents, agent("sec-1", "security")] },
      before,
      narrow,
    )

    expect(before.bands).toHaveLength(1)
    expect(before.container.rect).toEqual({ x: 19, y: 2, w: 3, h: 2 })
    expectPlacedToStay(before, after)
    expect(after.bands[1]).toEqual({ dir: "w", returnRow: 11, trunkRow: 13 })
    expect(after.bays[3]).toMatchObject({ rect: { x: 16, y: 12, w: 3, h: 2 }, stations: [{ bench: { x: 17, y: 13 } }] })
    expect(after.container).toMatchObject({ rect: { x: 11, y: 12, w: 3, h: 2 }, mouth: { x: 13, y: 13 } })
    expect(after.bounds).toEqual({ x: 0, y: 0, w: 23, h: 15 })
    const turn = after.belts.find((b) => b.id === "bay:qa>bay:security")!
    expect(turn.tiles[0]).toEqual({ kind: "straight", x: 17, y: 3, dir: "e" })
    expect(turn.tiles).toContainEqual({ kind: "corner", x: 22, y: 3, from: "e", to: "s" })
    expect(turn.tiles).toContainEqual({ kind: "corner", x: 22, y: 13, from: "s", to: "w" })
    expect(turn.tiles.at(-1)).toEqual({ kind: "straight", x: 19, y: 13, dir: "w" })
  })

  it("keeps a late role at the end even when the pipeline now lists it mid-line", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    const after = layoutFloor(
      { roles: ["implementer", "reviewer", "security", "qa"] },
      { ...oneOfEach, agents: [...oneOfEach.agents, agent("sec-1", "security")] },
      before,
    )
    expect(after.bays.map((b) => b.role)).toEqual(["implementer", "reviewer", "qa", "security"])
    expectPlacedToStay(before, after)
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

  it("gives a newcomer of the role the first vacant lane, and the next newcomer a lane in an annex once the bay is full", () => {
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
    ])
    expect(twoNew.bays[3]).toMatchObject({ id: "bay:implementer:1", stations: [{ lane: 0, agentId: "imp-5", bench: { x: 20, y: 3 } }] })
  })

  it("keeps a vacant bench for the box left on it: a newcomer passes it by until the host moves the box", () => {
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
    ])
    expect(newcomer.bays[3]).toMatchObject({ id: "bay:implementer:1", stations: [{ lane: 0, agentId: "imp-4" }] })
    expect(boxesByTask(newcomer)["t-left"]!.tile).toEqual({ x: 5, y: 6 })

    const boxMoved = layoutFloor(
      pipeline,
      { agents: [...without, agent("imp-4", "implementer"), agent("imp-5", "implementer")], tasks: [task("t-left", { agent: "rev-1" })] },
      newcomer,
    )
    expect(boxMoved.bays[0]!.stations[1]).toMatchObject({ lane: 1, agentId: "imp-5", vacant: false })
  })

  it("keeps every tile a bay reserved when a lane is added to it", () => {
    const twoImplementers = { ...threeImplementers, agents: threeImplementers.agents.filter((a) => a.id !== "imp-3") }
    const before = layoutFloor(pipeline, twoImplementers)
    const after = layoutFloor(pipeline, threeImplementers, before)

    const beforeTiles = beltTiles(before)
    const afterTiles = beltTiles(after)
    for (const [key, tile] of beforeTiles) expect(afterTiles.get(key)).toEqual(tile)
    expect(afterTiles.size).toBeGreaterThan(beforeTiles.size)
    expect(after.bays[0]!.stations.slice(0, 2)).toEqual(before.bays[0]!.stations)
    expect(after.bays[0]!.stations[2]).toMatchObject({ lane: 2, agentId: "imp-3", bench: { x: 5, y: 9 } })
    expect(after.bays.slice(1)).toEqual(before.bays.slice(1))
  })

  it("puts the door in the back wall, above the belt into the first bay", () => {
    const layout = layoutFloor(pipeline, oneOfEach)
    expect(layout.door).toEqual({ x: 2, y: 0 })
  })
})

// A bay holds three lanes. Thirty-two tiles wide, the line runs along one
// band: the implementer bay at x = 4, the reviewer's at 9, the qa's at 14,
// then an annex for the implementers at 19 and the ends past it.

describe("annexes", () => {
  const wide = { width: 32 }
  const implementers = (n: number) => Array.from({ length: n }, (_, i) => agent(`imp-${i + 1}`, "implementer"))
  const crew = (n: number): Snapshot => ({ agents: [...implementers(n), agent("rev-1", "reviewer"), agent("qa-1", "qa")], tasks: [] })
  const crewWithout = (n: number, id: string): Snapshot => ({ ...crew(n), agents: crew(n).agents.filter((a) => a.id !== id) })

  it("puts the fourth agent of a role in an annex at the end of the line, a further bay of the role before the ends", () => {
    const layout = layoutFloor(pipeline, crew(4), undefined, wide)

    expect(layout.bays.map((b) => [b.id, b.role, b.annex, b.rect.x, b.stations.length])).toEqual([
      ["bay:implementer", "implementer", 0, 4, 3],
      ["bay:reviewer", "reviewer", 0, 9, 1],
      ["bay:qa", "qa", 0, 14, 1],
      ["bay:implementer:1", "implementer", 1, 19, 1],
    ])
    expect(layout.bays[3]!.stations[0]).toEqual({
      id: "station:implementer:3",
      role: "implementer",
      bay: "bay:implementer:1",
      lane: 0,
      agentId: "imp-4",
      vacant: false,
      bench: { x: 20, y: 3 },
      agentTile: { x: 20, y: 2 },
    })
    expect(layout.bays[0]!.stations.map((s) => [s.id, s.bay])).toEqual([
      ["station:implementer:0", "bay:implementer"],
      ["station:implementer:1", "bay:implementer"],
      ["station:implementer:2", "bay:implementer"],
    ])
    expect(layout.staging!.rect.x).toBe(24)
    expect(layout.bounds).toEqual({ x: 0, y: 0, w: 32, h: 11 })
  })

  it("appends the annex when the fourth agent arrives, and nothing placed before it moves", () => {
    const before = layoutFloor(pipeline, crew(3), undefined, wide)
    const after = layoutFloor(pipeline, crew(4), before, wide)

    expectPlacedToStay(before, after)
    expect(after.bays[3]).toMatchObject({ id: "bay:implementer:1", rect: { x: 19, y: 2, w: 3, h: 2 } })
    const trunk = after.belts.filter((b) => b.kind === "trunk").map((b) => b.id)
    expect(trunk).toEqual(["intake>bay:implementer", "bay:implementer>bay:reviewer", "bay:reviewer>bay:qa", "bay:qa>bay:implementer:1", "bay:implementer:1>staging", "staging>container"])
    expect(after.belts.find((b) => b.id === "bay:implementer:1:feeder")!.tiles[0]).toEqual({ kind: "junction", x: 19, y: 3, dir: "e", entries: ["e", "s"], exits: ["e", "s"] })
  })

  it("fills a vacancy in the role's own bay before an annex, an annex's lanes before another annex", () => {
    const full = layoutFloor(pipeline, crew(4), undefined, wide)
    const oneGone = layoutFloor(pipeline, crewWithout(4, "imp-2"), full, wide)
    const replaced = layoutFloor(pipeline, crewWithout(5, "imp-2"), oneGone, wide)
    const seven = layoutFloor(pipeline, crewWithout(8, "imp-2"), replaced, wide)

    expect(replaced.bays[0]!.stations.map((s) => s.agentId)).toEqual(["imp-1", "imp-5", "imp-3"])
    expect(replaced.bays[3]!.stations.map((s) => s.agentId)).toEqual(["imp-4"])
    expect(seven.bays[3]!.stations.map((s) => [s.lane, s.agentId])).toEqual([
      [0, "imp-4"],
      [1, "imp-6"],
      [2, "imp-7"],
    ])
    expect(seven.bays[4]).toMatchObject({ id: "bay:implementer:2", annex: 2, rect: { x: 24, y: 2, w: 3, h: 2 }, stations: [{ id: "station:implementer:6", agentId: "imp-8" }] })
    // The third bay of the implementers leaves no room for the ends on the first band, so they wrap into the next.
    expect(seven.staging).toMatchObject({ band: 1, rect: { x: 25 } })
  })

  it("appends an annex for each role whose lanes are all taken in one snapshot, in the order their agents come", () => {
    const reviewers = (n: number) => Array.from({ length: n }, (_, i) => agent(`rev-${i + 1}`, "reviewer"))
    const crews = (imps: number, revs: number): Snapshot => ({ agents: [...implementers(imps), ...reviewers(revs), agent("qa-1", "qa")], tasks: [] })
    const before = layoutFloor(pipeline, crews(3, 3), undefined, { width: 40 })
    const after = layoutFloor(pipeline, crews(4, 4), before, { width: 40 })

    expectPlacedToStay(before, after)
    expect(after.bays.map((b) => [b.id, b.rect.x, b.stations.map((s) => s.agentId)])).toEqual([
      ["bay:implementer", 4, ["imp-1", "imp-2", "imp-3"]],
      ["bay:reviewer", 9, ["rev-1", "rev-2", "rev-3"]],
      ["bay:qa", 14, ["qa-1"]],
      ["bay:implementer:1", 19, ["imp-4"]],
      ["bay:reviewer:1", 24, ["rev-4"]],
    ])
  })

  it("extends the return belt to an annex appended after it was laid, its stretch over the bays so far unchanged", () => {
    const withTask = (n: number, at: Task["at"]): Snapshot => ({ ...crew(n), tasks: [task("t-1", at)] })
    const before = layoutFloor(pipeline, withTask(3, { agent: "rev-1" }), undefined, wide)
    const laid = layoutFloor(pipeline, withTask(3, { agent: "imp-1" }), before, wide)
    const appended = layoutFloor(pipeline, withTask(4, { agent: "imp-1" }), laid, wide)
    const run = appended.belts.find((b) => b.id === "return:0")!

    // The staging area's riser moved along with it; the annex has a riser and a drop of its own.
    expect(run.tiles[0]).toEqual({ kind: "corner", x: 26, y: 1, from: "n", to: "w" })
    expect(run.tiles.find((t) => t.x === 21)).toEqual({ kind: "junction", x: 21, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] })
    expect(run.tiles.find((t) => t.x === 19)).toEqual({ kind: "junction", x: 19, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] })
    const appendedTiles = beltTiles(appended)
    const overTheBays = laid.belts.filter((b) => b.kind === "return").flatMap((b) => b.tiles).filter((t) => t.x <= 16)
    for (const tile of overTheBays) expect(appendedTiles.get(tileKey(tile))).toEqual(tile)
  })

  // Twenty-two tiles wide with the staging area off, the container just fits
  // after the qa bay; an annex does not, and starts a band below.
  it("starts a new band for an annex that does not fit in the last bay's band, the container after it, and leaves what came before as it was", () => {
    const narrow = { width: 22, staging: false }
    const before = layoutFloor(pipeline, crew(3), undefined, narrow)
    const after = layoutFloor(pipeline, crew(4), before, narrow)

    expectPlacedToStay(before, after)
    expect(before.container).toMatchObject({ band: 0, rect: { x: 19 } })
    expect(after.bays[3]).toMatchObject({ id: "bay:implementer:1", band: 1, rect: { x: 15, y: 12, w: 3, h: 2 } })
    expect(after.container).toMatchObject({ band: 1, rect: { x: 10 } })
    expect(after.bounds).toEqual({ x: 0, y: 0, w: 22, h: 15 })
  })

  it("is as wide as the first line needs, annexes and all, when the host gives no width", () => {
    const layout = layoutFloor(pipeline, crew(4))

    expect(layout.bounds.w).toBe(32)
    expect(layout.bands).toHaveLength(1)
  })

  // Twenty tiles wide, the qa bay already starts a second band, which has room
  // for the annex after it but not for the ends: they go to a third.
  it("extends the floor's bounds to cover an annex in a band below, and the ends in the band after it", () => {
    const layout = layoutFloor(pipeline, crew(4), undefined, { width: 20 })
    const inside = (rect: Rect) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= layout.bounds.w && rect.y + rect.h <= layout.bounds.h

    expect(layout.bands).toEqual([
      { dir: "e", returnRow: 1, trunkRow: 3 },
      { dir: "w", returnRow: 11, trunkRow: 13 },
      { dir: "e", returnRow: 21, trunkRow: 23 },
    ])
    expect(layout.bays[3]).toMatchObject({ id: "bay:implementer:1", band: 1, rect: { x: 8, y: 12, w: 3, h: 2 } })
    expect(layout.staging).toMatchObject({ band: 2, rect: { x: 4 } })
    expect(layout.container).toMatchObject({ band: 2, rect: { x: 9 } })
    expect(layout.bounds).toEqual({ x: 0, y: 0, w: 20, h: 25 })
    expect([...layout.bays.map((bay) => bay.rect), layout.staging!.rect, layout.container.rect].every(inside)).toBe(true)
  })

  it("holds as many lanes as the host says, with the bands spaced for them, fixed when the first layout is laid", () => {
    const twoLanes = layoutFloor(pipeline, crew(3), undefined, { width: 20, lanes: 2 })
    const later = layoutFloor(pipeline, crew(3), twoLanes, { width: 20, lanes: 5 })

    expect(twoLanes.lanesPerBay).toBe(2)
    expect(twoLanes.bays.map((b) => [b.id, b.stations.length])).toEqual([
      ["bay:implementer", 2],
      ["bay:reviewer", 1],
      ["bay:qa", 1],
      ["bay:implementer:1", 1],
    ])
    expect(twoLanes.bands).toEqual([
      { dir: "e", returnRow: 1, trunkRow: 3 },
      { dir: "w", returnRow: 8, trunkRow: 10 },
      { dir: "e", returnRow: 15, trunkRow: 17 },
    ])
    expect(later.lanesPerBay).toBe(2)
    expect(later).toEqual(twoLanes)
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

// With one agent per role, the bays sit at x = 4, 9 and 14; the return belt
// runs along row 1 from the qa bay's riser at x = 16 to the implementer
// bay's drop at x = 4, a drop and a riser per bay on row 2.

describe("the return belt", () => {
  const atReviewer: Snapshot = { ...oneOfEach, tasks: [task("t-1", { agent: "rev-1" })] }
  const backAtImplementer: Snapshot = { ...oneOfEach, tasks: [task("t-1", { agent: "imp-1" })] }
  const returnBelts = (layout: Layout) => layout.belts.filter(carriesRework)

  it("is not laid until a task goes back", () => {
    const layout = layoutFloor(pipeline, atReviewer)
    expect(returnBelts(layout)).toEqual([])
  })

  it("is laid along the back wall the first time a task goes back, right to left from the staging area's riser past every bay to the first bay's drop", () => {
    const before = layoutFloor(pipeline, atReviewer)
    const after = layoutFloor(pipeline, backAtImplementer, before)
    const run = after.belts.find((b) => b.id === "return:0")!

    expect(run).toMatchObject({ kind: "return", from: "staging", to: bayId("implementer") })
    expect(run.tiles).toEqual([
      { kind: "corner", x: 21, y: 1, from: "n", to: "w" },
      { kind: "straight", x: 20, y: 1, dir: "w" },
      { kind: "straight", x: 19, y: 1, dir: "w" },
      { kind: "straight", x: 18, y: 1, dir: "w" },
      { kind: "straight", x: 17, y: 1, dir: "w" },
      { kind: "junction", x: 16, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 15, y: 1, dir: "w" },
      { kind: "junction", x: 14, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
      { kind: "straight", x: 13, y: 1, dir: "w" },
      { kind: "straight", x: 12, y: 1, dir: "w" },
      { kind: "junction", x: 11, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 10, y: 1, dir: "w" },
      { kind: "junction", x: 9, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
      { kind: "straight", x: 8, y: 1, dir: "w" },
      { kind: "straight", x: 7, y: 1, dir: "w" },
      { kind: "junction", x: 6, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 5, y: 1, dir: "w" },
      { kind: "junction", x: 4, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
    ])
    expect(returnBelts(after).map((b) => [b.id, b.kind, b.tiles])).toEqual([
      ["return:0", "return", run.tiles],
      ["staging>return", "riser", [{ kind: "straight", x: 21, y: 2, dir: "n" }]],
      [`${bayId("implementer")}>return`, "riser", [{ kind: "straight", x: 6, y: 2, dir: "n" }]],
      [`return>${bayId("implementer")}`, "drop", [{ kind: "straight", x: 4, y: 2, dir: "s" }]],
      [`${bayId("reviewer")}>return`, "riser", [{ kind: "straight", x: 11, y: 2, dir: "n" }]],
      [`return>${bayId("reviewer")}`, "drop", [{ kind: "straight", x: 9, y: 2, dir: "s" }]],
      [`${bayId("qa")}>return`, "riser", [{ kind: "straight", x: 16, y: 2, dir: "n" }]],
      [`return>${bayId("qa")}`, "drop", [{ kind: "straight", x: 14, y: 2, dir: "s" }]],
    ])
  })

  it("stays as it is once laid, whatever is added later", () => {
    const before = layoutFloor(pipeline, atReviewer)
    const laid = layoutFloor(pipeline, backAtImplementer, before)
    const later = layoutFloor(pipeline, { ...oneOfEach, agents: [...oneOfEach.agents, agent("imp-2", "implementer")] }, laid)

    expect(returnBelts(later)).toEqual(returnBelts(laid))
  })

  it("extends along the line to a bay appended after it was laid, its tiles so far unchanged", () => {
    const wide = { width: 32 }
    const before = layoutFloor(pipeline, atReviewer, undefined, wide)
    const laid = layoutFloor(pipeline, backAtImplementer, before, wide)
    const appended = layoutFloor(
      { roles: [...pipeline.roles, "security"] },
      { agents: [...oneOfEach.agents, agent("sec-1", "security")], tasks: backAtImplementer.tasks },
      laid,
      wide,
    )
    const run = appended.belts.find((b) => b.id === "return:0")!

    expect(run.tiles[0]).toEqual({ kind: "corner", x: 26, y: 1, from: "n", to: "w" })
    expect(run.tiles.find((t) => t.x === 21)).toEqual({ kind: "junction", x: 21, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] })
    // The ends of the line slide right to make room, the staging area's stretch of the return belt with them
    // (ADR 0002); the stretch over the bays laid so far does not.
    const appendedTiles = beltTiles(appended)
    const overTheBays = returnBelts(laid).flatMap((b) => b.tiles).filter((t) => t.x <= 16)
    for (const tile of overTheBays) expect(appendedTiles.get(tileKey(tile))).toEqual(tile)
  })

  it("is laid again from the ends' new band when they wrap on an append, the stretch over the bays laid so far unchanged", () => {
    // Twenty-seven wide, the first line just fits; a fourth bay fits after the qa bay, and the ends go on into a band below.
    const before = layoutFloor(pipeline, atReviewer)
    const laid = layoutFloor(pipeline, backAtImplementer, before)
    const appended = layoutFloor(
      { roles: [...pipeline.roles, "security"] },
      { agents: [...oneOfEach.agents, agent("sec-1", "security")], tasks: backAtImplementer.tasks },
      laid,
    )
    const belt = (id: string) => appended.belts.find((b) => b.id === id)!

    expect(appended.staging).toMatchObject({ band: 1, bench: { x: 21, y: 13 } })
    expect(belt("staging>return")).toMatchObject({ to: "return:1", tiles: [{ kind: "straight", x: 20, y: 12, dir: "n" }] })
    expect(belt("return:1").tiles).toEqual([
      { kind: "corner", x: 20, y: 11, from: "n", to: "e" },
      ...[21, 22, 23, 24].map((x) => ({ kind: "straight", x, y: 11, dir: "e" })),
      { kind: "corner", x: 25, y: 11, from: "e", to: "n" },
      ...[10, 9, 8, 7, 6, 5, 4].map((y) => ({ kind: "straight", x: 25, y, dir: "n" })),
    ])
    expect(belt("return:1>return:0").tiles).toEqual([{ kind: "straight", x: 25, y: 2, dir: "n" }])
    expect(belt("return:0")).toMatchObject({ from: "return:1", to: bayId("implementer") })
    expect(belt("return:0").tiles.slice(0, 7)).toEqual([
      { kind: "corner", x: 25, y: 1, from: "n", to: "w" },
      ...[24, 23, 22].map((x) => ({ kind: "straight", x, y: 1, dir: "w" })),
      { kind: "junction", x: 21, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 20, y: 1, dir: "w" },
      { kind: "junction", x: 19, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
    ])
    const appendedTiles = beltTiles(appended)
    const overTheBays = returnBelts(laid).flatMap((b) => b.tiles).filter((t) => t.x <= 16)
    for (const tile of overTheBays) expect(appendedTiles.get(tileKey(tile))).toEqual(tile)
  })

  it("is laid when a task goes from one lane to another of the same bay", () => {
    const twoLanes = [...oneOfEach.agents, agent("imp-2", "implementer")]
    const before = layoutFloor(pipeline, { agents: twoLanes, tasks: [task("t-1", { agent: "imp-2" })] })
    const after = layoutFloor(pipeline, { agents: twoLanes, tasks: [task("t-1", { agent: "imp-1" })] }, before)

    expect(returnBelts(after)).not.toEqual([])
  })

  it("is not laid for a queue that advances, a handoff forward, or a task put back at the intake", () => {
    const before = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("a", { agent: "imp-1" }), task("b", { agent: "imp-1" }), task("c", { agent: "rev-1" })] })
    const after = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("b", { agent: "imp-1" }), task("a", { agent: "rev-1" }), task("c", "intake")] }, before)

    expect(returnBelts(after)).toEqual([])
  })

  it("passes straight over a bay with no station", () => {
    const noReviewer = [agent("imp-1", "implementer"), agent("qa-1", "qa")]
    const before = layoutFloor(pipeline, { agents: noReviewer, tasks: [task("t-1", { agent: "qa-1" })] })
    const after = layoutFloor(pipeline, { agents: noReviewer, tasks: [task("t-1", { agent: "imp-1" })] }, before)
    const tiles = beltTiles(after)

    expect(tiles.get(tileKey({ x: 9, y: 1 }))).toEqual({ kind: "straight", x: 9, y: 1, dir: "w" })
    expect(tiles.get(tileKey({ x: 11, y: 1 }))).toEqual({ kind: "straight", x: 11, y: 1, dir: "w" })
    expect(tiles.has(tileKey({ x: 9, y: 2 }))).toBe(false)
  })

  it("leaves every previously reserved tile unchanged when it is added", () => {
    const before = layoutFloor(pipeline, { agents: [...oneOfEach.agents, agent("imp-2", "implementer")], tasks: [task("t-1", { agent: "rev-1" })] })
    const after = layoutFloor(pipeline, { agents: [...oneOfEach.agents, agent("imp-2", "implementer")], tasks: [task("t-1", { agent: "imp-2" })] }, before)

    const afterTiles = beltTiles(after)
    for (const [key, tile] of beltTiles(before)) expect(afterTiles.get(key)).toEqual(tile)
    expect(after.bays).toEqual(before.bays)
    expect(after.bounds).toEqual(before.bounds)
  })
})

describe("the ends of the line", () => {
  it("piles tasks at the intake in order, the overflow on the last pile tile, whether or not the first role has a station", () => {
    const nobody = layoutFloor(pipeline, { agents: [], tasks: ["a", "b", "c", "d", "e"].map((id) => task(id, "intake")) })
    const byTask = boxesByTask(nobody)

    expect(["a", "b", "c", "d", "e"].map((id) => byTask[id]!.tile)).toEqual([
      { x: 1, y: 3 },
      { x: 0, y: 3 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 2 },
    ])
    expect(nobody.bays[0]!.stations).toEqual([])
    expect(nobody.unplaced.taskIds).toEqual([])
  })

  it("fills the container behind its mouth a layer at a time, the trunk row first, then stacks up", () => {
    const layout = layoutFloor(pipeline, { ...oneOfEach, tasks: ["a", "b", "c", "d", "e"].map((id) => task(id, "shipped")) })

    expect(layout.container).toEqual({
      band: 0,
      rect: { x: 24, y: 2, w: 3, h: 2 },
      mouth: { x: 24, y: 3 },
      stacks: [
        { x: 25, y: 3 },
        { x: 26, y: 3 },
        { x: 25, y: 2 },
        { x: 26, y: 2 },
      ],
    })
    expect(layout.boxes.map((b) => [b.taskId, b.tile, b.spot])).toEqual([
      ["a", { x: 25, y: 3 }, { kind: "container", index: 0 }],
      ["b", { x: 26, y: 3 }, { kind: "container", index: 1 }],
      ["c", { x: 25, y: 2 }, { kind: "container", index: 2 }],
      ["d", { x: 26, y: 2 }, { kind: "container", index: 3 }],
      ["e", { x: 25, y: 3 }, { kind: "container", index: 4 }],
    ])
  })

  it("keeps a shipped task in the container whatever the host says of it later: shipped is terminal", () => {
    const shipped = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", "shipped")] })
    const backAtWork = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "imp-1" })] }, shipped)

    expect(boxesByTask(backAtWork)["t-1"]).toEqual({ taskId: "t-1", tile: { x: 25, y: 3 }, spot: { kind: "container", index: 0 } })
    expect(backAtWork.belts.some(carriesRework)).toBe(false)
  })

  it("lays the return belt from the staging area's riser when a task is rejected there", () => {
    const awaitingReview = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", "staging")] })
    const rejected = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "qa-1" })] }, awaitingReview)
    const tiles = beltTiles(rejected)

    // The belt out of the staging area starts with a junction: on to the container, or up to the return belt.
    expect(tiles.get(tileKey({ x: 21, y: 3 }))).toEqual({ kind: "junction", x: 21, y: 3, dir: "e", entries: ["e"], exits: ["e", "n"] })
    expect(rejected.belts.find((b) => b.id === "staging>return")).toEqual({
      id: "staging>return",
      kind: "riser",
      from: "staging",
      to: "return:0",
      tiles: [{ kind: "straight", x: 21, y: 2, dir: "n" }],
    })
    const run = rejected.belts.find((b) => b.id === "return:0")!
    expect(run.from).toBe("staging")
    expect(run.tiles.slice(0, 6)).toEqual([
      { kind: "corner", x: 21, y: 1, from: "n", to: "w" },
      { kind: "straight", x: 20, y: 1, dir: "w" },
      { kind: "straight", x: 19, y: 1, dir: "w" },
      { kind: "straight", x: 18, y: 1, dir: "w" },
      { kind: "straight", x: 17, y: 1, dir: "w" },
      { kind: "junction", x: 16, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
    ])
  })
})

describe("with the staging area switched off", () => {
  const noStaging = { staging: false }

  it("lays no staging area, and the last bay's trunk runs straight into the container", () => {
    const layout = layoutFloor(pipeline, oneOfEach, undefined, noStaging)
    const trunk = layout.belts.filter((b) => b.kind === "trunk")

    expect(layout.staging).toBeUndefined()
    expect(trunk.map((b) => b.id)).toEqual(["intake>bay:implementer", "bay:implementer>bay:reviewer", "bay:reviewer>bay:qa", "bay:qa>container"])
    expect(layout.container).toEqual({
      band: 0,
      rect: { x: 19, y: 2, w: 3, h: 2 },
      mouth: { x: 19, y: 3 },
      stacks: [
        { x: 20, y: 3 },
        { x: 21, y: 3 },
        { x: 20, y: 2 },
        { x: 21, y: 2 },
      ],
    })
    expect(trunk[3]!.tiles.map((t) => t.x)).toEqual([17, 18, 19])
    expect(layout.bounds.w).toBe(22)
  })

  it("has no place for a task the host still reports at staging", () => {
    const layout = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", "staging"), task("t-2", "shipped")] }, undefined, noStaging)

    expect(layout.unplaced.taskIds).toEqual(["t-1"])
    expect(boxesByTask(layout)["t-2"]!.spot).toEqual({ kind: "container", index: 0 })
  })

  it("starts the return belt at the last bay's riser", () => {
    const before = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "qa-1" })] }, undefined, noStaging)
    const after = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "imp-1" })] }, before, noStaging)
    const run = after.belts.find((b) => b.id === "return:0")!

    expect(run.from).toBe(bayId("qa"))
    expect(run.tiles[0]).toEqual({ kind: "junction", x: 16, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] })
    expect(after.belts.find((b) => b.id === "staging>return")).toBeUndefined()
  })
})

// Twenty tiles wide, the intake, the implementer bay and the reviewer bay fill
// the first band; the trunk turns at the east edge, down column 19 with the
// return belt's way up beside it in column 18, and the qa bay, the staging
// area and the container run back westward along a second band below, whose
// return belt is on row 11 and trunk on row 13.

describe("the floor's width", () => {
  const twentyWide = { width: 20 }

  it("lays the first line in bands within the host's width when it does not fit in one, each band running the other way", () => {
    const layout = layoutFloor(pipeline, oneOfEach, undefined, twentyWide)

    expect(layout.bounds).toEqual({ x: 0, y: 0, w: 20, h: 15 })
    expect(layout.bands).toEqual([
      { dir: "e", returnRow: 1, trunkRow: 3 },
      { dir: "w", returnRow: 11, trunkRow: 13 },
    ])
    expect(layout.bays.map((b) => [b.role, b.band, b.rect])).toEqual([
      ["implementer", 0, { x: 4, y: 2, w: 3, h: 2 }],
      ["reviewer", 0, { x: 9, y: 2, w: 3, h: 2 }],
      ["qa", 1, { x: 13, y: 12, w: 3, h: 2 }],
    ])
    expect(layout.bays[2]!.stations[0]).toMatchObject({ bench: { x: 14, y: 13 }, agentTile: { x: 14, y: 12 } })
    expect(layout.staging).toEqual({
      band: 1,
      rect: { x: 8, y: 12, w: 3, h: 2 },
      bench: { x: 9, y: 13 },
      inspectorTile: { x: 9, y: 12 },
      pile: [
        { x: 9, y: 13 },
        { x: 10, y: 12 },
      ],
    })
    expect(layout.container).toEqual({
      band: 1,
      rect: { x: 3, y: 12, w: 3, h: 2 },
      mouth: { x: 5, y: 13 },
      stacks: [
        { x: 4, y: 13 },
        { x: 3, y: 13 },
        { x: 4, y: 12 },
        { x: 3, y: 12 },
      ],
    })
  })

  it("turns the trunk at the edge and brings it down into the next band, where the bays face the other way", () => {
    const layout = layoutFloor(pipeline, oneOfEach, undefined, twentyWide)
    const tiles = beltTiles(layout)
    const at = (x: number, y: number) => tiles.get(tileKey({ x, y }))
    const turn = layout.belts.find((b) => b.id === "bay:reviewer>bay:qa")!

    expect(turn.tiles).toEqual([
      ...[12, 13, 14, 15, 16, 17].map((x) => ({ kind: "straight", x, y: 3, dir: "e" })),
      // Where the band below's return belt will cross on its way up, shaped for it now.
      { kind: "junction", x: 18, y: 3, dir: "e", entries: ["e", "n"], exits: ["e", "n"] },
      { kind: "corner", x: 19, y: 3, from: "e", to: "s" },
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((y) => ({ kind: "straight", x: 19, y, dir: "s" })),
      { kind: "corner", x: 19, y: 13, from: "s", to: "w" },
      ...[18, 17, 16].map((x) => ({ kind: "straight", x, y: 13, dir: "w" })),
    ])
    // The qa bay is entered from the east and left to the west.
    expect(at(15, 13)).toEqual({ kind: "junction", x: 15, y: 13, dir: "w", entries: ["w", "s"], exits: ["w", "s"] })
    expect(at(13, 13)).toEqual({ kind: "junction", x: 13, y: 13, dir: "w", entries: ["w", "n"], exits: ["w", "n"] })
    expect(layout.belts.find((b) => b.id === "bay:qa>staging")!.tiles.map((t) => t.x)).toEqual([12, 11, 10])
    expect(layout.belts.find((b) => b.id === "staging>container")!.tiles).toEqual([
      { kind: "junction", x: 8, y: 13, dir: "w", entries: ["w"], exits: ["w", "n"] },
      { kind: "straight", x: 7, y: 13, dir: "w" },
      { kind: "straight", x: 6, y: 13, dir: "w" },
      { kind: "straight", x: 5, y: 13, dir: "w" },
    ])
  })

  it("is as wide as the first line when the host gives no width, and never narrower than a band holding a turn and the two ends", () => {
    expect(layoutFloor(pipeline, oneOfEach).bounds.w).toBe(27)
    expect(layoutFloor(pipeline, oneOfEach, undefined, { width: 5 }).bounds.w).toBe(12)
  })

  it("keeps the width the first layout was laid at, whatever the host says later", () => {
    const first = layoutFloor(pipeline, oneOfEach, undefined, twentyWide)
    expect(layoutFloor(pipeline, oneOfEach, first, { width: 40 }).bounds.w).toBe(20)
  })

  it("lays the return belt from the staging area back along its band, up the turn beside the trunk's way down, and on along the band above", () => {
    const atQa = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "qa-1" })] }, undefined, twentyWide)
    const backAtImp = layoutFloor(pipeline, { ...oneOfEach, tasks: [task("t-1", { agent: "imp-1" })] }, atQa, twentyWide)
    const belt = (id: string) => backAtImp.belts.find((b) => b.id === id)!

    expect(belt("return:1")).toMatchObject({ kind: "return", from: "staging", to: "return:0" })
    expect(belt("return:1").tiles).toEqual([
      { kind: "corner", x: 8, y: 11, from: "n", to: "e" },
      ...[9, 10, 11, 12].map((x) => ({ kind: "straight", x, y: 11, dir: "e" })),
      { kind: "junction", x: 13, y: 11, dir: "e", entries: ["e", "n"], exits: ["e"] },
      { kind: "straight", x: 14, y: 11, dir: "e" },
      { kind: "junction", x: 15, y: 11, dir: "e", entries: ["e"], exits: ["e", "s"] },
      ...[16, 17].map((x) => ({ kind: "straight", x, y: 11, dir: "e" })),
      { kind: "corner", x: 18, y: 11, from: "e", to: "n" },
      ...[10, 9, 8, 7, 6, 5, 4].map((y) => ({ kind: "straight", x: 18, y, dir: "n" })),
    ])
    // Over the crossing on the trunk, one tile of riser joins the band above's belt.
    expect(belt("return:1>return:0")).toEqual({
      id: "return:1>return:0",
      kind: "riser",
      from: "return:1",
      to: "return:0",
      tiles: [{ kind: "straight", x: 18, y: 2, dir: "n" }],
    })
    expect(belt("return:0")).toMatchObject({ kind: "return", from: "return:1", to: bayId("implementer") })
    expect(belt("return:0").tiles).toEqual([
      { kind: "corner", x: 18, y: 1, from: "n", to: "w" },
      ...[17, 16, 15, 14, 13, 12].map((x) => ({ kind: "straight", x, y: 1, dir: "w" })),
      { kind: "junction", x: 11, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 10, y: 1, dir: "w" },
      { kind: "junction", x: 9, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
      ...[8, 7].map((x) => ({ kind: "straight", x, y: 1, dir: "w" })),
      { kind: "junction", x: 6, y: 1, dir: "w", entries: ["w", "n"], exits: ["w"] },
      { kind: "straight", x: 5, y: 1, dir: "w" },
      { kind: "junction", x: 4, y: 1, dir: "w", entries: ["w"], exits: ["w", "s"] },
    ])
    expect(belt("staging>return")).toMatchObject({ to: "return:1", tiles: [{ kind: "straight", x: 8, y: 12, dir: "n" }] })
    expect(belt(`${bayId("qa")}>return`).tiles).toEqual([{ kind: "straight", x: 13, y: 12, dir: "n" }])
    expect(belt(`return>${bayId("qa")}`).tiles).toEqual([{ kind: "straight", x: 15, y: 12, dir: "s" }])
  })
})
