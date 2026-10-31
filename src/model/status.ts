// What an agent's status looks like on the floor. Pure data: the scene reads
// it, the host overrides it per status, and nothing here touches the renderer.

export type AgentStatus = "idle" | "working" | "waiting" | "done" | "error" | "offline"

export const AGENT_STATUSES: readonly AgentStatus[] = [
  "idle",
  "working",
  "waiting",
  "done",
  "error",
  "offline",
]

/** What the agent's body does while it has this status. */
export type BodyMotion = "stand" | "work" | "jump"

/** The icon shown over the agent's head. */
export type StatusIcon = "none" | "hand" | "warning" | "check"

/** Every icon there is; each is a 16 by 16 image of that name under the icons folder of the assets. */
export const STATUS_ICONS: readonly Exclude<StatusIcon, "none">[] = ["hand", "warning", "check"]

/** The sheet pose held while standing or at the top of a jump. */
export type Pose = "walk" | "hurt"

export interface StatusStyle {
  motion: BodyMotion
  icon: StatusIcon
  /** Bubble text when the agent has no activity of its own. null hides it. */
  bubble: string | null
  pose: Pose
  /** 1 is fully present. */
  opacity: number
}

export const DEFAULT_STATUS_STYLES: Readonly<Record<AgentStatus, StatusStyle>> = {
  idle: { motion: "stand", icon: "none", bubble: null, pose: "walk", opacity: 1 },
  working: { motion: "work", icon: "none", bubble: "Working…", pose: "walk", opacity: 1 },
  waiting: { motion: "jump", icon: "hand", bubble: "Needs you", pose: "walk", opacity: 1 },
  done: { motion: "stand", icon: "check", bubble: "Done", pose: "walk", opacity: 1 },
  error: { motion: "jump", icon: "warning", bubble: "Error", pose: "hurt", opacity: 1 },
  offline: { motion: "stand", icon: "none", bubble: null, pose: "walk", opacity: 0.6 },
}

/** Per-status overrides a host passes in. Any cell left out keeps its default. */
export type StatusStyleOverrides = Partial<Record<AgentStatus, Partial<StatusStyle>>>

function merge(base: StatusStyle, patch: Partial<StatusStyle> | undefined): StatusStyle {
  if (!patch) return { ...base }
  return {
    motion: patch.motion ?? base.motion,
    icon: patch.icon ?? base.icon,
    // null is a real value here (hide the bubble), so only undefined falls back.
    bubble: patch.bubble === undefined ? base.bubble : patch.bubble,
    pose: patch.pose ?? base.pose,
    opacity: patch.opacity ?? base.opacity,
  }
}

export function resolveStatusStyles(
  overrides: StatusStyleOverrides = {},
): Record<AgentStatus, StatusStyle> {
  return {
    idle: merge(DEFAULT_STATUS_STYLES.idle, overrides.idle),
    working: merge(DEFAULT_STATUS_STYLES.working, overrides.working),
    waiting: merge(DEFAULT_STATUS_STYLES.waiting, overrides.waiting),
    done: merge(DEFAULT_STATUS_STYLES.done, overrides.done),
    error: merge(DEFAULT_STATUS_STYLES.error, overrides.error),
    offline: merge(DEFAULT_STATUS_STYLES.offline, overrides.offline),
  }
}

/** The text over an agent's head: its own activity first, else the status default. */
export function bubbleText(
  status: AgentStatus,
  activity: string | undefined,
  styles: Readonly<Record<AgentStatus, StatusStyle>> = DEFAULT_STATUS_STYLES,
): string | null {
  const own = activity?.trim()
  if (own) return own
  return styles[status].bubble
}
