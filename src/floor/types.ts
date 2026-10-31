// What the floor core produces: a layout, where everything sits on the tile
// grid. Pure data for the views to draw and for tests to assert against. x
// runs with the flow, left to right; y runs toward the camera, so y = 0 is
// the back wall.

export interface Tile {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Direction = "e" | "w" | "n" | "s"

/**
 * One tile of belt. A junction is shaped once for everything that may ever
 * join or leave it, so that a lane or a belt added later connects to it
 * without changing it: its entries are the ways boxes travel as they come
 * in, its exits the ways they may leave, the way through first in both.
 */
export type BeltTile =
  | { kind: "straight"; x: number; y: number; dir: Direction }
  | { kind: "corner"; x: number; y: number; from: Direction; to: Direction }
  | { kind: "junction"; x: number; y: number; dir: Direction; entries: Direction[]; exits: Direction[] }

/**
 * A contiguous run of belt tiles in travel order. A trunk runs between two
 * places: the intake, a bay, the staging area or the container. A bay's own
 * belts, its feeder and its collector, start and end at the bay. The return
 * belt runs along the back wall from the last bay to the first; the riser
 * out of each bay and the drop into it are one tile each (ADR 0003).
 */
export interface Belt {
  id: string
  kind: "trunk" | "feeder" | "collector" | "return" | "riser" | "drop"
  from: string
  to: string
  tiles: BeltTile[]
}

export interface Station {
  id: string
  role: string
  /** Which lane of its bay, counted from the back wall. */
  lane: number
  /** The agent working here, or the one that left while the bench is vacant. */
  agentId: string
  vacant: boolean
  /** Where the box sits while the agent works it. The tablet is on the bench. */
  bench: Tile
  /** Where the agent stands: behind the bench, facing the camera. */
  agentTile: Tile
}

export interface Bay {
  role: string
  /** Grows toward the camera, a lane per station. */
  rect: Rect
  /** Empty until an agent of the role arrives; from then on one per lane, vacant or not. */
  stations: Station[]
}

export interface Intake {
  rect: Rect
  /** Where waiting boxes pile, in fill order. */
  pile: Tile[]
}

export interface StagingArea {
  rect: Rect
  /** Where the inspector stamps the box under review. */
  bench: Tile
  inspectorTile: Tile
  /** Where boxes awaiting review wait, in fill order, starting with the bench. */
  pile: Tile[]
}

export interface Container {
  rect: Rect
  /** The last belt tile before boxes go in. */
  mouth: Tile
  /** Where shipped boxes stack: the tiles past the mouth, filled in this order a layer at a time. */
  stacks: Tile[]
}

export type BoxSpot =
  | { kind: "intake"; index: number }
  | { kind: "bench"; stationId: string }
  | { kind: "queue"; stationId: string; index: number }
  | { kind: "staging"; index: number }
  | { kind: "container"; index: number }

export interface BoxPlacement {
  taskId: string
  tile: Tile
  spot: BoxSpot
}

export interface Layout {
  bounds: Rect
  /** The row the trunk runs along. */
  trunkRow: number
  /** The door in the back wall that new agents walk in through. */
  door: Tile
  intake: Intake
  /** In order along the trunk, left to right. */
  bays: Bay[]
  /** None when the host has switched the staging area off: the last bay's trunk runs straight into the container. */
  staging: StagingArea | undefined
  container: Container
  belts: Belt[]
  boxes: BoxPlacement[]
  /** The tasks this layout had no place for: at an agent with no station, or at a staging area that is switched off. */
  unplaced: { taskIds: string[] }
}
