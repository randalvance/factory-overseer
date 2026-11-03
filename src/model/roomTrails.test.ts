import { expect, it } from "vitest"
import { afterPlanning, exampleRooms, planningFirst } from "./roomExamples"
import { recordRoomTrails } from "./roomTrails"
import type { RoomFactoryState } from "./types"

it("records visits and rework without inventing travel for assignment, completion or room-name changes", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: planningFirst })
  let trails = recordRoomTrails({}, state)
  state.snapshot = structuredClone(afterPlanning)
  trails = recordRoomTrails(trails, state)
  state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["impl-b"], completedAgentIds: ["impl-b"] } }
  state.configuration.rooms.find((room) => room.id === "implementation")!.label = "Build room"
  state.snapshot.agents.find((agent) => agent.id === "impl-b")!.name = "New name"
  trails = recordRoomTrails(trails, state)
  state.snapshot = structuredClone(planningFirst)
  trails = recordRoomTrails(trails, state)
  expect(trails.planned?.map((stop) => stop.label)).toEqual(["Planning", "Implementation", "Planning"])
})

it("keeps old room names after configuration removal and distinguishes deployment from shipping", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: planningFirst })
  let trails = recordRoomTrails({}, state)
  state.configuration.rooms = state.configuration.rooms.filter((room) => room.id !== "planning")
  state.snapshot.tasks[0]!.at = { kind: "room", roomId: "deployment" }
  trails = recordRoomTrails(trails, state)
  state.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
  trails = recordRoomTrails(trails, state)
  expect(trails.planned?.map((stop) => stop.label)).toEqual(["Planning", "Deployment", "Shipped from Deployment"])
  expect(recordRoomTrails(trails, state).planned).toBe(trails.planned)
})

it("forgets removed tasks without mutating their recorded history", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: planningFirst })
  const before = recordRoomTrails({}, state)
  state.snapshot.tasks = []
  expect(recordRoomTrails(before, state)).toEqual({})
  expect(before.planned?.map((stop) => stop.label)).toEqual(["Planning"])
})
