// The embeddable component: the pipeline, agents and tasks in as props, the
// factory drawn in 3D. React owns only this shell; the view behind the
// imperative handle does the drawing (ADR 0004). Each snapshot is laid out
// additively on the last, so the floor never rearranges itself under the
// overseer (ADR 0002); the boxes whose place changed ride the belts there
// from wherever they are, and the agents who came and went since the last
// snapshot walk in and fade. Only the overseer's Reorganize, asked for on the
// handle the host gets once the factory is ready, lays the floor afresh.

import { useEffect, useRef, useState } from "react"
import { layoutFloor, reorganizedFloor } from "~/floor/layout"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"
import { comingsAndGoings } from "~/floor/walk"
import { type StatusStyleOverrides, resolveStatusStyles } from "~/model/status"
import type { Agent, Pipeline, Task } from "~/model/types"
import type { Wardrobes } from "./sprites"
import { type FactoryView, type Styling, createFactoryView } from "./view"

export interface FactoryProps {
  pipeline: Pipeline
  agents: Agent[]
  tasks: Task[]
  /** Scales every belt and walk. 1 is about two tiles a second. */
  speed?: number
  /** Whether boxes pass the inspector before they ship. On unless switched off, when the last bay ships straight into the container. */
  staging?: boolean
  /**
   * The floor's width in tiles, fixed when the first snapshot is drawn: the
   * line wraps into bands within it rather than run past it (ADR 0006). As
   * wide as the first line needs when not given.
   */
  width?: number
  /** How many lanes a bay holds, fixed like the width: three unless given. The next agent of the role takes a lane in an annex (ADR 0007). */
  lanes?: number
  /** What each status looks like, cell by cell over the defaults. Keep the same object between renders. */
  statusStyles?: StatusStyleOverrides
  /** The stock sheets each role's agents draw from, over the defaults. Keep the same object between renders. */
  wardrobes?: Wardrobes
  /** Called with each layout once drawn, and the motions played for it, for anything that shows the same floor another way. */
  onLayout?: (layout: Layout, motions: Motions) => void
  /** Called once with the handle when the first snapshot is drawn and the factory is ready. */
  onReady?: (handle: FactoryHandle) => void
}

/** What the host asks of the factory once it is ready, beyond what the props say. */
export interface FactoryHandle {
  /**
   * Lay the floor afresh as the overseer asks: compact, in pipeline order,
   * every annex beside its role's bay, no vacant lane but one a box still
   * rests at, the line wrapped anew within the floor width; and slide every
   * station, belt and box to its new place in one pass. Nothing moves at any
   * other time (ADR 0002).
   */
  reorganize(): void
}

export function Factory({ pipeline, agents, tasks, speed = 1, staging = true, width, lanes, statusStyles, wardrobes, onLayout, onReady }: FactoryProps) {
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<FactoryView | null>(null)
  const previous = useRef<Layout | undefined>(undefined)
  /** The props as last rendered, for the handle, which is called between renders. */
  const latest = useRef({ pipeline, agents, tasks, staging, statusStyles, wardrobes, onLayout, onReady })
  /** How many drawings have been asked of the view; only the latest counts once drawn. */
  const asked = useRef(0)
  /** How many snapshots the view has drawn; the first makes the factory ready. */
  const [drawn, setDrawn] = useState(0)

  useEffect(() => {
    latest.current = { pipeline, agents, tasks, staging, statusStyles, wardrobes, onLayout, onReady }
  })

  useEffect(() => {
    if (!mount.current) return
    const created = createFactoryView(mount.current, { assetBase: import.meta.env.BASE_URL })
    view.current = created
    return () => {
      created.dispose()
      view.current = null
      asked.current++
    }
  }, [])

  /** Report the layout once the view has drawn it, unless a later one has been asked for since. */
  function drawnBy(drawing: Promise<Motions>, layout: Layout, failure: string) {
    const call = ++asked.current
    drawing
      .then((motions) => {
        if (call !== asked.current) return
        latest.current.onLayout?.(layout, motions)
        setDrawn((n) => n + 1)
      })
      .catch((error: unknown) => console.error(failure, error))
  }

  useEffect(() => {
    view.current?.setSpeed(speed)
  }, [speed])

  useEffect(() => {
    if (!view.current) return
    const layout = layoutFloor(pipeline, { agents, tasks }, previous.current, { staging, width, lanes })
    const traffic = comingsAndGoings(previous.current, layout)
    previous.current = layout
    drawnBy(view.current.show(layout, { agents, tasks }, styling(statusStyles, wardrobes), traffic), layout, "The factory could not be drawn")
  }, [pipeline, agents, tasks, staging, width, lanes, statusStyles, wardrobes])

  const handle = useRef<FactoryHandle>({
    reorganize() {
      const { pipeline, agents, tasks, staging, statusStyles, wardrobes } = latest.current
      if (!view.current || !previous.current) return
      const layout = reorganizedFloor(pipeline, { agents, tasks }, previous.current, { staging })
      previous.current = layout
      drawnBy(view.current.reorganize(layout, { agents, tasks }, styling(statusStyles, wardrobes)), layout, "The factory could not be reorganized")
    },
  })

  useEffect(() => {
    if (drawn === 1) latest.current.onReady?.(handle.current)
  }, [drawn])

  return <div ref={mount} className="factory" role="img" aria-label="Factory floor" data-drawn={drawn} />
}

/** How the view is to show the agents, from the host's overrides. */
function styling(statusStyles: StatusStyleOverrides | undefined, wardrobes: Wardrobes | undefined): Styling {
  return { styles: resolveStatusStyles(statusStyles), wardrobes: wardrobes ?? {} }
}
