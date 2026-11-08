// The hopper as a drop target for the host's own HTML5 drags. A drag the
// host accepts arms the hopper as it comes over the canvas; over the hopper
// it may be let go, and the host is told what was dropped. The factory never
// makes the task itself: the host publishes the snapshot that queues it
// (ADR 0001), and its box drops out of the hopper like any other newcomer.

import type { Point } from "./controls"

/** No accepted drag; one over the canvas, but not the hopper; or one over the hopper, where it may be let go. */
export type HopperDragState = "none" | "armed" | "over"

export interface HopperDropTarget {
  /** Whether a drag carrying these data types may be let go over the hopper. */
  accepts(types: readonly string[]): boolean
  /** Whether a point of the canvas lies over the hopper. */
  over(point: Point): boolean
  /** The drag state changed. */
  changed(state: HopperDragState): void
  /** An accepted drag was let go over the hopper. Its data can be read only during this call. */
  drop(dataTransfer: DataTransfer, point: Point): void
}

export function hopperDragState(accepted: boolean, overHopper: boolean): HopperDragState {
  return !accepted ? "none" : overHopper ? "over" : "armed"
}

/** What the pointer shows: a copy over the hopper, and no drop elsewhere on the canvas. */
export function hopperDropEffect(state: HopperDragState): "copy" | "none" {
  return state === "over" ? "copy" : "none"
}

/** Wire the canvas's drag events to the hopper. Returns the function that unwires them. */
export function attachHopperDrop(canvas: HTMLCanvasElement, target: HopperDropTarget): () => void {
  let state: HopperDragState = "none"
  const become = (next: HopperDragState) => {
    if (next === state) return
    state = next
    target.changed(next)
  }
  const canvasPoint = (event: DragEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const accepted = (event: DragEvent) => event.dataTransfer !== null && target.accepts([...event.dataTransfer.types])

  const onDragOver = (event: DragEvent) => {
    // Drags the host does not accept are the page's: neither cancelled nor shown.
    if (!accepted(event)) return become("none")
    // Cancelled across the whole canvas, so the browser keeps it the drop
    // target; the drop effect alone says whether letting go here does anything.
    event.preventDefault()
    const next = hopperDragState(true, target.over(canvasPoint(event)))
    event.dataTransfer!.dropEffect = hopperDropEffect(next)
    become(next)
  }
  const onDragLeave = () => become("none")
  const onDrop = (event: DragEvent) => {
    if (!accepted(event)) return become("none")
    event.preventDefault()
    const point = canvasPoint(event)
    const over = target.over(point)
    become("none")
    if (over) target.drop(event.dataTransfer!, point)
  }

  canvas.addEventListener("dragenter", onDragOver)
  canvas.addEventListener("dragover", onDragOver)
  canvas.addEventListener("dragleave", onDragLeave)
  canvas.addEventListener("drop", onDrop)
  return () => {
    canvas.removeEventListener("dragenter", onDragOver)
    canvas.removeEventListener("dragover", onDragOver)
    canvas.removeEventListener("dragleave", onDragLeave)
    canvas.removeEventListener("drop", onDrop)
  }
}
