import type { Agent, HumanAttentionRequest, RoomFactoryState } from "~/model/types"

/** Host policy: requests hold their tasks; the rendering component never advances them. */
export function needsHuman(state: RoomFactoryState, taskId: string): boolean {
  return state.snapshot.humanRequests.some((request) => request.taskId === taskId)
}

function withRequests(state: RoomFactoryState, requests: HumanAttentionRequest[]): RoomFactoryState {
  const waiting = new Set(requests.flatMap((request) => request.agentIds))
  const previouslyWaiting = new Set(state.snapshot.humanRequests.flatMap((request) => request.agentIds))
  const asked = <A extends Agent>(agent: A): A => waiting.has(agent.id) ? { ...agent, status: "waiting" } :
    agent.status === "waiting" && previouslyWaiting.has(agent.id) ? { ...agent, status: "idle" } : agent
  const { mainAgent } = state.snapshot
  return {
    ...state,
    snapshot: {
      ...state.snapshot,
      humanRequests: requests,
      agents: state.snapshot.agents.map(asked),
      ...(mainAgent ? { mainAgent: asked(mainAgent) } : {}),
    },
  }
}

/** This demo host requests attention without moving or reassigning any task. */
export function requestHuman(state: RoomFactoryState, request: HumanAttentionRequest): RoomFactoryState {
  if (state.snapshot.humanRequests.some((active) => active.id === request.id)) return state
  return withRequests(state, [...state.snapshot.humanRequests, request])
}

/** Resolve one request, optionally replacing it with the next question in the same snapshot. */
export function resolveHuman(state: RoomFactoryState, requestId: string, followUp?: HumanAttentionRequest): RoomFactoryState {
  if (!state.snapshot.humanRequests.some((request) => request.id === requestId)) return state
  const requests = state.snapshot.humanRequests.filter((request) => request.id !== requestId)
  if (followUp) requests.push(followUp)
  return withRequests(state, requests)
}
