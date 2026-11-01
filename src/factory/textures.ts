// The textures drawn on canvases, labels, counts and bubbles, and the loader
// for what is fetched: sheets and icons. The pieces bring their own textures
// in their GLB. Pixel art is nearest-filtered so the look is chunky pixels,
// not blur; bubble text is not. Textures are shared and cached for the life
// of the page, so nothing here is disposed. The tablet faces, drawn the same
// way, are in tablets.ts.

import * as THREE from "three"

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

/** A texture drawn on a fresh canvas of the given size. */
export function canvasTexture(width: number, height: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas is not available")
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Nearest-filtered, so the pixels stay crisp at every zoom. */
export function pixelated<T extends THREE.Texture>(texture: T): T {
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function pixelTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  return pixelated(canvasTexture(size, size, (ctx, s) => draw(ctx, s)))
}

const labels = new Map<string, THREE.CanvasTexture>()

/** The font stack of every label, count and bubble. */
const MONO = "ui-monospace, Menlo, Consolas, monospace"

/** A box's face: its label on a plate in a colour, stuck on the cardboard. Cached per label and colour; the cardboard is the same for every box. */
export function labelTexture(label: string, color: string, cardboard: CanvasImageSource): THREE.CanvasTexture {
  const key = `${color}\n${label}`
  let texture = labels.get(key)
  if (!texture) {
    texture = pixelTexture(64, (ctx, s) => {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(cardboard, 0, 0, s, s)
      ctx.fillStyle = color
      ctx.fillRect(8, 18, s - 16, s - 36)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"
      ctx.lineWidth = 2
      ctx.strokeRect(9, 19, s - 18, s - 38)
      ctx.fillStyle = "#1c1711"
      ctx.font = `bold ${Math.round(s * 0.3)}px ${MONO}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(label, s / 2, s / 2 + 1, s - 20)
    })
    // The box piece's faces read their texture from the top, as the GLB's textures are, so the canvas goes on unflipped.
    texture.flipY = false
    labels.set(key, texture)
  }
  return texture
}

const counts = new Map<number, THREE.CanvasTexture>()

/** A plate with a count on it, in safety yellow on dark: the container's total. */
export function countTexture(count: number): THREE.CanvasTexture {
  let texture = counts.get(count)
  if (!texture) {
    texture = canvasTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = "#1a2634"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "#ffd166"
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, w - 4, h - 4)
      ctx.fillStyle = "#ffd166"
      ctx.font = `bold 40px ${MONO}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(count), w / 2, h / 2 + 2, w - 16)
    })
    counts.set(count, texture)
  }
  return texture
}

/** Canvas pixels per tile for text: twice the base zoom, so it stays sharp zoomed in. */
export const TEXT_PX_PER_TILE = 128

const BUBBLE_FONT = `bold 24px ${MONO}`
const BUBBLE_PAD = 14
const BUBBLE_BODY_H = 44
const BUBBLE_TAIL_H = 8
const bubbles = new Map<string, THREE.CanvasTexture>()
let ruler: CanvasRenderingContext2D | undefined

/** A speech bubble with the text in it and its tail at the bottom centre. Cached per text. */
export function bubbleTexture(text: string): THREE.CanvasTexture {
  let texture = bubbles.get(text)
  if (!texture) {
    ruler ??= document.createElement("canvas").getContext("2d") ?? undefined
    if (!ruler) throw new Error("2D canvas is not available")
    ruler.font = BUBBLE_FONT
    const width = Math.ceil(ruler.measureText(text).width) + 2 * BUBBLE_PAD
    texture = canvasTexture(width, BUBBLE_BODY_H + BUBBLE_TAIL_H, (ctx, w) => {
      ctx.fillStyle = "#f4f6fa"
      ctx.strokeStyle = "#1c2230"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(1.5, 1.5, w - 3, BUBBLE_BODY_H - 3, 10)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(w / 2 - 8, BUBBLE_BODY_H - 2)
      ctx.lineTo(w / 2, BUBBLE_BODY_H + BUBBLE_TAIL_H - 1)
      ctx.lineTo(w / 2 + 8, BUBBLE_BODY_H - 2)
      ctx.fill()
      ctx.fillStyle = "#f4f6fa"
      ctx.fillRect(w / 2 - 7, BUBBLE_BODY_H - 4, 14, 3)
      ctx.fillStyle = "#1c2230"
      ctx.font = BUBBLE_FONT
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(text, w / 2, BUBBLE_BODY_H / 2 + 1)
    })
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    bubbles.set(text, texture)
  }
  return texture
}

let blank: THREE.CanvasTexture | undefined

/** A clear 1 by 1 texture: what an icon that could not be loaded shows, which is nothing. */
export function blankTexture(): THREE.CanvasTexture {
  blank ??= canvasTexture(1, 1, () => {})
  return blank
}

const loaded = new Map<string, Promise<THREE.Texture>>()
const loader = new THREE.TextureLoader()

/** A sheet or an icon by URL, nearest-filtered so the pixels stay crisp. Loaded once per URL; a failed load is tried again next time. */
export function loadTexture(url: string): Promise<THREE.Texture> {
  let texture = loaded.get(url)
  if (!texture) {
    texture = loader.loadAsync(url).then(pixelated)
    texture.catch(() => loaded.delete(url))
    loaded.set(url, texture)
  }
  return texture
}
