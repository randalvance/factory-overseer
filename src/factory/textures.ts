// The placeholder textures, drawn on canvases so nothing has to be fetched,
// and the stock sheet loader. Everything is nearest-filtered: the look is
// chunky pixels, not blur. Textures are shared and cached for the life of the
// page, so nothing here is disposed.

import * as THREE from "three"

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void

function canvasTexture(size: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas is not available")
  draw(ctx, size)
  return pixelated(new THREE.CanvasTexture(canvas))
}

function pixelated<T extends THREE.Texture>(texture: T): T {
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

let belt: THREE.CanvasTexture | undefined

/** One tile of belt: dark green between two rails, with a light chevron pointing the way boxes travel. */
export function beltTexture(): THREE.CanvasTexture {
  belt ??= canvasTexture(32, (ctx, s) => {
    ctx.fillStyle = "#24483a"
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = "#172e25"
    ctx.fillRect(0, 0, s, 3)
    ctx.fillRect(0, s - 3, s, 3)
    ctx.strokeStyle = "#5fb48c"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(11, 7)
    ctx.lineTo(21, s / 2)
    ctx.lineTo(11, s - 7)
    ctx.stroke()
  })
  belt.wrapS = THREE.RepeatWrapping
  return belt
}

let floor: THREE.CanvasTexture | undefined

/** One concrete floor tile with a grout line around it. Repeats once per tile. */
export function floorTexture(): THREE.CanvasTexture {
  floor ??= canvasTexture(32, (ctx, s) => {
    ctx.fillStyle = "#7d8593"
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = "#737b89"
    for (const [x, y] of [[6, 9], [20, 4], [13, 22], [25, 18], [3, 26]]) ctx.fillRect(x!, y!, 2, 2)
    ctx.strokeStyle = "#5e6674"
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, s - 2, s - 2)
  })
  floor.wrapS = THREE.RepeatWrapping
  floor.wrapT = THREE.RepeatWrapping
  return floor
}

const labels = new Map<string, THREE.CanvasTexture>()

/** A box face: the task's colour with its label printed across it. Cached per label and colour. */
export function labelTexture(label: string, color: string): THREE.CanvasTexture {
  const key = `${color}\n${label}`
  let texture = labels.get(key)
  if (!texture) {
    texture = canvasTexture(64, (ctx, s) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, s, s)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, s - 4, s - 4)
      ctx.fillStyle = "#1c1711"
      ctx.font = `bold ${Math.round(s * 0.34)}px ui-monospace, Menlo, monospace`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(label, s / 2, s / 2 + 1, s - 10)
    })
    labels.set(key, texture)
  }
  return texture
}

const sheets = new Map<string, Promise<THREE.Texture>>()
const loader = new THREE.TextureLoader()

/** A sheet by URL, nearest-filtered so the pixels stay crisp. Loaded once per URL; a failed load is tried again next time. */
export function loadSheet(url: string): Promise<THREE.Texture> {
  let sheet = sheets.get(url)
  if (!sheet) {
    sheet = loader.loadAsync(url).then(pixelated)
    sheet.catch(() => sheets.delete(url))
    sheets.set(url, sheet)
  }
  return sheet
}
