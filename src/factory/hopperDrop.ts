// The hopper as a drop target for the host's own HTML5 drags. A drag the
// host accepts arms the hopper as it comes over the canvas; over the hopper
// it may be let go, and the host is told what was dropped. The factory never
// makes the task itself: the host publishes the snapshot that queues it
// (ADR 0001), and its box drops out of the hopper like any other newcomer.

import * as THREE from "three"
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

const COPY_ALLOWED = new Set(["copy", "copyMove", "copyLink", "all", "uninitialized"])
const MOVE_ALLOWED = new Set(["move", "linkMove"])

export function hopperDragState(accepted: boolean, overHopper: boolean): HopperDragState {
  return !accepted ? "none" : overHopper ? "over" : "armed"
}

/** What the pointer shows over the hopper from what the drag source permits, and no drop elsewhere on the canvas. */
export function hopperDropEffect(
  state: HopperDragState,
  effectAllowed: DataTransfer["effectAllowed"] = "uninitialized",
): DataTransfer["dropEffect"] {
  if (state !== "over") return "none"
  if (COPY_ALLOWED.has(effectAllowed)) return "copy"
  if (MOVE_ALLOWED.has(effectAllowed)) return "move"
  if (effectAllowed === "link") return "link"
  return "none"
}

/** The cached meshes of one drawing for hopper hit testing. */
export interface HopperHitTarget {
  hopper: THREE.Object3D | undefined
  hopperMeshes: THREE.Mesh[]
  occluders: THREE.Mesh[]
}

/** Collect the hopper's own meshes and every other piece above the ground that may occlude it. */
export function hopperHitTarget(drawing: THREE.Group): HopperHitTarget {
  drawing.updateMatrixWorld(true)
  const hopper = drawing.getObjectByName("hopper")
  const hopperMeshes: THREE.Mesh[] = []
  const occluders: THREE.Mesh[] = []
  for (const piece of drawing.children) {
    if (piece.name === "floor" || piece.name === "paper-road" || piece === drawing.userData.batch?.batch) continue
    const bucket = piece.name === "hopper" ? hopperMeshes : occluders
    piece.traverse((object) => {
      if (object instanceof THREE.Mesh) bucket.push(object)
    })
  }
  return { hopper, hopperMeshes, occluders }
}

/** Whether the ray strikes the drawn hopper before any nearer box, agent, tree or other piece. */
export function hitsHopper(raycaster: THREE.Raycaster, target: HopperHitTarget, nearerDistance = Infinity): boolean {
  if (!target.hopperMeshes.length) return false
  target.hopper?.updateWorldMatrix(true, true)
  const [hit] = raycaster.intersectObjects(target.hopperMeshes, false)
  if (!hit || hit.distance >= nearerDistance) return false
  target.hopper?.parent?.updateMatrixWorld()
  for (const occluder of target.occluders) {
    const [blocked] = raycaster.intersectObject(occluder, false)
    if (blocked && blocked.distance < hit.distance) return false
  }
  return true
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
    event.dataTransfer!.dropEffect = hopperDropEffect(next, event.dataTransfer!.effectAllowed)
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
