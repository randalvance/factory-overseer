import { useEffect, useState } from "react"
import { LayoutDebugView } from "~/debug/LayoutDebugView"
import {
  type Demo,
  atTheStart,
  nextHandoff,
  tripOver,
  withAnotherImplementer,
  withAnotherRole,
  withAnotherTask,
  withNextStatus,
  withoutAnImplementer,
} from "~/demo/scripted"
import { Factory } from "~/factory/Factory"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"

const SPEEDS = [0.5, 1, 2, 4]
/** Between snapshots while playing, at speed 1: long enough for a handoff between neighbouring bays. */
const PLAY_INTERVAL_MS = 3000

export function App() {
  const [demo, setDemo] = useState<Demo>(atTheStart)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [staging, setStaging] = useState(true)
  /** What the factory last drew, for the debug view and the note. */
  const [drawn, setDrawn] = useState<{ layout: Layout; motions: Motions }>()
  const [view, setView] = useState<"factory" | "debug">("factory")

  const over = tripOver(demo)
  useEffect(() => {
    if (!playing || over) return
    const timer = setInterval(() => setDemo(nextHandoff), PLAY_INTERVAL_MS / speed)
    return () => clearInterval(timer)
  }, [playing, over, speed])
  useEffect(() => {
    if (over) setPlaying(false)
  }, [over])

  const { pipeline, snapshot } = demo.script
  const anyImplementer = snapshot.agents.some((agent) => agent.role === "implementer")
  const noPlace = drawn?.layout.unplaced.taskIds ?? []
  const noRoute = drawn?.motions.unrouted ?? []

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>Factory Overseer</h1>
        <span className="demo-actions">
          <button type="button" onClick={() => setDemo(nextHandoff)} disabled={over}>
            Next handoff
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)} disabled={over}>
            {playing ? "Pause" : "Play"}
          </button>
          <select aria-label="Speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}× speed
              </option>
            ))}
          </select>
          {/* Ada, at the first bench, round every status. */}
          <button type="button" onClick={() => setDemo((d) => ({ ...d, script: withNextStatus(d.script, "imp-1") }))}>
            Next status
          </button>
          <button type="button" onClick={() => setDemo(withAnotherImplementer)}>
            Add an implementer
          </button>
          <button type="button" onClick={() => setDemo(withoutAnImplementer)} disabled={!anyImplementer}>
            Remove an implementer
          </button>
          <button type="button" onClick={() => setDemo((d) => ({ ...d, script: withAnotherRole(d.script) }))}>
            Add a role
          </button>
          <button type="button" onClick={() => setDemo((d) => ({ ...d, script: withAnotherTask(d.script) }))}>
            Add a task
          </button>
          <button type="button" onClick={() => setStaging((on) => !on)}>
            {staging ? "Staging off" : "Staging on"}
          </button>
          <button type="button" onClick={() => setView((v) => (v === "factory" ? "debug" : "factory"))}>
            {view === "factory" ? "Debug view" : "3D view"}
          </button>
        </span>
      </header>
      {/* Both stay mounted: the factory keeps its additive layout and its rides across toggles. */}
      <section className="demo-factory" hidden={view !== "factory"}>
        <Factory
          pipeline={pipeline}
          agents={snapshot.agents}
          tasks={snapshot.tasks}
          speed={speed}
          staging={staging}
          onLayout={(layout, motions) => setDrawn({ layout, motions })}
        />
      </section>
      <section className="demo-floor" hidden={view !== "debug"}>
        {drawn && <LayoutDebugView layout={drawn.layout} motions={drawn.motions.toPlay} />}
      </section>
      {(noPlace.length > 0 || noRoute.length > 0) && (
        <p className="demo-note">
          {noPlace.length > 0 && `No place yet for ${noPlace.join(", ")}. `}
          {noRoute.length > 0 && `No route for ${noRoute.join(", ")}, so they appear where they are. `}
        </p>
      )}
    </main>
  )
}
