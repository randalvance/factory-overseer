import { expect, it } from "vitest"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { destination } from "./roomDispatch"

function state(): RoomFactoryState {
  return { configuration: structuredClone(exampleRooms), snapshot: {
    agents: Array.from({ length: 6 }, (_, i) => ({ id: `impl-${i + 1}`, name: `Implementer ${i + 1}`, roomId: "implementation", role: "implementer", status: "idle" as const })),
    tasks: [], humanRequests: [],
  } }
}

function dispatch(value: RoomFactoryState, id: string) {
  const at = destination(value, "implementation")
  value.snapshot.tasks.push({ id, label: id, at })
  if (at.kind !== "room") throw new Error("Expected room destination")
  const agentId = at.assignment?.agentIds[0]
  for (const agent of value.snapshot.agents) if (agent.id === agentId) agent.status = "working"
  return agentId
}

it("gives six direct tasks to six implementers before queuing a seventh", () => {
  const value = state()
  const assigned = Array.from({ length: 6 }, (_, i) => dispatch(value, `task-${i}`))
  expect(assigned).toEqual(value.snapshot.agents.map((agent) => agent.id))
  expect(dispatch(value, "overflow")).toBe("impl-1")
  expect(dispatch(value, "next-overflow")).toBe("impl-2")
})

it("reuses an agent whose task has left instead of choosing the first busy agent", () => {
  const value = state()
  for (let i = 0; i < 6; i++) dispatch(value, `task-${i}`)
  value.snapshot.tasks[3]!.at = { kind: "room", roomId: "review" }
  value.snapshot.agents[3]!.status = "idle"
  expect(dispatch(value, "new-work")).toBe("impl-4")
})

it("counts shared participants and completed work until their task leaves the room", () => {
  const value = state()
  value.snapshot.tasks.push({ id: "shared", label: "Shared", at: { kind: "room", roomId: "implementation", assignment: {
    agentIds: ["impl-1", "impl-2"], completedAgentIds: ["impl-2"],
  } } })
  value.snapshot.agents[0]!.status = "working"
  value.snapshot.agents[1]!.status = "done"
  expect(dispatch(value, "next")).toBe("impl-3")
})

it("uses actual assignment load even when a host has left an occupied agent idle", () => {
  const value = state()
  value.snapshot.tasks.push({ id: "occupied", label: "Occupied", at: { kind: "room", roomId: "implementation", assignment: {
    agentIds: ["impl-1"], completedAgentIds: [],
  } } })
  expect(dispatch(value, "next")).toBe("impl-2")
})

it("prefers an idle worker over an equally loaded busy worker and stays in the requested room", () => {
  const value = state()
  value.snapshot.agents[0]!.status = "working"
  value.snapshot.agents.unshift({ id: "other", name: "Other room", roomId: "review", role: "implementer", status: "idle" })
  const before = structuredClone(value)
  expect(destination(value, "implementation")).toMatchObject({ assignment: { agentIds: ["impl-2"] } })
  expect(value).toEqual(before)
})

it.each(["offline", "waiting", "error"] as const)("does not send new work to a %s agent", (status) => {
  const value = state()
  value.snapshot.agents[0]!.status = status
  expect(dispatch(value, "next")).toBe("impl-2")
  value.snapshot.agents = [value.snapshot.agents[0]!]
  expect(destination(value, "implementation")).toEqual({ kind: "room", roomId: "implementation" })
})

it("keeps an unstaffed destination queued without inventing an assignment", () => {
  expect(destination(state(), "planning")).toEqual({ kind: "room", roomId: "planning" })
})
