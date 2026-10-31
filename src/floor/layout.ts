// The floor core: a pipeline and a snapshot in, a layout out (ADR 0002). Pure:
// no renderer, no time, no randomness. Everything sits on a tile grid along
// one trunk row, left to right: intake, one bay per role, staging, container.
// Inside a bay, lanes stack toward the camera, one station each (ADR 0003).

import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import type {
  Bay,
  Belt,
  BeltTile,
  BoxPlacement,
  Container,
  Intake,
  Layout,
  Rect,
  StagingArea,
  Station,
  Tile,
} from "./types"

/** The row the trunk runs along. Above it: the agents' backs, the return belt, the back wall. */
const TRUNK_ROW = 3
/** The back wall's row, where the door is. */
const WALL_ROW = 0
const INTAKE_W = 2
/** A bay's width: the feeder column, the benches, the collector column. */
const BAY_W = 3
/** Rows from one lane's bench to the next: the belts between, the agent, the bench. */
const LANE_H = 3
const STAGING_W = 3
const CONTAINER_W = 3
/** Belt tiles between one structure and the next. */
const GAP = 2

export function bayId(role: string): string {
  return `bay:${role}`
}

export function layoutFloor(pipeline: Pipeline, snapshot: Snapshot, previous?: Layout): Layout {
  const roles = roleOrder(pipeline, snapshot, previous)
  let x = 0

  const intake: Intake = {
    rect: footprint(x, INTAKE_W),
    pile: [
      { x: 1, y: TRUNK_ROW },
      { x: 0, y: TRUNK_ROW },
      { x: 1, y: TRUNK_ROW - 1 },
      { x: 0, y: TRUNK_ROW - 1 },
    ],
  }
  x += INTAKE_W + GAP

  const bays: Bay[] = roles.map((role) => {
    const bay = layBay(role, x, snapshot, previous?.bays.find((b) => b.role === role))
    x += BAY_W + GAP
    return bay
  })

  const staging: StagingArea = {
    rect: footprint(x, STAGING_W),
    bench: { x: x + 1, y: TRUNK_ROW },
    inspectorTile: { x: x + 1, y: TRUNK_ROW - 1 },
    // Waiting boxes stay inside the area: on the bench, then piled on the
    // shelf before it, from where the next one rolls onto the bench when it
    // frees. The shelf past the bench would only be reachable against the belt.
    pile: [
      { x: x + 1, y: TRUNK_ROW },
      { x, y: TRUNK_ROW - 1 },
    ],
  }
  x += STAGING_W + GAP

  const container: Container = {
    rect: footprint(x, CONTAINER_W),
    mouth: { x, y: TRUNK_ROW },
    stack: { x: x + 1, y: TRUNK_ROW },
  }
  x += CONTAINER_W

  const belts = [...trunkBelts(intake, bays, staging, container), ...bays.flatMap(bayBelts)]
  const { boxes, unplacedTaskIds } = placeBoxes(snapshot.tasks, { bays, intake, staging, container, belts })
  // One row of floor in front of the frontmost lane.
  const front = Math.max(TRUNK_ROW + 1, ...bays.map((bay) => bay.rect.y + bay.rect.h))

  return {
    bounds: { x: 0, y: 0, w: x, h: front + 1 },
    trunkRow: TRUNK_ROW,
    door: { x: intake.rect.x + intake.rect.w, y: WALL_ROW },
    intake,
    bays,
    staging,
    container,
    belts,
    boxes,
    unplaced: { taskIds: unplacedTaskIds },
  }
}

/** A structure's footprint on the first two rows of the floor: the agent row and the trunk row. */
function footprint(x: number, w: number): Rect {
  return { x, y: TRUNK_ROW - 1, w, h: 2 }
}

/**
 * Bays keep the order they were first laid out in, so laying out from a
 * previous layout reproduces it exactly and roles seen for the first time
 * append. Declared roles get a bay before any agent of theirs arrives.
 */
function roleOrder(pipeline: Pipeline, snapshot: Snapshot, previous?: Layout): string[] {
  const order: string[] = []
  const add = (role: string) => {
    if (!order.includes(role)) order.push(role)
  }
  for (const bay of previous?.bays ?? []) add(bay.role)
  for (const role of pipeline.roles) add(role)
  for (const agent of snapshot.agents) add(agent.role)
  return order
}

/**
 * A bay, lane by lane: the stations it had, each vacant when its agent is no
 * longer in the snapshot, then every agent of the role new to the bay at the
 * first vacant station or, failing one, on a new lane in front. A vacant
 * bench with a box still on it keeps the box until the host moves it, so a
 * newcomer passes it by. The back of the bay never moves.
 */
function layBay(role: string, x: number, snapshot: Snapshot, previous: Bay | undefined): Bay {
  const here = snapshot.agents.filter((agent) => agent.role === role)
  const stations: Station[] = (previous?.stations ?? []).map((station) => ({
    ...station,
    vacant: !here.some((agent) => agent.id === station.agentId),
  }))
  const holdsABox = (station: Station) =>
    snapshot.tasks.some((task) => typeof task.at === "object" && task.at.agent === station.agentId)
  for (const agent of here) {
    if (stations.some((station) => station.agentId === agent.id)) continue
    const vacantStation = stations.find((station) => station.vacant && !holdsABox(station))
    if (vacantStation) {
      vacantStation.agentId = agent.id
      vacantStation.vacant = false
    } else {
      stations.push(laneStation(role, x, stations.length, agent.id))
    }
  }
  const lanes = Math.max(stations.length, 1)
  return { role, rect: { x, y: TRUNK_ROW - 1, w: BAY_W, h: lanes * LANE_H - 1 }, stations }
}

/** A station on a lane of the bay at x: the bench in the bay's middle column, the agent behind it. */
function laneStation(role: string, x: number, lane: number, agentId: string): Station {
  const benchRow = TRUNK_ROW + lane * LANE_H
  return {
    id: `station:${role}:${lane}`,
    role,
    lane,
    agentId,
    vacant: false,
    bench: { x: x + 1, y: benchRow },
    agentTile: { x: x + 1, y: benchRow - 1 },
  }
}

/** A place a box stops on its way along the trunk. */
interface TrunkStop {
  id: string
  /** The last tile of the stop along the trunk; the belt out starts after it. */
  exit: number
  /** The first tile of the stop along the trunk; the belt in ends before it. */
  entry: number
}

/**
 * One belt between each pair of consecutive stops, from the tile after one
 * stop's exit to the tile before the next one's entry. A bay with stations
 * is entered at its feeder column and left at its collector column; a bay
 * with none yet is not a stop, and the trunk runs through it.
 */
function trunkBelts(intake: Intake, bays: Bay[], staging: StagingArea, container: Container): Belt[] {
  const stops: TrunkStop[] = [
    { id: "intake", exit: intake.rect.x + intake.rect.w - 1, entry: intake.rect.x },
    ...bays
      .filter((bay) => bay.stations.length > 0)
      .map((bay) => ({ id: bayId(bay.role), entry: bay.rect.x, exit: bay.rect.x + bay.rect.w - 1 })),
    { id: "staging", exit: staging.bench.x, entry: staging.bench.x },
    // The mouth is the belt's last tile, so the container's entry is past it.
    { id: "container", exit: container.mouth.x, entry: container.mouth.x + 1 },
  ]
  const belts: Belt[] = []
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!
    const to = stops[i]!
    const tiles: BeltTile[] = []
    for (let bx = from.exit + 1; bx < to.entry; bx++) tiles.push({ kind: "straight", x: bx, y: TRUNK_ROW, dir: "e" })
    belts.push({ id: `${from.id}>${to.id}`, kind: "trunk", from: from.id, to: to.id, tiles })
  }
  return belts
}

/**
 * A bay's own belts. The feeder runs down the back column from the split
 * junction on the trunk, with a junction at each lane's bench row that
 * sends boxes onto that lane's bench; the collector runs up the front
 * column, a junction at each bench row taking the lane's boxes in, out
 * through the merge junction onto the trunk. The split junction also takes
 * the return belt's drop from above and the merge junction also feeds its
 * riser, so the return belt connects without changing either (ADR 0002).
 */
function bayBelts(bay: Bay): Belt[] {
  if (bay.stations.length === 0) return []
  const benchRows = new Set(bay.stations.map((s) => s.bench.y))
  const front = Math.max(...benchRows)
  const back = bay.rect.x
  const fore = bay.rect.x + bay.rect.w - 1
  const feeder: BeltTile[] = []
  const collector: BeltTile[] = []
  for (let y = TRUNK_ROW; y <= front; y++) {
    feeder.push(
      y === TRUNK_ROW
        ? { kind: "junction", x: back, y, dir: "e", entries: ["e", "s"], exits: ["e", "s"] }
        : benchRows.has(y)
          ? { kind: "junction", x: back, y, dir: "s", entries: ["s"], exits: ["e", "s"] }
          : { kind: "straight", x: back, y, dir: "s" },
    )
    collector.unshift(
      y === TRUNK_ROW
        ? { kind: "junction", x: fore, y, dir: "e", entries: ["e", "n"], exits: ["e", "n"] }
        : benchRows.has(y)
          ? { kind: "junction", x: fore, y, dir: "n", entries: ["e", "n"], exits: ["n"] }
          : { kind: "straight", x: fore, y, dir: "n" },
    )
  }
  const id = bayId(bay.role)
  return [
    { id: `${id}:feeder`, kind: "feeder", from: id, to: id, tiles: feeder },
    { id: `${id}:collector`, kind: "collector", from: id, to: id, tiles: collector },
  ]
}

type Places = Pick<Layout, "intake" | "bays" | "staging" | "container" | "belts">

/**
 * One box per task, where its location says. Among tasks at one agent, array
 * order is queue order: the first sits on the bench, the rest wait back along
 * the belts into its lane, piling up at the farthest tile when the belts are
 * shorter than the queue.
 */
function placeBoxes(tasks: Task[], places: Places): { boxes: BoxPlacement[]; unplacedTaskIds: string[] } {
  const boxes: BoxPlacement[] = []
  const unplacedTaskIds: string[] = []
  const stations = places.bays.flatMap((bay) => bay.stations)
  const counts = new Map<string, number>()
  const nextIndexAt = (key: string): number => {
    const n = counts.get(key) ?? 0
    counts.set(key, n + 1)
    return n
  }
  const pileTile = (pile: Tile[], index: number): Tile => pile[Math.min(index, pile.length - 1)]!
  const queueTile = (station: Station, index: number): Tile => {
    if (index === 0) return station.bench
    const behind = queueBehind(station, places.belts)
    const tile = behind[Math.min(index - 1, behind.length - 1)] ?? station.bench
    return { x: tile.x, y: tile.y }
  }

  for (const task of tasks) {
    const at = task.at
    if (at === "intake") {
      const index = nextIndexAt("intake")
      boxes.push({ taskId: task.id, tile: pileTile(places.intake.pile, index), spot: { kind: "intake", index } })
    } else if (at === "staging") {
      const index = nextIndexAt("staging")
      boxes.push({ taskId: task.id, tile: pileTile(places.staging.pile, index), spot: { kind: "staging", index } })
    } else if (at === "shipped") {
      const index = nextIndexAt("shipped")
      boxes.push({ taskId: task.id, tile: places.container.stack, spot: { kind: "container", index } })
    } else {
      const station = stations.find((s) => s.agentId === at.agent)
      if (!station) {
        unplacedTaskIds.push(task.id)
        continue
      }
      const index = nextIndexAt(station.id)
      boxes.push({
        taskId: task.id,
        tile: queueTile(station, index),
        spot: index === 0 ? { kind: "bench", stationId: station.id } : { kind: "queue", stationId: station.id, index },
      })
    }
  }
  return { boxes, unplacedTaskIds }
}

/** The belt tiles behind a station's bench, nearest first: its stretch of the feeder up to the trunk, then the trunk into the bay. */
function queueBehind(station: Station, belts: Belt[]): Tile[] {
  const bay = bayId(station.role)
  const feeder = belts.find((b) => b.kind === "feeder" && b.from === bay)?.tiles ?? []
  const inbound = belts.find((b) => b.kind === "trunk" && b.to === bay)?.tiles ?? []
  return [...feeder.filter((t) => t.y <= station.bench.y).reverse(), ...inbound.slice().reverse()]
}

/** Every station, each with the agent at it, or none while it is vacant. */
export function stationed(layout: Layout, agents: Agent[]): { station: Station; agent: Agent | undefined }[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  return layout.bays.flatMap((bay) => bay.stations.map((station) => ({ station, agent: byId.get(station.agentId) })))
}
