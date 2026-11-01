import * as THREE from "three"
import { ROOM_THEME_SLOTS, type ResolvedRoomTheme } from "~/model/roomThemes"
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
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = cream) => {
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
  function themedBench(theme: ResolvedRoomTheme, accessory?: THREE.Object3D, suppliedAccent?: THREE.MeshLambertMaterial): THREE.Object3D {
    const group = new THREE.Group()
    // Palette edits produce drawing-owned materials, never entries in the
    // lifetime prototype cache. A drawing can share one accent across stations;
    // the folded geometry and neutral cards remain shared across drawings.
    const accent = suppliedAccent ?? new THREE.MeshLambertMaterial({ color: theme.accent })
    accent.name = "room-theme-accent"
    const put = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = accent) => {
      const mesh = slab(w, h, d, x, y, z, mat); mesh.name = name; group.add(mesh); return mesh
    }
    put("station-surface", 2.8, .1, 1.3, 0, PAPER_BELT_H - .05, 0, theme.station === "lab" ? cream : accent)
    put("station-paper-edge", 2.8, .025, .035, 0, PAPER_BELT_H, .62, cream)
    if (theme.station === "lab") {
      for (const x of [-.94, .94]) {
        put("lab-cabinet", .73, .70, 1.05, x, .36, .02)
        for (const y of [.23, .55]) {
          put("lab-drawer", .63, .24, .035, x, y, .56, cream)
          put("lab-pull", .22, .035, .025, x, y + .025, .59, edge)
        }
      }
    } else if (theme.station === "foundry") {
      put("foundry-apron", 2.6, .55, .06, 0, .48, .5)
      for (const x of [-1.20, 1.20]) put("foundry-leg", .18, .73, 1.05, x, .37, 0, cream)
      for (const side of [-1, 1]) {
        const brace = put("foundry-brace", 1.18, .065, .04, side * .61, .42, .55, edge)
        brace.rotation.z = side * .4
      }
    } else if (theme.station === "assembly") {
      for (const x of [-1.25, 1.25]) put("assembly-folded-leg", .07, .75, 1.1, x, .375, 0, cream)
      put("assembly-shelf", 2.54, .06, 1.0, 0, .19, .03)
      for (const x of [-.82, 0, .82]) {
        put("assembly-bin", .65, .32, .60, x, .38, .17, cream)
        put("assembly-bin-label", .22, .08, .015, x, .40, .48, edge)
      }
    } else {
      for (const side of [-1, 1]) {
        const leg = put("precision-trestle", .12, .74, 1.05, side * 1.15, .38, 0, cream)
        leg.rotation.z = -side * .17
        put("precision-foot", .44, .035, 1.1, side * 1.17, .018, 0, edge)
      }
      put("precision-rule", 2.65, .18, .035, 0, .64, .56, cream)
      for (let i = 0; i < 13; i++) put("precision-mark", .025, i % 3 ? .06 : .11, .012, -1.2 + i * .2, .66, .585, edge)
    }
    if (accessory) {
      accessory.position.set(...ROOM_THEME_SLOTS.station.anchor)
      group.add(accessory)
    } else {
      const tool = new THREE.Group(); tool.name = "station-accessory"
      const bit = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = cream) => tool.add(slab(w, h, d, x, y, z, mat))
      if (theme.station === "lab") {
        for (const x of [-.14, .10]) { bit(.12, .19, .15, x, .10, 0); bit(.07, .06, .09, x, .22, 0, accent) }
      } else if (theme.station === "foundry") {
        bit(.44, .08, .23, 0, .04, 0, edge); bit(.24, .16, .16, 0, .15, 0, accent); bit(.48, .06, .23, 0, .26, 0)
      } else if (theme.station === "assembly") {
        bit(.46, .10, .24, 0, .05, 0, edge)
        for (const x of [-.13, .12]) bit(.14, .12, .16, x, .16, 0)
      } else {
        bit(.46, .05, .24, 0, .025, 0); bit(.38, .12, .18, 0, .11, 0, edge); bit(.035, .21, .23, .17, .17, 0, accent)
      }
      tool.position.set(...ROOM_THEME_SLOTS.station.anchor); group.add(tool)
    }
    return group
  }

  const library: Pieces = {
    paper: true, floor, cardboard, belts, themedBench,
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
