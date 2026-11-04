import { useMemo, useRef, useState } from "react"
import { RoomFactory } from "~/factory/RoomFactory"
import { DEFAULT_PET_ASSETS } from "~/factory/petAssets"
import type { FactoryHandle } from "~/factory/Factory"
import { HumanAttentionPanel, type HumanAnswer } from "./HumanAttentionPanel"
import { changeParticipant, implementationReady } from "./sharedWork"
import { destination } from "./roomDispatch"
import { needsHuman, requestHuman, resolveHuman } from "./humanAttention"
import type { HumanAttentionRequest, RoomFactoryState, RoomTask } from "~/model/types"
import { exampleRooms } from "~/model/roomExamples"
import { ROOM_THEMES, type RoomThemeRegistry } from "~/model/roomThemes"

const DEMO_ROOM_THEMES = {
  "paper-garden": { extends: "research-lab", label: "Paper garden", wall: "#a4b99a", accent: "#5f806b", floor: "kraft-pavers", station: "lab", decoration: "shelves" },
} satisfies RoomThemeRegistry

function opening(): RoomFactoryState {
  return {
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").map((room) => ({ id: room.id + "-1", name: room.label + " agent", roomId: room.id, role: room.role, status: "idle" })),
      tasks: [
        { id: "task-1", label: "Plan a new feature", at: { kind: "room", roomId: "intake" } },
        { id: "task-2", label: "Fix a typo directly", at: { kind: "room", roomId: "intake" } },
      ],
      humanRequests: [],
    },
  }
}

/** A host example for #21: controls change snapshots; the renderer never decides work. */
export function RoutingDemo() {
  const [state, setState] = useState(opening)
  const [sharedTasks, setSharedTasks] = useState<Set<string>>(new Set())
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
  const [controlsInitiallyOpen] = useState(() => window.matchMedia("(min-width: 900px)").matches)
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
  const choices = useMemo(() => state.configuration.rooms.filter((room) => room.kind !== "intake").map((room) => <option key={room.id} value={room.id}>{room.label}</option>), [state.configuration.rooms])

  function moveTo(roomId: string | "shipped") {
    if (needsHuman(state, selected) || (roomId !== "planning" && sharedTasks.has(selected) && !implementationReady(state, selected))) return
    setState((before) => {
      const at = roomId === "shipped" ? { kind: "shipped" as const, roomId: "deployment" } : destination(before, roomId)
      if (at.kind === "room" && roomId === "implementation" && sharedTasks.has(selected)) {
        const agentIds = before.snapshot.agents.filter((agent) => agent.roomId === roomId && agent.status !== "offline").slice(0, 2).map((agent) => agent.id)
        at.assignment = agentIds.length ? { agentIds, completedAgentIds: [] } : undefined
      }
      const tasks = before.snapshot.tasks.map((task) => task.id !== selected ? task : { ...task, at })
      const previous = before.snapshot.tasks.find((task) => task.id === selected)
      const formerMembers = previous?.at.kind === "room" ? previous.at.assignment?.agentIds ?? [] : []
      return { ...before, snapshot: { ...before.snapshot,
        tasks,
        agents: before.snapshot.agents.map((agent) => {
          if (at.kind === "room" && at.assignment?.agentIds.includes(agent.id)) return { ...agent, status: "working" as const }
          const stillAssigned = tasks.some((task) => task.at.kind === "room" && task.at.assignment?.agentIds.includes(agent.id))
          return formerMembers.includes(agent.id) && !stillAssigned ? { ...agent, status: "idle" as const } : agent
        }),
      } }
    })
    if (follow) handle?.focus({ task: selected })
  }
  function shareTask() {
    setSharedTasks((before) => new Set([...before, selected]))
    setState((before) => {
      const members = before.snapshot.agents.filter((agent) => agent.roomId === "implementation" && agent.status !== "offline")
      const added = members.length < 2 ? Array.from({ length: 2 - members.length }, (_, index) => ({
        id: `shared-implementer-${index}`, name: `Implementer ${members.length + index + 1}`,
        roomId: "implementation", role: "implementer", status: "working" as const,
      })) : []
      const agentIds = [...members, ...added].slice(0, 2).map((agent) => agent.id)
      return { ...before, snapshot: { ...before.snapshot,
        agents: [...before.snapshot.agents, ...added].map((agent) => agentIds.includes(agent.id) ? { ...agent, status: "working" as const } : agent),
        tasks: before.snapshot.tasks.map((item) => item.id !== selected ? item : {
          ...item, at: { kind: "room", roomId: "implementation", assignment: { agentIds, completedAgentIds: [] } },
        }),
      } }
    })
  }
  function addTask(needsPlanning: boolean) {
    const id = `task-${state.snapshot.tasks.length + 1}`
    const task: RoomTask = { id, label: needsPlanning ? `Feature ${id}` : `Quick fix ${id}`, at: destination(state, "intake") }
    setState((before) => ({ ...before, snapshot: { ...before.snapshot, tasks: [...before.snapshot.tasks, task] } }))
    setPlanning((before) => ({ ...before, [id]: needsPlanning }))
    setSelected(id)
  }
  function setRoomTheme(theme: string) {
    setState((before) => ({ ...before, configuration: { ...before.configuration,
      rooms: before.configuration.rooms.map((room) => room.id === roomChoice ? { ...room, theme } : room),
    } }))
  }
  function setRoomGraphic(graphic: string) {
    setState((before) => ({ ...before, configuration: { ...before.configuration,
      rooms: before.configuration.rooms.map((room) => {
        if (room.id !== roomChoice) return room
        const name = graphic === "custom" ? "custom-rocket" : graphic === "pixel" ? "pixel-crate" :
          graphic === "unavailable" ? "unavailable" : room.id === "qa" ? "review" : room.id
        return { ...room, billboard: graphic === "default" ? undefined : {
          image: `assets/billboards/${name}.svg`,
          alt: graphic === "custom" ? "Folded paper rocket" : graphic === "pixel" ? "Pixel crate" : room.label,
          filter: graphic === "pixel" ? "nearest" as const : "linear" as const,
        } }
      }),
    } }))
  }
  const graphicImage = state.configuration.rooms.find((room) => room.id === roomChoice)?.billboard?.image
  const graphicChoice = !graphicImage ? "default" : graphicImage.includes("custom-rocket") ? "custom" :
    graphicImage.includes("pixel-crate") ? "pixel" : graphicImage.includes("unavailable") ? "unavailable" : "example"

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
  const shared = sharedTasks.has(selected) && task.at.kind === "room" && task.at.roomId === "implementation"
  const assignment = task.at.kind === "room" ? task.at.assignment : undefined
  const joinBlocked = shared && !implementationReady(state, selected)
  return <main className={new URLSearchParams(location.search).get("art") === "legacy" ? "demo" : "demo paper-demo"}>
    <header className="demo-header routing-demo-header">
      <div className="demo-brand"><h1>Factory Overseer</h1><span>Paper workshop</span></div>
      <div className="demo-controls">
        <section className="demo-control-group demo-task-controls" aria-label="Task controls">
          <h2>Tasks</h2>
          <div className="demo-cluster">
          <label>Task <select aria-label="Task" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {state.snapshot.tasks.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}
          </select></label>
          <button onClick={() => addTask(true)}>Add planning task</button>
          <button onClick={() => addTask(false)}>Add direct task</button>
          <button onClick={() => handle?.inspect({ task: selected })} disabled={!handle}>Inspect task</button>
          <button className="demo-next-action" onClick={() => moveTo(task.at.roomId === "deployment" ? "shipped" : edge!.to)} disabled={!handle || joinBlocked || waitingForHuman || riding.has(selected) || task.at.kind === "shipped" || (!edge && task.at.roomId !== "deployment")}>{routeLabel}</button>
          <button onClick={() => moveTo("planning")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.roomId !== "implementation"}>Return to planning</button>
          </div>
        </section>
        <details className="demo-control-group" open={controlsInitiallyOpen}>
          <summary>Rooms and appearance</summary>
          <div className="demo-cluster">
          <label>Room <select aria-label="Room" value={roomChoice} onChange={(event) => setRoomChoice(event.target.value)}>{choices}</select></label>
          <label>Theme <select aria-label="Room theme" value={state.configuration.rooms.find((room) => room.id === roomChoice)?.theme ?? "factory"} onChange={(event) => setRoomTheme(event.target.value)}>
            {Object.entries(ROOM_THEMES).map(([id, theme]) => <option key={id} value={id}>{theme.label}</option>)}
            {Object.entries(DEMO_ROOM_THEMES).map(([id, theme]) => <option key={id} value={id}>{theme.label} (custom)</option>)}
          </select></label>
          <label>Graphic <select aria-label="Room graphic" value={graphicChoice} onChange={(event) => setRoomGraphic(event.target.value)}>
            <option value="example">Example graphic</option>
            <option value="custom">Custom rocket</option>
            <option value="pixel">Pixel crate</option>
            <option value="default">Built-in default</option>
            <option value="unavailable">Unavailable image</option>
          </select></label>
          <button onClick={addAgent}>Add agent</button>
          <button onClick={togglePlanner} disabled={state.snapshot.humanRequests.some((request) => request.roomId === "planning")}>{plannerPresent ? "Unstaff planning" : "Staff planning"}</button>
          <button onClick={toggleQA} disabled={hasQA && (riding.size > 0 || state.snapshot.tasks.some((task) => task.at.roomId === "qa"))}>{hasQA ? "Remove QA room" : "Include QA room"}</button>
          <button onClick={() => setState((before) => ({ ...before, configuration: { ...before.configuration, transitions: hasBypass ?
            before.configuration.transitions.filter((edge) => edge.id !== "skip-plan") :
            [...before.configuration.transitions, { id: "skip-plan", from: "intake", to: "implementation", outcome: "ready" }] } }))}>{hasBypass ? "Remove bypass" : "Restore bypass"}</button>
          </div>
        </details>
        <details className="demo-control-group" open={controlsInitiallyOpen}>
          <summary>View and assistance</summary>
          <div className="demo-cluster">
          <label>Speed <input type="range" aria-label="Speed" min="0.5" max="8" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />{speed}×</label>
          <label><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />Follow handoffs</label>
          <button onClick={() => handle?.focus({ task: selected })}>Follow task</button>
          <button onClick={() => askForHuman(selected, "help", "What help or clarification does this task need?")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.kind === "shipped"}>Ask for help</button>
          <button onClick={() => askForHuman(selected, "approval", "May this task continue?")} disabled={!handle || waitingForHuman || riding.has(selected) || task.at.kind === "shipped"}>Request approval</button>
          </div>
        </details>
      </div>
      {task.at.kind === "room" && task.at.roomId === "implementation" && <section className="shared-work" aria-label="Shared implementation">
        <button onClick={shareTask} disabled={!handle || waitingForHuman || riding.has(selected)}>Assign two implementers</button>
        {shared && <>
          <span>{assignment?.completedAgentIds.length ?? 0}/{assignment?.agentIds.length ?? 0} complete · {joinBlocked ? "waiting for participants" : "ready to send onward"}</span>
          {assignment?.agentIds.map((id) => {
            const agent = state.snapshot.agents.find((agent) => agent.id === id)!
            const complete = assignment.completedAgentIds.includes(id)
            return <span className="demo-cluster" key={id}>
              <button onClick={() => handle?.inspect({ agent: id })}>{agent.name}</button>
              <span>{complete ? "complete" : agent.status}</span>
              <button disabled={waitingForHuman || riding.has(selected) || complete} onClick={() => setState((before) => changeParticipant(before, selected, id, "complete"))}>Complete {agent.name}</button>
              <button disabled={waitingForHuman || riding.has(selected)} onClick={() => setState((before) => changeParticipant(before, selected, id, "fail"))}>Fail {agent.name}</button>
              <button disabled={waitingForHuman || riding.has(selected)} onClick={() => setState((before) => changeParticipant(before, selected, id, "remove"))}>Unassign {agent.name}</button>
            </span>
          })}
        </>}
      </section>}
      <p className="route-status" role="status">{task.label}: {riding.has(selected) ? "riding to " : task.at.kind === "shipped" ? "shipped from " : "in "}{room.label}{waitingForHuman ? " · waiting for your response" : room.kind === "intake" ? " · ready to route" : task.at.kind === "room" && !task.at.assignment ? " · waiting for assignment" : ""}</p>
    </header>
    <section className="demo-factory">
      <RoomFactory assetBase={import.meta.env.BASE_URL} roomThemes={DEMO_ROOM_THEMES} petAssets={new URLSearchParams(location.search).get("art") === "legacy" ? undefined : DEFAULT_PET_ASSETS} appearance={new URLSearchParams(location.search).get("art") === "legacy" ? "legacy" : "paper"} state={state} speed={speed} width={28} onReady={setHandle}
        onTaskLanded={taskLanded}
        onHumanNeeded={(request) => setNotifications((before) => [...before, request])}
        onLayout={(_layout, motions) => { setRiding(new Set(motions.toPlay.map((motion) => motion.taskId))); setUnrouted(motions.unrouted) }} />
    </section>
    <HumanAttentionPanel state={state} notifications={notifications} answers={answers} onAnswer={answerRequest} />
    {unrouted.length > 0 && <p className="demo-note" role="alert">No conveyor path for {unrouted.join(", ")}. Boxes remain at their last valid position.</p>}
  </main>
}
