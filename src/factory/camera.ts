// The diorama camera as numbers: where it looks on the floor and how far in.
// Pure, so the pan and zoom limits are tested without a renderer; the view
// turns a pose into a three.js camera.

import type { Rect } from "~/floor/types"

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
/** The camera's angle below the horizon. Fixed: the sprites read correctly only from here. */
export const PITCH = (50 * Math.PI) / 180
/** Pixels of wheel travel for one doubling of the zoom. */
const WHEEL_PX_PER_DOUBLING = 500
/** How far past the floor's edge the camera may look. */
const PAN_MARGIN = 2
/** Room kept around the floor when framing it, in tiles. */
const FIT_MARGIN = 1
/** Height of what stands on the floor, in tiles, so framing leaves room for it. */
const HEADROOM = 2

export function zoomBy(pose: CameraPose, deltaY: number): CameraPose {
  return { ...pose, zoom: clamp(pose.zoom * 2 ** (-deltaY / WHEEL_PX_PER_DOUBLING), ZOOM_MIN, ZOOM_MAX) }
}

/** Move the target so the floor follows a drag of dx, dy screen pixels. Depth is foreshortened by the pitch. */
export function panBy(pose: CameraPose, dx: number, dy: number): CameraPose {
  const tilesPerPx = 1 / (PX_PER_TILE * pose.zoom)
  return { ...pose, x: pose.x - dx * tilesPerPx, z: pose.z - (dy * tilesPerPx) / Math.sin(PITCH) }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
