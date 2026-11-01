import * as THREE from "three"
import { type Pieces, type PieceName, shareResource, replaceMaterials } from "./models"
import { canvasTexture } from "./textures"
import { LEGACY_BELT_H, PAPER_BELT_H, paperBeltSupport } from "./paperConveyors"
import { createPaperJunctions, registerPaperJunctions } from "./paperJunctions"

/** Small, reusable authored pieces. Layout, routing and sprite contracts stay separate. */
export function paperPieces(base: Pieces): Pieces {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  const own = <T extends THREE.BufferGeometry | THREE.Material>(value: T): T => {
    resources.add(value); shareResource(value); return value
  }
  const material = (color: number) => own(new THREE.MeshLambertMaterial({ color }))
  const cream = material(0xf4e6c9), edge = material(0xc6b28f), sage = material(0x8ea896)
  const geometry = own(new THREE.BoxGeometry(1, 1, 1))
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, mat = cream) => {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.scale.set(w, h, d); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh
  }
  const texture = (color: string, belt = false) => {
    const map = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h)
      if (belt) {
        ctx.fillStyle = "#faf0d9"
        ctx.beginPath(); ctx.moveTo(40, 30); ctx.lineTo(58, 30); ctx.lineTo(94, 64)
        ctx.lineTo(58, 98); ctx.lineTo(40, 98); ctx.lineTo(75, 64); ctx.closePath(); ctx.fill()
        ctx.fillStyle = "rgba(255,245,220,.35)"; ctx.fillRect(0, 4, w, 2); ctx.fillRect(0, 122, w, 2)
      } else {
        if (color === "#d6b88b") {
          ctx.fillStyle = "#efdbb3"; ctx.fillRect(55, 0, 18, h)
          ctx.strokeStyle = "#b79b73"; ctx.lineWidth = 1; ctx.strokeRect(1, 1, w-2, h-2)
        }
      }
    })
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.flipY = false; resources.add(map); return map
  }
  const floor = texture("#f3e9d5"), cardboard = texture("#d6b88b")
  cardboard.userData.paper = true
  const belts = { forward: texture("#779886", true), rework: texture("#779886", true) }
  const converted = new Map<THREE.Material, THREE.Material>()
  const prototypes = new Map<string, THREE.Object3D>()
  function build(name: PieceName, accent?: number): THREE.Object3D {
    if (name === "box") return new THREE.Mesh(own(new THREE.BoxGeometry(.6, .6, .6)), edge)
    const group = new THREE.Group()
    if (name === "bench") {
      const top = accent ? material(accent) : sage
      group.add(slab(2.8, .1, 1.3, 0, PAPER_BELT_H - .05, 0, top))
      group.add(slab(2.65, PAPER_BELT_H - .1, .055, 0, PAPER_BELT_H / 2, .51, top))
      // Folded white book and paper edges occupy the spare side of the desk.
      group.add(slab(.43, .055, .28, -.7, PAPER_BELT_H + .03, -.48, cream))
      group.add(slab(.43, .018, .28, -.7, PAPER_BELT_H + .07, -.48, edge))
      for (const x of [-1.25, 1.25]) {
        group.add(slab(.065, PAPER_BELT_H - .07, 1.1, x, (PAPER_BELT_H - .07) / 2, 0))
        group.add(slab(.28, .035, 1.1, x + (x < 0 ? .06 : -.06), .02, 0))
      }
      group.add(slab(2.8, .025, .035, 0, PAPER_BELT_H, .62))
      return group
    }
    if (name === "tablet") {
      group.add(slab(.64, .025, .32, 0, -.02, .12, edge))
      const lid = slab(.64, .44, .04, 0, .19, -.04, cream)
      lid.rotation.x = -.16
      group.add(lid)
      const face = own(new THREE.MeshBasicMaterial({ color: 0x354651 }))
      face.name = "tablet-face"
      const screen = new THREE.Mesh(own(new THREE.PlaneGeometry(.56, .36)), face)
      screen.position.set(0, .19, -.014)
      screen.rotation.x = -.16
      group.add(screen)
      return group
    }
    if (name === "door") {
      group.add(slab(.1, 1.8, .12, -.43, .9, 0), slab(.1, 1.8, .12, .43, .9, 0))
      group.add(slab(.96, .16, .12, 0, 1.72, 0, sage))
      return group
    }
    const piece = base.clone(name)
    replaceMaterials(piece, (source) => {
      let result = converted.get(source)
      if (!result) {
        const map = source.name === "belt-surface" ? belts.forward : source.name === "belt-surface-return" ? belts.rework : undefined
        result = own(new THREE.MeshLambertMaterial({ color: map ? 0xffffff : source.name.includes("dark") ? 0xbcae94 : 0xeadbbd, map }))
        result.name = source.name
        converted.set(source, result)
      }
      return result
    })
    if (name.startsWith("belt-")) piece.position.y += PAPER_BELT_H - LEGACY_BELT_H
    return piece
  }
  const library: Pieces = {
    paper: true, floor, cardboard, belts,
    beltSupport: (name, floorY) => paperBeltSupport(name, floorY, geometry, cream, edge),
    clone(name, accent) {
      const key = name + ":" + (accent ?? "")
      let piece = prototypes.get(key)
      if (!piece) { piece = build(name, accent); prototypes.set(key, piece) }
      const copy = piece.clone()
      copy.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true } })
      return copy
    },
    dispose() { for (const resource of resources) resource.dispose(); resources.clear(); prototypes.clear() },
  }
  registerPaperJunctions(library, createPaperJunctions(own))
  return library
}
