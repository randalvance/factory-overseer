// The placeholder pieces the factory is drawn with, each on the tile grid:
// plain boxes and planes in flat colours until the Blender pieces replace
// them. One tile is one world unit; a tile's x is world x and its y is world
// z, so the back wall is at z = 0 and the camera looks in from positive z.

import * as THREE from "three"
import { travelDirection } from "~/floor/belts"
import { tileKey } from "~/floor/tiles"
import type { BeltTile, Container, Direction, Layout, Rect, Tile } from "~/floor/types"
import { SHEET, sheetFrame } from "./sprites"
import { TEXT_PX_PER_TILE, bubbleTexture, floorTexture, labelTexture } from "./textures"

/** Heights in tiles. */
export const BENCH_H = 0.5
const BELT_H = 0.12
const PALLET_H = 0.1
const CONTAINER_FLOOR_H = 0.1
const WALL_H = 1.4
const WALL_T = 0.1
export const AGENT_H = 1.5
/** A box's edge, in tiles. */
export const BOX_SIZE = 0.6
/** A status icon's edge, in tiles: its 16 pixels shown two for one at the base zoom, so they stay whole. */
export const ICON_SIZE = 0.5
const SPARK_SIZE = 0.08

const COLOR = {
  intake: 0x3b5bb5,
  bay: 0x3a7a62,
  staging: 0xc08a2e,
  bench: 0x6b7f99,
  tablet: 0x1a2634,
  beltFrame: 0x2b2f36,
  pallet: 0x8b6b3e,
  container: 0x9c4a2f,
  box: "#d9a559",
  sparks: [0xffd166, 0xffb347, 0xfff3c4],
}

export function tileCenter(tile: Tile): { x: number; z: number } {
  return { x: tile.x + 0.5, z: tile.y + 0.5 }
}

/** The whole floor, one concrete tile per grid tile. */
export function floorSlab(bounds: Rect): THREE.Mesh {
  const texture = floorTexture()
  texture.repeat.set(bounds.w, bounds.h)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bounds.w, bounds.h), new THREE.MeshLambertMaterial({ map: texture }))
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

/** The moving surface shared by every belt tile of one drawing. */
export function beltSurface(texture: THREE.Texture): THREE.Material {
  return new THREE.MeshLambertMaterial({ map: texture })
}

const YAW: Record<Direction, number> = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }

/** A belt tile: a dark frame with the moving surface on top, turned so the texture runs the way boxes travel. */
export function beltTile(tile: BeltTile, surface: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, BELT_H, 0.8), new THREE.MeshLambertMaterial({ color: COLOR.beltFrame }))
  frame.position.y = BELT_H / 2
  group.add(frame)
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7).rotateX(-Math.PI / 2), surface)
  top.position.y = BELT_H + 0.005
  top.rotation.y = YAW[travelDirection(tile)]
  group.add(top)
  const { x, z } = tileCenter(tile)
  group.position.set(x, 0, z)
  return group
}

/** A bench, the width of its tile so the belts meet it. The box sits on it; the tablet is a piece of its own, since its face changes with the agent's status. */
export function bench(tile: Tile): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, BENCH_H, 0.7), new THREE.MeshLambertMaterial({ color: COLOR.bench }))
  const { x, z } = tileCenter(tile)
  mesh.position.set(x, BENCH_H / 2, z)
  return mesh
}

/** A tablet as the agents keep it: the group goes at its bench's tile, and the face wears the texture of its look. */
export interface TabletPiece {
  group: THREE.Group
  face: THREE.MeshBasicMaterial
}

/** A tablet at the right end of a bench, clear of the box. */
export function tablet(): TabletPiece {
  const body = new THREE.MeshLambertMaterial({ color: COLOR.tablet })
  const face = new THREE.MeshBasicMaterial()
  // Box faces in order: right, left, top, bottom, front, back. The front faces the camera.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.04), [body, body, body, body, face, body])
  // The box on the bench is BOX_SIZE wide about the centre, so the tablet starts just past its edge.
  mesh.position.set(BOX_SIZE / 2 + 0.13, BENCH_H + 0.1, -0.15)
  mesh.rotation.x = -0.5
  const group = new THREE.Group()
  group.add(mesh)
  return { group, face }
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
  group.add(slab(w, CONTAINER_FLOOR_H, h, x + w / 2, y + h / 2))
  group.add(slab(w, WALL_H, WALL_T, x + w / 2, y + WALL_T / 2))
  group.add(slab(WALL_T, WALL_H, h, x + w - WALL_T / 2, y + h / 2))
  group.add(slab(w, WALL_H / 3, WALL_T, x + w / 2, y + h - WALL_T / 2))
  for (let row = y; row < y + h; row++) {
    if (row !== container.mouth.y) group.add(slab(WALL_T, WALL_H, 1, x + WALL_T / 2, row + 0.5))
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
  for (const tile of layout.staging.pile.slice(1)) set(tile, PALLET_H)
  for (const belt of layout.belts) for (const tile of belt.tiles) set(tile, BELT_H)
  for (const bay of layout.bays) for (const station of bay.stations) set(station.bench, BENCH_H)
  set(layout.staging.bench, BENCH_H)
  return (tile) => heights.get(tileKey(tile)) ?? 0
}

/** The face of a box: its task's label on the task's colour, or on cardboard. */
export function boxFace(label: string, color?: string): THREE.Texture {
  return labelTexture(label, color ?? COLOR.box)
}

/** A box with its task's label on every face, its underside at the given height. */
export function box(tile: Tile, underside: number, label: string, color?: string): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ map: boxFace(label, color) })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE), material)
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

/** One spark: a fleck of hot colour. */
export function spark(): THREE.Sprite {
  const color = COLOR.sparks[Math.floor(Math.random() * COLOR.sparks.length)]
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color }))
  sprite.scale.set(SPARK_SIZE, SPARK_SIZE, 1)
  return sprite
}
