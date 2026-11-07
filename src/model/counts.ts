// The header's counts, from a snapshot alone: who is on the floor and where
// the work stands. Pure, like the rest of the model.

import type { Snapshot } from "./types"

export interface Counts {
  agents: number
  /** Tasks at the intake or at an agent: on the floor and not yet before the inspector. */
  inFlight: number
  /** Tasks in the staging area. */
  awaitingReview: number
  shipped: number
}

/** The header's tally of a snapshot: its agents, the main agent among them, and its tasks by whether they are in flight, awaiting review or shipped. */
export function counts(snapshot: Snapshot): Counts {
  const tally: Counts = { agents: snapshot.agents.length + (snapshot.mainAgent ? 1 : 0), inFlight: 0, awaitingReview: 0, shipped: 0 }
  for (const task of snapshot.tasks) {
    if (task.at === "staging") tally.awaitingReview++
    else if (task.at === "shipped") tally.shipped++
    else tally.inFlight++
  }
  return tally
}
