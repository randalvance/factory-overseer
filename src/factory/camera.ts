// The diorama camera as numbers: where it looks on the floor and how far in.
// Pure, so the pan and zoom limits are tested without a renderer; the view
// turns a pose into a three.js camera.

import type { Layout, Rect } from "~/floor/types"
import { paperTruckPlacement } from "./paperTruck"

export interface Viewport {
  width: number
  height: number
}

/** The point on the floor under the middle of the screen, and the zoom factor. */
export interface CameraPose {
  x: number
  z: number
  zoom: number
}

/** Half shows the whole floor; four times reads a tablet. */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 4
/** Screen pixels across one tile at zoom 1. */
export const PX_PER_TILE = 64
/** Fixed legacy camera angle below the horizon, matching the pixel sprite sheets. */
export const PITCH = (50 * Math.PI) / 180
/** A lower view of the paper model exposes desk fronts, folded feet and raised belts. */
export const PAPER_PITCH = (38 * Math.PI) / 180
/** Mild perspective gives the front rooms more presence without a wide-angle lens. */
export const PAPER_CAMERA_DISTANCE = 50
/** Pixels of wheel travel for one doubling of the zoom. */
const WHEEL_PX_PER_DOUBLING = 500
/** What one press of a zoom key multiplies the zoom by: six presses from half to four times. */
const ZOOM_STEP = Math.SQRT2
/** How far past the floor's edge the camera may look. */
const PAN_MARGIN = 2
/** Room kept around the floor when framing it, in tiles. */
const FIT_MARGIN = 1
/** Height of what stands on the floor, in tiles, so framing leaves room for it. */
const HEADROOM = 2

export function zoomBy(pose: CameraPose, deltaY: number): CameraPose {
  return { ...pose, zoom: clamp(pose.zoom * 2 ** (-deltaY / WHEEL_PX_PER_DOUBLING), ZOOM_MIN, ZOOM_MAX) }
}

/** One press of a zoom key: in for 1, out for -1. */
export function zoomStep(pose: CameraPose, direction: 1 | -1): CameraPose {
  return { ...pose, zoom: clamp(pose.zoom * ZOOM_STEP ** direction, ZOOM_MIN, ZOOM_MAX) }
}

/** A pinch: the distance between the fingers went from one length to another, in pixels, and the zoom scales with it. Fingers with no distance between them pinch nothing. */
export function pinchBy(pose: CameraPose, from: number, to: number): CameraPose {
  if (from <= 0 || to <= 0) return pose
  return { ...pose, zoom: clamp((pose.zoom * to) / from, ZOOM_MIN, ZOOM_MAX) }
}

/** Move the target so the floor follows a drag of dx, dy screen pixels. Depth is foreshortened by the pitch. */
export function panBy(pose: CameraPose, dx: number, dy: number, pitch = PITCH): CameraPose {
  const tilesPerPx = 1 / (PX_PER_TILE * pose.zoom)
  return { ...pose, x: pose.x - dx * tilesPerPx, z: pose.z - (dy * tilesPerPx) / Math.sin(pitch) }
}

export function clampToFloor(pose: CameraPose, floor: Rect): CameraPose {
  return {
    ...pose,
    x: clamp(pose.x, floor.x - PAN_MARGIN, floor.x + floor.w + PAN_MARGIN),
    z: clamp(pose.z, floor.y - PAN_MARGIN, floor.y + floor.h + PAN_MARGIN),
  }
}

/**
 * The pose the view opens on: the floor's width filling the viewport, so the
 * overseer never scrolls sideways, and the whole floor when it fits; when it
 * is taller than the viewport, the back of it, from where the overseer pans
 * toward the camera. On screen a tile of depth is foreshortened by the pitch,
 * and what stands on the floor rises above the back wall by the headroom.
 */
export function fitFloor(floor: Rect, viewport: Viewport): CameraPose {
  const zoom = clamp(viewport.width / ((floor.w + 2 * FIT_MARGIN) * PX_PER_TILE), ZOOM_MIN, ZOOM_MAX)
  const screenDepth = floor.h * Math.sin(PITCH) + HEADROOM * Math.cos(PITCH)
  const screenHalfHeight = viewport.height / PX_PER_TILE / zoom / 2
  const fits = screenDepth + 2 * FIT_MARGIN <= 2 * screenHalfHeight
  const z = fits
    ? floor.y + floor.h / 2
    : floor.y + (screenHalfHeight - FIT_MARGIN - HEADROOM * Math.cos(PITCH)) / Math.sin(PITCH)
  return { x: floor.x + floor.w / 2, z, zoom }
}

/** The perspective lens preserves the existing pixels-per-tile scale at its target. */
export function paperFieldOfView(viewportHeight: number): number {
  return 2 * Math.atan(viewportHeight / (2 * PX_PER_TILE * PAPER_CAMERA_DISTANCE)) * 180 / Math.PI
}

export interface PaperPoint { x: number; y: number; z: number }
interface ScreenPoint { x: number; y: number }

/** Project the fixed paper camera without a renderer, for framing its physical model. */
export function projectDioramaPoint(point: PaperPoint, pose: CameraPose, viewport: Viewport, pitch = PAPER_PITCH): ScreenPoint {
  const dz = point.z - pose.z
  const depth = PAPER_CAMERA_DISTANCE - point.y * Math.sin(pitch) - dz * Math.cos(pitch)
  const scale = PX_PER_TILE * pose.zoom * PAPER_CAMERA_DISTANCE / depth
  return {
    x: viewport.width / 2 + (point.x - pose.x) * scale,
    y: viewport.height / 2 + (dz * Math.sin(pitch) - point.y * Math.cos(pitch)) * scale,
  }
}

/** Ground intersection of a ray through a screen point; undefined above the horizon. */
function dioramaGroundPoint(point: ScreenPoint, pose: CameraPose, viewport: Viewport): { x: number; z: number } | undefined {
  const across = (point.x - viewport.width / 2) / (PX_PER_TILE * pose.zoom)
  const up = (viewport.height / 2 - point.y) / (PX_PER_TILE * pose.zoom)
  const denominator = PAPER_CAMERA_DISTANCE * Math.sin(PAPER_PITCH) - up * Math.cos(PAPER_PITCH)
  if (denominator <= .001) return undefined
  const dz = -up * PAPER_CAMERA_DISTANCE / denominator
  const depth = PAPER_CAMERA_DISTANCE - dz * Math.cos(PAPER_PITCH)
  return { x: pose.x + across * depth / PAPER_CAMERA_DISTANCE, z: pose.z + dz }
}

/** Anchor a dragged floor point under the pointer despite perspective foreshortening.
 * Keyboard pans use the canvas center as their anchor.
 */
export function panDiorama(pose: CameraPose, viewport: Viewport, dx: number, dy: number, at: ScreenPoint = { x: viewport.width / 2, y: viewport.height / 2 }): CameraPose {
  const from = dioramaGroundPoint({ x: at.x - dx, y: at.y - dy }, pose, viewport)
  const to = dioramaGroundPoint(at, pose, viewport)
  if (!from || !to) return panBy(pose, dx, dy, PAPER_PITCH)
  return { ...pose, x: pose.x + from.x - to.x, z: pose.z + from.z - to.z }
}

/** Extremes of the authored model, excluding empty corners of its floor rectangle.
 * These points retain real room depth and height instead of inventing tall
 * foreground walls in the unused corners of a staggered room arrangement.
 */
export function dioramaModelPoints(layout: Layout): PaperPoint[] {
  const points: PaperPoint[] = []
  for (const room of layout.rooms ?? []) {
    if (room.kind === "intake") continue // The outdoor hopper is framed separately below.
    const { x, y, w, h } = room.rect
    for (const px of [x - .1, x + w + .1]) {
      for (const z of [y - .1, y + h + .1]) points.push({ x: px, y: -.22, z })
      points.push({ x: px, y: 2.35, z: y + .1 }, { x: px, y: .8, z: y + h })
    }
    const signHalfWidth = Math.min(w, 7) * .79 / 2
    for (const px of [x + w / 2 - signHalfWidth, x + w / 2 + signHalfWidth]) {
      points.push({ x: px, y: 3.48, z: y + .09 })
    }
  }
  const visited = new Set<string>()
  for (const belt of layout.belts) for (const tile of belt.tiles) {
    const key = `${tile.x},${tile.y}`
    if (visited.has(key)) continue
    visited.add(key)
    for (const x of [tile.x, tile.x + 1]) for (const z of [tile.y, tile.y + 1]) {
      points.push({ x, y: .95, z }, { x, y: -.22, z })
    }
  }
  const intake = layout.intake.rect
  for (const x of [intake.x + intake.w / 2 - .85, intake.x + intake.w / 2 + .85]) {
    for (const z of [intake.y + intake.h / 2 - .85, intake.y + intake.h / 2 + .85]) points.push({ x, y: 3, z })
  }
  const truck = paperTruckPlacement(layout)
  // The grass and exit road continue outside the view; frame the factory
  // and its parked truck rather than zooming out to their distant edges.
  if (truck) {
    const { x, y, w, h } = truck.footprint
    for (const px of [x, x + w]) for (const z of [y, y + h]) {
      points.push({ x: px, y: truck.groundY, z }, { x: px, y: truck.topY, z })
    }
  }
  return points
}

/** Fit the actual paper layout, including staggered room edges and corridor supports. */
export function fitDioramaLayout(layout: Layout, viewport: Viewport): CameraPose {
  return fitDiorama(layout.bounds, viewport, PAPER_PITCH, dioramaModelPoints(layout))
}

/** Frame the complete paper model in perspective, including raised rear belts,
 * sign tops and the cardstock base; keep the canvas HUD above the composition.
 * A map beyond the manual zoom range remains pannable.
 */
export function fitDiorama(floor: Rect, viewport: Viewport, pitch = PAPER_PITCH, modelPoints?: readonly PaperPoint[]): CameraPose {
  const hudPixels = 48
  const x = floor.x + floor.w / 2
  // Very deep maps cannot fit at the minimum zoom. Start at the back, with
  // the visible portion in front of the camera rather than behind its eye.
  if (floor.h * Math.cos(pitch) > PAPER_CAMERA_DISTANCE) {
    const depth = Math.max(1, viewport.height - hudPixels) / (PX_PER_TILE * ZOOM_MIN * Math.sin(pitch))
    return { x, z: floor.y + Math.min(depth / 2, PAPER_CAMERA_DISTANCE / 3), zoom: ZOOM_MIN }
  }
  const fallbackPoints: PaperPoint[] = []
  for (const px of [floor.x - .1, floor.x + floor.w + .1]) {
    for (const z of [floor.y - .1, floor.y + floor.h + .1]) {
      fallbackPoints.push({ x: px, y: -.22, z }, { x: px, y: .95, z })
    }
    for (const z of [floor.y + Math.min(3, floor.h / 2), floor.y + Math.max(floor.h - 3, floor.h / 2)]) {
      fallbackPoints.push({ x: px, y: 3.4, z })
    }
  }
  const points = modelPoints?.length ? modelPoints : fallbackPoints
  let pose: CameraPose = { x, z: floor.y + floor.h / 2, zoom: 1 }
  // A small fixed-point solve accounts for how moving the look target changes
  // both perspective scale and the model's projected center.
  for (let i = 0; i < 12; i++) {
    const projected = points.map((point) => projectDioramaPoint(point, { ...pose, zoom: 1 }, { width: 0, height: 0 }, pitch))
    const left = Math.min(...projected.map((point) => point.x))
    const right = Math.max(...projected.map((point) => point.x))
    const top = Math.min(...projected.map((point) => point.y))
    const bottom = Math.max(...projected.map((point) => point.y))
    const widthZoom = viewport.width / (right - left + 2 * FIT_MARGIN * PX_PER_TILE)
    const heightZoom = Math.max(1, viewport.height - hudPixels) / (bottom - top + 2 * FIT_MARGIN * PX_PER_TILE)
    const zoom = clamp(Math.min(widthZoom, heightZoom), ZOOM_MIN, ZOOM_MAX)
    const centerError = (top + bottom) / 2 - hudPixels / (2 * zoom)
    pose = { x: pose.x + (left + right) / (2 * PX_PER_TILE), z: pose.z + centerError / (PX_PER_TILE * Math.sin(pitch)), zoom }
  }
  return pose
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
