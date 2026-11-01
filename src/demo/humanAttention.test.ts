import { expect, it } from "vitest"
import { exampleRooms, planningFirst } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { needsHuman, requestHuman, resolveHuman } from "./humanAttention"

const opening = (): RoomFactoryState => structuredClone({ configuration: exampleRooms, snapshot: planningFirst })

it("holds a task through consecutive planning rounds without moving or duplicating it", () => {
  const state = opening()
  const request = state.snapshot.humanRequests[0]!
  const next = resolveHuman(state, request.id, { ...request, id: "next-round", message: "What are the constraints?" })
  expect(next.snapshot.tasks).toEqual(state.snapshot.tasks)
  expect(next.snapshot.agents.find((agent) => agent.id === "planner")!.status).toBe("waiting")
  expect(next.snapshot.humanRequests.map((request) => request.id)).toEqual(["next-round"])
  expect(needsHuman(next, "planned")).toBe(true)
  const done = resolveHuman(next, "next-round")
  expect(needsHuman(done, "planned")).toBe(false)
  expect(done.snapshot.tasks).toEqual(state.snapshot.tasks)
  expect(done.snapshot.agents.find((agent) => agent.id === "planner")!.status).toBe("idle")
  expect(state.snapshot.humanRequests).toHaveLength(1)
})

it("resolves concurrent requests independently and keeps shared agents waiting", () => {
  const state = opening()
  const request = state.snapshot.humanRequests[0]!
  const concurrent = requestHuman(state, { ...request, id: "another", kind: "approval" })
  expect(requestHuman(concurrent, request)).toBe(concurrent)
  const oneDone = resolveHuman(concurrent, request.id)
  expect(oneDone.snapshot.humanRequests.map((request) => request.id)).toEqual(["another"])
  expect(oneDone.snapshot.agents.find((agent) => agent.id === "planner")!.status).toBe("waiting")
  expect(needsHuman(oneDone, "planned")).toBe(true)
  expect(resolveHuman(oneDone, request.id)).toBe(oneDone)
})

it("leaves unrelated waiting and error states alone when a request is answered", () => {
  const state = opening()
  state.snapshot.agents.find((agent) => agent.id === "impl-a")!.status = "waiting"
  state.snapshot.agents.find((agent) => agent.id === "impl-b")!.status = "error"
  const next = resolveHuman(state, state.snapshot.humanRequests[0]!.id)
  expect(next.snapshot.agents.find((agent) => agent.id === "impl-a")!.status).toBe("waiting")
  expect(next.snapshot.agents.find((agent) => agent.id === "impl-b")!.status).toBe("error")
})
