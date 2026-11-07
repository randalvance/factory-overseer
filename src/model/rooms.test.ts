import { describe, expect, it } from "vitest"
import { afterPlanning, directImplementation, exampleRooms, planningFirst } from "./roomExamples"
import { validateRoomState } from "./roomValidation"
import type { RoomFactoryState } from "./types"

const state = (): RoomFactoryState => structuredClone({ configuration: exampleRooms, snapshot: planningFirst })
const messages = (value: RoomFactoryState) => validateRoomState(value).map((error) => error.message)

it("accepts both intake branches and shared implementation, including a return cycle", () => {
  for (const snapshot of [directImplementation, planningFirst, afterPlanning]) {
    expect(validateRoomState({ configuration: exampleRooms, snapshot })).toEqual([])
  }
})

it("accepts unstaffed and disconnected rooms, room queues and custom theme references", () => {
  const value = state()
  value.configuration.rooms.push({ id: "extra", label: "Extra", role: "planner", kind: "work", theme: "host-theme" })
  value.snapshot.tasks.push({ id: "queued", label: "Waiting for staff", at: { kind: "room", roomId: "extra" } })
  expect(validateRoomState(value)).toEqual([])
})

describe("configuration validation", () => {
  it("reports duplicate IDs and dangling destinations with field paths", () => {
    const value = state()
    value.configuration.rooms.push({ ...value.configuration.rooms[0]! })
    value.configuration.transitions[0]!.to = "missing"
    expect(validateRoomState(value)).toEqual(expect.arrayContaining([
      { path: "configuration.rooms[5].id", message: "Duplicate ID" },
      { path: "configuration.transitions[0].to", message: "Unknown room" },
    ]))
  })
  it("requires one intake and one terminal deployment room", () => {
    const value = state()
    value.configuration.rooms = value.configuration.rooms.filter((room) => room.kind !== "intake")
    value.configuration.transitions.push({ id: "return", from: "deployment", to: "planning", outcome: "rework" })
    expect(messages(value)).toContain("Expected exactly one intake room")
    expect(messages(value)).toContain("Deployment is terminal")
  })
  it("rejects ambiguous routing outcomes but permits distinct outcomes to the same room", () => {
    const value = state()
    value.configuration.transitions.push({ id: "another", from: "intake", to: "planning", outcome: "ready" })
    expect(messages(value)).toContain("Outcome must select one destination per source room")
    value.configuration.transitions.at(-1)!.outcome = "needs-help"
    expect(validateRoomState(value)).toEqual([])
  })
  it("rejects blank role and image references", () => {
    const value = state()
    value.configuration.rooms[0]!.role = " "
    value.configuration.rooms[0]!.billboard = { image: "" }
    expect(validateRoomState(value).filter((error) => error.message === "Must not be blank")).toHaveLength(2)
  })
})

it("rejects unknown billboard filters and accepts smooth or pixel artwork without changing room identity", () => {
  const value = state()
  const room = value.configuration.rooms[1]!
  room.billboard = { image: "/graphics/plan.svg", filter: "blur" } as unknown as NonNullable<typeof room.billboard>
  expect(validateRoomState(value)).toContainEqual({ path: "configuration.rooms[1].billboard.filter", message: "Expected linear or nearest" })
  for (const filter of ["linear", "nearest"] as const) {
    room.billboard = { image: "/graphics/plan.svg", alt: "Planning notes", filter }
    expect(validateRoomState(value)).toEqual([])
  }
})

describe("snapshot validation", () => {
  it("rejects mismatched roles and cross-room task assignments", () => {
    const value = state()
    value.snapshot.agents[0]!.role = "implementer"
    value.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["impl-a"], completedAgentIds: [] } }
    expect(messages(value)).toContain("Agent role must match its room")
    expect(messages(value)).toContain("Agent belongs to another room")
  })
  it("rejects empty, duplicate and unknown assignments and invalid completion subsets", () => {
    const value = state()
    value.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: [], completedAgentIds: ["planner"] } }
    expect(messages(value)).toContain("An assignment needs at least one agent")
    expect(messages(value)).toContain("Expected a unique assigned agent")
    value.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["planner", "planner", "missing"], completedAgentIds: [] } }
    expect(messages(value)).toContain("Duplicate agent")
    expect(messages(value)).toContain("Unknown agent; retain offline agents while referenced")
  })
  it("allows offline members to retain orphaned work", () => {
    const value = state()
    value.snapshot.agents[0]!.status = "offline"
    expect(validateRoomState(value)).toEqual([])
  })
  it("rejects duplicate task, agent and request IDs", () => {
    const value = state()
    value.snapshot.tasks.push(structuredClone(value.snapshot.tasks[0]!))
    value.snapshot.agents.push(structuredClone(value.snapshot.agents[0]!))
    value.snapshot.humanRequests.push(structuredClone(value.snapshot.humanRequests[0]!))
    expect(messages(value).filter((message) => message === "Duplicate ID")).toHaveLength(3)
  })
  it("allows shipping only in deployment and refuses attention requests for shipped tasks", () => {
    const value = state()
    value.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "planning" }
    expect(messages(value)).toContain("Only deployment can ship a task")
    expect(messages(value)).toContain("Request must concern a task held in this room")
    value.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
    value.snapshot.humanRequests = []
    expect(validateRoomState(value)).toEqual([])
  })
  it("rejects requests for missing tasks and agents", () => {
    const value = state()
    value.snapshot.humanRequests[0]!.taskId = "missing"
    value.snapshot.humanRequests[0]!.agentIds = ["missing"]
    expect(messages(value)).toContain("Unknown task")
    expect(messages(value)).toContain("Unknown agent; retain offline agents while referenced")
  })
  it("accepts a main agent in no room, lets requests name it from any room, and keeps it off tasks and out of the agents' ids", () => {
    const value = state()
    value.snapshot.mainAgent = { id: "jarvis", name: "Jarvis", role: "main", status: "working" }
    expect(validateRoomState(value)).toEqual([])
    value.snapshot.humanRequests[0]!.agentIds = ["jarvis"]
    expect(validateRoomState(value)).toEqual([])
    value.snapshot.humanRequests.push({ id: "jarvis:help", roomId: "implementation", agentIds: ["jarvis", "jarvis"], kind: "help", message: "Which repository?" })
    expect(messages(value)).toEqual(["Duplicate agent"])
    value.snapshot.humanRequests.pop()
    value.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["jarvis"], completedAgentIds: [] } }
    expect(messages(value)).toContain("The main agent holds no task")
    value.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning" }
    value.snapshot.humanRequests[0]!.agentIds = ["planner"]
    value.snapshot.mainAgent = { id: "planner", name: "Jarvis", role: "main", status: "idle" }
    expect(validateRoomState(value)).toEqual([{ path: "snapshot.mainAgent.id", message: "Duplicate ID" }])
    value.snapshot.mainAgent = { id: " ", name: "Jarvis", role: "", status: "idle" }
    expect(validateRoomState(value).map((error) => error.path)).toEqual(["snapshot.mainAgent.id", "snapshot.mainAgent.role"])
  })
  it.each([NaN, Infinity, -0.1, 1.1])("rejects invalid progress %s", (progress) => {
    const value = state()
    value.snapshot.tasks[0]!.progress = progress
    expect(messages(value)).toContain("Progress must be finite and between 0 and 1")
  })
  it("validates an atomic room removal without mutating either state", () => {
    const original = state()
    const candidate = structuredClone(original)
    candidate.configuration.rooms = candidate.configuration.rooms.filter((room) => room.id !== "planning")
    expect(messages(candidate)).toContain("Unknown room")
    const before = structuredClone(original)
    expect(validateRoomState(original)).toEqual([])
    expect(original).toEqual(before)
  })
})
