import type { RoomFactoryState } from "./rooms"

export interface RoomContractError {
  path: string
  message: string
}

/**
 * Semantic validation for typed host data, not a decoder for untrusted JSON.
 * Pure and non-mutating. Validate the entire candidate state atomically.
 */
export function validateRoomState({ configuration, snapshot }: RoomFactoryState): RoomContractError[] {
  const errors: RoomContractError[] = []
  const error = (path: string, message: string) => errors.push({ path, message })
  const nonempty = (value: string, path: string) => {
    if (!value.trim()) error(path, "Must not be blank")
  }
  function index<T extends { id: string }>(values: T[], path: string): Map<string, T> {
    const result = new Map<string, T>()
    values.forEach((value, i) => {
      nonempty(value.id, `${path}[${i}].id`)
      if (result.has(value.id)) error(`${path}[${i}].id`, "Duplicate ID")
      result.set(value.id, value)
    })
    return result
  }
  const rooms = index(configuration.rooms, "configuration.rooms")
  index(configuration.transitions, "configuration.transitions")
  const agents = index(snapshot.agents, "snapshot.agents")
  const tasks = index(snapshot.tasks, "snapshot.tasks")
  index(snapshot.humanRequests, "snapshot.humanRequests")
  const mainAgent = snapshot.mainAgent
  if (mainAgent) {
    nonempty(mainAgent.id, "snapshot.mainAgent.id")
    if (agents.has(mainAgent.id)) error("snapshot.mainAgent.id", "Duplicate ID")
    nonempty(mainAgent.role, "snapshot.mainAgent.role")
  }

  for (const kind of ["intake", "deployment"] as const) {
    if (configuration.rooms.filter((room) => room.kind === kind).length !== 1) {
      error("configuration.rooms", `Expected exactly one ${kind} room`)
    }
  }
  configuration.rooms.forEach((room, i) => {
    const path = `configuration.rooms[${i}]`
    nonempty(room.label, `${path}.label`)
    nonempty(room.role, `${path}.role`)
    if (room.theme !== undefined) nonempty(room.theme, `${path}.theme`)
    if (room.billboard?.image !== undefined) nonempty(room.billboard.image, `${path}.billboard.image`)
    if (room.billboard?.filter !== undefined && !["linear", "nearest"].includes(room.billboard.filter)) error(`${path}.billboard.filter`, "Expected linear or nearest")
  })
  const outcomes = new Set<string>()
  configuration.transitions.forEach((transition, i) => {
    const path = `configuration.transitions[${i}]`
    const from = rooms.get(transition.from)
    const to = rooms.get(transition.to)
    if (!from) error(`${path}.from`, "Unknown room")
    if (!to) error(`${path}.to`, "Unknown room")
    if (from?.kind === "deployment") error(`${path}.from`, "Deployment is terminal")
    nonempty(transition.outcome, `${path}.outcome`)
    const key = JSON.stringify([transition.from, transition.outcome])
    if (outcomes.has(key)) error(`${path}.outcome`, "Outcome must select one destination per source room")
    outcomes.add(key)
  })
  snapshot.agents.forEach((agent, i) => {
    const room = rooms.get(agent.roomId)
    if (!room) error(`snapshot.agents[${i}].roomId`, "Unknown room")
    else if (room.role !== agent.role) error(`snapshot.agents[${i}].role`, "Agent role must match its room")
  })

  /** The agents a list names, each once, each in the room; the main agent, in no room, may be asked for attention from any. */
  function members(ids: string[], roomId: string, path: string, mainAgentWelcome = false) {
    const seen = new Set<string>()
    ids.forEach((id, i) => {
      if (seen.has(id)) error(`${path}[${i}]`, "Duplicate agent")
      seen.add(id)
      const agent = agents.get(id)
      if (!agent && mainAgentWelcome && mainAgent && id === mainAgent.id) return
      if (!agent) error(`${path}[${i}]`, mainAgent && id === mainAgent.id ? "The main agent holds no task" : "Unknown agent; retain offline agents while referenced")
      else if (agent.roomId !== roomId) error(`${path}[${i}]`, "Agent belongs to another room")
    })
  }
  snapshot.tasks.forEach((task, i) => {
    const path = `snapshot.tasks[${i}]`
    const room = rooms.get(task.at.roomId)
    if (!room) error(`${path}.at.roomId`, "Unknown room")
    if (task.progress !== undefined && (!Number.isFinite(task.progress) || task.progress < 0 || task.progress > 1)) {
      error(`${path}.progress`, "Progress must be finite and between 0 and 1")
    }
    if (task.at.kind === "shipped") {
      if (room && room.kind !== "deployment") error(`${path}.at.roomId`, "Only deployment can ship a task")
      return
    }
    const assignment = task.at.assignment
    if (!assignment) return
    if (assignment.agentIds.length === 0) error(`${path}.at.assignment.agentIds`, "An assignment needs at least one agent")
    members(assignment.agentIds, task.at.roomId, `${path}.at.assignment.agentIds`)
    const completed = new Set<string>()
    assignment.completedAgentIds.forEach((id, j) => {
      if (!assignment.agentIds.includes(id) || completed.has(id)) {
        error(`${path}.at.assignment.completedAgentIds[${j}]`, "Expected a unique assigned agent")
      }
      completed.add(id)
    })
  })
  snapshot.humanRequests.forEach((request, i) => {
    const path = `snapshot.humanRequests[${i}]`
    if (!rooms.has(request.roomId)) error(`${path}.roomId`, "Unknown room")
    nonempty(request.message, `${path}.message`)
    members(request.agentIds, request.roomId, `${path}.agentIds`, true)
    if (request.taskId !== undefined) {
      const task = tasks.get(request.taskId)
      if (!task) error(`${path}.taskId`, "Unknown task")
      else if (task.at.kind === "shipped" || task.at.roomId !== request.roomId) {
        error(`${path}.taskId`, "Request must concern a task held in this room")
      }
    }
  })
  return errors
}
