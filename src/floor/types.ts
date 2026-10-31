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

export type BeltTile =
  | { kind: "straight"; x: number; y: number; dir: Direction }
  | { kind: "corner"; x: number; y: number; from: Direction; to: Direction }
  | { kind: "junction"; x: number; y: number; dir: Direction; exits: Direction[] }

/**
 * A contiguous run of belt tiles in travel order between two places: the
 * intake, a bay, the staging area or the container. Trunks connect bays, not
 * agents (ADR 0003).
 */
export interface Belt {
  id: string
  from: string
  to: string
  tiles: BeltTile[]
}

export interface Station {
  id: string
  role: string
  /** Which lane of its bay, counted from the back wall. */
  lane: number
  /** The agent working here, or null once its agent has left and the bench is vacant. */
  agentId: string | null
  /** Where the box sits while the agent works it. The tablet is on the bench. */
  bench: Tile
  /** Where the agent stands: behind the bench, facing the camera. */
  agentTile: Tile
}

export interface Bay {
  role: string
  rect: Rect
  /** Empty until an agent of the role arrives. */
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
  /** Where shipped boxes stack. */
  stack: Tile
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
  intake: Intake
  /** In order along the trunk, left to right. */
  bays: Bay[]
  staging: StagingArea
  container: Container
  belts: Belt[]
  boxes: BoxPlacement[]
  /** What this layout had no place for. */
  unplaced: { agentIds: string[]; taskIds: string[] }
}
