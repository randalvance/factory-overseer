import { useMemo, useRef, useState } from "react"
import { RoomFactory } from "~/factory/RoomFactory"
import type { FactoryHandle } from "~/factory/Factory"
import { HumanAttentionPanel, type HumanAnswer } from "./HumanAttentionPanel"
import { needsHuman, requestHuman, resolveHuman } from "./humanAttention"
import type { HumanAttentionRequest, RoomFactoryState, RoomTask, RoomTaskLocation } from "~/model/types"
import { exampleRooms } from "~/model/roomExamples"

function opening(): RoomFactoryState {
  return {
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-1", name: room.label + " agent", roomId: room.id, role: room.role, status: "idle" })),
      tasks: [
        { id: "task-1", label: "Plan a new feature", at: { kind: "room", roomId: "intake", assignment: { agentIds: ["intake-1"], completedAgentIds: [] } } },
        { id: "task-2", label: "Fix a typo directly", at: { kind: "room", roomId: "intake" } },
      ],
      humanRequests: [],
    },
  }
}

function destination(state: RoomFactoryState, roomId: string): RoomTaskLocation {
  const agent = state.snapshot.agents.find((agent) => agent.roomId === roomId && agent.status !== "offline")
  return { kind: "room", roomId, ...(agent ? { assignment: { agentIds: [agent.id], completedAgentIds: [] } } : {}) }
}

/** A host example for #21: controls change snapshots; the renderer never decides work. */
export function RoutingDemo() {
  const [state, setState] = useState(opening)
  const [notifications, setNotifications] = useState<HumanAttentionRequest[]>([])
  const [answers, setAnswers] = useState<HumanAnswer[]>([])
  const requestSequence = useRef(0)
  const planningRound = useRef(new Map<string, 1 | 2>())
  const [selected, setSelected] = useState("task-1")
  const [planning, setPlanning] = useState<Record<string, boolean>>({ "task-1": true, "task-2": false })
  const [roomChoice, setRoomChoice] = useState("implementation")
  const [speed, setSpeed] = useState(4)
  const [handle, setHandle] = useState<FactoryHandle>()
  const [riding, setRiding] = useState<Set<string>>(new Set())
  const [unrouted, setUnrouted] = useState<string[]>([])
  const [follow, setFollow] = useState(true)
  const task = state.snapshot.tasks.find((task) => task.id === selected)!
  const room = state.configuration.rooms.find((room) => room.id === task.at.roomId)!
  const hasQA = state.configuration.rooms.some((room) => room.id === "qa")
  const hasBypass = state.configuration.transitions.some((edge) => edge.id === "skip-plan")
  const plannerPresent = state.snapshot.agents.some((agent) => agent.roomId === "planning")
  const outcome = task.at.roomId === "intake" && (planning[task.id] || !hasBypass) ? "needs-planning" :
    task.at.roomId === "review" ? "approved" : "ready"
  const edge = state.configuration.transitions.find((edge) => edge.from === task.at.roomId && edge.outcome === outcome)
  const routeLabel = task.at.kind === "shipped" ? "Shipped" : task.at.roomId === "deployment" ? "Ship task" :
    edge ? `Send to ${state.configuration.rooms.find((room) => room.id === edge.to)!.label}` : "No next room"
  const choices = useMemo(() => state.configuration.rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>), [state.configuration.rooms])

  function moveTo(roomId: string | "shipped") {
    if (needsHuman(state, selected)) return
    setState((before) => ({ ...before, snapshot: { ...before.snapshot, tasks: before.snapshot.tasks.map((task) => task.id !== selected ? task : {
      ...task, at: roomId === "shipped" ? { kind: "shipped", roomId: "deployment" } : destination(before, roomId),
    }) } }))
    if (follow) handle?.focus({ task: selected })
  }
  function addTask(needsPlanning: boolean) {
    const id = `task-${state.snapshot.tasks.length + 1}`
    const task: RoomTask = { id, label: needsPlanning ? `Feature ${id}` : `Quick fix ${id}`, at: destination(state, "intake") }
    setState((before) => ({ ...before, snapshot: { ...before.snapshot, tasks: [...before.snapshot.tasks, task] } }))
    setPlanning((before) => ({ ...before, [id]: needsPlanning }))
    setSelected(id)
  }
  function addAgent() {
    setState((before) => {
      const room = before.configuration.rooms.find((room) => room.id === roomChoice)!
      const id = `${room.id}-${before.snapshot.agents.length + 1}`
      return { ...before, snapshot: { ...before.snapshot, agents: [...before.snapshot.agents, { id, name: `${room.label} ${before.snapshot.agents.length + 1}`, roomId: room.id, role: room.role, status: "idle" }] } }
    })
  }
  function toggleQA() {
    setState((before) => ({
      ...before,
      configuration: {
        rooms: hasQA ? before.configuration.rooms.filter((room) => room.id !== "qa") : [...before.configuration.rooms, { id: "qa", label: "QA", role: "qa", kind: "work" }],
        transitions: [
          ...before.configuration.transitions.filter((edge) => !["deploy", "review-qa", "qa-deploy"].includes(edge.id)),
          ...(hasQA ? [{ id: "deploy", from: "review", to: "deployment", outcome: "approved" }] : [
            { id: "review-qa", from: "review", to: "qa", outcome: "approved" },
            { id: "qa-deploy", from: "qa", to: "deployment", outcome: "ready" },
          ]),
        ],
      },
      snapshot: { ...before.snapshot, agents: before.snapshot.agents.filter((agent) => agent.roomId !== "qa") },
    }))
    if (roomChoice === "qa") setRoomChoice("implementation")
  }
  function togglePlanner() {
    setState((before) => ({
      ...before,
      snapshot: {
        ...before.snapshot,
        agents: plannerPresent ? before.snapshot.agents.filter((agent) => agent.roomId !== "planning") :
          [...before.snapshot.agents, { id: "planning-1", name: "Planning agent", role: "planner", roomId: "planning", status: "idle" }],
        tasks: before.snapshot.tasks.map((task) => task.at.kind === "room" && task.at.roomId === "planning" ?
          { ...task, at: plannerPresent ? { kind: "room", roomId: "planning" } : { kind: "room", roomId: "planning", assignment: { agentIds: ["planning-1"], completedAgentIds: [] } } } : task),
      },
    }))
  }
  function askForHuman(taskId: string, kind: HumanAttentionRequest["kind"], message: string, round?: 1 | 2) {
    const task = state.snapshot.tasks.find((task) => task.id === taskId)
    if (!task || task.at.kind === "shipped" || needsHuman(state, taskId)) return
    const request: HumanAttentionRequest = {
      id: `human-${++requestSequence.current}`, taskId, roomId: task.at.roomId,
      agentIds: task.at.assignment?.agentIds ?? [], kind, message,
    }
    if (round) planningRound.current.set(request.id, round)
    setState((before) => needsHuman(before, taskId) ? before : requestHuman(before, request))
  }
  function taskLanded(id: string) {
    setRiding((before) => { const next = new Set(before); next.delete(id); return next })
    const task = state.snapshot.tasks.find((task) => task.id === id)
    if (task?.at.kind === "room" && task.at.roomId === "planning" && task.at.assignment) {
      askForHuman(id, "question", "Who is this feature for, and what should it do?", 1)
    }
  }
  function answerRequest(request: HumanAttentionRequest, response: string) {
    if (!state.snapshot.humanRequests.some((active) => active.id === request.id)) return
    let followUp: HumanAttentionRequest | undefined
    if (planningRound.current.get(request.id) === 1) {
      followUp = { ...request, id: `human-${++requestSequence.current}`, message: "What should count as success, and which constraints matter?" }
      planningRound.current.set(followUp.id, 2)
    }
    setAnswers((before) => [...before, { requestId: request.id, question: request.message, response }])
    setState((before) => resolveHuman(before, request.id, followUp))
  }
  const waitingForHuman = needsHuman(state, selected)
  return <main className="demo">
    <header className="demo-header">
      <h1>Factory Overseer</h1><span>Rooms and human attention</span>
      <div className="demo-controls">
        <span className="demo-cluster">
          <select aria-label="Task" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {state.snapshot.tasks.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}
          </select>
          <button onClick={() => addTask(true)}>Add planning task</button>
          <button onClick={() => addTask(false)}>Add direct task</button>
          <button onClick={() => moveTo(task.at.roomId === "deployment" ? "shipped" : edge!.to)} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.kind === "shipped" || (!edge && task.at.roomId !== "deployment")}>{routeLabel}</button>
          <button onClick={() => moveTo("planning")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.roomId !== "implementation"}>Return to planning</button>
        </span>
        <span className="demo-cluster">
          <select aria-label="Room" value={roomChoice} onChange={(event) => setRoomChoice(event.target.value)}>{choices}</select>
          <button onClick={addAgent}>Add agent</button>
          <button onClick={togglePlanner} disabled={state.snapshot.humanRequests.some((request) => request.roomId === "planning")}>{plannerPresent ? "Unstaff planning" : "Staff planning"}</button>
          <button onClick={toggleQA} disabled={hasQA && (riding.size > 0 || state.snapshot.tasks.some((task) => task.at.roomId === "qa"))}>{hasQA ? "Remove QA room" : "Include QA room"}</button>
          <button onClick={() => setState((before) => ({ ...before, configuration: { ...before.configuration, transitions: hasBypass ?
            before.configuration.transitions.filter((edge) => edge.id !== "skip-plan") :
            [...before.configuration.transitions, { id: "skip-plan", from: "intake", to: "implementation", outcome: "ready" }] } }))}>{hasBypass ? "Remove bypass" : "Restore bypass"}</button>
        </span>
        <span className="demo-cluster">
          <label>Speed <input type="range" aria-label="Speed" min="0.5" max="8" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />{speed}×</label>
          <label><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />Follow handoffs</label>
          <button onClick={() => handle?.focus({ task: selected })}>Follow task</button>
          <button onClick={() => askForHuman(selected, "help", "What help or clarification does this task need?")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.kind === "shipped"}>Ask for help</button>
          <button onClick={() => askForHuman(selected, "approval", "May this task continue?")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.kind === "shipped"}>Request approval</button>
        </span>
      </div>
      <p className="route-status" role="status">{task.label}: {riding.has(selected) ? "riding to " : task.at.kind === "shipped" ? "shipped from " : "in "}{room.label}{waitingForHuman ? " · waiting for your response" : task.at.kind === "room" && !task.at.assignment ? " · waiting for assignment" : ""}</p>
    </header>
    <section className="demo-factory">
      <RoomFactory state={state} speed={speed} width={24} onReady={setHandle}
        onTaskLanded={taskLanded}
        onHumanNeeded={(request) => setNotifications((before) => [...before, request])}
        onLayout={(_layout, motions) => { setRiding(new Set(motions.toPlay.map((motion) => motion.taskId))); setUnrouted(motions.unrouted) }} />
    </section>
    <HumanAttentionPanel state={state} notifications={notifications} answers={answers} onAnswer={answerRequest} />
    {unrouted.length > 0 && <p className="demo-note" role="alert">No conveyor path for {unrouted.join(", ")}. Boxes remain at their last valid position.</p>}
  </main>
}
