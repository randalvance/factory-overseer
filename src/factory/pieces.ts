// What the factory is drawn with, each piece on the tile grid: the
// Blender-built pieces placed as copies, and the placeholders in plain boxes
// and planes that the hero props have yet to replace. One tile is one world
// unit; a tile's x is world x and its y is world z, so the back wall is at
// z = 0 and the camera looks in from positive z.

import * as THREE from "three"
import type { ResolvedRoomTheme } from "~/model/roomThemes"
import type { ThemeAssets } from "./roomThemeAssets"
import { tileKey } from "~/floor/tiles"
import type { BeltTile, Container, Intake, Layout, Tile } from "~/floor/types"
import { type BeltSurface, beltPieces } from "./beltPieces"
import { type Pieces, TABLET_FACE, replaceMaterials, isShared } from "./models"
import { sheetFrame } from "./sprites"
import { PAPER_BELT_H } from "./paperConveyors"
import { PAPER_GROUND_Y } from "./paperGround"
import { paperJunctionFor } from "./paperJunctions"
import { TEXT_PX_PER_TILE, canvasTexture, bubbleTexture, countTexture } from "./textures"

/** Heights in tiles. */
const PALLET_H = 0.1
const CONTAINER_FLOOR_H = 0.1
/** How high over the floor the hopper's mouth is, where new boxes drop from. */
const HOPPER_MOUTH_H = 1.9
/** Half the hopper's square rim, and the funnel's height from mouth to rim. */
const HOPPER_HALF_WIDTH = 1.2
const HOPPER_HEIGHT = 1.25
/** A box's edge, in tiles. */
export const BOX_SIZE = 0.6
/** A status icon's edge, in tiles. */
export const ICON_SIZE = 0.5
const SPARK_SIZE = 0.08
/** How much of its colour a vacant bench keeps. */
const VACANT_DIM = 0.55

const COLOR = {
  pallet: 0x8b6b3e,
  sparks: [0xffd166, 0xffb347, 0xfff3c4],
  halo: 0xffd166,
}

export function tileCenter(tile: Tile): { x: number; z: number } {
  return { x: tile.x + 0.5, z: tile.y + 0.5 }
}

/** A belt tile: its pieces, a straight or a corner and a junction's arms, each turned its way, with the surface the belt wears. */
export function beltTile(tile: BeltTile, surface: BeltSurface, pieces: Pieces, floorY = 0): THREE.Group {
  const group = new THREE.Group()
  if (tile.kind === "junction") {
    const junction = paperJunctionFor(pieces, tile, floorY)
    if (junction) {
      group.add(junction)
      const { x, z } = tileCenter(tile)
      group.position.set(x, 0, z)
      return group
    }
  }
  const placements = beltPieces(tile, surface)
  for (const { piece, yaw } of placements) {
    const laid = pieces.clone(piece)
    laid.rotation.y = yaw
    group.add(laid)
  }
  const primary = placements[0]!
  const support = pieces.beltSupport?.(primary.piece, floorY)
  if (support) { support.rotation.y = primary.yaw; group.add(support) }
  const { x, z } = tileCenter(tile)
  group.position.set(x, 0, z)
  return group
}

/**
 * A bench, the width of its tile so the belts meet it, dimmed while vacant.
 * The box sits on it; the tablet is a piece of its own, since its face
 * changes with the agent's status.
 */
export function bench(tile: Tile, vacant: boolean, pieces: Pieces, role?: string, theme?: ResolvedRoomTheme, assets?: ThemeAssets, palette?: Map<number, THREE.MeshLambertMaterial>): THREE.Object3D {
  const colors: Record<string, number> = { planner: 0x7798bb, implementer: 0xd9a556, reviewer: 0x8fa993, deployer: 0xc58d76, router: 0x90a986 }
  const accessory = theme?.assets.station ? assets?.model(theme.assets.station, "station") : undefined
  let accent: THREE.MeshLambertMaterial | undefined
  if (theme && pieces.themedBench && palette && !vacant) {
    accent = palette.get(theme.accent)
    if (!accent) { accent = new THREE.MeshLambertMaterial({ color: theme.accent }); palette.set(theme.accent, accent) }
  }
  const piece = theme && pieces.themedBench ? pieces.themedBench(theme, accessory, accent) : pieces.clone("bench", role ? colors[role] : undefined)
  if (vacant) dim(piece, VACANT_DIM)
  const { x, z } = tileCenter(tile)
  piece.position.set(x, 0, z)
  return piece
}

/** Put every mesh of a piece on its own darker copies of its materials, which go when the piece does. */
function dim(piece: THREE.Object3D, keep: number) {
  const copies = new Map<THREE.Material, THREE.Material>()
  replaceMaterials(piece, (material) => {
    let copy = copies.get(material)
    if (!copy) {
      copy = material.clone()
      ;(copy as THREE.MeshLambertMaterial).color.multiplyScalar(keep)
      copies.set(material, copy)
    }
    return copy
  })
  // A theme's live palette is drawing-owned; replacing it must not orphan it.
  for (const original of copies.keys()) if (!isShared(original)) original.dispose()
}

/** A tablet as the agents keep it: the group goes at its bench's tile, and the face wears the texture of its look. */
export interface TabletPiece {
  group: THREE.Group
  face: THREE.MeshBasicMaterial
}

/** A tablet at the right end of a bench, clear of the box, tilted toward the camera; its face is its own, for the view to draw on. */
export function tablet(pieces: Pieces): TabletPiece {
  const piece = pieces.clone("tablet")
  const face = new THREE.MeshBasicMaterial()
  replaceMaterials(piece, (material) => (material.name === TABLET_FACE ? face : material))
  // Keep the center strip clear for parcels travelling across the desk.
  piece.position.set(.85, PAPER_BELT_H + .04, -.59)
  const group = new THREE.Group()
  group.add(piece)
  return { group, face }
}

/** The door in the back wall: the door segment standing in the wall's plane at the back edge of its tile. */
export function door(tile: Tile, pieces: Pieces): THREE.Object3D {
  const piece = pieces.clone("door")
  piece.position.set(tile.x + 0.5, 0, tile.y)
  return piece
}

/** The hopper over the intake: a funnel on four legs, its mouth over the middle of the intake, that new boxes drop out of. */
export function hopper(intake: Intake, floorY = PAPER_GROUND_Y): THREE.Group {
  const group = new THREE.Group()
  const mouth = hopperMouth(intake)
  const halfWidth = HOPPER_HALF_WIDTH
  const height = HOPPER_HEIGHT
  // Four segments make a square funnel; turned so its sides run with the grid. The radius is to a corner.
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(halfWidth * Math.SQRT2, 0.3 * Math.SQRT2, height, 4, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xf1e3c6, side: THREE.FrontSide }),
  )
  funnel.rotation.y = Math.PI / 4
  funnel.position.set(0, HOPPER_MOUTH_H + height / 2, 0)
  funnel.castShadow = true
  funnel.receiveShadow = true
  group.add(funnel)
  // The warm red liner and cream folded rim make the open funnel readable at
  // the shallow camera angle; the mouth remains the actual parcel source.
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry((halfWidth - .03) * Math.SQRT2, .285 * Math.SQRT2, height, 4, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xc66f60, side: THREE.BackSide }),
  )
  liner.rotation.y = Math.PI / 4; liner.position.copy(funnel.position)
  liner.receiveShadow = true; group.add(liner)
  const rimMaterial = new THREE.MeshLambertMaterial({ color: 0xfff5de })
  for (const side of [-1, 1]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + .1, .075, .08), rimMaterial)
    front.position.set(0, HOPPER_MOUTH_H + height, side * halfWidth)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.08, .075, halfWidth * 2 + .1), rimMaterial)
    edge.position.set(side * halfWidth, HOPPER_MOUTH_H + height, 0)
    front.castShadow = edge.castShadow = true
    group.add(front, edge)
  }
  const legMaterial = new THREE.MeshLambertMaterial({ color: 0xd9c6a4 })
  // Meet the sloping bowl at the support centers without raising the outlet.
  const legTop = HOPPER_MOUTH_H + height * (.5 - .3) / (halfWidth - .3)
  const legH = legTop - floorY
  for (const dx of [-.5, .5]) {
    for (const dz of [-.5, .5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, legH, 0.3), legMaterial)
      leg.position.set(dx, floorY + legH / 2, dz)
      leg.castShadow = true
      group.add(leg)
    }
  }
  group.position.set(mouth.x, 0, mouth.z)
  return group
}

/** Where new boxes come out of the hopper: over the middle of the intake. */
export function hopperMouth(intake: Intake): THREE.Vector3 {
  const { x, y, w, h } = intake.rect
  return new THREE.Vector3(x + w / 2, HOPPER_MOUTH_H, y + h / 2)
}

/** The middle of the hopper's open top, at the height of its rim. */
export function hopperRim(intake: Intake): THREE.Vector3 {
  return hopperMouth(intake).setY(HOPPER_MOUTH_H + HOPPER_HEIGHT)
}

/** Put the drag glow over the rim of the drawn hopper piece where it stands this frame. */
export function placeHopperGlow(glow: THREE.Object3D, hopperPiece: THREE.Object3D) {
  hopperPiece.updateWorldMatrix(true, false)
  glow.position.set(0, HOPPER_MOUTH_H + HOPPER_HEIGHT + .06, 0).applyMatrix4(hopperPiece.matrixWorld)
}

/** A square of warm light around the hopper's rim, shown while a host's drag can be dropped in. Hidden until then. */
export function hopperGlow(): THREE.Mesh {
  // Four segments make a square ring; turned so its sides run with the rim's. Radii are to a corner.
  const inner = (HOPPER_HALF_WIDTH + .06) * Math.SQRT2, outer = (HOPPER_HALF_WIDTH + .36) * Math.SQRT2
  const material = new THREE.MeshBasicMaterial({ color: COLOR.halo, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), material)
  mesh.name = "hopper-drop-glow"
  mesh.renderOrder = 2
  mesh.visible = false
  return mesh
}

/** The count of boxes resting in the container, on a plate above its back wall over the mouth, where no stack rises in front of it. */
export function containerCount(container: Container, count: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: countTexture(count) }))
  mesh.scale.setScalar(.65)
  mesh.position.set(container.rect.x + container.rect.w / 2, PAPER_BELT_H + .35, container.rect.y + container.rect.h + .08)
  mesh.visible = count > 0
  return mesh
}

/** Put a new count on the plate. */
export function recount(plate: THREE.Mesh, count: number) {
  const material = plate.material as THREE.MeshBasicMaterial
  material.map = countTexture(count)
  material.needsUpdate = true
  plate.visible = count > 0
}

/** A low wooden pallet where boxes wait with nothing carrying them. */
export function pallet(tile: Tile): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, PALLET_H, 0.9), new THREE.MeshLambertMaterial({ color: COLOR.pallet }))
  const { x, z } = tileCenter(tile)
  mesh.position.set(x, PALLET_H / 2, z)
  return mesh
}

/** The container: a floor, walls on three sides, a low wall in front so the stack shows, and a gap where the belt comes in. */
export function containerWalls(container: Container): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshLambertMaterial({ color: 0xc8947e })
  const { x, y, w, h } = container.rect
  const slab = (sx: number, sy: number, sz: number, px: number, pz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    mesh.position.set(px, sy / 2, pz)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
  // A low dispatch tray and folded portal at its far end, leaving the worker
  // and moving packages visible through the cutaway front.
  const raised = (sx: number, sy: number, sz: number, px: number, pz: number) => {
    const mesh = slab(sx, sy, sz, px, pz)
    mesh.position.y += PAPER_BELT_H - CONTAINER_FLOOR_H
    return mesh
  }
  group.add(raised(w, .1, h, x + w / 2, y + h / 2))
  group.add(raised(w, .16, .07, x + w / 2, y + h - .04))
  group.add(raised(w, .16, .07, x + w / 2, y + .04))
  for (const px of [x + .25, x + w - .25]) {
    for (const pz of [y + .16, y + h - .16]) group.add(slab(.14, PAPER_BELT_H - CONTAINER_FLOOR_H, .14, px, pz))
  }
  // A front-facing folded dispatch arch frames the parcels, like the
  // reference's little loading house. Its opening clears the raised deck.
  const card = new THREE.MeshLambertMaterial({ color: 0xf6e7cd })
  const center = x + w / 2, front = y + h - .05
  const opening = PAPER_BELT_H + 1.10
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, opening, .18), card)
    post.position.set(center + side * (w / 2 - .12), opening / 2, front)
    post.castShadow = true; post.receiveShadow = true; group.add(post)
  }
  const roof = new THREE.Shape()
  roof.moveTo(-w / 2, opening); roof.lineTo(-w / 2, opening + .38)
  roof.lineTo(0, opening + .66); roof.lineTo(w / 2, opening + .38)
  roof.lineTo(w / 2, opening); roof.closePath()
  const header = new THREE.Mesh(new THREE.ExtrudeGeometry(roof, { depth: .14, bevelEnabled: false }), card)
  header.position.set(center, 0, front - .07); header.castShadow = true; header.receiveShadow = true
  group.add(header)
  const mark = canvasTexture(160, 80, (ctx) => {
    ctx.strokeStyle = "#bd7f62"; ctx.fillStyle = "#bd7f62"; ctx.lineWidth = 6; ctx.lineJoin = "round"
    ctx.strokeRect(40, 17, 48, 40)
    ctx.beginPath(); ctx.moveTo(88, 32); ctx.lineTo(109, 32); ctx.lineTo(122, 47); ctx.lineTo(122, 57); ctx.lineTo(88, 57); ctx.stroke()
    for (const px of [55, 108]) { ctx.beginPath(); ctx.arc(px, 62, 8, 0, Math.PI * 2); ctx.fill() }
  })
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .55), new THREE.MeshBasicMaterial({ map: mark, transparent: true }))
  plaque.position.set(center, opening + .27, front + .08)
  plaque.userData.disposeTexture = true; group.add(plaque)
  return group

}

/**
 * How high a box's underside sits over each tile of a layout, riding or at
 * rest: on the belt, on a bench, on a pallet, on the container's floor, else
 * on the ground.
 */
export function heightsOver(layout: Layout): (tile: Tile) => number {
  const heights = new Map<string, number>()
  const set = (tile: Tile, height: number) => heights.set(tileKey(tile), height)
  for (let y = layout.container.rect.y; y < layout.container.rect.y + layout.container.rect.h; y++) {
    for (let x = layout.container.rect.x; x < layout.container.rect.x + layout.container.rect.w; x++) {
      set({ x, y }, PAPER_BELT_H)
    }
  }
  for (const tile of layout.shippingDock?.cargoTiles ?? []) set(tile, PAPER_BELT_H)
  for (const tile of layout.intake.pile) set(tile, PALLET_H)
  for (const belt of layout.belts) for (const tile of belt.tiles) set(tile, PAPER_BELT_H)
  for (const bay of layout.bays) for (const station of bay.stations) set(station.bench, PAPER_BELT_H)
  if (layout.staging) {
    for (const tile of layout.staging.pile.slice(1)) set(tile, PALLET_H)
    set(layout.staging.bench, PAPER_BELT_H)
  }
  return (tile) => heights.get(tileKey(tile)) ?? 0
}

const paperLabels = new Map<string, THREE.Texture>()

/** The face of a box: its task's label on a plate in the task's colour, or in cardboard's, stuck on the box piece's cardboard. */
export function boxFace(label: string, color: string | undefined): THREE.Texture {
  const key = (color ?? "") + ":" + label
  let map = paperLabels.get(key)
  if (!map) {
    map = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.scale(.5, .5); w *= 2; h *= 2
      ctx.fillStyle = color ?? "#d6b88b"; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "#eed9ad"; ctx.fillRect(112, 0, 32, h)
      ctx.strokeStyle = "#ad9064"; ctx.lineWidth = 2; ctx.strokeRect(2, 2, w-4, h-4)
      ctx.fillStyle = "#fff6e1"; ctx.fillRect(22, 75, 212, 108)
      ctx.fillStyle = "#47514a"; ctx.textAlign = "center"
      ctx.font = "bold 20px sans-serif"; ctx.fillText("TASK", 128, 105)
      ctx.font = "22px sans-serif"; ctx.fillText(label, 128, 147, 194)
    })
    map.flipY = false
    paperLabels.set(key, map)
  }
  return map
}

/** A box with its task's label on every face over the piece's cardboard, its underside at the given height. The material is the box's own. */
export function box(tile: Tile, underside: number, label: string, color: string | undefined, pieces: Pieces): THREE.Mesh {
  const mesh = pieces.clone("box")
  if (!(mesh instanceof THREE.Mesh)) throw new Error("The box piece is not one mesh")
  mesh.material = new THREE.MeshLambertMaterial({ map: boxFace(label, color) })
  // Moving parcels stay out of the cached architectural shadow map.
  mesh.castShadow = false
  const { x, z } = tileCenter(tile)
  mesh.position.set(x, underside + BOX_SIZE / 2, z)
  return mesh
}

/** One cell of a pet sheet on a billboard at the origin. The agent renderer sets its height and animation frame. */
export function agentSprite(sheet: THREE.Texture): THREE.Sprite {
  const map = sheet.clone()
  const frame = sheetFrame(0, "down")
  map.offset.set(frame.offset.x, frame.offset.y)
  map.repeat.set(frame.repeat.x, frame.repeat.y)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, alphaTest: 0.5 }))
  sprite.center.set(0.5, 0)
  sprite.position.y = 0.01
  return sprite
}

/** A status icon on a billboard, centred where it is put. The texture is shared, never disposed with the sprite. */
export function statusIcon(icon: THREE.Texture): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon, alphaTest: 0.5 }))
  sprite.scale.set(ICON_SIZE, ICON_SIZE, 1)
  return sprite
}

/** A bubble of text on a billboard, the tip of its tail where it is put. */
export function bubble(text: string): THREE.Sprite {
  const texture = bubbleTexture(text)
  const { width, height } = texture.image as HTMLCanvasElement
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))
  sprite.center.set(0.5, 0)
  sprite.scale.set(width / TEXT_PX_PER_TILE, height / TEXT_PX_PER_TILE, 1)
  return sprite
}

/** The ring of light on the floor under whatever the pointer rests on. */
export function halo(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color: COLOR.halo, transparent: true, opacity: 0.85, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2), material)
  mesh.visible = false
  return mesh
}

/** One spark: a fleck of hot colour. */
export function spark(): THREE.Sprite {
  const color = COLOR.sparks[Math.floor(Math.random() * COLOR.sparks.length)]
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color }))
  sprite.scale.set(SPARK_SIZE, SPARK_SIZE, 1)
  return sprite
}
