import { useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "~/factory/RoomFactory"
import { DEFAULT_PET_ASSETS, type PetAssets } from "~/factory/petAssets"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import "~/styles.css"

const initial: RoomFactoryState = { configuration: exampleRooms, snapshot: {
  agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-pet", name: room.label + " pet", role: room.role, roomId: room.id, status: "idle" })),
  tasks: [], humanRequests: [],
} }
const staticPets: PetAssets = { default: { src: "/assets/pets/cat.svg" } }
function Fixture() {
  const [state, setState] = useState(initial)
  const [notifications, setNotifications] = useState(0)
  const [draws, setDraws] = useState(0)
  const pets = new URLSearchParams(location.search).has("static") ? staticPets : DEFAULT_PET_ASSETS
  return <main className="demo paper-demo">
    <header className="demo-header">
      <h1>Pet activity</h1>
      <button onClick={() => setState((before) => ({ ...before, snapshot: { ...before.snapshot, agents: before.snapshot.agents.map((agent) => ({ ...agent, status: "working" })), humanRequests: [] } }))}>Work</button>
      <button onClick={() => setState((before) => ({ ...before, snapshot: { ...before.snapshot, humanRequests: exampleRooms.rooms.map((room) => ({ id: "question:" + room.id, roomId: room.id, agentIds: [], kind: "question", message: "Please help this pet" })) } }))}>Ask human</button>
      <button onClick={() => setState((before) => ({ ...before, snapshot: { ...before.snapshot, humanRequests: [] } }))}>Resolve</button>
      <output aria-label="Host statuses">{state.snapshot.agents.map((agent) => agent.status).join(",")}</output>
      <output aria-label="Notifications">{notifications}</output>
      <output aria-label="Draws">{draws}</output>
    </header>
    <section className="demo-factory"><RoomFactory state={state} petAssets={pets} width={28} onHumanNeeded={() => setNotifications((count) => count + 1)} onLayout={() => setDraws((count) => count + 1)}/></section>
  </main>
}
createRoot(document.getElementById("root")!).render(<Fixture/>)
