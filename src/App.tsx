import { useState } from "react"
import { LayoutDebugView } from "~/debug/LayoutDebugView"
import { type DemoScript, opening, withAnotherRole, withAnotherTask } from "~/demo/scripted"
import { layoutFloor } from "~/floor/layout"
import type { Layout } from "~/floor/types"

interface DemoState extends DemoScript {
  layout: Layout
}

/** Lay the next script out additively on top of the current layout. */
function relayout(current: DemoState, next: DemoScript): DemoState {
  return { ...next, layout: layoutFloor(next.pipeline, next.snapshot, current.layout) }
}

export function App() {
  const [state, setState] = useState<DemoState>(() => ({
    ...opening,
    layout: layoutFloor(opening.pipeline, opening.snapshot),
  }))
  const { layout } = state
  const unplaced = layout.unplaced.agentIds.length + layout.unplaced.taskIds.length

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>Factory Overseer</h1>
        <span className="demo-actions">
          <button type="button" onClick={() => setState((s) => relayout(s, withAnotherRole(s)))}>
            Add a role
          </button>
          <button type="button" onClick={() => setState((s) => relayout(s, withAnotherTask(s)))}>
            Add a task
          </button>
        </span>
      </header>
      <section className="demo-floor">
        <LayoutDebugView layout={layout} />
      </section>
      {unplaced > 0 && (
        <p className="demo-note">
          No place yet for agents {layout.unplaced.agentIds.join(", ") || "none"} and tasks{" "}
          {layout.unplaced.taskIds.join(", ") || "none"}.
        </p>
      )}
    </main>
  )
}
