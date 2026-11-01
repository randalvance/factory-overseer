import type { RoomConfiguration, RoomSnapshot } from "./rooms"

export const exampleRooms: RoomConfiguration = {
  rooms: [
    { id: "intake", label: "Task intake", role: "router", kind: "intake", theme: "factory" },
    { id: "planning", label: "Planning", role: "planner", kind: "work", theme: "research-lab", billboard: { image: "/assets/rooms/planning.png" } },
    { id: "implementation", label: "Implementation", role: "implementer", kind: "work", theme: "foundry" },
    { id: "review", label: "Code review", role: "reviewer", kind: "work", theme: "factory" },
    { id: "deployment", label: "Deployment", role: "deployer", kind: "deployment", theme: "fabrication-plant" },
  ],
  transitions: [
    { id: "plan", from: "intake", to: "planning", outcome: "needs-planning" },
    { id: "skip-plan", from: "intake", to: "implementation", outcome: "ready" },
    { id: "implement", from: "planning", to: "implementation", outcome: "ready" },
    { id: "replan", from: "implementation", to: "planning", outcome: "rework" },
    { id: "review", from: "implementation", to: "review", outcome: "ready" },
    { id: "deploy", from: "review", to: "deployment", outcome: "approved" },
  ],
}

const agents: RoomSnapshot["agents"] = [
  { id: "planner", name: "Planner", role: "planner", roomId: "planning", status: "waiting" },
  { id: "impl-a", name: "Implementer A", role: "implementer", roomId: "implementation", status: "working" },
  { id: "impl-b", name: "Implementer B", role: "implementer", roomId: "implementation", status: "working" },
]

/** Host selected intake's ready outcome; the task skipped planning. */
export const directImplementation: RoomSnapshot = {
  agents,
  tasks: [{ id: "direct", label: "Fix typo", at: { kind: "room", roomId: "implementation", assignment: { agentIds: ["impl-a"], completedAgentIds: [] } } }],
  humanRequests: [],
}

/** Host selected needs-planning and is waiting for the first answer. */
export const planningFirst: RoomSnapshot = {
  agents,
  tasks: [{ id: "planned", label: "Build feature", at: { kind: "room", roomId: "planning", assignment: { agentIds: ["planner"], completedAgentIds: [] } } }],
  humanRequests: [{ id: "planned:question:1", roomId: "planning", taskId: "planned", agentIds: ["planner"], kind: "question", message: "Who should be able to deploy this feature?" }],
}

/** After answering, the host removes the request and assigns both implementers. */
export const afterPlanning: RoomSnapshot = {
  agents: agents.map((agent) => agent.id === "planner" ? { ...agent, status: "idle" } : agent),
  tasks: [{ id: "planned", label: "Build feature", at: { kind: "room", roomId: "implementation", assignment: { agentIds: ["impl-a", "impl-b"], completedAgentIds: ["impl-a"] } } }],
  humanRequests: [],
}
