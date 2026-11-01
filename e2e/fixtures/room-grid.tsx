import { useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "~/factory/RoomFactory"
import { DEFAULT_PET_ASSETS } from "~/factory/petAssets"
import type { FactoryHandle } from "~/factory/Factory"
import type { Layout } from "~/floor/types"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import "~/styles.css"

function member(index: number) {
  return { id: `pet-${index}`, name: `Pet ${index}`, role: "implementer", roomId: "implementation", status: "working" as const }
}
const initial: RoomFactoryState = { configuration: exampleRooms, snapshot: {
  agents: [member(1), ...exampleRooms.rooms.filter((room) => !["intake", "implementation"].includes(room.id)).map((room) => ({
    id: room.id, name: room.label, role: room.role, roomId: room.id, status: "idle" as const,
  }))],
  tasks: [{ id: "task", label: "Grid task", at: { kind: "room", roomId: "intake" } }], humanRequests: [],
} }
interface GridFixture {
  state: RoomFactoryState
  layout?: Layout
  handle?: FactoryHandle
  draws: number
  landed: string[]
  unrouted: string[]
  notifications: string[]
  update: (state: RoomFactoryState) => void
  setAgents: (count: number) => void
}
declare global { interface Window { grid: GridFixture } }
window.grid = { state: initial, draws: 0, landed: [], unrouted: [], notifications: [], update: () => {}, setAgents: () => {} }
function Fixture() {
  const [state, setState] = useState(initial)
  window.grid.state = state
  window.grid.update = setState
  window.grid.setAgents = (count) => setState((before) => ({ ...before, snapshot: { ...before.snapshot,
    agents: [...before.snapshot.agents.filter((agent) => agent.roomId !== "implementation"), ...Array.from({ length: count }, (_, index) => member(index + 1))],
  } }))
  const count = state.snapshot.agents.filter((agent) => agent.roomId === "implementation").length
  return <main className="demo paper-demo">
    <header className="demo-header"><h1>Three pets per row</h1>
      <button onClick={() => window.grid.setAgents(count + 1)}>Add agent</button>
      <button onClick={() => window.grid.handle?.focus({ agent: "pet-1" })}>Focus room</button>
      <output>{count} implementation pets</output>
    </header>
    <section className="demo-factory"><RoomFactory state={state} petAssets={DEFAULT_PET_ASSETS} width={28} speed={8}
      onReady={(handle) => { window.grid.handle = handle }}
      onLayout={(layout, motions) => { window.grid.layout = layout; window.grid.draws++; window.grid.unrouted.push(...motions.unrouted) }}
      onTaskLanded={(id) => { window.grid.landed.push(id) }}
      onHumanNeeded={(request) => { window.grid.notifications.push(request.id) }}/></section>
  </main>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
