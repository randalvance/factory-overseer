import { describe, expect, it } from "vitest"
import { counts } from "./counts"
import type { Snapshot } from "./types"

const snapshot: Snapshot = {
  agents: [
    { id: "imp-1", name: "Ada", role: "implementer", status: "working" },
    { id: "rev-1", name: "Grace", role: "reviewer", status: "idle" },
    { id: "qa-1", name: "Linus", role: "qa", status: "waiting" },
  ],
  tasks: [
    { id: "t-41", label: "t-41", at: "intake" },
    { id: "t-42", label: "t-42", at: "intake" },
    { id: "t-37", label: "t-37", at: { agent: "imp-1" } },
    { id: "t-38", label: "t-38", at: { agent: "imp-1" } },
    { id: "t-35", label: "t-35", at: { agent: "qa-1" } },
    { id: "t-31", label: "t-31", at: "staging" },
    { id: "t-29", label: "t-29", at: "shipped" },
    { id: "t-30", label: "t-30", at: "shipped" },
  ],
}

describe("the header counts", () => {
  it("counts the agents, the tasks in flight at the intake or an agent, those awaiting review in the staging area, and those shipped", () => {
    expect(counts(snapshot)).toEqual({ agents: 3, inFlight: 5, awaitingReview: 1, shipped: 2 })
  })

  it("counts nothing on an empty floor", () => {
    expect(counts({ agents: [], tasks: [] })).toEqual({ agents: 0, inFlight: 0, awaitingReview: 0, shipped: 0 })
  })
})
