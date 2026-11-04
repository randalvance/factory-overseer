import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"
import { afterPlanning, exampleRooms } from "~/model/roomExamples"
import { roomSnapshotForView } from "~/model/roomRouting"
import { DEFAULT_STATUS_STYLES } from "~/model/status"
import type { RoomFactoryState, Subject } from "~/model/types"
import { Hud } from "./Hud"

function card(state: RoomFactoryState, picked: Subject) {
  return renderToStaticMarkup(<Hud roomState={state} snapshot={roomSnapshotForView(state)}
    riding={new Set()} styles={DEFAULT_STATUS_STYLES} picked={picked} ready
    onClose={() => {}} onFitAll={() => {}} onReorganize={() => {}} />)
}

it("explains room, shared completion and active human context while counting one shared task", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: afterPlanning })
  state.snapshot.humanRequests = [{ id: "choose", roomId: "implementation", taskId: "planned", agentIds: [], kind: "question", message: "Choose the release target" }]
  const task = card(state, { task: "planned" })
  expect(task).toContain("1 in flight")
  expect(task).toContain("1 human request")
  expect(task).toContain("1/2 complete")
  expect(task).toContain("Choose the release target")
  const member = card(state, { agent: "impl-a" })
  expect(member).toContain("Implementation")
  expect(member).toContain("Build feature (complete)")
  expect(member).toContain("Choose the release target")
  state.snapshot.humanRequests = []
  expect(card(state, { task: "planned" })).not.toContain("Choose the release target")
  expect(card(state, { task: "planned" })).toContain("0 human requests")
})

it("shows explicit-agent and room-wide attention only on relevant agent cards", () => {
  const state: RoomFactoryState = structuredClone({ configuration: exampleRooms, snapshot: afterPlanning })
  state.snapshot.humanRequests = [
    { id: "targeted", roomId: "implementation", agentIds: ["impl-b"], kind: "help", message: "Review this approach" },
    { id: "room", roomId: "planning", agentIds: [], kind: "approval", message: "Approve the plan" },
  ]
  expect(card(state, { agent: "impl-a" })).not.toContain("Review this approach")
  expect(card(state, { agent: "impl-b" })).toContain("Review this approach")
  expect(card(state, { agent: "impl-b" })).not.toContain("Approve the plan")
  expect(card(state, { agent: "planner" })).toContain("Approve the plan")
})
