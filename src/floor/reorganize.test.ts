import { describe, expect, it } from "vitest"
import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { layoutFloor, reorganizedFloor } from "./layout"
import { motionsFor, tileAfterSlide } from "./motion"
import type { Layout } from "./types"

const pipeline: Pipeline = { roles: ["implementer", "reviewer", "qa"] }
/** The host's pipeline once security joined, listed before qa. */
const amended: Pipeline = { roles: ["implementer", "reviewer", "security", "qa"] }

function agent(id: string, role: string): Agent {
  return { id, name: id, role, status: "idle" }
}

function task(id: string, at: Task["at"]): Task {
  return { id, label: id, at }
}

const implementers = (ids: number[]) => ids.map((n) => agent(`imp-${n}`, "implementer"))
const others = [agent("rev-1", "reviewer"), agent("qa-1", "qa")]
const wide = { width: 40 }

/**
 * A floor grown while it ran, forty tiles wide: imp-4 in an annex after the
 * qa bay, security appended after that though the host lists it before qa,
 * and imp-2 having left, its lane vacant.
 */
function messyFloor(tasks: Task[] = []): { before: Layout; snapshot: Snapshot } {
  let layout = layoutFloor(pipeline, { agents: [...implementers([1]), ...others], tasks: [] }, undefined, wide)
  layout = layoutFloor(pipeline, { agents: [...implementers([1, 2, 3]), ...others], tasks: [] }, layout, wide)
  layout = layoutFloor(pipeline, { agents: [...implementers([1, 2, 3, 4]), ...others], tasks: [] }, layout, wide)
  layout = layoutFloor(amended, { agents: [...implementers([1, 2, 3, 4]), ...others, agent("sec-1", "security")], tasks: [] }, layout, wide)
  const snapshot: Snapshot = { agents: [...implementers([1, 3, 4]), ...others, agent("sec-1", "security")], tasks }
  layout = layoutFloor(amended, snapshot, layout, wide)
  return { before: layout, snapshot }
}

describe("reorganizing the floor", () => {
  it("grows a messy floor to reorganize: the annex and the late role after qa, a lane vacant", () => {
    const { before } = messyFloor()

    expect(before.bays.map((b) => [b.id, b.rect.x, b.stations.map((s) => s.vacant ? `${s.agentId}?` : s.agentId)])).toEqual([
      ["bay:implementer", 4, ["imp-1", "imp-2?", "imp-3"]],
      ["bay:reviewer", 9, ["rev-1"]],
      ["bay:qa", 14, ["qa-1"]],
      ["bay:implementer:1", 19, ["imp-4"]],
      ["bay:security", 24, ["sec-1"]],
    ])
  })

  it("lays the floor afresh in pipeline order, the annex's agent folded into the bay as the vacant lane closes, every station keeping its id", () => {
    const { before, snapshot } = messyFloor()

    const after = reorganizedFloor(amended, snapshot, before)

    expect(after.bays.map((b) => [b.id, b.rect.x, b.stations.map((s) => [s.id, s.lane, s.agentId, s.vacant])])).toEqual([
      ["bay:implementer", 4, [["station:implementer:0", 0, "imp-1", false], ["station:implementer:2", 1, "imp-3", false], ["station:implementer:3", 2, "imp-4", false]]],
      ["bay:reviewer", 9, [["station:reviewer:0", 0, "rev-1", false]]],
      ["bay:security", 14, [["station:security:0", 0, "sec-1", false]]],
      ["bay:qa", 19, [["station:qa:0", 0, "qa-1", false]]],
    ])
    expect(after.bays[0]!.stations[2]).toMatchObject({ bay: "bay:implementer", bench: { x: 5, y: 9 }, agentTile: { x: 5, y: 8 } })
    expect(after.staging!.rect.x).toBe(24)
    expect(after.container.rect.x).toBe(29)
    expect(after.bounds).toEqual({ x: 0, y: 0, w: 40, h: 11 })
    expect(after.belts.map((b) => b.id).filter((id) => id.includes(">"))).toEqual([
      "intake>bay:implementer",
      "bay:implementer>bay:reviewer",
      "bay:reviewer>bay:security",
      "bay:security>bay:qa",
      "bay:qa>staging",
      "staging>container",
    ])
  })

  it("keeps a vacant bench for the box left on it, in an annex beside the role's bay when the lanes run out", () => {
    const { before, snapshot } = messyFloor([task("t-1", { agent: "imp-2" }), task("t-2", { agent: "imp-4" })])

    const after = reorganizedFloor(amended, snapshot, before)

    expect(after.bays.map((b) => [b.id, b.rect.x, b.stations.map((s) => s.vacant ? `${s.agentId}?` : s.agentId)])).toEqual([
      ["bay:implementer", 4, ["imp-1", "imp-2?", "imp-3"]],
      ["bay:implementer:1", 9, ["imp-4"]],
      ["bay:reviewer", 14, ["rev-1"]],
      ["bay:security", 19, ["sec-1"]],
      ["bay:qa", 24, ["qa-1"]],
    ])
    expect(after.bays[1]!.stations[0]).toMatchObject({ id: "station:implementer:3", bay: "bay:implementer:1", lane: 0, bench: { x: 10, y: 3 } })
    expect(after.boxes).toEqual([
      { taskId: "t-1", tile: { x: 5, y: 6 }, spot: { kind: "bench", stationId: "station:implementer:1" } },
      { taskId: "t-2", tile: { x: 10, y: 3 }, spot: { kind: "bench", stationId: "station:implementer:3" } },
    ])
    expect(after.unplaced.taskIds).toEqual([])
  })

  it("keeps the width and the lanes a bay holds, wraps the line afresh within them, and keeps the return belt once laid", () => {
    const twoLanes = { width: 27, lanes: 2 }
    const crew = (ids: number[], tasks: Task[]): Snapshot => ({ agents: [...implementers(ids), ...others], tasks })
    const first = layoutFloor(pipeline, crew([1], [task("t-1", { agent: "rev-1" })]), undefined, twoLanes)
    const rework = layoutFloor(pipeline, crew([1], [task("t-1", { agent: "imp-1" })]), first, twoLanes)
    const grown = layoutFloor(pipeline, crew([1, 2, 3], [task("t-1", { agent: "imp-1" })]), rework, twoLanes)
    expect(grown.bays.map((b) => b.id)).toEqual(["bay:implementer", "bay:reviewer", "bay:qa", "bay:implementer:1"])

    const after = reorganizedFloor(pipeline, crew([1, 2, 3], [task("t-1", { agent: "imp-1" })]), grown)

    expect(after.bounds.w).toBe(27)
    expect(after.lanesPerBay).toBe(2)
    expect(after.bays.map((b) => [b.id, b.band, b.rect.x])).toEqual([
      ["bay:implementer", 0, 4],
      ["bay:implementer:1", 0, 9],
      ["bay:reviewer", 0, 14],
      ["bay:qa", 0, 19],
    ])
    expect(after.staging).toMatchObject({ band: 1 })
    expect(after.belts.filter((b) => b.kind === "return").map((b) => b.id)).toEqual(["return:1", "return:0"])
  })

  it("changes nothing on a floor laid afresh, and nothing when done again", () => {
    const snapshot: Snapshot = {
      agents: [...implementers([1, 2, 3, 4]), ...others],
      tasks: [task("t-1", { agent: "imp-4" }), task("t-2", "staging"), task("t-3", "shipped"), task("t-4", "intake")],
    }
    const fresh = layoutFloor(pipeline, snapshot)
    expect(fresh.bays.map((b) => b.id)).toEqual(["bay:implementer", "bay:implementer:1", "bay:reviewer", "bay:qa"])

    const once = reorganizedFloor(pipeline, snapshot, fresh)
    const twice = reorganizedFloor(pipeline, snapshot, once)

    expect(once).toEqual(fresh)
    expect(twice).toEqual(fresh)
  })

  it("keeps shipped boxes in the container, and lays no staging area when the host has it off", () => {
    const { before, snapshot } = messyFloor([task("t-9", "shipped")])
    const hostSays: Snapshot = { ...snapshot, tasks: [task("t-9", "intake")] }

    const after = reorganizedFloor(amended, hostSays, before, { staging: false })

    expect(after.staging).toBeUndefined()
    expect(after.boxes[0]).toMatchObject({ taskId: "t-9", spot: { kind: "container", index: 0 } })
  })
})

describe("where a box in transit is once the floor has slid", () => {
  // The return belt was laid when t-2 went back from qa to the reviewer.
  const { before: grown, snapshot } = messyFloor([task("t-1", { agent: "sec-1" }), task("t-2", { agent: "qa-1" })])
  const handedBack: Snapshot = { ...snapshot, tasks: [task("t-1", { agent: "sec-1" }), task("t-2", { agent: "rev-1" })] }
  const before = layoutFloor(amended, handedBack, grown, wide)
  const after = reorganizedFloor(amended, handedBack, before)

  it("is the same number of tiles along the same belt, where the belt now runs", () => {
    // Over the security bay's split junction, now at x = 14 rather than 24.
    expect(tileAfterSlide(before, after, { x: 24, y: 3 })).toEqual({ x: 14, y: 3 })
    // Three tiles along the first band's return belt from the staging riser, now at x = 26 rather than 31.
    expect(tileAfterSlide(before, after, { x: 28, y: 1 })).toEqual({ x: 23, y: 1 })
  })

  it("is on the trunk now leaving the same place when the one it rode led elsewhere", () => {
    // The first tile of the trunk from the qa bay to the annex; laid afresh, qa feeds the staging area.
    expect(tileAfterSlide(before, after, { x: 17, y: 3 })).toEqual({ x: 22, y: 3 })
  })

  it("is the belt's last tile when the belt is now shorter than that", () => {
    expect(tileAfterSlide(before, after, { x: 6, y: 1 })).toEqual({ x: 4, y: 1 })
  })

  it("is nowhere when no belt stands for the one it rode, or the tile was not on a belt", () => {
    // The annex's riser up to the return belt, the annex folded into the bay.
    expect(before.belts.find((b) => b.id === "bay:implementer:1>return")?.tiles).toEqual([{ kind: "straight", x: 21, y: 2, dir: "n" }])
    expect(tileAfterSlide(before, after, { x: 21, y: 2 })).toBeUndefined()
    expect(tileAfterSlide(before, after, { x: 5, y: 3 })).toBeUndefined()
  })

  it("rides on from there to where the floor now rests it", () => {
    const motions = motionsFor(after, { "t-1": tileAfterSlide(before, after, { x: 24, y: 3 })! })

    expect(motions.toPlay).toEqual([{ taskId: "t-1", path: [{ x: 14, y: 3 }, { x: 15, y: 3 }], junctions: [{ tile: { x: 14, y: 3 }, exit: "e" }] }])
  })
})
