// The tasks at an agent. Among them the snapshot's order is the queue's
// (ADR 0001): the first is on the bench, the rest wait behind it.

import type { TaskLocation } from "./types"

/** The tasks at an agent, in the snapshot's order: the first is on its bench and the rest wait in its queue. */
export function tasksAt<T extends { at: TaskLocation }>(tasks: readonly T[], agentId: string): T[] {
  return tasks.filter((task) => typeof task.at === "object" && task.at.agent === agentId)
}
