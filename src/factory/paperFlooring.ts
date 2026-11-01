import * as THREE from "three"
import type { RoomFootprint } from "~/floor/types"
import { canvasTexture } from "./textures"

import { PAPER_FLOOR_PROFILES, type PaperFloorProfile } from "~/model/roomThemes"
export { PAPER_FLOOR_PROFILES, type PaperFloorProfile } from "~/model/roomThemes"

/** Identity defaults, separate from the future host theme/furniture registry. */
export function paperFloorProfile(room: Pick<RoomFootprint, "id" | "kind">): PaperFloorProfile {
  if (room.kind === "intake") return "kraft-pavers"
  if (room.kind === "deployment") return "terracotta-bays"
  if (room.kind === "staging") return "sage-checker"
  const name = room.id.toLowerCase()
  if (name.includes("plan") || name.includes("research")) return "blue-grid"
  if (name.includes("implement") || name.includes("foundry")) return "honey-planks"
  if (name.includes("review") || name.includes("qa")) return "sage-checker"
  let hash = 2166136261
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return PAPER_FLOOR_PROFILES[hash % PAPER_FLOOR_PROFILES.length]!
}

/** Two world tiles per repeat: growing a room adds paper pieces rather than stretching them. */
export function paperFloorTexture(profile: PaperFloorProfile, width: number, depth: number): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx, size) => {
    const line = (color: string, stroke = 3) => { ctx.strokeStyle = color; ctx.lineWidth = stroke }
    if (profile === "kraft-pavers") {
      ctx.fillStyle = "#c2ae8b"; ctx.fillRect(0, 0, size, size)
      const tones = ["#ead8b6", "#e1cca7", "#efdfc1"]
      for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
        const x = col * 128 + (row % 2) * 64
        ctx.fillStyle = tones[(row + col + 3) % tones.length]!
        ctx.fillRect(x + 3, row * 64 + 3, 122, 58)
        line("rgba(255,249,229,.65)", 2); ctx.strokeRect(x + 5, row * 64 + 5, 118, 54)
      }
    } else if (profile === "blue-grid") {
      ctx.fillStyle = "#dce9e8"; ctx.fillRect(0, 0, size, size)
      line("#c1d8dd", 1)
      for (let n = 0; n <= size; n += 16) {
        ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, size); ctx.moveTo(0, n); ctx.lineTo(size, n); ctx.stroke()
      }
      line("#97bac8", 3)
      for (let n = 0; n <= size; n += 64) {
        ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, size); ctx.moveTo(0, n); ctx.lineTo(size, n); ctx.stroke()
      }
      ctx.fillStyle = "#7da7bb"
      for (const x of [64, 192]) for (const y of [64, 192]) ctx.fillRect(x - 3, y - 3, 6, 6)
    } else if (profile === "honey-planks") {
      ctx.fillStyle = "#bb9b71"; ctx.fillRect(0, 0, size, size)
      const tones = ["#e6c796", "#efd5a9", "#ddbd8d", "#ead0a0"]
      for (let col = 0; col < 4; col++) {
        const x = col * 64
        ctx.fillStyle = tones[col]!
        ctx.fillRect(x + 2, 0, 60, size)
        line("#bf9d6d", 2)
        const seam = col % 2 ? 64 : 192
        ctx.beginPath(); ctx.moveTo(x + 2, seam); ctx.lineTo(x + 62, seam); ctx.stroke()
        // Broad printed grain, like pencil marks on cut construction paper.
        line("rgba(163,126,79,.22)", 2)
        for (const offset of [13, 38, 51]) {
          ctx.beginPath(); ctx.moveTo(x + offset, 8); ctx.bezierCurveTo(x + offset - 4, 76, x + offset + 5, 165, x + offset, 248); ctx.stroke()
        }
      }
    } else if (profile === "sage-checker") {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        ctx.fillStyle = (row + col) % 2 ? "#d1ddc3" : "#edf0da"
        ctx.fillRect(col * 64, row * 64, 64, 64)
        line("#b0c2a4", 2); ctx.strokeRect(col * 64 + 2, row * 64 + 2, 60, 60)
        line("rgba(255,250,226,.75)", 2); ctx.strokeRect(col * 64 + 7, row * 64 + 7, 50, 50)
      }
    } else {
      ctx.fillStyle = "#d9b6a2"; ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = "#d2aa95"; ctx.fillRect(0, 0, 128, 128); ctx.fillRect(128, 128, 128, 128)
      line("#b6917e", 3)
      for (const n of [0, 128, 256]) {
        ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, size); ctx.moveTo(0, n); ctx.lineTo(size, n); ctx.stroke()
      }
      // Cream L marks identify dispatch bays without text competing with labels.
      line("#f8e8cb", 9)
      for (const [x, y, dx, dy] of [[24, 24, 1, 1], [232, 24, -1, 1], [24, 232, 1, -1], [232, 232, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(x! + dx! * 46, y!); ctx.lineTo(x!, y!); ctx.lineTo(x!, y! + dy! * 46); ctx.stroke()
      }
    }
    // Sparse low-contrast paper fibers are deterministic and repeat seamlessly.
    ctx.fillStyle = "rgba(255,252,236,.2)"
    for (let i = 0; i < 90; i++) {
      const x = (i * 73 + 19) % size, y = (i * 41 + 37) % size
      ctx.fillRect(x, y, 1 + i % 3, 1)
    }
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(width / 2, depth / 2)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.userData.paperFloor = profile
  return texture
}
