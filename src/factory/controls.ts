// What the overseer does with the pointer and the keys, turned into plain
// calls on the view: drag to pan, wheel or pinch to zoom, WASD or the arrows
// to pan while held, plus and minus to zoom a step, F to fit all. A click, or
// the pointer at rest, hands over the point for the view to look under.

/** A point of the canvas, in pixels from its top left corner. */
export interface Point {
  x: number
  y: number
}

export interface ViewControls {
  /** The floor was dragged, or a pan key held, for this many screen pixels. */
  pan(dx: number, dy: number): void
  /** The wheel turned by this many pixels; positive is away from the overseer, zooming out. */
  zoom(deltaY: number): void
  /** The fingers of a pinch went from one distance apart to another, in pixels. */
  pinch(from: number, to: number): void
  /** A zoom key: in for 1, out for -1. */
  zoomStep(direction: 1 | -1): void
  fitAll(): void
  /** A click at a point of the canvas. */
  click(point: Point): void
  /** The pointer rests at a point of the canvas, or has left it or is busy with a drag or a pinch. Whether anything is under it. */
  hover(point: Point | undefined): boolean
}

/** Wheel events that count in lines rather than pixels, as Firefox sends, are about this many pixels a line. */
const PX_PER_WHEEL_LINE = 33
/** A trackpad pinch comes as a wheel with the control key held, in small steps. */
const PINCH_WHEEL_GAIN = 5
/** How far the pointer may travel during a press for it still to count as a click. */
const CLICK_SLOP_PX = 4
/** How far a tap of a pan key nudges the view, in screen pixels. */
const KEY_TAP_PX = 32
/** How far the view travels a second while a pan key is held, in screen pixels. */
const KEY_PAN_PX_PER_S = 600
/** Which way each pan key sends the view. */
const PAN_KEYS: ReadonlyMap<string, Point> = new Map([
  ["w", { x: 0, y: -1 }],
  ["a", { x: -1, y: 0 }],
  ["s", { x: 0, y: 1 }],
  ["d", { x: 1, y: 0 }],
  ["arrowup", { x: 0, y: -1 }],
  ["arrowleft", { x: -1, y: 0 }],
  ["arrowdown", { x: 0, y: 1 }],
  ["arrowright", { x: 1, y: 0 }],
])

/** Wire the canvas and the keyboard up to the controls. Returns the function that unwires them. */
export function attachControls(canvas: HTMLCanvasElement, controls: ViewControls): () => void {
  /** Every pointer pressed on the canvas, where it is now. */
  const pointers = new Map<number, Point>()
  /** The first pointer's press: a click unless it travels, a drag once it has. */
  let press: { id: number; start: Point; last: Point; dragging: boolean } | undefined
  /** How far apart the two pointers of a pinch were last. */
  let pinchSpan: number | undefined

  const canvasPoint = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const span = (): number => {
    const [a, b] = [...pointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  /** Tell the view where the pointer rests, and show a hand over anything under it. */
  const rest = (point: Point | undefined) => {
    canvas.style.cursor = controls.hover(point) ? "pointer" : ""
  }

  const onPointerDown = (event: PointerEvent) => {
    // Only the main button presses, drags and clicks; the others are the browser's.
    if (event.button !== 0) return
    const at = { x: event.clientX, y: event.clientY }
    pointers.set(event.pointerId, at)
    canvas.setPointerCapture(event.pointerId)
    // Take the keys back from whatever the overseer last clicked in the HUD.
    canvas.focus({ preventScroll: true })
    if (pointers.size === 1) {
      press = { id: event.pointerId, start: at, last: at, dragging: false }
    } else if (pointers.size === 2) {
      // Two fingers down: a pinch, and no click or drag from either.
      press = undefined
      pinchSpan = span()
      rest(undefined)
    }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) {
      rest(canvasPoint(event))
      return
    }
    const at = { x: event.clientX, y: event.clientY }
    pointers.set(event.pointerId, at)
    if (pinchSpan !== undefined && pointers.size >= 2) {
      const now = span()
      controls.pinch(pinchSpan, now)
      pinchSpan = now
    } else if (press?.id === event.pointerId) {
      if (!press.dragging && Math.hypot(at.x - press.start.x, at.y - press.start.y) > CLICK_SLOP_PX) {
        press.dragging = true
        controls.hover(undefined)
        canvas.style.cursor = "grabbing"
      }
      if (press.dragging) controls.pan(at.x - press.last.x, at.y - press.last.y)
      press.last = at
    }
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.type === "pointerup" && event.button !== 0) return
    if (!pointers.delete(event.pointerId)) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (press?.id === event.pointerId) {
      if (!press.dragging && event.type === "pointerup") controls.click(canvasPoint(event))
      press = undefined
    }
    if (pointers.size < 2) pinchSpan = undefined
    if (pointers.size === 0) rest(event.type === "pointerup" ? canvasPoint(event) : undefined)
  }
  const onPointerLeave = () => rest(undefined)
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const px = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * PX_PER_WHEEL_LINE : event.deltaY
    controls.zoom(event.ctrlKey ? px * PINCH_WHEEL_GAIN : px)
  }

  /** The pan keys held, and the frame loop that pans while any is. */
  const held = new Set<string>()
  let frame: number | undefined
  let lastFrame: number | undefined
  const panWhileHeld = (time: number) => {
    const dt = lastFrame === undefined ? 0 : (time - lastFrame) / 1000
    lastFrame = time
    let x = 0
    let y = 0
    for (const key of held) {
      const way = PAN_KEYS.get(key)
      if (!way) continue
      x += way.x
      y += way.y
    }
    // The view goes the way of the key, so the floor is dragged the other way.
    if (x !== 0 || y !== 0) controls.pan(-x * KEY_PAN_PX_PER_S * dt, -y * KEY_PAN_PX_PER_S * dt)
    frame = held.size > 0 ? requestAnimationFrame(panWhileHeld) : undefined
    if (frame === undefined) lastFrame = undefined
  }
  /** Whether the keys are the floor's: the pointer is over it, or it was the last thing pressed. The host's page keeps them otherwise. */
  const engaged = () => document.activeElement === canvas || canvas.matches(":hover")
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !engaged() || typing(event.target)) return
    const key = event.key.toLowerCase()
    const way = PAN_KEYS.get(key)
    if (way) {
      event.preventDefault()
      if (event.repeat) return
      // A tap nudges the view; a hold pans it on from there.
      controls.pan(-way.x * KEY_TAP_PX, -way.y * KEY_TAP_PX)
      held.add(key)
      frame ??= requestAnimationFrame(panWhileHeld)
    } else if (key === "f") {
      controls.fitAll()
    } else if (key === "+" || key === "=") {
      controls.zoomStep(1)
    } else if (key === "-" || key === "_") {
      controls.zoomStep(-1)
    }
  }
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.key.toLowerCase())
  const onBlur = () => held.clear()

  canvas.style.cursor = ""
  canvas.tabIndex = -1
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.addEventListener("pointercancel", onPointerUp)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("wheel", onWheel, { passive: false })
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onBlur)

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown)
    canvas.removeEventListener("pointermove", onPointerMove)
    canvas.removeEventListener("pointerup", onPointerUp)
    canvas.removeEventListener("pointercancel", onPointerUp)
    canvas.removeEventListener("pointerleave", onPointerLeave)
    canvas.removeEventListener("wheel", onWheel)
    window.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("keyup", onKeyUp)
    window.removeEventListener("blur", onBlur)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
}

/** Whether a key press belongs to something the overseer is typing into, which the view leaves alone. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}
