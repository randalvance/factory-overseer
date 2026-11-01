import { useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "~/factory/RoomFactory"
import { DEFAULT_PET_ASSETS } from "~/factory/petAssets"
import type { FactoryHandle, FactoryProps } from "~/factory/Factory"
import type { Layout } from "~/floor/types"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import type { RoomThemeDefinition, RoomThemeRegistry } from "~/model/roomThemes"
import "~/styles.css"

const initial: RoomFactoryState = { configuration: structuredClone(exampleRooms), snapshot: {
  agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").map((room) => ({
    id: room.id, name: room.label, role: room.role, roomId: room.id, status: "idle" as const,
  })),
  tasks: [{ id: "task", label: "Theme task", at: { kind: "room", roomId: "intake" } }],
  humanRequests: [{ id: "question", roomId: "planning", agentIds: ["planning"], kind: "question", message: "Which finish do you prefer?" }],
} }
interface ThemeFixture {
  state: RoomFactoryState
  registry: RoomThemeRegistry
  layout?: Layout
  metrics?: Parameters<NonNullable<FactoryProps["onRenderMetrics"]>>[0]
  handle?: FactoryHandle
  draws: number
  landed: string[]
  rides: string[]
  unrouted: string[]
  notifications: string[]
  update: (state: RoomFactoryState) => void
  setRegistry: (registry: RoomThemeRegistry) => void
  setTheme: (roomId: string, theme: string, overrides?: RoomThemeDefinition) => void
}
declare global { interface Window { themes: ThemeFixture } }
window.themes = { state: initial, registry: {}, draws: 0, landed: [], rides: [], unrouted: [], notifications: [], update: () => {}, setRegistry: () => {}, setTheme: () => {} }
function Fixture() {
  const [state, setState] = useState(initial)
  const [registry, setRegistry] = useState<RoomThemeRegistry>({})
  window.themes.state = state
  window.themes.registry = registry
  window.themes.update = setState
  window.themes.setRegistry = setRegistry
  window.themes.setTheme = (roomId, theme, themeOverrides) => setState((before) => ({ ...before, configuration: {
    ...before.configuration, rooms: before.configuration.rooms.map((room) => room.id === roomId ? { ...room, theme, themeOverrides } : room),
  } }))
  return <main className="demo paper-demo">
    <header className="demo-header"><h1>Room themes</h1></header>
    <section className="demo-factory"><RoomFactory state={state} roomThemes={registry} petAssets={DEFAULT_PET_ASSETS} width={28} speed={4}
      onRenderMetrics={(metrics) => { window.themes.metrics = metrics }}
      onReady={(handle) => { window.themes.handle = handle }}
      onLayout={(layout, motions) => { window.themes.layout = layout; window.themes.draws++; window.themes.rides.push(...motions.toPlay.map((motion) => motion.taskId)); window.themes.unrouted.push(...motions.unrouted) }}
      onTaskLanded={(id) => { window.themes.landed.push(id) }}
      onHumanNeeded={(request) => { window.themes.notifications.push(request.id) }}/></section>
  </main>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
