// The floor core: a pipeline and a snapshot in, a layout out (ADR 0002). Pure:
// no renderer, no time, no randomness. Everything sits on a tile grid along
// one trunk row, left to right: intake, one bay per role, staging, container.

import type { Pipeline, Snapshot, Task } from "~/model/types"
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

/** The row the trunk runs along. Rows above it hold the agents' backs and, later, the return belt. */
const TRUNK_ROW = 3
const INTAKE_W = 2
const BAY_W = 3
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

  const unplacedAgentIds: string[] = []
  const bays: Bay[] = roles.map((role) => {
    const rect = footprint(x, BAY_W)
    const [seated, ...standing] = snapshot.agents.filter((a) => a.role === role)
    unplacedAgentIds.push(...standing.map((a) => a.id))
    const stations: Station[] = seated
      ? [
          {
            id: `station:${role}:0`,
            role,
            lane: 0,
            agentId: seated.id,
            bench: { x: x + 1, y: TRUNK_ROW },
            agentTile: { x: x + 1, y: TRUNK_ROW - 1 },
          },
        ]
      : []
    x += BAY_W + GAP
    return { role, rect, stations }
  })

  const staging: StagingArea = {
    rect: footprint(x, STAGING_W),
    bench: { x: x + 1, y: TRUNK_ROW },
    inspectorTile: { x: x + 1, y: TRUNK_ROW - 1 },
    // Waiting boxes stay inside the area: on the bench, then on the shelf
    // either side of the inspector.
    pile: [
      { x: x + 1, y: TRUNK_ROW },
      { x: x + 2, y: TRUNK_ROW - 1 },
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

  const belts = trunkBelts(intake, bays, staging, container)
  const { boxes, unplacedTaskIds } = placeBoxes(snapshot.tasks, { intake, bays, staging, container, belts })

  return {
    bounds: { x: 0, y: 0, w: x, h: TRUNK_ROW + 2 },
    trunkRow: TRUNK_ROW,
    intake,
    bays,
    staging,
    container,
    belts,
    boxes,
    unplaced: { agentIds: unplacedAgentIds, taskIds: unplacedTaskIds },
  }
}

/** A structure's footprint: the agent row and the trunk row. */
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
 * stop's exit to the tile before the next one's entry. A bay with no station
 * yet is not a stop: the trunk runs through it.
 */
function trunkBelts(intake: Intake, bays: Bay[], staging: StagingArea, container: Container): Belt[] {
  const stops: TrunkStop[] = [
    { id: "intake", exit: intake.rect.x + intake.rect.w - 1, entry: intake.rect.x },
    ...bays.flatMap((bay) =>
      bay.stations.map((station) => ({ id: bayId(bay.role), exit: station.bench.x, entry: station.bench.x })),
    ),
    { id: "staging", exit: staging.bench.x, entry: staging.bench.x },
    // The mouth is the belt's last tile, so the container's entry is past it.
    { id: "container", exit: container.mouth.x, entry: container.mouth.x + 1 },
  ]
  const belts: Belt[] = []
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!
    const to = stops[i]!
    const tiles: BeltTile[] = []
    for (let bx = from.exit + 1; bx < to.entry; bx++) {
      tiles.push({ kind: "straight", x: bx, y: TRUNK_ROW, dir: "e" })
    }
    belts.push({ id: `${from.id}>${to.id}`, from: from.id, to: to.id, tiles })
  }
  return belts
}

type Places = Pick<Layout, "intake" | "bays" | "staging" | "container" | "belts">

/**
 * One box per task, where its location says. Among tasks at one agent, array
 * order is queue order: the first sits on the bench, the rest wait back along
 * the belt into the bay, piling up at its first tile when the belt is shorter
 * than the queue.
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
    const inbound = places.belts.find((b) => b.to === bayId(station.role))?.tiles ?? []
    const tile = inbound[Math.max(0, inbound.length - index)] ?? station.bench
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
