// The demo: the factory on a runtime of its own that beats by itself, with
// a control panel to push it around by hand. The runtime only produces
// snapshots; the factory only draws them.

import { useEffect, useMemo, useState } from "react"
import { LayoutDebugView } from "~/debug/LayoutDebugView"
import { ControlPanel } from "~/demo/ControlPanel"
import { type Runtime, nextBeat, opening, snapshotOf } from "~/demo/runtime"
import { Factory, type FactoryHandle } from "~/factory/Factory"
import { PX_PER_TILE } from "~/factory/camera"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"

/** Between beats at speed 1: long enough for a handoff between neighbouring bays to ride. */
const BEAT_MS = 3000
/** No wider than this, so the opening line of three bays, the staging area and the container wraps on any window. */
const WIDEST_FLOOR = 24
/** The floor as wide as the window at zoom 1, so the line wraps into bands below rather than run off the edge. */
const floorWidth = Math.min(WIDEST_FLOOR, Math.floor(window.innerWidth / PX_PER_TILE))

export function App() {
  const roomLayout = new URLSearchParams(window.location.search).get("layout") !== "legacy"
  const [runtime, setRuntime] = useState<Runtime>(() => opening())
  const snapshot = useMemo(() => snapshotOf(runtime), [runtime])
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [staging, setStaging] = useState(true)
  /** What the factory last drew, for the debug view and the note. */
  const [drawn, setDrawn] = useState<{ layout: Layout; motions: Motions }>()
  const [view, setView] = useState<"factory" | "debug">("factory")
  /** The factory's handle, once it is ready. */
  const [factory, setFactory] = useState<FactoryHandle>()

  // The clock starts once the factory is ready, so the opening is drawn before the first beat, and runs faster at a higher speed.
  useEffect(() => {
    if (!playing || !factory) return
    const timer = setInterval(() => setRuntime(nextBeat), BEAT_MS / speed)
    return () => clearInterval(timer)
  }, [playing, factory, speed])

  const noPlace = drawn?.layout.unplaced.taskIds ?? []
  const noRoute = drawn?.motions.unrouted ?? []

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>Factory Overseer</h1>
        <span>{roomLayout ? "Expandable rooms" : "Legacy floor"}</span>
        <ControlPanel
          runtime={runtime}
          snapshot={snapshot}
          playing={playing}
          speed={speed}
          factory={factory}
          onChange={setRuntime}
          onPlaying={setPlaying}
          onSpeed={setSpeed}
        >
          <button type="button" onClick={() => setStaging((on) => !on)}>
            {staging ? "Staging off" : "Staging on"}
          </button>
          <button type="button" onClick={() => setView((v) => (v === "factory" ? "debug" : "factory"))}>
            {view === "factory" ? "Debug view" : "3D view"}
          </button>
        </ControlPanel>
      </header>
      {/* Both stay mounted: the factory keeps its additive layout and its rides across toggles. */}
      <section className="demo-factory" hidden={view !== "factory"}>
        <Factory
          pipeline={runtime.pipeline}
          agents={snapshot.agents}
          tasks={snapshot.tasks}
          speed={speed}
          staging={staging}
          width={roomLayout ? Math.max(18, floorWidth) : floorWidth}
          roomLayout={roomLayout}
          onLayout={(layout, motions) => setDrawn({ layout, motions })}
          onReady={setFactory}
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
