import type { Agent, Task } from "./types"

/** Theme definitions and assets are supplied by the theme registry. */
export type RoomTheme = "research-lab" | "foundry" | "factory" | "fabrication-plant" | (string & {})

export interface RoomBillboard {
  /** Host-served image URL. Missing/failed images use the room's default graphic. */
  image?: string
  /** Defaults to the room label. */
  alt?: string
}

export interface Room {
  id: string
  label: string
  /** Each member agent must have this role; several rooms may share a role. */
  role: string
  kind: "intake" | "work" | "deployment"
  theme?: RoomTheme
  billboard?: RoomBillboard
}

export interface RoomTransition {
  id: string
  from: string
  to: string
  /** Host-defined outcome, e.g. needs-planning, ready or rework. Not executable code. */
  outcome: string
}

export interface RoomConfiguration {
  rooms: Room[]
  transitions: RoomTransition[]
}

export interface RoomAgent extends Agent {
  roomId: string
}

/** One logical task, one box. The first member is its visual anchor. */
export interface TaskAssignment {
  agentIds: string[]
  /** A subset of agentIds. Only the host decides when to hand off the task. */
  completedAgentIds: string[]
}

export type RoomTaskLocation =
  | { kind: "room"; roomId: string; assignment?: TaskAssignment }
  | { kind: "shipped"; roomId: string }

export interface RoomTask extends Omit<Task, "at"> {
  at: RoomTaskLocation
}

/** Active requests only; removing a request resolves it. IDs must never be reused. */
export interface HumanAttentionRequest {
  id: string
  roomId: string
  taskId?: string
  agentIds: string[]
  kind: "question" | "approval" | "help"
  /** The question or context the host should present to the human. */
  message: string
}

export type OnHumanNeeded = (request: HumanAttentionRequest) => void

export interface RoomSnapshot {
  agents: RoomAgent[]
  /** Array order is queue order, including unassigned tasks waiting in a room. */
  tasks: RoomTask[]
  humanRequests: HumanAttentionRequest[]
}

/** Validate configuration and state together before accepting an update. */
export interface RoomFactoryState {
  configuration: RoomConfiguration
  snapshot: RoomSnapshot
}
