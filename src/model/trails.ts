// Where each task has been this session, and where it is, in words for its
// card. A trail is the places a task was seen at, one snapshot to the next;
// the factory remembers nothing older than the session (no persistence). Pure.

import { tasksAt } from "./tasks"
import type { Agent, Snapshot, Task, TaskLocation } from "./types"

/** By task id, the places the task has been seen at this session, in order, the last being where it is. */
export type Trails = Readonly<Record<string, readonly TaskLocation[]>>

/** The trails carried on by a snapshot: a task seen somewhere new gains the place; one no longer in the snapshot is forgotten. */
export function recordTrails(trails: Trails, snapshot: Snapshot): Trails {
  const next: Record<string, readonly TaskLocation[]> = {}
  for (const task of snapshot.tasks) {
    const trail = trails[task.id] ?? []
    const last = trail[trail.length - 1]
    next[task.id] = last !== undefined && samePlace(last, task.at) ? trail : [...trail, task.at]
  }
  return next
}

function samePlace(a: TaskLocation, b: TaskLocation): boolean {
  return typeof a === "object" && typeof b === "object" ? a.agent === b.agent : a === b
}

/** A place in words: the intake, the staging area, shipped, or an agent by name and role, or by id when the snapshot no longer has it. */
export function placeText(place: TaskLocation, agents: readonly Agent[]): string {
  if (place === "intake") return "the intake"
  if (place === "staging") return "the staging area"
  if (place === "shipped") return "shipped"
  const agent = agents.find((a) => a.id === place.agent)
  return agent ? `${agent.name}, ${agent.role}` : place.agent
}

/** Whether a task's box is at the place the snapshot gives it, or still riding there. */
export type Arrival = "arrived" | "riding"

/**
 * Where a task is in words: on whose bench, or in whose queue and how far
 * back; in the intake; awaiting review; or shipped. While its box still
 * rides, where it is bound.
 */
export function whereText(task: Task, snapshot: Snapshot, arrival: Arrival = "arrived"): string {
  const place = task.at
  const riding = arrival === "riding"
  if (place === "intake") return riding ? "riding to the intake" : "in the intake"
  if (place === "staging") return riding ? "riding to the staging area" : "in the staging area, awaiting review"
  if (place === "shipped") return riding ? "riding to the container" : "shipped, in the container"
  const agent = snapshot.agents.find((a) => a.id === place.agent)
  const name = agent?.name ?? place.agent
  const behind = tasksAt(snapshot.tasks, place.agent).findIndex((t) => t.id === task.id)
  if (riding) return `riding to ${name}'s ${behind <= 0 ? "bench" : "queue"}`
  if (behind <= 0) return `on ${name}'s bench`
  return `in ${name}'s queue, ${behind === 1 ? "next" : ordinal(behind)}`
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${n}${suffix}`
}
