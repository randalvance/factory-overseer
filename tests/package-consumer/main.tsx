import { useState } from "react"
import { createRoot } from "react-dom/client"
import {
  RoomFactory, DEFAULT_PET_ASSETS, ROOM_THEMES, BIOMES, DEFAULT_BIOME,
  type FactoryHandle, type HopperDrop, type Biome, type RoomFactoryState,
  type RoomFactoryProps, type OnHumanNeeded, type RenderMetrics,
  type RoomThemeRegistry, type PetAssets, type Layout, type Motions,
} from "factory-overseer"
import "factory-overseer/styles.css"

// Retired API must stay absent from the package's public declarations.
// @ts-expect-error the legacy component is no longer exported
import type { Factory } from "factory-overseer"
// @ts-expect-error the legacy pipeline API is no longer exported
import type { Pipeline } from "factory-overseer"
// @ts-expect-error legacy pixel-sheet wardrobes are no longer exported
import type { Wardrobes } from "factory-overseer"
// @ts-expect-error paper is the sole appearance
const retiredAppearance: RoomFactoryProps["appearance"] = "pixel"
// @ts-expect-error room agents select paper assets through petAssets
const retiredSprite: RoomFactoryState["snapshot"]["agents"][number]["sprite"] = 1

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
  const petAssets: PetAssets = DEFAULT_PET_ASSETS
  const roomThemes: RoomThemeRegistry = { studio: { extends: "research-lab", wall: "#c5d4de" } }
  if (!ROOM_THEMES.foundry) throw new Error("Missing theme presets")
  const onHumanNeeded: OnHumanNeeded = (request) => setNotice(request.message)
  const onRenderMetrics = (_metrics: RenderMetrics) => {}
  const onLayout = (_layout: Layout, _motions: Motions) => {}
  const common = { assetBase: "/host/static/factory", onReady: setHandle, onRenderMetrics, onLayout }
  const biome: Biome = BIOMES.includes("snow") ? "snow" : DEFAULT_BIOME
  const storedBiome: RoomFactoryProps["biome"] = String(biome)
  const onHopperDrop = (drop: HopperDrop) => setNotice(`Dropped on ${drop.roomId}: ${drop.data["text/plain"] ?? ""}`)
  const props: RoomFactoryProps = { ...common, state, petAssets, roomThemes, onHumanNeeded, width: 28, biome: storedBiome, onHopperDrop,
    acceptsHopperDrag: (types) => types.includes("text/plain") }
  return <>
    <output aria-label="Host question">{notice}</output>
    <button onClick={() => { setState({ ...state, snapshot: { ...state.snapshot, humanRequests: [] } }); setNotice("Answered") }}>Answer</button>
    <button onClick={() => handle?.inspect({ task: "task" })}>Inspect</button>
    <button onClick={() => handle?.fitAll()}>Fit</button>
    <button onClick={() => handle?.reorganize()}>Compact</button>
    <div style={{ position: "relative", height: 600 }}>
      <RoomFactory {...props} />
    </div>
  </>
}
createRoot(document.getElementById("root")!).render(<Consumer />)
