// The embeddable component: the pipeline, agents and tasks in as props, the
// factory drawn in 3D. React owns only this shell; the view behind the
// imperative handle does the drawing (ADR 0004). Each snapshot is laid out
// additively on the last, so the floor never rearranges itself under the
// overseer (ADR 0002), and the boxes whose place changed ride the belts there
// from wherever they are.

import { useEffect, useRef, useState } from "react"
import { layoutFloor } from "~/floor/layout"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"
import type { Agent, Pipeline, Task } from "~/model/types"
import { type FactoryView, createFactoryView } from "./view"

export interface FactoryProps {
  pipeline: Pipeline
  agents: Agent[]
  tasks: Task[]
  /** Scales every belt. 1 is about two tiles a second. */
  speed?: number
  /** Called with each layout once drawn, and the motions played for it, for anything that shows the same floor another way. */
  onLayout?: (layout: Layout, motions: Motions) => void
}

export function Factory({ pipeline, agents, tasks, speed = 1, onLayout }: FactoryProps) {
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
    previous.current = layout
    let stale = false
    view.current
      .show(layout, { agents, tasks })
      .then((motions) => {
        if (stale) return
        latestOnLayout.current?.(layout, motions)
        setDrawn((n) => n + 1)
      })
      .catch((error: unknown) => console.error("The factory could not be drawn", error))
    return () => {
      stale = true
    }
  }, [pipeline, agents, tasks])

  return <div ref={mount} className="factory" role="img" aria-label="Factory floor" data-drawn={drawn} />
}
