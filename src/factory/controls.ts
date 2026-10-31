// Drag to pan, wheel to zoom: the pointer and wheel events on the canvas,
// turned into plain pan and zoom calls. Keyboard, pinch and the rest come
// later.

export interface CameraControls {
  /** The floor was dragged by this many screen pixels. */
  pan(dx: number, dy: number): void
  /** The wheel turned by this many pixels; positive is away from the overseer, zooming out. */
  zoom(deltaY: number): void
}

/** Wheel events that count in lines rather than pixels, as Firefox sends, are about this many pixels a line. */
const PX_PER_WHEEL_LINE = 33

/** Wire the canvas up to the controls. Returns the function that unwires it. */
export function attachControls(canvas: HTMLCanvasElement, controls: CameraControls): () => void {
  let drag: { x: number; y: number } | undefined

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY }
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor = "grabbing"
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return
    controls.pan(event.clientX - drag.x, event.clientY - drag.y)
    drag = { x: event.clientX, y: event.clientY }
  }
  const onPointerUp = (event: PointerEvent) => {
    drag = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    canvas.style.cursor = "grab"
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    controls.zoom(event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * PX_PER_WHEEL_LINE : event.deltaY)
  }

  canvas.style.cursor = "grab"
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.addEventListener("pointercancel", onPointerUp)
  canvas.addEventListener("wheel", onWheel, { passive: false })

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown)
    canvas.removeEventListener("pointermove", onPointerMove)
    canvas.removeEventListener("pointerup", onPointerUp)
    canvas.removeEventListener("pointercancel", onPointerUp)
    canvas.removeEventListener("wheel", onWheel)
  }
}
