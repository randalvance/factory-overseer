// What the factory is drawn with, each piece on the tile grid: the
// Blender-built pieces placed as copies, and the placeholders in plain boxes
// and planes that the hero props have yet to replace. One tile is one world
// unit; a tile's x is world x and its y is world z, so the back wall is at
// z = 0 and the camera looks in from positive z.

import * as THREE from "three"
import { tileKey } from "~/floor/tiles"
import type { BeltTile, Container, Intake, Layout, Rect, Tile } from "~/floor/types"
import { type BeltSurface, beltPieces } from "./beltPieces"
import { type Pieces, TABLET_FACE, replaceMaterials } from "./models"
import { SHEET, sheetFrame } from "./sprites"
import { TEXT_PX_PER_TILE, bubbleTexture, countTexture, labelTexture } from "./textures"

/** Heights in tiles. The belt's and the bench's are the pieces' own, built to these numbers in tools/blender. */
export const BENCH_H = 0.5
const BELT_H = 0.12
const PALLET_H = 0.1
const CONTAINER_FLOOR_H = 0.1
const WALL_H = 1.4
const WALL_T = 0.1
/** How high over the floor the hopper's mouth is, where new boxes drop from. */
const HOPPER_MOUTH_H = 1.9
const HOPPER_H = 0.9
export const AGENT_H = 1.5
/** A box's edge, in tiles. */
export const BOX_SIZE = 0.6
/** A status icon's edge, in tiles: its 16 pixels shown two for one at the base zoom, so they stay whole. */
export const ICON_SIZE = 0.5
const SPARK_SIZE = 0.08
/** How much of its colour a vacant bench keeps. */
const VACANT_DIM = 0.55

const COLOR = {
  intake: 0x3b5bb5,
  bay: 0x3a7a62,
  staging: 0xc08a2e,
  hopper: 0xd9b23c,
  darkSteel: 0x2b2f36,
  pallet: 0x8b6b3e,
  container: 0x9c4a2f,
  box: "#d9a559",
  sparks: [0xffd166, 0xffb347, 0xfff3c4],
  halo: 0xffd166,
}

export function tileCenter(tile: Tile): { x: number; z: number } {
  return { x: tile.x + 0.5, z: tile.y + 0.5 }
}

/** The whole floor, wearing the floor tile's texture once per grid tile. */
export function floorSlab(bounds: Rect, tile: THREE.Texture): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(bounds.w, bounds.h)
  // The repeat is in the geometry's own texture coordinates, so the texture stays shared and untouched.
  const uv = geometry.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bounds.w, uv.getY(i) * bounds.h)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: tile }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(bounds.x + bounds.w / 2, 0, bounds.y + bounds.h / 2)
  return mesh
}

/** A tinted patch of floor marking an area: the intake, a bay, the staging area. */
export function patch(rect: Rect, area: "intake" | "bay" | "staging"): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color: COLOR[area], transparent: true, opacity: 0.38, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.w - 0.1, rect.h - 0.1), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(rect.x + rect.w / 2, 0.005, rect.y + rect.h / 2)
  return mesh
}

/** A belt tile: its pieces, a straight or a corner and a junction's arms, each turned its way, with the surface the belt wears. */
export function beltTile(tile: BeltTile, surface: BeltSurface, pieces: Pieces): THREE.Group {
  const group = new THREE.Group()
  for (const { piece, yaw } of beltPieces(tile, surface)) {
    const laid = pieces.clone(piece)
    laid.rotation.y = yaw
    group.add(laid)
  }
  const { x, z } = tileCenter(tile)
  group.position.set(x, 0, z)
  return group
}

/**
 * A bench, the width of its tile so the belts meet it, dimmed while vacant.
 * The box sits on it; the tablet is a piece of its own, since its face
 * changes with the agent's status.
 */
export function bench(tile: Tile, vacant: boolean, pieces: Pieces): THREE.Object3D {
  const piece = pieces.clone("bench")
  if (vacant) dim(piece, VACANT_DIM)
  const { x, z } = tileCenter(tile)
  piece.position.set(x, 0, z)
  return piece
}

/** Put every mesh of a piece on its own darker copies of its materials, which go when the piece does. */
function dim(piece: THREE.Object3D, keep: number) {
  replaceMaterials(piece, (material) => {
    const copy = material.clone() as THREE.MeshLambertMaterial
    copy.color.multiplyScalar(keep)
    return copy
  })
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
  // The box on the bench is BOX_SIZE wide about the centre, so the tablet starts just past its edge.
  piece.position.set(BOX_SIZE / 2 + 0.13, BENCH_H + 0.1, -0.15)
  piece.rotation.x = -0.5
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
export function hopper(intake: Intake): THREE.Group {
  const group = new THREE.Group()
  const mouth = hopperMouth(intake)
  // Four segments make a square funnel; turned so its sides run with the grid. The radius is to a corner.
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8 * Math.SQRT2, 0.3 * Math.SQRT2, HOPPER_H, 4, 1, true),
    new THREE.MeshLambertMaterial({ color: COLOR.hopper, side: THREE.DoubleSide }),
  )
  funnel.rotation.y = Math.PI / 4
  funnel.position.set(mouth.x, HOPPER_MOUTH_H + HOPPER_H / 2, mouth.z)
  group.add(funnel)
  const legMaterial = new THREE.MeshLambertMaterial({ color: COLOR.darkSteel })
  const legH = HOPPER_MOUTH_H + HOPPER_H
  for (const dx of [-0.95, 0.95]) {
    for (const dz of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, legH, 0.08), legMaterial)
      leg.position.set(mouth.x + dx, legH / 2, mouth.z + dz)
      group.add(leg)
    }
  }
  return group
}

/** Where new boxes come out of the hopper: over the middle of the intake. */
export function hopperMouth(intake: Intake): THREE.Vector3 {
  const { x, y, w, h } = intake.rect
  return new THREE.Vector3(x + w / 2, HOPPER_MOUTH_H, y + h / 2)
}

/** The count of boxes resting in the container, on a plate above its back wall over the mouth, where no stack rises in front of it. */
export function containerCount(container: Container, count: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: countTexture(count) }))
  mesh.position.set(container.mouth.x + 0.5, WALL_H + 0.45, container.rect.y + WALL_T)
  return mesh
}

/** Put a new count on the plate. */
export function recount(plate: THREE.Mesh, count: number) {
  const material = plate.material as THREE.MeshBasicMaterial
  material.map = countTexture(count)
  material.needsUpdate = true
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
  const material = new THREE.MeshLambertMaterial({ color: COLOR.container })
  const { x, y, w, h } = container.rect
  const slab = (sx: number, sy: number, sz: number, px: number, pz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    mesh.position.set(px, sy / 2, pz)
    return mesh
  }
  // The side the trunk reaches is open at the mouth; the far side is a wall.
  const [mouthSide, farSide] = container.mouth.x === x ? [x + WALL_T / 2, x + w - WALL_T / 2] : [x + w - WALL_T / 2, x + WALL_T / 2]
  group.add(slab(w, CONTAINER_FLOOR_H, h, x + w / 2, y + h / 2))
  group.add(slab(w, WALL_H, WALL_T, x + w / 2, y + WALL_T / 2))
  group.add(slab(WALL_T, WALL_H, h, farSide, y + h / 2))
  group.add(slab(w, WALL_H / 3, WALL_T, x + w / 2, y + h - WALL_T / 2))
  for (let row = y; row < y + h; row++) {
    if (row !== container.mouth.y) group.add(slab(WALL_T, WALL_H, 1, mouthSide, row + 0.5))
  }
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
      set({ x, y }, CONTAINER_FLOOR_H)
    }
  }
  for (const tile of layout.intake.pile) set(tile, PALLET_H)
  for (const belt of layout.belts) for (const tile of belt.tiles) set(tile, BELT_H)
  for (const bay of layout.bays) for (const station of bay.stations) set(station.bench, BENCH_H)
  if (layout.staging) {
    for (const tile of layout.staging.pile.slice(1)) set(tile, PALLET_H)
    set(layout.staging.bench, BENCH_H)
  }
  return (tile) => heights.get(tileKey(tile)) ?? 0
}

/** The face of a box: its task's label on a plate in the task's colour, or in cardboard's, stuck on the box piece's cardboard. */
export function boxFace(label: string, color: string | undefined, cardboard: THREE.Texture): THREE.Texture {
  return labelTexture(label, color ?? COLOR.box, cardboard.image as CanvasImageSource)
}

/** A box with its task's label on every face over the piece's cardboard, its underside at the given height. The material is the box's own. */
export function box(tile: Tile, underside: number, label: string, color: string | undefined, pieces: Pieces): THREE.Mesh {
  const mesh = pieces.clone("box")
  if (!(mesh instanceof THREE.Mesh)) throw new Error("The box piece is not one mesh")
  mesh.material = new THREE.MeshLambertMaterial({ map: boxFace(label, color, pieces.cardboard) })
  const { x, z } = tileCenter(tile)
  mesh.position.set(x, underside + BOX_SIZE / 2, z)
  return mesh
}

/** An agent: one cell of its sheet on a billboard of fixed height, standing at the origin, facing the camera. Which cell shows is set on its map. */
export function agentSprite(sheet: THREE.Texture): THREE.Sprite {
  const map = sheet.clone()
  const frame = sheetFrame(0, "down")
  map.offset.set(frame.offset.x, frame.offset.y)
  map.repeat.set(frame.repeat.x, frame.repeat.y)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, alphaTest: 0.5 }))
  sprite.center.set(0.5, 0)
  sprite.scale.set(AGENT_H * (SHEET.cellW / SHEET.cellH), AGENT_H, 1)
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
