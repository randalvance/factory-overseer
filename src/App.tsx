import { useState } from "react"
import { LayoutDebugView } from "~/debug/LayoutDebugView"
import { type DemoScript, opening, withAnotherRole, withAnotherTask } from "~/demo/scripted"
import { Factory } from "~/factory/Factory"
import type { Layout } from "~/floor/types"

export function App() {
  const [script, setScript] = useState<DemoScript>(opening)
  /** The layout the factory last drew, for the debug view and the note. */
  const [layout, setLayout] = useState<Layout>()
  const [view, setView] = useState<"factory" | "debug">("factory")
  const unplaced = layout ? layout.unplaced.agentIds.length + layout.unplaced.taskIds.length : 0

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>Factory Overseer</h1>
        <span className="demo-actions">
          <button type="button" onClick={() => setScript(withAnotherRole)}>
            Add a role
          </button>
          <button type="button" onClick={() => setScript(withAnotherTask)}>
            Add a task
          </button>
          <button type="button" onClick={() => setView((v) => (v === "factory" ? "debug" : "factory"))}>
            {view === "factory" ? "Debug view" : "3D view"}
          </button>
        </span>
      </header>
      {/* Both stay mounted: the factory keeps its additive layout across toggles. */}
      <section className="demo-factory" hidden={view !== "factory"}>
        <Factory
          pipeline={script.pipeline}
          agents={script.snapshot.agents}
          tasks={script.snapshot.tasks}
          onLayout={setLayout}
        />
      </section>
      <section className="demo-floor" hidden={view !== "debug"}>
        {layout && <LayoutDebugView layout={layout} />}
      </section>
      {layout && unplaced > 0 && (
        <p className="demo-note">
          No place yet for agents {layout.unplaced.agentIds.join(", ") || "none"} and tasks{" "}
          {layout.unplaced.taskIds.join(", ") || "none"}.
        </p>
      )}
    </main>
  )
}
