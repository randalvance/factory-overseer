import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "~/factory/RoomFactory"
import type { PetAssets } from "~/factory/petAssets"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import "~/styles.css"

const state: RoomFactoryState = {
  configuration: exampleRooms,
  snapshot: {
    agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-pet", name: room.label + " pet", role: room.role, roomId: room.id, status: room.id === "planning" ? "waiting" : "idle" })),
    tasks: [],
    humanRequests: [{ id: "pet-question", roomId: "planning", agentIds: ["planning-pet"], kind: "question", message: "Which pet should plan this task?" }],
  },
}
const initialAssets: PetAssets = {
  default: { src: "/assets/pets/cat.svg?default" },
  byRole: { planner: { src: "/assets/pets/rabbit.svg?role" } },
  byAgent: { "deployment-pet": { src: "/assets/pets/fox.svg?agent" } },
}
function Fixture() {
  const [petAssets, setPetAssets] = useState(initialAssets)
  const [notifications, setNotifications] = useState(0)
  const [draws, setDraws] = useState(0)
  return <main className="demo paper-demo">
    <header className="demo-header">
      <h1>Host pet assets</h1>
      <button onClick={() => setPetAssets((before) => ({ ...before, byAgent: { ...before.byAgent, "planning-pet": { src: "/assets/pets/owl.svg?override", height: 2.5 } } }))}>Swap planner pet</button>
      <button onClick={() => setPetAssets((before) => ({ ...before, default: { src: "/missing-pet-asset.png" } }))}>Use missing default</button>
      <output aria-label="Human notifications">{notifications}</output>
      <output aria-label="Draws">{draws}</output>
    </header>
    <section className="demo-factory">
      <RoomFactory state={state} petAssets={petAssets} width={28} onHumanNeeded={() => setNotifications((value) => value + 1)} onLayout={() => setDraws((value) => value + 1)}/>
    </section>
  </main>
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture/></StrictMode>)
