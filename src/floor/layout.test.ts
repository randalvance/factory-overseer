import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { bayId, layoutFloor } from "./layout"
import type { Belt, Layout } from "./types"

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

    expect(layout.belts.map((b) => [b.from, b.to])).toEqual([
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

    const first = (i: number) => layout.belts[i]!.tiles[0]!
    const last = (i: number) => layout.belts[i]!.tiles.at(-1)!
    expect(first(0)).toMatchObject({ x: layout.intake.rect.x + layout.intake.rect.w, y: layout.trunkRow })
    expect(last(0)).toMatchObject({ x: imp!.bench.x - 1, y: layout.trunkRow })
    expect(first(1)).toMatchObject({ x: imp!.bench.x + 1, y: layout.trunkRow })
    expect(last(1)).toMatchObject({ x: rev!.bench.x - 1, y: layout.trunkRow })
    expect(last(2)).toMatchObject({ x: qa!.bench.x - 1, y: layout.trunkRow })
    expect(last(3)).toMatchObject({ x: layout.staging.bench.x - 1, y: layout.trunkRow })
    expect(last(4)).toMatchObject(layout.container.mouth)
  })

  it("seats the one agent of each role at its bay's station", () => {
    const layout = layoutFloor(pipeline, oneOfEach)

    expect(layout.bays.map((b) => b.stations[0]!.agentId)).toEqual(["imp-1", "rev-1", "qa-1"])
    expect(layout.unplaced.agentIds).toEqual([])
  })

  it("gives a declared role its bay before any agent arrives, with the trunk running through", () => {
    const layout = layoutFloor(pipeline, { agents: [agent("imp-1", "implementer"), agent("qa-1", "qa")], tasks: [] })

    expect(layout.bays.map((b) => [b.role, b.stations.length])).toEqual([
      ["implementer", 1],
      ["reviewer", 0],
      ["qa", 1],
    ])
    const through = layout.belts.find((b) => b.from === bayId("implementer"))!
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
    const inbound = layout.belts.find((b) => b.to === bayId("implementer"))!
    const byTask = boxesByTask(layout)

    expect(byTask["a"]!.spot).toEqual({ kind: "bench", stationId: imp.id })
    expect(byTask["b"]!.tile).toMatchObject({ x: imp.bench.x - 1, y: layout.trunkRow })
    expect(byTask["b"]!.spot).toEqual({ kind: "queue", stationId: imp.id, index: 1 })
    expect(byTask["c"]!.tile).toMatchObject({ x: imp.bench.x - 2, y: layout.trunkRow })

    // The inbound belt has three tiles; the queue piles up at its first tile past that.
    expect(inbound.tiles).toHaveLength(3)
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

  it("changes nothing already placed when another agent of an existing role arrives", () => {
    const before = layoutFloor(pipeline, oneOfEach)
    const after = layoutFloor(pipeline, { ...oneOfEach, agents: [...oneOfEach.agents, agent("imp-2", "implementer")] }, before)

    expect(after.bays).toEqual(before.bays)
    expect(after.belts).toEqual(before.belts)
    expect(after.staging).toEqual(before.staging)
    expect(after.container).toEqual(before.container)
    expect(after.unplaced.agentIds).toEqual(["imp-2"])
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

describe("what the first floor cannot place", () => {
  it("reports a second agent of a role, and the tasks of anyone without a station", () => {
    const layout = layoutFloor(pipeline, {
      agents: [...oneOfEach.agents, agent("imp-2", "implementer")],
      tasks: [task("t-1", { agent: "imp-1" }), task("t-2", { agent: "imp-2" }), task("t-3", { agent: "ghost" })],
    })

    expect(layout.bays[0]!.stations[0]!.agentId).toBe("imp-1")
    expect(layout.unplaced.agentIds).toEqual(["imp-2"])
    expect(layout.unplaced.taskIds).toEqual(["t-2", "t-3"])
    expect(layout.boxes.map((b) => b.taskId)).toEqual(["t-1"])
  })
})
