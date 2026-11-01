// The floor core: a pipeline and a snapshot in, a layout out (ADR 0002). Pure:
// no renderer, no time, no randomness. Everything sits on a tile grid along
// the line: intake, a bay per role, staging, container. The line runs along a
// band across the floor until the next structure would not fit in the floor's
// width; then the trunk turns at the edge and the line goes on in a band
// below, running the other way (ADR 0006). Inside a bay, lanes stack toward
// the camera, one station each, up to a fixed number; the next agent of the
// role takes a lane in an annex, a further bay for the role, appended at the
// end of the line while the floor runs (ADR 0007). Only the overseer's
// Reorganize lays the floor afresh, as the first layout is laid: compact, in
// pipeline order, each annex right after its role's bay and no lane left
// vacant (ADR 0002). Rework, and any handoff to a bay behind along the line,
// rides a return belt along the back of each band and up the turns, laid the
// first time it is needed (ADR 0003).

import type { Agent, Pipeline, Snapshot, Task } from "~/model/types"
import { tasksAt } from "~/model/tasks"
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
  RoomFootprint,
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
/** The lanes a bay holds unless the host says otherwise (ADR 0007). */
const LANES_PER_BAY = 3
const STAGING_W = 3
const CONTAINER_W = 3
/** Belt tiles between one structure and the next. */
const GAP = 2
/** A turn's columns at the edge: the trunk's way down on the outside, the return belt's way up beside it, one each. */
const TURN_W = 2
/** The narrowest floor the line can always be laid in: a band must take a turn and both ends after it. */
const MIN_WIDTH = TURN_W + GAP + STAGING_W + GAP + CONTAINER_W

/** The id of a role's own bay, or of its annex number `annex`, counted from one. */
export function bayId(role: string, annex = 0): string {
  return annex === 0 ? `bay:${role}` : `bay:${role}:${annex}`
}

export interface FloorOptions {
  /** Expandable, separated rooms; the legacy pipeline supplies their role order. */
  roomLayout?: boolean
  /** Whether boxes pass an inspector before they ship. On unless switched off. */
  staging?: boolean
  /** How many lanes a bay holds, fixed when the first layout is laid: three unless given. The next agent of the role takes a lane in an annex. */
  lanes?: number
  /**
   * The floor's width in tiles, fixed when the first layout is laid; once laid,
   * the layout before keeps it. As wide as the first line needs when not given,
   * and never narrower than the line can be laid in.
   */
  width?: number
}

/**
 * The layout for a snapshot: the first laid afresh, compact and as wide as
 * the options or the line say; every later one grown from the previous,
 * nothing placed before moving (ADR 0002).
 */
export function layoutFloor(pipeline: Pipeline, snapshot: Snapshot, previous?: Layout, options: FloorOptions = {}): Layout {
  if (previous && Boolean(previous.rooms) !== Boolean(options.roomLayout)) previous = undefined
  if (options.roomLayout) return layoutRoomFloor(pipeline, snapshot, previous, options)
  const withStaging = options.staging ?? true
  if (!previous) {
    const lanesPerBay = Math.max(1, options.lanes ?? LANES_PER_BAY)
    const bays = compactBays(pipeline, snapshot, undefined, lanesPerBay)
    const width = Math.max(MIN_WIDTH, options.width ?? lineWidth(bays.length, withStaging))
    return lay(snapshot, bays, { width, lanesPerBay, withStaging, previous: undefined, returnBelt: () => false })
  }
  return lay(snapshot, grownBays(pipeline, snapshot, previous), {
    width: previous.bounds.w,
    lanesPerBay: previous.lanesPerBay,
    withStaging,
    previous,
    returnBelt: (boxes, bays) => hadReturnBelt(previous) || boxes.some((box) => goesBack(box, bays, previous)),
  })
}

/**
 * The floor laid afresh for a snapshot, as the overseer's Reorganize asks
 * (ADR 0002): compact, in pipeline order, a role's annexes beside its bay, no
 * vacant lane but one with a box still on its bench, and the line wrapped
 * afresh within the width the floor was laid at, with as many lanes per bay.
 * Every station kept keeps its id, the return belt stays once laid, and
 * shipped stays shipped.
 */
export function reorganizedFloor(pipeline: Pipeline, snapshot: Snapshot, previous: Layout, options: Pick<FloorOptions, "staging"> = {}): Layout {
  if (previous.rooms) return layoutRoomFloor(pipeline, snapshot, previous, options, true)
  return lay(snapshot, compactBays(pipeline, snapshot, previous, previous.lanesPerBay), {
    width: previous.bounds.w,
    lanesPerBay: previous.lanesPerBay,
    withStaging: options.staging ?? true,
    previous,
    returnBelt: () => hadReturnBelt(previous),
  })
}

/** What a layout is laid within and from. */
interface Basis {
  width: number
  lanesPerBay: number
  withStaging: boolean
  /** The layout the boxes come from: what has shipped stays shipped. */
  previous: Layout | undefined
  /** Whether the return belt is laid, given the boxes placed and the bays laid. */
  returnBelt: (boxes: BoxPlacement[], bays: Bay[]) => boolean
}

function hadReturnBelt(layout: Layout): boolean {
  return layout.belts.some((belt) => belt.kind === "return")
}

/** Lay the intake, the bays in order, the ends after them, and the belts between them all; then place the boxes. */
function lay(snapshot: Snapshot, toLay: BayToLay[], basis: Basis): Layout {
  const { width, lanesPerBay, withStaging, previous } = basis
  const bands: Band[] = [bandAt(0, lanesPerBay)]
  /** The line turns down into a new band, whose first free column is past the turn and a gap. */
  const turnDown = (): LineHead => {
    const band = bandAt(bands.length, lanesPerBay)
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

  const bays: Bay[] = toLay.map((bay) => {
    if (room(head) < BAY_W + GAP + TURN_W) head = turnDown()
    const placed = placeBay(bay, startOf(head, BAY_W), head.band, bands[head.band]!)
    head = advance(head, BAY_W + GAP)
    return placed
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
  if (basis.returnBelt(boxes, bays)) belts.push(...returnBelts(bays, staging, bands, width))
  // One row of floor in front of the frontmost lane, or of the last band's trunk.
  const front = Math.max(bands.at(-1)!.trunkRow + 1, ...bays.map((bay) => bay.rect.y + bay.rect.h))

  return {
    bounds: { x: 0, y: 0, w: width, h: front + 1 },
    bands,
    lanesPerBay,
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

/** The width the line takes laid along one band: the intake, the bays, the ends. */
function lineWidth(bayCount: number, withStaging: boolean): number {
  return INTAKE_W + GAP + bayCount * (BAY_W + GAP) + (withStaging ? STAGING_W + GAP : 0) + CONTAINER_W
}

/**
 * The band at a depth from the back wall: east along the first, the other way
 * in each below. From one band's return belt to the next band's: the belts,
 * the lanes a bay holds, and one row of floor in front.
 */
function bandAt(index: number, lanesPerBay: number): Band {
  const bandHeight = TRUNK_BELOW_RETURN + 1 + (lanesPerBay - 1) * LANE_H + 1
  const returnRow = FIRST_RETURN_ROW + index * bandHeight
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

/** A station before it is given a lane: everything but its bay, its lane and its tiles. */
type StationToLay = Omit<Station, "bay" | "lane" | "bench" | "agentTile">

/** A station in its lane of a bay to lay: everything but its tiles. */
type LaneToLay = Omit<Station, "bench" | "agentTile">

/** A bay before it is placed: the role's own or one of its annexes, and its stations, lane by lane. */
interface BayToLay {
  id: string
  role: string
  annex: number
  stations: LaneToLay[]
}

/**
 * The bays of the floor grown from the previous layout (ADR 0002): every bay
 * it had, in order, each station vacant where its agent has left; a bay for
 * each role new to the floor, declared roles first; and an annex for each lot
 * of agents no bay of their role has a lane for, appended like any other bay
 * (ADR 0007).
 */
function grownBays(pipeline: Pipeline, snapshot: Snapshot, previous: Layout): BayToLay[] {
  const stationing = stationingOf(snapshot, previous, previous.lanesPerBay)
  const bays: BayToLay[] = previous.bays.map((bay) => ({
    id: bay.id,
    role: bay.role,
    annex: bay.annex,
    stations: bay.stations.map((station) => relaid(station, snapshot)),
  }))
  for (const role of rolesInOrder(pipeline, snapshot, [])) {
    if (!bays.some((bay) => bay.role === role)) bays.push({ id: bayId(role), role, annex: 0, stations: [] })
  }
  for (const bay of bays) fill(bay, stationing)
  for (const agent of snapshot.agents) {
    if (stationing.placed.has(agent.id)) continue
    const annex = bays.filter((bay) => bay.role === agent.role).length
    const bay: BayToLay = { id: bayId(agent.role, annex), role: agent.role, annex, stations: [] }
    fill(bay, stationing)
    bays.push(bay)
  }
  return bays
}

/**
 * The bays of a floor laid afresh: a bay per role in pipeline order, the
 * roles the pipeline does not list after them, each role's annexes right
 * after its own bay, with as many lanes as its stations need. The stations
 * of the previous layout stay, with their ids, for the agents still there
 * and for a box left on a vacant bench; every other vacant lane closes.
 */
function compactBays(pipeline: Pipeline, snapshot: Snapshot, previous: Layout | undefined, lanesPerBay: number): BayToLay[] {
  const stationing = stationingOf(snapshot, previous, lanesPerBay)
  const kept = (previous?.bays ?? [])
    .flatMap((bay) => bay.stations)
    .filter((station) => stillThere(station, snapshot) || holdsABox(station, snapshot))
  return rolesInOrder(pipeline, snapshot, kept).flatMap((role) => {
    const stations: StationToLay[] = [
      ...kept.filter((station) => station.role === role).map((station) => relaid(station, snapshot)),
      ...snapshot.agents
        .filter((agent) => agent.role === role && !stationing.placed.has(agent.id))
        .map((agent) => newStation(role, agent.id, stationing)),
    ]
    return inBays(role, stations, lanesPerBay)
  })
}

/** The roles with a bay on a floor laid afresh, in order: the pipeline's, then any other an agent has, then any other a kept station has. */
function rolesInOrder(pipeline: Pipeline, snapshot: Snapshot, kept: Station[]): string[] {
  const roles: string[] = []
  for (const role of [...pipeline.roles, ...snapshot.agents.map((agent) => agent.role), ...kept.map((station) => station.role)]) {
    if (!roles.includes(role)) roles.push(role)
  }
  return roles
}

/** A role's stations in bays of as many lanes as a bay holds: its own bay, then an annex for each further lot. A role with no station gets its bay all the same. */
function inBays(role: string, stations: StationToLay[], lanesPerBay: number): BayToLay[] {
  const bays: BayToLay[] = []
  for (let annex = 0; annex === 0 || annex * lanesPerBay < stations.length; annex++) {
    const id = bayId(role, annex)
    const lanes = stations.slice(annex * lanesPerBay, (annex + 1) * lanesPerBay).map((station, lane) => ({ ...station, bay: id, lane }))
    bays.push({ id, role, annex, stations: lanes })
  }
  return bays
}

/**
 * What laying the bays goes by for who stands where: the snapshot, the
 * lanes a bay holds, the agents placed at a station so far, and the next
 * index for a role's station ids, which count across its bays.
 */
interface Stationing {
  snapshot: Snapshot
  lanesPerBay: number
  placed: Set<string>
  nextStationIndex: (role: string) => number
}

/** Everyone at a station of the previous layout, still there in that role, keeps it: placed before any bay is laid. */
function stationingOf(snapshot: Snapshot, previous: Layout | undefined, lanesPerBay: number): Stationing {
  const stations = previous?.bays.flatMap((bay) => bay.stations) ?? []
  const nextStationIndex = indexer()
  for (const station of stations) nextStationIndex(station.role)
  return {
    snapshot,
    lanesPerBay,
    placed: new Set(stations.filter((station) => stillThere(station, snapshot)).map((station) => station.agentId)),
    nextStationIndex,
  }
}

/**
 * Fill a bay: every agent of its role without a station yet takes its first
 * vacant station with no box on the bench or, failing one, a new lane while
 * the bay has lanes left; the rest wait for an annex. A vacant bench with a
 * box still on it keeps the box until the host moves it, so a newcomer
 * passes it by.
 */
function fill(bay: BayToLay, stationing: Stationing) {
  const { snapshot, placed, lanesPerBay } = stationing
  for (const agent of snapshot.agents) {
    if (agent.role !== bay.role || placed.has(agent.id)) continue
    const vacantStation = bay.stations.find((station) => station.vacant && !holdsABox(station, snapshot))
    if (vacantStation) {
      vacantStation.agentId = agent.id
      vacantStation.vacant = false
    } else if (bay.stations.length < lanesPerBay) {
      bay.stations.push({ ...newStation(bay.role, agent.id, stationing), bay: bay.id, lane: bay.stations.length })
    } else {
      break
    }
    placed.add(agent.id)
  }
}

/** A station for an agent new to the floor, its id the role's next; its bay and lane come when it is put in one. */
function newStation(role: string, agentId: string, stationing: Stationing): StationToLay {
  return { id: `station:${role}:${stationing.nextStationIndex(role)}`, role, agentId, vacant: false }
}

/** The station laid again in its lane, its tiles to come, vacant unless its agent is still there. */
function relaid(station: Station, snapshot: Snapshot): LaneToLay {
  const { id, role, bay, lane, agentId } = station
  return { id, role, bay, lane, agentId, vacant: !stillThere(station, snapshot) }
}

/** Whether the station's agent is in the snapshot in the station's role. */
function stillThere(station: StationToLay, snapshot: Snapshot): boolean {
  return snapshot.agents.some((agent) => agent.id === station.agentId && agent.role === station.role)
}

/** Whether a task is at the station's agent, so a box sits or waits there. */
function holdsABox(station: StationToLay, snapshot: Snapshot): boolean {
  return tasksAt(snapshot.tasks, station.agentId).length > 0
}

/** A running count per key: each call gives the key's next index, from zero. */
function indexer(): (key: string) => number {
  const counts = new Map<string, number>()
  return (key) => {
    const n = counts.get(key) ?? 0
    counts.set(key, n + 1)
    return n
  }
}

/** The bay placed at x along its band: each lane's bench in the bay's middle column, the agent behind it, the lanes toward the camera. */
function placeBay(bay: BayToLay, x: number, bandIndex: number, band: Band): Bay {
  const stations: Station[] = bay.stations.map((station) => {
    const benchRow = band.trunkRow + station.lane * LANE_H
    return { ...station, bench: { x: x + 1, y: benchRow }, agentTile: { x: x + 1, y: benchRow - 1 } }
  })
  const lanes = Math.max(stations.length, 1)
  return { id: bay.id, role: bay.role, annex: bay.annex, band: bandIndex, rect: { x, y: band.trunkRow - 1, w: BAY_W, h: lanes * LANE_H - 1 }, stations }
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
      return { id: bay.id, band: bay.band, entry: feederColumn(bay, band), exit: collectorColumn(bay, band) }
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
  const id = bay.id
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
    : { id: last.id, band: last.band, column: collectorColumn(last, bands[last.band]!) }
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
      to: i === firstIndex ? first.id : `return:${i - 1}`,
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
      const id = bay.id
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
 * Whether a box goes back along the line: it now rests at a station behind
 * where the previous layout rested it, or at another station of the same
 * bay, and so rides the return belt. Rework does, and so does a handoff
 * forward in the pipeline to a bay that lies behind: from an annex, or from a
 * late role's bay. A queue advancing, a handoff on along the line and a box
 * new to the floor do not.
 */
function goesBack(box: BoxPlacement, bays: Bay[], previous: Layout | undefined): boolean {
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
  const nextIndexAt = indexer()
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
  const feeder = belts.find((b) => b.kind === "feeder" && b.from === station.bay)?.tiles ?? []
  const inbound = belts.find((b) => b.kind === "trunk" && b.to === station.bay)?.tiles ?? []
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

/**
 * Room-mode packing. Rooms share a row's belt corridor, but each keeps its
 * own height. Only rows below a growing room move. Vacancies are retained
 * until explicit Reorganize; a role never spills into an annex.
 * This stage keeps the legacy line connections; configurable edges follow.
 */
export function layoutRoomFloor(pipeline: Pipeline, snapshot: Snapshot, previous?: Layout, options: FloorOptions = {}, compact = false): Layout {
  const width = previous?.bounds.w ?? options.width ?? 24
  if (!Number.isInteger(width) || width < 18) throw new Error("Room floor width must be an integer of at least 18 tiles")
  const capacity = Number.MAX_SAFE_INTEGER
  const toLay = previous && !compact
    ? grownBays(pipeline, snapshot, previous)
    : compactBays(pipeline, snapshot, previous, capacity)
  const bands: Band[] = [{ dir: "e", returnRow: 1, trunkRow: 3 }]
  const rooms: RoomFootprint[] = []
  let bandIndex = 0
  let column = 0
  let front = 6

  const place = (id: string, label: string, kind: RoomFootprint["kind"], w: number, h: number) => {
    let band = bands[bandIndex]!
    const available = band.dir === "e" ? width - column : column + 1
    if (available < w + TURN_W) {
      bandIndex++
      band = { dir: bandIndex % 2 === 0 ? "e" : "w", returnRow: front + 2, trunkRow: front + 4 }
      bands.push(band)
      column = ahead(firstColumn(band, width), band, TURN_W + GAP)
    }
    const x = Math.min(column, ahead(column, band, w - 1))
    const rect = { x, y: band.returnRow - 1, w, h }
    const room: RoomFootprint = {
      id, label, kind, rect,
      door: { x: band.dir === "e" ? x + 1 : x + w - 2, y: rect.y },
      ports: [rect.x, rect.x + rect.w - 1].flatMap((x) => [band.returnRow, band.trunkRow].map((y) => ({ x, y }))),
    }
    rooms.push(room)
    front = Math.max(front, rect.y + h)
    column = ahead(column, band, w + GAP)
    return { room, band, bandIndex }
  }

  const first = place("intake", "INTAKE", "intake", 6, 6)
  const intake: Intake = {
    rect: footprint(first.room.rect.x + 2, 2, first.band),
    pile: [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }],
  }
  const bays = toLay.map((bay) => {
    const placed = place(bay.id, bay.role.toUpperCase(), "work", 7, Math.max(6, bay.stations.length * LANE_H + 3))
    return placeBay(bay, placed.room.rect.x + 2, placed.bandIndex, placed.band)
  })
  let staging: StagingArea | undefined
  if (options.staging ?? true) {
    const placed = place("staging", "HUMAN REVIEW", "staging", 7, 6)
    staging = layStaging(placed.room.rect.x + 2, placed.bandIndex, placed.band)
  }
  const last = place("deployment", "DEPLOYMENT", "deployment", 7, 6)
  const container = layContainer(last.room.rect.x + 2, last.bandIndex, last.band)
  const belts = [
    ...trunkBelts(intake, bays, staging, container, bands, width),
    ...bays.flatMap((bay) => bayBelts(bay, bands[bay.band]!)),
    ...returnBelts(bays, staging, bands, width),
  ]
  const { boxes, unplacedTaskIds } = placeBoxes(snapshot.tasks, { bays, intake, staging, container, belts }, previous)
  return {
    bounds: { x: 0, y: 0, w: width, h: front + 1 }, bands, rooms,
    lanesPerBay: capacity, door: first.room.door, intake, bays, staging, container, belts, boxes,
    unplaced: { taskIds: unplacedTaskIds },
  }
}

/** Geometry changes that require the room drawing and its occupants to glide. */
export function roomGeometryChanged(before: Layout | undefined, after: Layout): boolean {
  if (!before?.rooms || !after.rooms) return false
  return JSON.stringify([before.rooms, before.shippingDock, before.bays.map((bay) => bay.stations.map((station) => [station.id, station.bench]))]) !==
    JSON.stringify([after.rooms, after.shippingDock, after.bays.map((bay) => bay.stations.map((station) => [station.id, station.bench]))])
}
