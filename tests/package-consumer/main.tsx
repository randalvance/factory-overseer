import { useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Factory, RoomFactory, DEFAULT_PET_ASSETS, ROOM_THEMES,
  type FactoryHandle, type FactoryProps, type RoomFactoryState,
  type RoomFactoryProps, type OnHumanNeeded, type RenderMetrics,
  type RoomThemeRegistry, type PetAssets, type Layout, type Motions,
} from "factory-overseer"
import "factory-overseer/styles.css"

const initial: RoomFactoryState = {
  configuration: {
    rooms: [
      { id: "intake", label: "Intake", role: "router", kind: "intake" },
      { id: "planning", label: "Planning", role: "planner", kind: "work", theme: "studio", billboard: { image: "assets/billboards/planning.svg" } },
      { id: "implementation", label: "Implementation", role: "implementer", kind: "work", theme: "foundry" },
      { id: "review", label: "Review", role: "reviewer", kind: "work", theme: "factory" },
      { id: "deployment", label: "Deployment", role: "deployer", kind: "deployment", theme: "fabrication-plant" },
    ],
    transitions: [
      { id: "start", from: "intake", to: "planning", outcome: "plan" },
      { id: "implement", from: "planning", to: "implementation", outcome: "ready" },
      { id: "review", from: "implementation", to: "review", outcome: "ready" },
      { id: "deploy", from: "review", to: "deployment", outcome: "ready" },
    ],
  },
  snapshot: {
    agents: [{ id: "planner", name: "Package planner", role: "planner", roomId: "planning", status: "waiting" }],
    tasks: [{ id: "task", label: "Package task", at: { kind: "room", roomId: "planning", assignment: { agentIds: ["planner"], completedAgentIds: [] } } }],
    humanRequests: [{ id: "question", roomId: "planning", taskId: "task", agentIds: ["planner"], kind: "question", message: "Confirm the packaged factory" }],
  },
}

function Consumer() {
  const [state, setState] = useState(initial)
  const [handle, setHandle] = useState<FactoryHandle>()
  const [notice, setNotice] = useState("")
  const [legacy, setLegacy] = useState(false)
  const petAssets: PetAssets = DEFAULT_PET_ASSETS
  const roomThemes: RoomThemeRegistry = { studio: { extends: "research-lab", wall: "#c5d4de" } }
  if (!ROOM_THEMES.foundry) throw new Error("Missing theme presets")
  const onHumanNeeded: OnHumanNeeded = (request) => setNotice(request.message)
  const onRenderMetrics = (_metrics: RenderMetrics) => {}
  const onLayout = (_layout: Layout, _motions: Motions) => {}
  const common = { assetBase: "/host/static/factory", onReady: setHandle, onRenderMetrics, onLayout }
  const props: RoomFactoryProps = { ...common, state, petAssets, roomThemes, onHumanNeeded, width: 28 }
  const legacyProps: FactoryProps = {
    ...common, pipeline: { roles: ["implementer"] },
    agents: [{ id: "legacy", name: "Legacy worker", role: "implementer", status: "working", sprite: 1 }],
    tasks: [{ id: "legacy-task", label: "Legacy package task", at: { agent: "legacy" } }],
  }
  return <>
    <output aria-label="Host question">{notice}</output>
    <button onClick={() => { setState({ ...state, snapshot: { ...state.snapshot, humanRequests: [] } }); setNotice("Answered") }}>Answer</button>
    <button onClick={() => handle?.inspect({ task: legacy ? "legacy-task" : "task" })}>Inspect</button>
    <button onClick={() => handle?.fitAll()}>Fit</button>
    <button onClick={() => handle?.reorganize()}>Compact</button>
    <button onClick={() => { setHandle(undefined); setLegacy(!legacy) }}>Switch appearance</button>
    <div style={{ position: "relative", height: 600 }}>
      {legacy ? <Factory {...legacyProps} /> : <RoomFactory {...props} />}
    </div>
  </>
}
createRoot(document.getElementById("root")!).render(<Consumer />)
