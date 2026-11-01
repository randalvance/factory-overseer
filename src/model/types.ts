// The host contract: what a host hands the factory on every change. Snapshots,
// not events (ADR 0001). Nothing here knows about tiles or the renderer.

import type { AgentStatus } from "./status"

/** The order of roles a task normally passes through. */
export interface Pipeline {
  roles: string[]
}

export interface Agent {
  /** Stable across snapshots. Also seeds the derived sprite. */
  id: string
  name: string
  /** The kind of work this agent does. Every agent has exactly one. */
  role: string
  status: AgentStatus
  /** Bubble text. Empty falls back to the status default. */
  activity?: string
  /** A stock sheet index, or a URL to a sheet in the stock layout. */
  sprite?: number | string
  color?: string
}

/** Where a task is. Everything else about a box is derived from this. */
export type TaskLocation = "intake" | "staging" | "shipped" | { agent: string }

export interface Task {
  id: string
  label: string
  at: TaskLocation
  color?: string
  /** 0 to 1 when the host knows it; fills the tablet's bar. */
  progress?: number
}

export interface Snapshot {
  /** View-only attention targets; active room requests take precedence over work animation. */
  humanNeededAgentIds?: readonly string[]
  /** Room projection: one logical task, associated with every participant. */
  assignments?: Record<string, import("./rooms").TaskAssignment>
  agents: Agent[]
  /** Among tasks at one agent, array order is queue order. */
  tasks: Task[]
}

/** An agent or a task, by id: what a click lands on, what a card is for, or what the camera focuses on. */
export type Subject = { agent: string } | { task: string }

// Room-based host contract; legacy types above remain supported.
export type { RoomTheme, RoomBillboard, Room, RoomTransition, RoomConfiguration, RoomAgent, TaskAssignment, RoomTaskLocation, RoomTask, HumanAttentionRequest, OnHumanNeeded, RoomSnapshot, RoomFactoryState } from "./rooms"

export type { RoomThemeDefinition, RoomThemeRegistry, RoomModelAsset, RoomThemeAssets, BuiltinRoomTheme } from "./roomThemes"
