import { useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "../../src/factory/RoomFactory"
import { DEFAULT_PET_ASSETS } from "../../src/factory/petAssets"
import { exampleRooms } from "../../src/model/roomExamples"
import type { RoomFactoryState } from "../../src/model/types"
import type { RenderMetrics } from "../../src/factory/view"
import "../../src/styles.css"

declare global { interface Window { samples: RenderMetrics[] } }
window.samples = []
const params = new URLSearchParams(location.search)
function state(count: number): RoomFactoryState {
  const rooms = exampleRooms.rooms
  const agents = Array.from({ length: count }, (_, i) => {
    const room = rooms[i % rooms.length]!
    return { id: "a" + i, name: "Agent " + i, role: room.role, roomId: room.id, status: "working" as const }
  })
  const tasks = Array.from({ length: count * 1.5 }, (_, i) => {
    const agent = agents[i % count]!
    return { id: "t" + i, label: "Task " + i, at: { kind: "room" as const, roomId: agent.roomId, assignment: { agentIds: [agent.id], completedAgentIds: [] } } }
  })
  return { configuration: exampleRooms, snapshot: { agents, tasks, humanRequests: [] } }
}
function Demo() {
  const [value, setValue] = useState(() => state(params.has("large") ? 100 : 20))
  return <><button onClick={() => setValue(state(100))}>Grow to 100 agents</button>
    <div style={{ position: "relative", height: "calc(100vh - 32px)" }}>
      <RoomFactory state={value} petAssets={params.get("art") === "legacy" ? undefined : DEFAULT_PET_ASSETS} width={28} speed={2} appearance={params.get("art") === "legacy" ? "legacy" : "paper"}
        onRenderMetrics={(metrics) => { window.samples.push(metrics); if (window.samples.length > 60) window.samples.shift() }} />
    </div></>
}
createRoot(document.getElementById("root")!).render(<Demo />)
