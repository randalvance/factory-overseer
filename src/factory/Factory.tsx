// The embeddable component: the pipeline, agents and tasks in as props, the
// factory drawn in 3D. React owns only this shell; the view behind the
// imperative handle does the drawing (ADR 0004). Each snapshot is laid out
// additively on the last, so the floor never rearranges itself under the
// overseer (ADR 0002); the boxes whose place changed ride the belts there
// from wherever they are, and the agents who came and went since the last
// snapshot walk in and fade. Only the overseer's Reorganize, asked for on the
// handle the host gets once the factory is ready, lays the floor afresh. The
// HUD over the canvas, the counts and the cards, is React too.

import { useEffect, useMemo, useRef, useState } from "react"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import type { RoomFactoryState } from "~/model/types"
import { layoutFloor, reorganizedFloor } from "~/floor/layout"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"
import { comingsAndGoings } from "~/floor/walk"
import { type StatusStyleOverrides, resolveStatusStyles } from "~/model/status"
import { type Trails, recordTrails } from "~/model/trails"
import type { Agent, Pipeline, Snapshot, Subject, Task } from "~/model/types"
import { Hud } from "./Hud"
import type { Wardrobes } from "./sprites"
import { type FactoryView, type Styling, createFactoryView } from "./view"

export interface FactoryProps {
  pipeline: Pipeline
  /** Separated expandable rooms using the existing pipeline order. */
  roomLayout?: boolean
  /** Used by RoomFactory to render the configured graph. */
  roomState?: RoomFactoryState
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
  /** A task finished riding its conveyor path. */
  onTaskLanded?: (taskId: string) => void
}

/** What the host asks of the factory once it is ready, beyond what the props say. */
export interface FactoryHandle {
  /** Put an agent under the middle of the screen; or a task, and keep it there until the overseer pans, fits all or focuses elsewhere. */
  focus(subject: Subject): void
  /** Frame the floor's width, and the whole floor when it fits, as the view opened. */
  fitAll(): void
  /**
   * Lay the floor afresh as the overseer asks: compact, in pipeline order,
   * every annex beside its role's bay, no vacant lane but one a box still
   * rests at, the line wrapped anew within the floor width; and slide every
   * station, belt and box to its new place in one pass. Nothing moves at any
   * other time (ADR 0002).
   */
  reorganize(): void
}

export function Factory({ pipeline, agents, tasks, roomLayout = false, roomState, speed = 1, staging = true, width, lanes, statusStyles, wardrobes, onLayout, onReady, onTaskLanded }: FactoryProps) {
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<FactoryView | null>(null)
  const previous = useRef<Layout | undefined>(undefined)
  /** The props as last rendered, for the handle, which is called between renders. */
  const latest = useRef({ pipeline, agents, tasks, staging, roomLayout, roomState, statusStyles, wardrobes, onLayout, onReady, onTaskLanded })
  /** How many drawings have been asked of the view; only the latest counts once drawn. */
  const asked = useRef(0)
  /** How many snapshots the view has drawn; the first makes the factory ready. */
  const [drawn, setDrawn] = useState(0)
  /** What the overseer clicked last, for its card. */
  const [picked, setPicked] = useState<Subject>()
  /** Where every task has been this session, for the cards. */
  const [trails, setTrails] = useState<Trails>({})
  /** The tasks whose boxes are riding to where the snapshot puts them, until each lands. */
  const activeRides = useRef(new Set<string>())
  const [riding, setRiding] = useState<ReadonlySet<string>>(() => new Set())
  const styles = useMemo(() => resolveStatusStyles(statusStyles), [statusStyles])

  useEffect(() => {
    latest.current = { pipeline, agents, tasks, staging, roomLayout, roomState, statusStyles, wardrobes, onLayout, onReady, onTaskLanded }
  })

  useEffect(() => {
    setTrails((before) => recordTrails(before, { agents, tasks }))
    // A card whose agent or task has left the floor goes with it.
    setPicked((before) => (before && !onFloor(before, { agents, tasks }) ? undefined : before))
  }, [agents, tasks])

  useEffect(() => {
    if (!mount.current) return
    const created = createFactoryView(mount.current, {
      assetBase: import.meta.env.BASE_URL,
      onClick: setPicked,
      onLanded: (taskId) => {
        activeRides.current.delete(taskId)
        latest.current.onTaskLanded?.(taskId)
        setRiding((before) => {
          if (!before.has(taskId)) return before
          const after = new Set(before)
          after.delete(taskId)
          return after
        })
      },
    })
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
        activeRides.current = new Set(motions.toPlay.map((motion) => motion.taskId))
        setRiding(new Set(activeRides.current))
        setDrawn((n) => n + 1)
      })
      .catch((error: unknown) => console.error(failure, error))
  }

  useEffect(() => {
    view.current?.setSpeed(speed)
  }, [speed])

  useEffect(() => {
    if (!view.current) return
    const layout = roomState
      ? layoutConfiguredRooms(roomState, previous.current, width, activeRides.current)
      : layoutFloor(pipeline, { agents, tasks }, previous.current, { staging, width, lanes, roomLayout })
    const traffic = comingsAndGoings(previous.current, layout)
    previous.current = layout
    drawnBy(view.current.show(layout, { agents, tasks }, styling(statusStyles, wardrobes), traffic), layout, "The factory could not be drawn")
  }, [pipeline, agents, tasks, staging, width, lanes, roomLayout, roomState, statusStyles, wardrobes])

  const handle = useRef<FactoryHandle>({
    focus(subject) {
      if ("agent" in subject) view.current?.focusAgent(subject.agent)
      else view.current?.followTask(subject.task)
    },
    fitAll() {
      view.current?.fitAll()
    },
    reorganize() {
      const { pipeline, agents, tasks, staging, roomState, statusStyles, wardrobes } = latest.current
      if (!view.current || !previous.current) return
      const layout = roomState
        ? layoutConfiguredRooms(roomState, previous.current, previous.current.bounds.w, activeRides.current, true)
        : reorganizedFloor(pipeline, { agents, tasks }, previous.current, { staging })
      previous.current = layout
      drawnBy(view.current.reorganize(layout, { agents, tasks }, styling(statusStyles, wardrobes)), layout, "The factory could not be reorganized")
    },
  })

  useEffect(() => {
    if (drawn === 1) latest.current.onReady?.(handle.current)
  }, [drawn])

  return (
    <div className="factory">
      <div ref={mount} className="factory-canvas" role="img" aria-label="Factory floor" data-drawn={drawn} data-rooms={previous.current?.rooms?.length ?? 0} />
      <Hud
        snapshot={{ agents, tasks }}
        roomState={roomState}
        trails={trails}
        riding={riding}
        styles={styles}
        picked={picked}
        ready={drawn > 0}
        onClose={() => setPicked(undefined)}
        onFitAll={() => handle.current.fitAll()}
        onReorganize={() => handle.current.reorganize()}
      />
    </div>
  )
}

/** Whether the snapshot still has the subject. */
function onFloor(subject: Subject, snapshot: Snapshot): boolean {
  return "agent" in subject ? snapshot.agents.some((agent) => agent.id === subject.agent) : snapshot.tasks.some((task) => task.id === subject.task)
}

/** How the view is to show the agents, from the host's overrides. */
function styling(statusStyles: StatusStyleOverrides | undefined, wardrobes: Wardrobes | undefined): Styling {
  return { styles: resolveStatusStyles(statusStyles), wardrobes: wardrobes ?? {} }
}
