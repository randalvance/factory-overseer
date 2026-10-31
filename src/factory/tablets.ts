// What a tablet's face shows, drawn on a canvas per look and cached for the
// life of the page, so a station's tablet changes by swapping its face.

import * as THREE from "three"
import type { StatusIcon } from "~/model/status"
import { canvasTexture, pixelated } from "./textures"

export type TabletLook =
  | { kind: "dim" }
  /** Lines of work going by; the texture repeats, so scroll it by its offset. */
  | { kind: "lines" }
  | { kind: "bar"; progress: number }
  /** An icon on the face: red for a warning, the usual blue otherwise. */
  | { kind: "icon"; name: Exclude<StatusIcon, "none">; icon: THREE.Texture }

const FACE_PX = { w: 44, h: 32 }
const FACE = "#2e6a8a"
const ALARM = "#b3261e"
const LIGHT = "#bfe6f5"
/** Progress is drawn in this many steps, so a bar is cached per step rather than per value. */
const BAR_STEPS = 32
const faces = new Map<string, THREE.CanvasTexture>()

/** A tablet face. Cached per look. */
export function tabletTexture(look: TabletLook): THREE.CanvasTexture {
  const key = faceKey(look)
  let texture = faces.get(key)
  if (!texture) {
    texture = pixelated(canvasTexture(FACE_PX.w, FACE_PX.h, (ctx, w, h) => drawFace(ctx, w, h, look)))
    if (look.kind === "lines") texture.wrapT = THREE.RepeatWrapping
    faces.set(key, texture)
  }
  return texture
}

function faceKey(look: TabletLook): string {
  switch (look.kind) {
    case "bar":
      return `bar:${barStep(look.progress)}`
    case "icon":
      return `icon:${look.name}`
    default:
      return look.kind
  }
}

function barStep(progress: number): number {
  return Math.round(Math.min(Math.max(progress, 0), 1) * BAR_STEPS)
}

function drawFace(ctx: CanvasRenderingContext2D, w: number, h: number, look: TabletLook) {
  switch (look.kind) {
    case "dim":
      ctx.fillStyle = "#16222c"
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "#1c2d3a"
      ctx.fillRect(4, 4, w - 8, h - 8)
      return
    case "lines": {
      ctx.fillStyle = FACE
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = LIGHT
      // Four lines eight pixels apart, so the top and bottom edges meet when the texture repeats.
      for (const [i, width] of [30, 18, 34, 12].entries()) ctx.fillRect(5, 2 + i * 8, width, 3)
      return
    }
    case "bar": {
      ctx.fillStyle = FACE
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = LIGHT
      ctx.lineWidth = 2
      ctx.strokeRect(5, 11, w - 10, 10)
      ctx.fillStyle = "#ffd166"
      ctx.fillRect(7, 13, Math.round(((w - 14) * barStep(look.progress)) / BAR_STEPS), 6)
      return
    }
    case "icon": {
      ctx.fillStyle = look.name === "warning" ? ALARM : FACE
      ctx.fillRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(look.icon.image as CanvasImageSource, (w - 24) / 2, (h - 24) / 2, 24, 24)
      return
    }
  }
}
