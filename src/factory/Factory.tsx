// The embeddable component: the pipeline, agents and tasks in as props, the
// factory drawn in 3D. React owns only this shell; the view behind the
// imperative handle does the drawing (ADR 0004). Each snapshot is laid out
// additively on the last, so the floor never rearranges itself under the
// overseer (ADR 0002); the boxes whose place changed ride the belts there
// from wherever they are, and the agents who came and went since the last
// snapshot walk in and fade.

import { useEffect, useRef, useState } from "react"
import { layoutFloor } from "~/floor/layout"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"
import { comingsAndGoings } from "~/floor/walk"
import { type StatusStyleOverrides, resolveStatusStyles } from "~/model/status"
import type { Agent, Pipeline, Task } from "~/model/types"
import type { Wardrobes } from "./sprites"
import { type FactoryView, createFactoryView } from "./view"

export interface FactoryProps {
  pipeline: Pipeline
  agents: Agent[]
  tasks: Task[]
  /** Scales every belt. 1 is about two tiles a second. */
  speed?: number
  /** What each status looks like, cell by cell over the defaults. Keep the same object between renders. */
  statusStyles?: StatusStyleOverrides
  /** The stock sheets each role's agents draw from, over the defaults. Keep the same object between renders. */
  wardrobes?: Wardrobes
  /** Called with each layout once drawn, and the motions played for it, for anything that shows the same floor another way. */
  onLayout?: (layout: Layout, motions: Motions) => void
}

export function Factory({ pipeline, agents, tasks, speed = 1, statusStyles, wardrobes, onLayout }: FactoryProps) {
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<FactoryView | null>(null)
  const previous = useRef<Layout | undefined>(undefined)
  const latestOnLayout = useRef(onLayout)
  /** How many snapshots the view has drawn; the first makes the factory ready. */
  const [drawn, setDrawn] = useState(0)

  useEffect(() => {
    latestOnLayout.current = onLayout
  })

  useEffect(() => {
    if (!mount.current) return
    const created = createFactoryView(mount.current, { assetBase: import.meta.env.BASE_URL })
    view.current = created
    return () => {
      created.dispose()
      view.current = null
    }
  }, [])

  useEffect(() => {
    view.current?.setSpeed(speed)
  }, [speed])

  useEffect(() => {
    if (!view.current) return
    const layout = layoutFloor(pipeline, { agents, tasks }, previous.current)
    const traffic = comingsAndGoings(previous.current, layout)
    previous.current = layout
    let stale = false
    view.current
      .show(layout, { agents, tasks }, { styles: resolveStatusStyles(statusStyles), wardrobes: wardrobes ?? {} }, traffic)
      .then((motions) => {
        if (stale) return
        latestOnLayout.current?.(layout, motions)
        setDrawn((n) => n + 1)
      })
      .catch((error: unknown) => console.error("The factory could not be drawn", error))
    return () => {
      stale = true
    }
  }, [pipeline, agents, tasks, statusStyles, wardrobes])

  return <div ref={mount} className="factory" role="img" aria-label="Factory floor" data-drawn={drawn} />
}
