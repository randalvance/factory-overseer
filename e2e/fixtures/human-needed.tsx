import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { RoomFactory } from "../../src/factory/RoomFactory"
import { exampleRooms, planningFirst } from "../../src/model/roomExamples"
import type { HumanAttentionRequest, RoomFactoryState } from "../../src/model/types"
import "../../src/styles.css"

const initial: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: planningFirst })
initial.snapshot.humanRequests[0]!.id = "request-1"
const first = initial.snapshot.humanRequests[0]!
function Fixture() {
  const [state, setState] = useState(initial)
  const [enabled, setEnabled] = useState(!new URLSearchParams(location.search).has("no-handler"))
  const [version, setVersion] = useState(0)
  const [mount, setMount] = useState(0)
  const [calls, setCalls] = useState<{ id: string; version: number }[]>([])
  const requests = (values: HumanAttentionRequest[]) => setState((before) => ({ ...before, snapshot: { ...before.snapshot, humanRequests: values } }))
  return <>
    <nav>
      <button onClick={() => setState(structuredClone(state))}>Repeat snapshot</button>
      <button onClick={() => setVersion((version) => version + 1)}>Replace callback</button>
      <button onClick={() => requests([])}>Resolve</button>
      <button onClick={() => requests([{ ...first, id: "request-2", message: "A follow-up question" }])}>Next question</button>
      <button onClick={() => requests([first])}>Replay old request</button>
      <button onClick={() => requests([
        { ...first, id: "request-2" },
        { id: "approval-1", roomId: "implementation", agentIds: ["impl-a"], kind: "approval", message: "Approve this?" },
        { id: "help-1", roomId: "review", agentIds: [], kind: "help", message: "Help this room" },
      ])}>Concurrent requests</button>
      <button onClick={() => requests([{ ...first, id: "invalid", roomId: "unknown" }])}>Invalid request</button>
      <button onClick={() => setEnabled((enabled) => !enabled)}>{enabled ? "Disable handler" : "Enable handler"}</button>
      <button onClick={() => setMount((mount) => mount + 1)}>Remount</button>
    </nav>
    <ol aria-label="Notifications">{calls.map((call, index) => <li key={index}>{call.id} callback {call.version}</li>)}</ol>
    <output aria-label="Task room">{state.snapshot.tasks[0]!.at.roomId}</output>
    <div style={{ height: 500, position: "relative" }}>
      <RoomFactory key={mount} state={state} width={24} onHumanNeeded={enabled ? (request) => {
        setCalls((before) => [...before, { id: request.id, version }])
        // User code cannot mutate the renderer's accepted agent-ID list.
        request.agentIds.push("host-mutation")
        return undefined
      } : undefined} />
    </div>
  </>
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>)
