import * as THREE from "three"
import type { Layout } from "~/floor/types"
import { floorSlab } from "./pieces"
import { canvasTexture, pixelated } from "./textures"

/** Low cutaway side walls and a taller back wall keep every station visible. */
export function drawRooms(layout: Layout, floorTexture: THREE.Texture, add: (name: string, piece: THREE.Object3D) => void) {
  const occupied = new Set(layout.belts.flatMap((belt) => belt.tiles.map((tile) => `${tile.x},${tile.y}`)))
  for (const room of layout.rooms ?? []) {
    const { x, y, w, h } = room.rect
    const color = room.kind === "intake" ? 0x5278ab : room.kind === "deployment" ? 0xb17a49 : room.kind === "staging" ? 0xc7a454 : 0x638a7d
    const floor = floorSlab(room.rect, floorTexture)
    ;(floor.material as THREE.MeshLambertMaterial).color.setHex(color).lerp(new THREE.Color(0xffffff), 0.7)
    floor.position.y = 0.012
    add(`room:${room.id}:floor`, floor)
    const wall = (key: string, cx: number, cy: number, width: number, depth: number, height: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshLambertMaterial({ color: 0x50616a }))
      mesh.position.set(cx, height / 2, cy)
      add(`room:${room.id}:${key}`, mesh)
    }
    // Stable wall indices make growth a slide/fade of the actual enclosure.
    for (let i = 0; i < w; i++) {
      if (x + i !== room.door.x) wall(`back:${i}`, x + i + 0.5, y + 0.12, 1, 0.24, 1.1)
      wall(`front:${i}`, x + i + 0.5, y + h - 0.12, 1, 0.24, 0.18)
    }
    for (let i = 1; i < h - 1; i++) {
      for (const [side, xx] of [["left", x], ["right", x + w - 1]] as const) {
        if (occupied.has(`${xx},${y + i}`)) continue
        wall(`${side}:${i}`, xx + (side === "left" ? 0.12 : 0.88), y + i + 0.5, 0.24, 1, 0.45)
      }
    }
    // A simple nameplate for this milestone; configurable image billboards are #24.
    const texture = pixelated(canvasTexture(256, 40, (ctx, width, height) => {
      ctx.fillStyle = "#17252d"
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = "#d8e5dd"
      ctx.font = "bold 22px monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(room.label, width / 2, height / 2, width - 16)
    }))
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w - 2.3, 0.65), new THREE.MeshBasicMaterial({ map: texture }))
    label.position.set(x + w / 2 + 0.3, 1.25, y + 0.26)
    label.userData.disposeTexture = true
    add(`room:${room.id}:label`, label)
  }
}
