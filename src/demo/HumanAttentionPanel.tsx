import { useState } from "react"
import type { HumanAttentionRequest, RoomFactoryState } from "~/model/types"

export interface HumanAnswer {
  requestId: string
  question: string
  response: string
}

/** A sample host-owned UI. RoomFactory supplies notifications, never this form. */
export function HumanAttentionPanel({ state, notifications, answers, onAnswer }: {
  state: RoomFactoryState
  notifications: HumanAttentionRequest[]
  answers: HumanAnswer[]
  onAnswer: (request: HumanAttentionRequest, response: string) => void
}) {
  const active = new Map(state.snapshot.humanRequests.map((request) => [request.id, request]))
  const pending = notifications.filter((request) => active.has(request.id))
  if (!pending.length && !answers.length) return null
  return <aside className="human-attention" aria-label="Human attention">
    <h2>{pending.length ? `Needs your attention · ${pending.length}` : "Questions answered"}</h2>
    {pending.map((notification, index) => {
      const request = active.get(notification.id)!
      const room = state.configuration.rooms.find((room) => room.id === request.roomId)
      const task = state.snapshot.tasks.find((task) => task.id === request.taskId)
      return <ResponseForm key={request.id + ":" + index} request={request} context={`${room?.label ?? request.roomId}${task ? " · " + task.label : ""}`} onAnswer={onAnswer} />
    })}
    {answers.length > 0 && <details><summary>Responses ({answers.length})</summary>
      <ul>{answers.map((answer) => <li key={answer.requestId}><strong>{answer.question}</strong><p>{answer.response}</p></li>)}</ul>
    </details>}
  </aside>
}

function ResponseForm({ request, context, onAnswer }: {
  request: HumanAttentionRequest
  context: string
  onAnswer: (request: HumanAttentionRequest, response: string) => void
}) {
  const [response, setResponse] = useState("")
  return <form aria-label={request.message} onSubmit={(event) => {
    event.preventDefault()
    if (response.trim()) onAnswer(request, response.trim())
  }}>
    <p className="attention-context">{context} · {request.kind}</p>
    <label>{request.message}
      <textarea aria-label="Your response" value={response} onChange={(event) => setResponse(event.target.value)} rows={2} required />
    </label>
    <button type="submit" disabled={!response.trim()}>Submit response</button>
    <p className="attention-note">The task stays here until you send it onward.</p>
  </form>
}
