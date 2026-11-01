// The demo's stand-in for a host (ADR 0009): it moves tasks through the
// pipeline beat by beat, with occasional rework, waiting and errors, and
// hands out snapshots the way a host would. Pure: a beat and every control
// are functions of the runtime, and every chance taken is a hash of the seed
// and the decision, so the same run plays the same way every time. Nothing
// here knows about the floor. An agent's queue holds the box on its bench
// and one waiting, no more: the intake hands out only to a clear bench, and
// finished work with nowhere to go waits on the bench, the agent done.

import type { AgentStatus } from "~/model/status"
import { tasksAt } from "~/model/tasks"
import type { Agent, Pipeline, Snapshot, Task, TaskLocation } from "~/model/types"

/** What a spell of trouble shows as: waiting on something, or in error. */
export type TroubleStatus = "waiting" | "error"

/** A spell that keeps an agent from its work: what it shows as, what the agent says about it, and how many beats of it are left. */
export interface Trouble {
  status: TroubleStatus
  activity: string
  beats: number
}

export interface RuntimeAgent {
  id: string
  name: string
  role: string
  trouble?: Trouble
  /** The beat it last handed work on, when it shows a check. */
  handedOnAt?: number
  /** On its way out: offline this beat, departed the next. */
  leaving?: boolean
}

export interface RuntimeTask {
  id: string
  label: string
  at: TaskLocation
  /** The role whose work it is at or bound for; none before the first. */
  role?: string
  /** Beats of the role's work done on it, or of the inspector's. */
  beatsDone: number
}

export interface Runtime {
  /** What every chance the runtime takes is hashed with: the same seed plays the same way. */
  seed: number
  /** How many beats have passed since the opening. */
  beat: number
  pipeline: Pipeline
  agents: RuntimeAgent[]
  tasks: RuntimeTask[]
  /** How many have been hired since the opening, for their names and ids. */
  hired: number
  /** The number of the last task to arrive, for the next one's id. */
  lastArrival: number
}

/** How many tasks an agent's queue holds: the one on its bench and one waiting. */
const QUEUE_LIMIT = 2
/** Beats of work a role's agent puts into a task; two for a role not listed. */
const BEATS_OF_WORK: Readonly<Record<string, number>> = { implementer: 3, reviewer: 2, qa: 2 }
const DEFAULT_BEATS_OF_WORK = 2
/** Beats a task waits at the staging area for the inspector's review. */
const BEATS_OF_REVIEW = 2
const BEATS_OF_TROUBLE = 2
/** A new task arrives every this many beats, while fewer than this many are on the floor. */
const ARRIVAL_EVERY = 4
const MOST_ON_THE_FLOOR = 6
/** The odds of each chance the runtime takes: rework at a handoff, rework by the inspector, and trouble each beat an agent is at work. */
const ODDS = { reworkAtAHandoff: 0.2, reworkByTheInspector: 0.25, trouble: 0.06 }
/** The seed the demo opens with: one whose first beats run clean, so the smoke test can count on them. */
const OPENING_SEED = 4

/** What an agent says it is doing with a task, by the task's number; a role not listed says the usual. */
const WORK_ACTIVITIES: Readonly<Record<string, readonly string[]>> = {
  implementer: ["Fixing the tests", "Writing the parser", "Wiring the API"],
  reviewer: ["Checking the tests", "Reading the diff", "Leaving comments"],
  qa: ["Trying the edge cases", "Running the suite", "Checking the build"],
}
const USUAL_WORK_ACTIVITIES: readonly string[] = ["Looking it over", "Getting it done"]
const WAITING_ACTIVITIES: readonly string[] = ["Needs the API key", "Needs a staging token", "Waiting on CI"]
const ERROR_ACTIVITIES: readonly string[] = ["The build is broken", "Tests are failing", "Out of disk"]
/** Who joins, in hiring order, whatever the role. */
const HIRES = ["Barbara", "Dennis", "Edsger", "Frances", "Hedy", "Ken", "Margaret", "Niklaus"]
/** How the opening roles' ids begin; another role's begin with the role. */
const ID_PREFIX: Readonly<Record<string, string>> = { implementer: "imp", reviewer: "rev", qa: "qa" }

/** The floor as a host would describe it one moment into a run: three agents at work and eight tasks along the line. */
export function opening(seed = OPENING_SEED): Runtime {
  return {
    seed,
    beat: 0,
    pipeline: { roles: ["implementer", "reviewer", "qa"] },
    agents: [
      { id: "imp-1", name: "Ada", role: "implementer" },
      { id: "rev-1", name: "Grace", role: "reviewer" },
      { id: "qa-1", name: "Linus", role: "qa", trouble: { status: "waiting", activity: "Needs a staging token", beats: BEATS_OF_TROUBLE } },
    ],
    tasks: [
      { id: "t-41", label: "t-41", at: "intake", beatsDone: 0 },
      { id: "t-42", label: "t-42", at: "intake", beatsDone: 0 },
      { id: "t-37", label: "t-37", at: { agent: "imp-1" }, role: "implementer", beatsDone: 2 },
      { id: "t-38", label: "t-38", at: { agent: "imp-1" }, role: "implementer", beatsDone: 0 },
      { id: "t-35", label: "t-35", at: { agent: "qa-1" }, role: "qa", beatsDone: 0 },
      { id: "t-31", label: "t-31", at: "staging", role: "qa", beatsDone: 0 },
      { id: "t-29", label: "t-29", at: "shipped", role: "qa", beatsDone: 0 },
      { id: "t-30", label: "t-30", at: "shipped", role: "qa", beatsDone: 0 },
    ],
    hired: 0,
    lastArrival: 42,
  }
}

/** The runtime as a host reports it: each agent's status and what it says, each task's place and progress, nothing more. */
export function snapshotOf(runtime: Runtime): Snapshot {
  const agents = runtime.agents.map((agent): Agent => {
    const bench = tasksAt(runtime.tasks, agent.id)[0]
    const status = statusOf(agent, bench, runtime.beat)
    const activity = agent.leaving ? undefined : agent.trouble ? agent.trouble.activity : status === "working" && bench ? workActivity(agent.role, bench) : undefined
    const reported: Agent = { id: agent.id, name: agent.name, role: agent.role, status }
    return activity ? { ...reported, activity } : reported
  })
  const tasks = runtime.tasks.map((task): Task => {
    const onBench = typeof task.at === "object" && tasksAt(runtime.tasks, task.at.agent)[0] === task
    const reported: Task = { id: task.id, label: task.label, at: task.at }
    return onBench && task.beatsDone > 0 ? { ...reported, progress: task.beatsDone / beatsOfWork(task.role) } : reported
  })
  return { agents, tasks }
}

/**
 * One beat of the clock: spells of trouble run their course, work advances
 * and is handed on, the inspector decides, whoever was leaving has departed
 * and the work left behind is handed to whoever can take it, the intake
 * gives out, and now and then a task arrives.
 */
export function nextBeat(runtime: Runtime): Runtime {
  const next: Runtime = { ...runtime, beat: runtime.beat + 1 }
  return arrivals(dispatched(leftBehind(departed(reviewed(worked(troubled(next)), next.tasks)))))
}

/** The name of a role new to the pipeline. */
export function nextRole(pipeline: Pipeline): string {
  return `role-${pipeline.roles.length + 1}`
}

/** Someone new joins in the role, named in hiring order. A role new to the pipeline goes in before the last, so its bay is laid at the end of the line out of order until the overseer reorganizes. */
export function withAgent(runtime: Runtime, role: string): Runtime {
  const hired = runtime.hired + 1
  const agent: RuntimeAgent = { id: `${ID_PREFIX[role] ?? role}-${hired + 1}`, name: HIRES[(hired - 1) % HIRES.length]!, role }
  const { roles } = runtime.pipeline
  const pipeline = roles.includes(role) ? runtime.pipeline : { roles: [...roles.slice(0, -1), role, ...roles.slice(-1)] }
  return { ...runtime, hired, pipeline, agents: [...runtime.agents, agent] }
}

/** The agent is on its way out: offline this beat, departed the next, its work handed to whoever can take it. */
export function withoutAgent(runtime: Runtime, agentId: string): Runtime {
  return { ...runtime, agents: runtime.agents.map((agent) => (agent.id === agentId ? { ...agent, leaving: true } : agent)) }
}

/** A new task arrives at the intake, numbered on from the last. */
export function withTask(runtime: Runtime): Runtime {
  const lastArrival = runtime.lastArrival + 1
  const id = `t-${lastArrival}`
  return { ...runtime, lastArrival, tasks: [...runtime.tasks, { id, label: id, at: "intake", beatsDone: 0 }] }
}

/** Whether the task has somewhere to go back to as rework, with room in a queue there: from a bay past the first, the bay before; from the first, another lane of it; from the staging area, the last bay. */
export function reworkable(runtime: Runtime, taskId: string): boolean {
  const task = runtime.tasks.find((t) => t.id === taskId)
  return task !== undefined && backFrom(runtime, task) !== undefined
}

/** The task goes back as rework, now, last in that queue. */
export function withRework(runtime: Runtime, taskId: string): Runtime {
  const task = runtime.tasks.find((t) => t.id === taskId)
  const back = task && backFrom(runtime, task)
  return task && back ? { ...runtime, tasks: placed(runtime.tasks, task, { agent: back.id }, back.role) } : runtime
}

/** The agent runs into trouble, as the overseer asks: waiting or in error, this beat and the next. */
export function withTrouble(runtime: Runtime, agentId: string, status: TroubleStatus): Runtime {
  return { ...runtime, agents: runtime.agents.map((agent, i) => (agent.id === agentId ? { ...agent, trouble: troubleOf(status, runtime.beat + i) } : agent)) }
}

// ---------------------------------------------------------------- a beat, part by part

/** Spells of trouble run their course; now and then a new one strikes an agent at work. */
function troubled(state: Runtime): Runtime {
  const agents = state.agents.map((agent, i): RuntimeAgent => {
    if (agent.trouble) {
      const beats = agent.trouble.beats - 1
      return beats > 0 ? { ...agent, trouble: { ...agent.trouble, beats } } : { ...agent, trouble: undefined }
    }
    if (agent.leaving || !tasksAt(state.tasks, agent.id)[0] || !chance(state.seed, `trouble:${agent.id}:${state.beat}`, ODDS.trouble)) return agent
    return { ...agent, trouble: troubleOf(chance(state.seed, `error:${agent.id}:${state.beat}`, 0.5) ? "error" : "waiting", state.beat + i) }
  })
  return { ...state, agents }
}

/** Every agent free to work puts a beat into the task on its bench; finished work goes on, or now and then back as rework, or waits on the bench while there is no room for it. */
function worked(state: Runtime): Runtime {
  let tasks = state.tasks
  const agents = state.agents.map((agent): RuntimeAgent => {
    const task = agent.trouble || agent.leaving ? undefined : tasksAt(state.tasks, agent.id)[0]
    if (!task) return agent
    const needed = beatsOfWork(agent.role)
    const beatsDone = Math.min(task.beatsDone + 1, needed)
    const handed = beatsDone === needed ? handedOn(state, tasks, task, agent) : undefined
    tasks = handed ?? tasks.map((t) => (t.id === task.id ? { ...t, beatsDone } : t))
    return handed ? { ...agent, handedOnAt: state.beat } : agent
  })
  return { ...state, agents, tasks }
}

/** Finished work handed on: now and then back as rework, else on to the next role with anyone in it, or to the inspector past the last; nothing, while the queue it is bound for is full. */
function handedOn(state: Runtime, tasks: RuntimeTask[], task: RuntimeTask, from: RuntimeAgent): RuntimeTask[] | undefined {
  const back = reworkTaker(state, tasks, from.role, from.id)
  if (back && chance(state.seed, `rework:${task.id}:${state.beat}`, ODDS.reworkAtAHandoff)) return placed(tasks, task, { agent: back.id }, back.role)
  const next = roleWithAnyone(state.agents, rolesAfter(state.pipeline, from.role))
  if (!next) return placed(tasks, task, "staging", task.role)
  const taker = roomIn(state.agents, tasks, next)
  return taker ? placed(tasks, task, { agent: taker.id }, taker.role) : undefined
}

/** The inspector looks over what was at the staging area as the beat began, passes what has waited long enough, and now and then hands it back to the last bay with room as rework. */
function reviewed(state: Runtime, atTheStart: RuntimeTask[]): Runtime {
  const waiting = new Set(atTheStart.filter((task) => task.at === "staging").map((task) => task.id))
  let tasks = state.tasks
  for (const task of state.tasks) {
    if (task.at !== "staging" || !waiting.has(task.id)) continue
    const beatsDone = task.beatsDone + 1
    if (beatsDone < BEATS_OF_REVIEW) {
      tasks = tasks.map((t) => (t.id === task.id ? { ...t, beatsDone } : t))
      continue
    }
    const back = takerAmong(state.agents, tasks, lastRolesFirst(state.pipeline))
    tasks = back && chance(state.seed, `rework-by-the-inspector:${task.id}:${state.beat}`, ODDS.reworkByTheInspector) ? placed(tasks, task, { agent: back.id }, back.role) : placed(tasks, task, "shipped", task.role)
  }
  return { ...state, tasks }
}

/** The intake's tasks go out in arrival order, each to an agent of the first role with anyone in it, from the role it was at on, whose bench is clear; the rest stay on the pile. */
function dispatched(state: Runtime): Runtime {
  let tasks = state.tasks
  for (const task of state.tasks) {
    if (task.at !== "intake") continue
    const role = roleWithAnyone(state.agents, task.role ? [task.role, ...rolesAfter(state.pipeline, task.role)] : state.pipeline.roles)
    const agent = role && staying(state.agents, role).find((a) => tasksAt(tasks, a.id).length === 0)
    if (agent) tasks = placed(tasks, task, { agent: agent.id }, agent.role)
  }
  return { ...state, tasks }
}

/** Now and then a new task arrives, while the floor is not too full. */
function arrivals(state: Runtime): Runtime {
  const onTheFloor = state.tasks.filter((task) => task.at !== "shipped").length
  return state.beat % ARRIVAL_EVERY === 0 && onTheFloor < MOST_ON_THE_FLOOR ? withTask(state) : state
}

/** The agents on their way out depart; their work stays where it is until someone takes it. */
function departed(state: Runtime): Runtime {
  return state.agents.some((agent) => agent.leaving) ? { ...state, agents: state.agents.filter((agent) => !agent.leaving) } : state
}

/** Work at an agent who has departed goes, in queue order, to whoever can take it: another of the role with room, else the next role with anyone and room; the rest waits on the vacant bench. */
function leftBehind(state: Runtime): Runtime {
  const present = new Set(state.agents.map((agent) => agent.id))
  let tasks = state.tasks
  for (const task of state.tasks) {
    if (typeof task.at !== "object" || present.has(task.at.agent)) continue
    const roles = task.role ? [task.role, ...rolesAfter(state.pipeline, task.role)] : state.pipeline.roles
    const taker = takerAmong(state.agents, tasks, roles)
    if (taker) tasks = placed(tasks, task, { agent: taker.id }, taker.role)
  }
  return { ...state, tasks }
}

// ---------------------------------------------------------------- what the parts share

function statusOf(agent: RuntimeAgent, bench: RuntimeTask | undefined, beat: number): AgentStatus {
  if (agent.leaving) return "offline"
  if (agent.trouble) return agent.trouble.status
  if (agent.handedOnAt === beat || (bench && bench.beatsDone >= beatsOfWork(agent.role))) return "done"
  return bench ? "working" : "idle"
}

function workActivity(role: string, task: RuntimeTask): string {
  const activities = WORK_ACTIVITIES[role] ?? USUAL_WORK_ACTIVITIES
  return activities[Number.parseInt(task.id.replace(/\D/g, ""), 10) % activities.length]!
}

/** A fresh spell of trouble, saying one of the things said about it, by the number given. */
function troubleOf(status: TroubleStatus, n: number): Trouble {
  const activities = status === "error" ? ERROR_ACTIVITIES : WAITING_ACTIVITIES
  return { status, activity: activities[n % activities.length]!, beats: BEATS_OF_TROUBLE }
}

function beatsOfWork(role: string | undefined): number {
  return (role && BEATS_OF_WORK[role]) || DEFAULT_BEATS_OF_WORK
}

/** The roles after the given one in the pipeline; all of them before the first. */
function rolesAfter(pipeline: Pipeline, role: string | undefined): string[] {
  return pipeline.roles.slice(role ? pipeline.roles.indexOf(role) + 1 : 0)
}

/** The roles before the given one, nearest first. */
function rolesBefore(pipeline: Pipeline, role: string): string[] {
  return pipeline.roles.slice(0, Math.max(pipeline.roles.indexOf(role), 0)).reverse()
}

/** Every role, the last first: the way the inspector looks for a bay to send work back to. */
function lastRolesFirst(pipeline: Pipeline): string[] {
  return [...pipeline.roles].reverse()
}

/** The agents of the role who are staying, in hiring order. */
function staying(agents: RuntimeAgent[], role: string): RuntimeAgent[] {
  return agents.filter((agent) => agent.role === role && !agent.leaving)
}

/** The first of the roles with anyone staying in it. */
function roleWithAnyone(agents: RuntimeAgent[], roles: string[]): string | undefined {
  return roles.find((role) => staying(agents, role).length > 0)
}

/** Who in the role takes the next task: of those not ruled out, the one with the shortest queue, the earliest hired first, if it has room. */
function roomIn(agents: RuntimeAgent[], tasks: RuntimeTask[], role: string, except?: string): RuntimeAgent | undefined {
  let best: { agent: RuntimeAgent; length: number } | undefined
  for (const agent of staying(agents, role)) {
    if (agent.id === except) continue
    const length = tasksAt(tasks, agent.id).length
    if (!best || length < best.length) best = { agent, length }
  }
  return best && best.length < QUEUE_LIMIT ? best.agent : undefined
}

/** Who takes the task next: in the first of the roles with anyone in it, whoever has room; nobody while that role's queues are full. */
function takerAmong(agents: RuntimeAgent[], tasks: RuntimeTask[], roles: string[]): RuntimeAgent | undefined {
  const role = roleWithAnyone(agents, roles)
  return role ? roomIn(agents, tasks, role) : undefined
}

/** Who takes work back from an agent of the role as rework: someone in the bay before with room, or from the first bay, someone in another lane of it. */
function reworkTaker(state: Runtime, tasks: RuntimeTask[], role: string, fromAgentId: string): RuntimeAgent | undefined {
  const before = rolesBefore(state.pipeline, role)
  return before.length > 0 ? takerAmong(state.agents, tasks, before) : roomIn(state.agents, tasks, role, fromAgentId)
}

/** Who a task would go back to as rework: from a bay, as from its agent; from the staging area, someone in the last bay; from anywhere else, or with no room there, nobody. */
function backFrom(runtime: Runtime, task: RuntimeTask): RuntimeAgent | undefined {
  if (task.at === "staging") return takerAmong(runtime.agents, runtime.tasks, lastRolesFirst(runtime.pipeline))
  if (typeof task.at === "object" && task.role) return reworkTaker(runtime, runtime.tasks, task.role, task.at.agent)
  return undefined
}

/** The task put somewhere afresh, last in the list: at an agent, at the start of that role's work, or at the staging area or shipped. */
function placed(tasks: RuntimeTask[], task: RuntimeTask, at: TaskLocation, role: string | undefined): RuntimeTask[] {
  return [...tasks.filter((t) => t.id !== task.id), { ...task, at, role, beatsDone: 0 }]
}

/**
 * Whether a chance, named by what is decided and when, falls under the odds:
 * the same way every time for the seed, and on its own whatever else is
 * decided. An FNV-1a hash of the key, mixed with the seed, then stirred so
 * that keys differing in one character, the beat's digit say, come out
 * unalike.
 */
function chance(seed: number, key: string, odds: number): boolean {
  let hash = (2166136261 ^ Math.imul(seed, 2654435761)) >>> 0
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0
  hash ^= hash >>> 16
  return (hash >>> 0) / 4294967296 < odds
}
