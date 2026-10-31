// The floor core: a pipeline and a snapshot in, a layout out (ADR 0002). Pure:
// no renderer, no time, no randomness. Everything sits on a tile grid along
// the line: intake, one bay per role, staging, container. The line runs along
// a band across the floor until the next structure would not fit in the
// floor's width; then the trunk turns at the edge and the line goes on in a
// band below, running the other way (ADR 0006). Inside a bay, lanes stack
// toward the camera, one station each; rework rides a return belt along the
// back of each band and up the turns, laid the first time it is needed (ADR
// 0003).

import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { opposite } from "./tiles"
import type {
  Band,
  Bay,
  Belt,
  BeltTile,
  BoxPlacement,
  BoxSpot,
  Container,
  Intake,
  Layout,
  Rect,
  StagingArea,
  Station,
  Tile,
} from "./types"

/** The back wall's row, where the door is. */
const WALL_ROW = 0
/** The first band's return belt runs just inside the back wall. */
const FIRST_RETURN_ROW = WALL_ROW + 1
/** Rows from a band's return belt down to its trunk: past the agent row. */
const TRUNK_BELOW_RETURN = 2
const INTAKE_W = 2
/** A bay's width: the feeder column, the benches, the collector column. */
const BAY_W = 3
/** Rows from one lane's bench to the next: the belts between, the agent, the bench. */
const LANE_H = 3
/** The lanes a band leaves room for in each of its bays: the fixed number ADR 0007 gives a bay. The cap itself is not kept yet, so a lane past them runs into the band below. */
const LANES_PER_BAY = 3
/** Rows from one band's return belt to the next band's: the belts, the lanes, and one row of floor in front. */
const BAND_H = TRUNK_BELOW_RETURN + 1 + (LANES_PER_BAY - 1) * LANE_H + 1
const STAGING_W = 3
const CONTAINER_W = 3
/** Belt tiles between one structure and the next. */
const GAP = 2
/** A turn's columns at the edge: the trunk's way down on the outside, the return belt's way up beside it, one each. */
const TURN_W = 2
/** The narrowest floor the line can always be laid in: a band must take a turn and both ends after it. */
const MIN_WIDTH = TURN_W + GAP + STAGING_W + GAP + CONTAINER_W

export function bayId(role: string): string {
  return `bay:${role}`
}

export interface FloorOptions {
  /** Whether boxes pass an inspector before they ship. On unless switched off. */
  staging?: boolean
  /**
   * The floor's width in tiles, fixed when the first layout is laid; once laid,
   * the layout before keeps it. As wide as the first line needs when not given,
   * and never narrower than the line can be laid in.
   */
  width?: number
}

export function layoutFloor(pipeline: Pipeline, snapshot: Snapshot, previous?: Layout, options: FloorOptions = {}): Layout {
  const roles = roleOrder(pipeline, snapshot, previous)
  const withStaging = options.staging ?? true
  const width = previous?.bounds.w ?? Math.max(MIN_WIDTH, options.width ?? lineWidth(roles.length, withStaging))
  const bands: Band[] = [bandAt(0)]
  /** The line turns down into a new band, whose first free column is past the turn and a gap. */
  const turnDown = (): LineHead => {
    const band = bandAt(bands.length)
    bands.push(band)
    return { band: bands.length - 1, column: ahead(firstColumn(band, width), band, TURN_W + GAP) }
  }
  const room = (head: LineHead) => Math.abs(lastColumn(bands[head.band]!, width) - head.column) + 1
  const startOf = (head: LineHead, w: number) => Math.min(head.column, ahead(head.column, bands[head.band]!, w - 1))
  const advance = (head: LineHead, tiles: number): LineHead => ({ band: head.band, column: ahead(head.column, bands[head.band]!, tiles) })

  const intake: Intake = {
    rect: footprint(0, INTAKE_W, bands[0]!),
    pile: [
      { x: 1, y: bands[0]!.trunkRow },
      { x: 0, y: bands[0]!.trunkRow },
      { x: 1, y: bands[0]!.trunkRow - 1 },
      { x: 0, y: bands[0]!.trunkRow - 1 },
    ],
  }
  let head: LineHead = { band: 0, column: INTAKE_W + GAP }

  const bays: Bay[] = roles.map((role) => {
    if (room(head) < BAY_W + GAP + TURN_W) head = turnDown()
    const bay = layBay(role, startOf(head, BAY_W), head.band, bands[head.band]!, snapshot, previous?.bays.find((b) => b.role === role))
    head = advance(head, BAY_W + GAP)
    return bay
  })

  // The two ends go together: the staging area and the container, or the container alone.
  if (room(head) < (withStaging ? STAGING_W + GAP : 0) + CONTAINER_W) head = turnDown()
  let staging: StagingArea | undefined
  if (withStaging) {
    staging = layStaging(startOf(head, STAGING_W), head.band, bands[head.band]!)
    head = advance(head, STAGING_W + GAP)
  }
  const container = layContainer(startOf(head, CONTAINER_W), head.band, bands[head.band]!)

  const belts = [...trunkBelts(intake, bays, staging, container, bands, width), ...bays.flatMap((bay) => bayBelts(bay, bands[bay.band]!))]
  const { boxes, unplacedTaskIds } = placeBoxes(snapshot.tasks, { bays, intake, staging, container, belts }, previous)
  // Once laid, the return belt stays; it is laid the first time a box is rework.
  const hadReturnBelt = previous?.belts.some((belt) => belt.kind === "return") ?? false
  if (hadReturnBelt || boxes.some((box) => isRework(box, bays, previous))) belts.push(...returnBelts(bays, staging, bands, width))
  // One row of floor in front of the frontmost lane, or of the last band's trunk.
  const front = Math.max(bands.at(-1)!.trunkRow + 1, ...bays.map((bay) => bay.rect.y + bay.rect.h))

  return {
    bounds: { x: 0, y: 0, w: width, h: front + 1 },
    bands,
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

/** The width the line takes laid along one band: the intake, a bay per role, the ends. */
function lineWidth(roleCount: number, withStaging: boolean): number {
  return INTAKE_W + GAP + roleCount * (BAY_W + GAP) + (withStaging ? STAGING_W + GAP : 0) + CONTAINER_W
}

/** The band at a depth from the back wall: east along the first, the other way in each below, one band's rows apart. */
function bandAt(index: number): Band {
  const returnRow = FIRST_RETURN_ROW + index * BAND_H
  return { dir: index % 2 === 0 ? "e" : "w", returnRow, trunkRow: returnRow + TRUNK_BELOW_RETURN }
}

/** The column a number of tiles ahead along a band, the way its trunk runs. The one place the way a band runs is told apart. */
function ahead(column: number, band: Band, tiles = 1): number {
  return band.dir === "e" ? column + tiles : column - tiles
}

/** The column a number of tiles behind along a band, against the way its trunk runs. */
function behind(column: number, band: Band, tiles = 1): number {
  return ahead(column, band, -tiles)
}

/** The column at the floor's edge a band begins at, behind everything on it, where the turn into it comes down. */
function firstColumn(band: Band, width: number): number {
  return band.dir === "e" ? 0 : width - 1
}

/** The column at the floor's edge a band ends at, ahead of everything on it, where the turn out of it goes down. */
function lastColumn(band: Band, width: number): number {
  return ahead(firstColumn(band, width), band, width - 1)
}

/** The column of a structure's footprint the band's trunk reaches first. */
function nearColumn(rect: Rect, band: Band): number {
  return band.dir === "e" ? rect.x : rect.x + rect.w - 1
}

/** The column of a structure's footprint the band's trunk leaves last. */
function farColumn(rect: Rect, band: Band): number {
  return ahead(nearColumn(rect, band), band, rect.w - 1)
}

/** Where the line has got to as it is laid: the band it runs along, by index, and the next free column, the way the band runs. */
interface LineHead {
  band: number
  column: number
}

/** A structure's footprint on a band's first two rows below its return belt: the agent row and the trunk row. */
function footprint(x: number, w: number, band: Band): Rect {
  return { x, y: band.trunkRow - 1, w, h: 2 }
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
function layBay(role: string, x: number, bandIndex: number, band: Band, snapshot: Snapshot, previous: Bay | undefined): Bay {
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
      stations.push(laneStation(role, x, band, stations.length, agent.id))
    }
  }
  const lanes = Math.max(stations.length, 1)
  return { role, band: bandIndex, rect: { x, y: band.trunkRow - 1, w: BAY_W, h: lanes * LANE_H - 1 }, stations }
}

/** A station on a lane of the bay at x: the bench in the bay's middle column, the agent behind it. */
function laneStation(role: string, x: number, band: Band, lane: number, agentId: string): Station {
  const benchRow = band.trunkRow + lane * LANE_H
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

/**
 * The staging area at x: the bench in the middle column, the inspector behind
 * it. Waiting boxes stay inside the area: on the bench, then piled on the
 * shelf before it, from where the next one rolls onto the bench when it
 * frees. The shelf past the bench would only be reachable against the belt.
 */
function layStaging(x: number, bandIndex: number, band: Band): StagingArea {
  const bench = { x: x + 1, y: band.trunkRow }
  return {
    band: bandIndex,
    rect: footprint(x, STAGING_W, band),
    bench,
    inspectorTile: { x: x + 1, y: band.trunkRow - 1 },
    pile: [bench, { x: behind(bench.x, band), y: band.trunkRow - 1 }],
  }
}

/** The container at x: its mouth where the trunk reaches it, the stacks past the mouth, the nearest first, a layer at a time. */
function layContainer(x: number, bandIndex: number, band: Band): Container {
  const rect = footprint(x, CONTAINER_W, band)
  const mouth = { x: nearColumn(rect, band), y: band.trunkRow }
  return {
    band: bandIndex,
    rect,
    mouth,
    stacks: [band.trunkRow, band.trunkRow - 1].flatMap((y) => [1, 2].map((past) => ({ x: ahead(mouth.x, band, past), y }))),
  }
}

/** A place a box stops on its way along the trunk. */
interface TrunkStop {
  id: string
  /** The band the stop is in, by index. */
  band: number
  /** The last column of the stop along the trunk; the belt out starts after it. */
  exit: number
  /** The first column of the stop along the trunk; the belt in ends before it. */
  entry: number
  /** The column where the belt out starts with a junction toward the return belt's riser: past the staging bench, for rework. */
  riserColumn?: number
}

/**
 * One belt between each pair of consecutive stops, from the tile after one
 * stop's exit to the tile before the next one's entry, through every turn
 * between their bands. A bay with stations is entered at its feeder column
 * and left at its collector column; a bay with none yet is not a stop, and
 * the trunk runs through it. Without a staging area the last stop before the
 * container is the last such bay.
 */
function trunkBelts(intake: Intake, bays: Bay[], staging: StagingArea | undefined, container: Container, bands: Band[], width: number): Belt[] {
  const stops: TrunkStop[] = [
    { id: "intake", band: 0, exit: intake.rect.x + intake.rect.w - 1, entry: intake.rect.x },
    ...staffed(bays).map((bay) => {
      const band = bands[bay.band]!
      return { id: bayId(bay.role), band: bay.band, entry: feederColumn(bay, band), exit: collectorColumn(bay, band) }
    }),
    ...(staging
      ? [{ id: "staging", band: staging.band, exit: staging.bench.x, entry: staging.bench.x, riserColumn: riserColumn(staging, bands[staging.band]!) }]
      : []),
    // The mouth is the belt's last tile, so the container's entry is past it.
    { id: "container", band: container.band, exit: container.mouth.x, entry: ahead(container.mouth.x, bands[container.band]!) },
  ]
  const belts: Belt[] = []
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!
    const to = stops[i]!
    belts.push({ id: `${from.id}>${to.id}`, kind: "trunk", from: from.id, to: to.id, tiles: trunkRun(from, to, bands, width) })
  }
  return belts
}

/**
 * The trunk from one stop to the next: along the band to the next stop or,
 * when that lies in a band below, to the edge, where it crosses the column
 * the band below's return belt will rise in, shaped for it, turns down the
 * outer column and turns again into the band below.
 */
function trunkRun(from: TrunkStop, to: TrunkStop, bands: Band[], width: number): BeltTile[] {
  const tiles: BeltTile[] = []
  let i = from.band
  let x = from.exit
  const along = (until: number) => {
    const band = bands[i]!
    for (x = ahead(x, band); x !== until; x = ahead(x, band)) {
      tiles.push(
        i === from.band && x === from.riserColumn
          ? { kind: "junction", x, y: band.trunkRow, dir: band.dir, entries: [band.dir], exits: [band.dir, "n"] }
          : { kind: "straight", x, y: band.trunkRow, dir: band.dir },
      )
    }
  }
  for (; i < to.band; i++) {
    const band = bands[i]!
    const below = bands[i + 1]!
    const { trunkColumn, returnColumn } = turnColumns(band, width)
    along(returnColumn)
    tiles.push({ kind: "junction", x: returnColumn, y: band.trunkRow, dir: band.dir, entries: [band.dir, "n"], exits: [band.dir, "n"] })
    tiles.push({ kind: "corner", x: trunkColumn, y: band.trunkRow, from: band.dir, to: "s" })
    for (let y = band.trunkRow + 1; y < below.trunkRow; y++) tiles.push({ kind: "straight", x: trunkColumn, y, dir: "s" })
    tiles.push({ kind: "corner", x: trunkColumn, y: below.trunkRow, from: "s", to: below.dir })
    x = trunkColumn
  }
  along(to.entry)
  return tiles
}

/** The columns of the turn out of a band, at the edge it ends at: the trunk's way down on the edge, the return belt's way up just behind it. */
function turnColumns(band: Band, width: number): { trunkColumn: number; returnColumn: number } {
  const trunkColumn = lastColumn(band, width)
  return { trunkColumn, returnColumn: behind(trunkColumn, band) }
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
function bayBelts(bay: Bay, band: Band): Belt[] {
  if (bay.stations.length === 0) return []
  const benchRows = new Set(bay.stations.map((s) => s.bench.y))
  const front = Math.max(...benchRows)
  const fx = feederColumn(bay, band)
  const cx = collectorColumn(bay, band)
  const dir = band.dir
  const feeder: BeltTile[] = []
  const collector: BeltTile[] = []
  for (let y = band.trunkRow; y <= front; y++) {
    feeder.push(
      y === band.trunkRow
        ? { kind: "junction", x: fx, y, dir, entries: [dir, "s"], exits: [dir, "s"] }
        : benchRows.has(y)
          ? { kind: "junction", x: fx, y, dir: "s", entries: ["s"], exits: [dir, "s"] }
          : { kind: "straight", x: fx, y, dir: "s" },
    )
    collector.unshift(
      y === band.trunkRow
        ? { kind: "junction", x: cx, y, dir, entries: [dir, "n"], exits: [dir, "n"] }
        : benchRows.has(y)
          ? { kind: "junction", x: cx, y, dir: "n", entries: [dir, "n"], exits: ["n"] }
          : { kind: "straight", x: cx, y, dir: "n" },
    )
  }
  const id = bayId(bay.role)
  return [
    { id: `${id}:feeder`, kind: "feeder", from: id, to: id, tiles: feeder },
    { id: `${id}:collector`, kind: "collector", from: id, to: id, tiles: collector },
  ]
}

/**
 * The return belts, back along the line from its end to the first bay with
 * stations: one per band, each running opposite the band's trunk along its
 * back, from the staging area's riser, the last served bay's riser or the
 * corner where the band below's belt comes up, to the first served bay's
 * drop or the turn, where it rises beside the trunk's way down to the band
 * above. Over each served bay a riser junction above its merge junction,
 * where rework from the bay joins, and a drop junction above its split
 * junction, where rework for the bay leaves. The risers and the drops
 * themselves, one tile each in the agent row, connect the belts to the
 * junctions below; so does the riser from one band's belt to the next above
 * the crossing on the trunk. A bay with no station is passed straight over.
 */
function returnBelts(bays: Bay[], staging: StagingArea | undefined, bands: Band[], width: number): Belt[] {
  const served = staffed(bays)
  const first = served[0]
  const last = served.at(-1)
  if (!first || !last) return []
  const firstIndex = first.band
  // The line's end, where the return path starts: the staging riser, or the last served bay's riser.
  const end = staging
    ? { id: "staging", band: staging.band, column: riserColumn(staging, bands[staging.band]!) }
    : { id: bayId(last.role), band: last.band, column: collectorColumn(last, bands[last.band]!) }
  const endIndex = end.band
  const runs: Belt[] = []
  const turnRisers: Belt[] = []

  for (let i = endIndex; i >= firstIndex; i--) {
    const band = bands[i]!
    const dir = opposite(band.dir)
    const inBand = served.filter((bay) => bay.band === i)
    const dropColumns = new Set(inBand.map((bay) => feederColumn(bay, band)))
    const riserColumns = new Set(inBand.map((bay) => collectorColumn(bay, band)))
    const tiles: BeltTile[] = []
    // Where the belt starts: at the staging riser's corner, at the last bay's riser junction, or at the corner up from the band below.
    const startColumn = i === endIndex ? end.column : turnColumns(band, width).returnColumn
    const startsAtRiserJunction = i === endIndex && !staging
    if (!startsAtRiserJunction) tiles.push({ kind: "corner", x: startColumn, y: band.returnRow, from: "n", to: dir })
    // Where it ends: at the first bay's drop junction, or at the corner up the turn into this band.
    const endColumn = i === firstIndex ? feederColumn(first, band) : turnColumns(bands[i - 1]!, width).returnColumn
    for (let x = startsAtRiserJunction ? startColumn : behind(startColumn, band); ; x = behind(x, band)) {
      tiles.push(
        riserColumns.has(x)
          ? { kind: "junction", x, y: band.returnRow, dir, entries: [dir, "n"], exits: [dir] }
          : dropColumns.has(x)
            ? { kind: "junction", x, y: band.returnRow, dir, entries: [dir], exits: [dir, "s"] }
            : x === endColumn && i !== firstIndex
              ? { kind: "corner", x, y: band.returnRow, from: dir, to: "n" }
              : { kind: "straight", x, y: band.returnRow, dir },
      )
      if (x === endColumn) break
    }
    if (i !== firstIndex) {
      // Up the turn to just below the crossing on the band above's trunk; one tile of riser carries on over it.
      const above = bands[i - 1]!
      for (let y = band.returnRow - 1; y > above.trunkRow; y--) tiles.push({ kind: "straight", x: endColumn, y, dir: "n" })
      turnRisers.push({
        id: `return:${i}>return:${i - 1}`,
        kind: "riser",
        from: `return:${i}`,
        to: `return:${i - 1}`,
        tiles: [{ kind: "straight", x: endColumn, y: above.trunkRow - 1, dir: "n" }],
      })
    }
    runs.push({
      id: `return:${i}`,
      kind: "return",
      from: i === endIndex ? end.id : `return:${i + 1}`,
      to: i === firstIndex ? bayId(first.role) : `return:${i - 1}`,
      tiles,
    })
  }

  const stagingRiser: Belt[] = staging
    ? [{ id: "staging>return", kind: "riser", from: "staging", to: `return:${endIndex}`, tiles: [{ kind: "straight", x: end.column, y: bands[endIndex]!.returnRow + 1, dir: "n" }] }]
    : []
  return [
    ...runs,
    ...stagingRiser,
    ...turnRisers,
    ...served.flatMap((bay): Belt[] => {
      const id = bayId(bay.role)
      const band = bands[bay.band]!
      const riser: BeltTile = { kind: "straight", x: collectorColumn(bay, band), y: band.returnRow + 1, dir: "n" }
      const drop: BeltTile = { kind: "straight", x: feederColumn(bay, band), y: band.returnRow + 1, dir: "s" }
      return [
        { id: `${id}>return`, kind: "riser", from: id, to: `return:${bay.band}`, tiles: [riser] },
        { id: `return>${id}`, kind: "drop", from: `return:${bay.band}`, to: id, tiles: [drop] },
      ]
    }),
  ]
}

/** The bays with a station, which the trunk stops at and the return belt serves. */
function staffed(bays: Bay[]): Bay[] {
  return bays.filter((bay) => bay.stations.length > 0)
}

/** The bay's back column the way its band runs, where the feeder runs and the trunk enters. */
function feederColumn(bay: Bay, band: Band): number {
  return nearColumn(bay.rect, band)
}

/** The bay's front column the way its band runs, where the collector runs and the trunk leaves. */
function collectorColumn(bay: Bay, band: Band): number {
  return farColumn(bay.rect, band)
}

/** The column past the staging bench, where the trunk's junction out of the staging area and its riser to the return belt are. */
function riserColumn(staging: StagingArea, band: Band): number {
  return ahead(staging.bench.x, band)
}

/**
 * Whether a box is rework: it now rests at a station behind where the
 * previous layout rested it, or at another station of the same bay, and so
 * rides the return belt. A queue advancing, a handoff forward and a box new
 * to the floor are not.
 */
function isRework(box: BoxPlacement, bays: Bay[], previous: Layout | undefined): boolean {
  const before = previous?.boxes.find((b) => b.taskId === box.taskId)
  if (!before || !previous || stationOf(box.spot) === undefined) return false
  const wasAt = alongTheLine(before.spot, previous.bays)
  const nowAt = alongTheLine(box.spot, bays)
  if (nowAt !== wasAt) return nowAt < wasAt
  return stationOf(box.spot) !== stationOf(before.spot)
}

/** How far along the line a spot is: the intake first, then each bay in order, the staging area, the container. */
function alongTheLine(spot: BoxSpot, bays: Bay[]): number {
  if (spot.kind === "intake") return 0
  if (spot.kind === "staging") return bays.length + 1
  if (spot.kind === "container") return bays.length + 2
  return 1 + bays.findIndex((bay) => bay.stations.some((station) => station.id === spot.stationId))
}

function stationOf(spot: BoxSpot): string | undefined {
  return spot.kind === "bench" || spot.kind === "queue" ? spot.stationId : undefined
}

type Places = Pick<Layout, "intake" | "bays" | "staging" | "container" | "belts">

/**
 * One box per task, where its location says. Among tasks at one agent, array
 * order is queue order: the first sits on the bench, the rest wait back along
 * the belts into its lane, piling up at the farthest tile when the belts are
 * shorter than the queue. Shipped is terminal: a task once in the container
 * stays there whatever the host says of it later; shipped boxes fill the
 * container's stacks in order, round and round, so they pile up a layer at a time.
 */
function placeBoxes(tasks: Task[], places: Places, previous: Layout | undefined): { boxes: BoxPlacement[]; unplacedTaskIds: string[] } {
  const boxes: BoxPlacement[] = []
  const unplacedTaskIds: string[] = []
  const stations = places.bays.flatMap((bay) => bay.stations)
  const shippedBefore = new Set(previous ? inContainer(previous).map((box) => box.taskId) : [])
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
    const at = shippedBefore.has(task.id) ? "shipped" : task.at
    if (at === "intake") {
      const index = nextIndexAt("intake")
      boxes.push({ taskId: task.id, tile: pileTile(places.intake.pile, index), spot: { kind: "intake", index } })
    } else if (at === "staging") {
      if (!places.staging) {
        unplacedTaskIds.push(task.id)
        continue
      }
      const index = nextIndexAt("staging")
      boxes.push({ taskId: task.id, tile: pileTile(places.staging.pile, index), spot: { kind: "staging", index } })
    } else if (at === "shipped") {
      const index = nextIndexAt("shipped")
      const stacks = places.container.stacks
      boxes.push({ taskId: task.id, tile: stacks[index % stacks.length]!, spot: { kind: "container", index } })
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

/** The boxes in the container, where they stay. */
export function inContainer(layout: Pick<Layout, "boxes">): BoxPlacement[] {
  return layout.boxes.filter((box) => box.spot.kind === "container")
}

/** A bay's aisle: the column before the bay, the way its band runs, that its agents walk down. */
export function aisleColumn(bay: Bay, band: Band): number {
  return behind(feederColumn(bay, band), band)
}
