// The tasks at an agent. Among them the snapshot's order is the queue's
// (ADR 0001): the first is on the bench, the rest wait behind it.

import type { Task } from "./types"

/** The tasks at an agent, in the snapshot's order: the first is on its bench and the rest wait in its queue. */
export function tasksAt(tasks: readonly Task[], agentId: string): Task[] {
  return tasks.filter((task) => typeof task.at === "object" && task.at.agent === agentId)
}
