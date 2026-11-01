import { expect, it } from "vitest"
import { afterPlanning, exampleRooms } from "./roomExamples"
import { roomSnapshotForView } from "./roomRouting"
import type { RoomFactoryState } from "./types"

it("animates request targets without changing host status, assignment or task location", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: afterPlanning })
  state.snapshot.humanRequests = [{ id: "help", roomId: "implementation", taskId: "planned", agentIds: ["impl-b"], kind: "help", message: "Choose an approach" }]
  const before = structuredClone(state)
  const view = roomSnapshotForView(state)
  expect(view.humanNeededAgentIds).toEqual(["impl-b"])
  expect(view.agents).toEqual(before.snapshot.agents)
  expect(view.assignments?.planned?.agentIds).toEqual(["impl-a", "impl-b"])
  expect(view.tasks[0]!.at).toEqual({ agent: "impl-a" })
  expect(state).toEqual(before)
  state.snapshot.humanRequests = []
  expect(roomSnapshotForView(state).humanNeededAgentIds).toEqual([])
})

it("uses task participants or room members for requests without explicit agents and deduplicates", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: afterPlanning })
  state.snapshot.humanRequests = [
    { id: "task", roomId: "implementation", taskId: "planned", agentIds: [], kind: "question", message: "Which option?" },
    { id: "room", roomId: "planning", agentIds: [], kind: "approval", message: "Ready?" },
    { id: "duplicate", roomId: "implementation", agentIds: ["impl-a"], kind: "help", message: "Help?" },
  ]
  expect(roomSnapshotForView(state).humanNeededAgentIds).toEqual(["impl-a", "impl-b", "planner"])
})
