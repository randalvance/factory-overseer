import * as THREE from "three"
import type { Agent } from "~/model/types"

/** Authored illustrated cutouts, using the 6×4 paper animation grid. */
export const PAPER_AGENT_H = 2.3
const CELL_W = 128
const CELL_H = 192
const PALETTES = [
  { coat: "#7395ba", shadow: "#567998", hair: "#343d50", skin: "#f0c4a3", glasses: false, long: true },
  { coat: "#dfa55b", shadow: "#bd8346", hair: "#343c47", skin: "#e4b28f", glasses: false, long: false },
  { coat: "#759b86", shadow: "#567b68", hair: "#795447", skin: "#f2c7a7", glasses: false, long: false },
  { coat: "#6c8daa", shadow: "#4c6e89", hair: "#3a3e4c", skin: "#f2c4a3", glasses: true, long: false },
  { coat: "#bd806a", shadow: "#955c4a", hair: "#4c3e35", skin: "#d7a281", glasses: false, long: false },
  { coat: "#97a97e", shadow: "#73845e", hair: "#655044", skin: "#efc39c", glasses: true, long: false },
]
type Palette = typeof PALETTES[number]

/** Each factory view owns these source sheets; cloned animation textures stay with figures. */
export function createPaperCharacters() {
  const sheets = new Map<number, THREE.CanvasTexture>()
  let badges: Record<"hand" | "check" | "warning", THREE.CanvasTexture> | undefined
  return {
    sheet(agent: Agent): THREE.CanvasTexture {
      const role = agent.role.toLowerCase()
      let index = role.includes("plan") ? 0 : role.includes("review") || role.includes("inspect") ? 3 :
        role.includes("deploy") ? 4 : role.includes("router") ? 5 : 1
      if (index === 1) {
        const hash = Array.from(agent.id).reduce((sum, char) => sum + char.charCodeAt(0), 0)
        index += hash % 2
      }
      let sheet = sheets.get(index)
      if (!sheet) {
        const canvas = document.createElement("canvas")
        canvas.width = CELL_W * 6; canvas.height = CELL_H * 4
        const ctx = canvas.getContext("2d")!
        for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
          const frame = document.createElement("canvas")
          frame.width = CELL_W; frame.height = CELL_H
          const draw = frame.getContext("2d")!
          drawPet(draw, PALETTES[index]!, col, row)
          const silhouette = document.createElement("canvas")
          silhouette.width = CELL_W; silhouette.height = CELL_H
          const mask = silhouette.getContext("2d")!
          mask.drawImage(frame, 0, 0)
          mask.globalCompositeOperation = "source-in"
          mask.fillStyle = "#fff9ec"; mask.fillRect(0, 0, CELL_W, CELL_H)
          ctx.save(); ctx.translate(col * CELL_W, row * CELL_H)
          // A smooth five-pixel die-cut border, deliberately not a dark outline.
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            ctx.drawImage(silhouette, Math.cos(angle) * 5, Math.sin(angle) * 5)
          }
          ctx.drawImage(frame, 0, 0)
          ctx.restore()
        }
        sheet = new THREE.CanvasTexture(canvas)
        sheet.colorSpace = THREE.SRGBColorSpace
        sheet.minFilter = THREE.LinearFilter
        sheet.magFilter = THREE.LinearFilter
        sheet.generateMipmaps = false
        sheet.userData.paper = true
        sheet.userData.pet = true
        sheet.userData.petLayout = "sheet"
        sheets.set(index, sheet)
      }
      return sheet
    },
    icons() {
      if (!badges) {
        const make = (color: string, mark: string) => {
          const canvas = document.createElement("canvas")
          canvas.width = canvas.height = 96
          const ctx = canvas.getContext("2d")!
          ctx.fillStyle = "#fff9ec"
          ctx.beginPath(); ctx.arc(48, 48, 45, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = color
          ctx.beginPath(); ctx.arc(48, 48, 38, 0, Math.PI * 2); ctx.fill()
          ctx.font = "bold 60px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
          ctx.fillStyle = mark === "?" ? "#45545a" : "#fff9ec"
          ctx.fillText(mark, 48, 50)
          const texture = new THREE.CanvasTexture(canvas)
          texture.colorSpace = THREE.SRGBColorSpace
          texture.minFilter = texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = false
          return texture
        }
        badges = { hand: make("#e5b866", "?"), check: make("#7d9e85", "✓"), warning: make("#bb7b66", "!") }
      }
      return badges
    },
    dispose() {
      for (const sheet of sheets.values()) sheet.dispose()
      sheets.clear()
      for (const badge of Object.values(badges ?? {})) badge.dispose()
      badges = undefined
    },
  }
}

/** Offline fallback for a failed host and bundled URL: a little paper cat. */
function drawPet(ctx: CanvasRenderingContext2D, p: Palette, pose: number, facing: number) {
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill()
  }
  const triangle = (x: number, y: number, flip: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 * flip, y + 22); ctx.lineTo(x + 5 * flip, y + 37); ctx.closePath(); ctx.fill()
  }
  const step = pose === 1 ? 3 : pose === 2 ? -3 : 0
  ellipse(64, 140, 33, 36, p.coat)
  ellipse(64, 143, 18, 27, "#f3e8d4")
  ellipse(43 - step, 173, 16, 7, p.coat); ellipse(85 + step, 173, 16, 7, p.coat)
  triangle(28, 25, 1, p.coat); triangle(100, 25, -1, p.coat)
  triangle(33, 35, .65, "#d9ac9d"); triangle(95, 35, -.65, "#d9ac9d")
  ellipse(64, 79, 41, 40, p.coat)
  ellipse(64, 94, 27, 18, "#f7eddb")
  if (facing !== 3) {
    const shift = facing === 1 ? -4 : facing === 2 ? 4 : 0
    ellipse(49 + shift, 78, 3.6, pose === 5 ? 1.5 : 4.8, "#35434b")
    ellipse(79 + shift, 78, 3.6, pose === 5 ? 1.5 : 4.8, "#35434b")
    ellipse(64 + shift, 92, 5, 3, "#8c6357")
    ctx.strokeStyle = "#8c6357"; ctx.lineWidth = 2; ctx.lineCap = "round"
    ctx.beginPath(); ctx.moveTo(64 + shift, 95); ctx.lineTo(64 + shift, 100); ctx.stroke()
  }
  ellipse(33, pose === 5 ? 48 : pose === 3 ? 117 : 144, 8, 13, p.coat)
  ellipse(95, pose === 4 ? 126 : 144, 8, 13, p.coat)
}
