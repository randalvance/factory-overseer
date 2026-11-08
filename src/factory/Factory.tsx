// Internal React shell for the configured paper factory. The host supplies
// snapshots; the view draws them and reports arrivals (ADR 0004).
import { useEffect, useMemo, useRef, useState } from "react"
import { roomSnapshotForView } from "~/model/roomRouting"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import type { RoomFactoryState, Snapshot, Subject } from "~/model/types"
import type { Motions } from "~/floor/motion"
import type { Layout } from "~/floor/types"
import { comingsAndGoings } from "~/floor/walk"
import type { Whereabouts } from "~/floor/roam"
import { type StatusStyleOverrides, resolveStatusStyles } from "~/model/status"
import { Hud } from "./Hud"
import type { RoomThemeRegistry } from "~/model/roomThemes"
import type { PetAssets } from "./petAssets"
import { type Biome, isBiome, resolveBiome } from "~/model/biomes"
import { type FactoryView, createFactoryView } from "./view"

export interface FactoryProps {
  /** Accepted configured-room state, supplied by RoomFactory. */
  roomState: RoomFactoryState
  /** Directory before assets/, absolute or page-relative. Fixed for this mount; defaults to /. */
  assetBase?: string
  /** Host theme registry layered over the four paper presets. Replace immutably to update. */
  roomThemes?: RoomThemeRegistry
  /** Transparent pet images or 6×4 sheets selected by agent, role, then default. */
  petAssets?: PetAssets
  onRenderMetrics?: (metrics: import("./view").RenderMetrics) => void
  /** Scales every belt and walk. 1 is about two tiles a second. */
  speed?: number
  /** Floor width in tiles, fixed after the first snapshot; at least 24. */
  width?: number
  /** Status visuals layered over the defaults. Keep the same object between renders. */
  statusStyles?: StatusStyleOverrides
  /** Each drawn layout and its planned task motions. */
  onLayout?: (layout: Layout, motions: Motions) => void
  /** Called once when the first snapshot is drawn. */
  onReady?: (handle: FactoryHandle) => void
  /** A task finished riding its conveyor path. */
  onTaskLanded?: (taskId: string) => void
  /**
   * The overseer clicked the floor: called with the agent or task box the
   * click picked, or undefined for open floor. The factory still opens or
   * closes its own card; this only tells the host. Not called for
   * `FactoryHandle.inspect`, which the host asked for itself.
   */
  onPick?: (subject: Subject | undefined) => void
  /**
   * The outdoor paper around the rooms: "grass" (the default), "desert",
   * whose trees are cacti, or "snow", snowy plains under snow-capped trees.
   * An unknown name draws grass.
   */
  biome?: Biome | (string & {})
  /**
   * Makes the outdoor hopper a drop target for the host's own HTML5 drags.
   * Called when an accepted drag is let go over the hopper. The factory
   * queues nothing itself: publish a snapshot with the new task at intake,
   * and its box drops out of the hopper. Without it the hopper takes no drags.
   */
  onHopperDrop?: (drop: HopperDrop) => void
  /** Which drags the hopper takes, by their `DataTransfer.types`. Every drag by default. Called while dragging, so keep it quick. */
  acceptsHopperDrag?: (types: readonly string[]) => boolean
}

/** A host's drag let go over the hopper. */
export interface HopperDrop {
  /** The configured intake room the hopper stands over. */
  roomId: string
  /** The drag's string data by type, read as it was dropped; files are left in `dataTransfer`. */
  data: Readonly<Record<string, string>>
  /** The drop's own transfer, for files; browsers allow reading it only during the call. */
  dataTransfer: DataTransfer
}

/** What the host asks of the factory beyond publishing snapshots. */
export interface FactoryHandle {
  /** Focus an agent, or follow a task until the overseer pans, fits all or focuses elsewhere. */
  focus(subject: Subject): void
  /** Open the subject card and focus it. */
  inspect(subject: Subject): void
  /** Frame the paper rooms, their signs and deployment truck. Very deep maps remain pannable. */
  fitAll(): void
  /** Compact vacant stations and rooms, preserving active task rides. */
  reorganize(): void
}

export function Factory({ roomState, assetBase = "/", roomThemes, petAssets, onRenderMetrics, speed = 1, width, statusStyles, onLayout, onReady, onTaskLanded, onPick, biome: biomeName, onHopperDrop, acceptsHopperDrag }: FactoryProps) {
  const mount = useRef<HTMLDivElement>(null)
  const view = useRef<FactoryView | null>(null)
  const previous = useRef<Layout | undefined>(undefined)
  const snapshot = useMemo(() => roomSnapshotForView(roomState), [roomState])
  const biome = resolveBiome(biomeName)
  const hasHopperDrop = onHopperDrop !== undefined
  const latest = useRef({ roomState, onRenderMetrics, petAssets, roomThemes, statusStyles, onLayout, onReady, onTaskLanded, onPick, onHopperDrop, acceptsHopperDrag })
  const asked = useRef(0)
  const [drawn, setDrawn] = useState(0)
  const [picked, setPicked] = useState<Subject>()
  const [roaming, setRoaming] = useState<{ id: string; whereabouts: Whereabouts }>()
  const activeRides = useRef(new Set<string>())
  const [riding, setRiding] = useState<ReadonlySet<string>>(() => new Set())
  const styles = useMemo(() => resolveStatusStyles(statusStyles), [statusStyles])

  useEffect(() => {
    latest.current = { roomState, onRenderMetrics, petAssets, roomThemes, statusStyles, onLayout, onReady, onTaskLanded, onPick, onHopperDrop, acceptsHopperDrag }
  })
  useEffect(() => {
    if (biomeName !== undefined && !isBiome(biomeName)) console.warn(`Unknown factory biome "${biomeName}"; drawing grass.`)
  }, [biomeName])
  useEffect(() => {
    setPicked((before) => before && !onFloor(before, snapshot) ? undefined : before)
  }, [snapshot])

  useEffect(() => {
    if (!mount.current) return
    const created = createFactoryView(mount.current, {
      assetBase: assetBase.replace(/\/?$/, "/"),
      onRenderMetrics: onRenderMetrics ? (metrics) => latest.current.onRenderMetrics?.(metrics) : undefined,
      onClick: (picked) => {
        setPicked(picked)
        latest.current.onPick?.(picked)
      },
      onRoam: (id, whereabouts) => setRoaming({ id, whereabouts }),
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
    return () => { created.dispose(); view.current = null; asked.current++ }
  }, [])

  function drawnBy(drawing: Promise<Motions>, layout: Layout, failure: string) {
    const call = ++asked.current
    drawing.then((motions) => {
      if (call !== asked.current) return
      latest.current.onLayout?.(layout, motions)
      activeRides.current = new Set(motions.toPlay.map((motion) => motion.taskId))
      setRiding(new Set(activeRides.current))
      setDrawn((n) => n + 1)
    }).catch((error: unknown) => console.error(failure, error))
  }

  useEffect(() => { view.current?.setSpeed(speed) }, [speed])
  useEffect(() => { view.current?.setBiome(biome) }, [biome])
  useEffect(() => {
    view.current?.setHopperDrop(hasHopperDrop ? {
      accepts: (types) => latest.current.onHopperDrop !== undefined && (latest.current.acceptsHopperDrag?.(types) ?? true),
      drop(dataTransfer) {
        const { onHopperDrop, roomState } = latest.current
        const intake = roomState.configuration.rooms.find((room) => room.kind === "intake")
        if (!onHopperDrop || !intake) return
        const data: Record<string, string> = {}
        for (const type of dataTransfer.types) if (type !== "Files") data[type] = dataTransfer.getData(type)
        onHopperDrop({ roomId: intake.id, data, dataTransfer })
      },
    } : undefined)
  }, [hasHopperDrop])
  useEffect(() => {
    if (!view.current) return
    const layout = layoutConfiguredRooms(roomState, previous.current, width, activeRides.current)
    const traffic = comingsAndGoings(previous.current, layout)
    previous.current = layout
    drawnBy(view.current.show(layout, snapshot, { styles, petAssets, roomThemes }, traffic), layout, "The factory could not be drawn")
  }, [roomState, snapshot, width, styles, petAssets, roomThemes])

  const handle = useRef<FactoryHandle>({
    focus(subject) {
      if ("agent" in subject) view.current?.focusAgent(subject.agent)
      else view.current?.followTask(subject.task)
    },
    inspect(subject) { setPicked(subject); handle.current.focus(subject) },
    fitAll() { view.current?.fitAll() },
    reorganize() {
      const { roomState, petAssets, roomThemes, statusStyles } = latest.current
      if (!view.current || !previous.current) return
      const layout = layoutConfiguredRooms(roomState, previous.current, previous.current.bounds.w, activeRides.current, true)
      previous.current = layout
      drawnBy(view.current.reorganize(layout, roomSnapshotForView(roomState), { styles: resolveStatusStyles(statusStyles), petAssets, roomThemes }), layout, "The factory could not be reorganized")
    },
  })
  useEffect(() => { if (drawn === 1) latest.current.onReady?.(handle.current) }, [drawn])

  return <div className="factory factory-paper">
    <div ref={mount} className="factory-canvas" role="img" aria-label="Factory floor"
      aria-description={roomState.configuration.rooms.map((room) => room.billboard?.alt ? `${room.label}: ${room.billboard.alt}` : room.label).join("; ")}
      data-drawn={drawn} data-rooms={previous.current?.rooms?.length ?? 0} data-biome={biome} />
    <Hud snapshot={snapshot} roomState={roomState} riding={riding} styles={styles} picked={picked} ready={drawn > 0} roaming={roaming}
      onClose={() => setPicked(undefined)} onFitAll={() => handle.current.fitAll()} onReorganize={() => handle.current.reorganize()} />
  </div>
}

function onFloor(subject: Subject, snapshot: Snapshot): boolean {
  return "agent" in subject ? snapshot.agents.some((agent) => agent.id === subject.agent) || snapshot.mainAgent?.id === subject.agent :
    snapshot.tasks.some((task) => task.id === subject.task)
}
