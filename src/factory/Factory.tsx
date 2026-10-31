// The embeddable component: the pipeline, agents and tasks in as props, the
// factory drawn in 3D. React owns only this shell; the view behind the
// imperative handle does the drawing (ADR 0004). The layout is laid out
// additively from one snapshot to the next, so the floor never rearranges
// itself under the overseer (ADR 0002).

import { useEffect, useRef, useState } from "react"
import { layoutFloor } from "~/floor/layout"
import type { Layout } from "~/floor/types"
import type { Agent, Pipeline, Task } from "~/model/types"
import { type FactoryView, createFactoryView } from "./view"

export interface FactoryProps {
  pipeline: Pipeline
  agents: Agent[]
  tasks: Task[]
  /** Called with each layout as it is drawn, for anything that wants to show the same floor another way. */
  onLayout?: (layout: Layout) => void
}

export function Factory({ pipeline, agents, tasks, onLayout }: FactoryProps) {
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
    if (!view.current) return
    const layout = layoutFloor(pipeline, { agents, tasks }, previous.current)
    previous.current = layout
    latestOnLayout.current?.(layout)
    let stale = false
    view.current
      .show(layout, { agents, tasks })
      .then(() => {
        if (!stale) setDrawn((n) => n + 1)
      })
      .catch((error: unknown) => console.error("The factory could not be drawn", error))
    return () => {
      stale = true
    }
  }, [pipeline, agents, tasks])

  return <div ref={mount} className="factory" role="img" aria-label="Factory floor" data-drawn={drawn} />
}
