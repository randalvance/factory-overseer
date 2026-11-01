import { expect, it } from "vitest"
import { afterPlanning, exampleRooms } from "~/model/roomExamples"
import { counts } from "~/model/counts"
import { roomSnapshotForView, validateRoomUpdate } from "~/model/roomRouting"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { motionsFor, restingTiles } from "~/floor/motion"
import type { RoomFactoryState } from "~/model/types"
import { changeParticipant, implementationReady } from "./sharedWork"
import { requestHuman, resolveHuman } from "./humanAttention"

const opening = (): RoomFactoryState => structuredClone({ configuration: exampleRooms, snapshot: afterPlanning })

it("keeps one box and one count through partial completion, repeat snapshots and the host join", () => {
  const state = opening()
  const view = roomSnapshotForView(state)
  expect(view.assignments?.planned?.agentIds).toEqual(["impl-a", "impl-b"])
  expect(counts(view).inFlight).toBe(1)
  const floor = layoutConfiguredRooms(state)
  expect(floor.boxes).toHaveLength(1)
  expect(implementationReady(state, "planned")).toBe(false)
  const complete = changeParticipant(state, "planned", "impl-b", "complete")
  expect(implementationReady(complete, "planned")).toBe(true)
  expect(complete.snapshot.tasks[0]!.at.roomId).toBe("implementation")
  expect(changeParticipant(complete, "planned", "impl-b", "complete")).toEqual(complete)
  const next = layoutConfiguredRooms(complete, floor)
  expect(next.boxes).toEqual(floor.boxes)
  expect(motionsFor(next, restingTiles(floor), floor).toPlay).toEqual([])
  // The component accepts a host's handoff even with incomplete work.
  const hostOverride = opening()
  hostOverride.snapshot.tasks[0]!.at = { kind: "room", roomId: "review" }
  expect(validateRoomUpdate(state, hostOverride)).toEqual([])
})

it("preserves membership and partial completion through human waiting, failure and rework", () => {
  const state = opening()
  const waiting = requestHuman(state, { id: "help", roomId: "implementation", taskId: "planned", agentIds: ["impl-b"], kind: "help", message: "Clarify?" })
  expect(changeParticipant(waiting, "planned", "impl-b", "complete")).toBe(waiting)
  const failed = changeParticipant(resolveHuman(waiting, "help"), "planned", "impl-b", "fail")
  expect(implementationReady(failed, "planned")).toBe(false)
  expect(failed.snapshot.agents.find((agent) => agent.id === "impl-b")!.status).toBe("error")
  const rework = structuredClone(failed)
  rework.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["planner"], completedAgentIds: [] } }
  expect(validateRoomUpdate(failed, rework)).toEqual([])
  const floor = layoutConfiguredRooms(failed)
  expect(motionsFor(layoutConfiguredRooms(rework, floor), restingTiles(floor), floor).unrouted).toEqual([])
  expect(rework.snapshot.tasks[0]!.id).toBe("planned")
})

it("reanchors once when the first participant leaves and queues when all are unassigned", () => {
  const state = opening()
  const floor = layoutConfiguredRooms(state)
  const remaining = changeParticipant(state, "planned", "impl-a", "remove")
  remaining.snapshot.agents = remaining.snapshot.agents.filter((agent) => agent.id !== "impl-a")
  expect(validateRoomUpdate(state, remaining)).toEqual([])
  const next = layoutConfiguredRooms(remaining, floor)
  expect(next.boxes).toHaveLength(1)
  const motion = motionsFor(next, restingTiles(floor), floor)
  expect(motion.unrouted).toEqual([])
  expect(motion.toPlay).toHaveLength(1)
  const queued = changeParticipant(remaining, "planned", "impl-b", "remove")
  expect(implementationReady(queued, "planned")).toBe(false)
  expect(validateRoomUpdate(remaining, queued)).toEqual([])
  expect(layoutConfiguredRooms(queued, next).boxes[0]!.spot.kind).toBe("queue")
})
