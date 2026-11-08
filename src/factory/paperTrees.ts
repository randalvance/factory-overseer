import * as THREE from "three"
import type { Layout, Rect } from "~/floor/types"
import { DEFAULT_BIOME, type Biome } from "~/model/biomes"
import { PAPER_GROUND_Y } from "./paperGround"
import { paperBiome } from "./paperBiomes"

export interface PaperTreeSite { x: number; z: number; height: number; turn: number }
const CROWN_RADIUS = .83
const TREE_HEIGHT = 2.42

function seed(x: number, z: number): number {
  let value = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000
}

/** A stable grove outside circulation, never between the camera and a room.
 * Scenery is deliberately absent from the model points used by Fit All.
 */
export function paperTreeSites(layout: Layout, reserved: readonly Rect[] = []): PaperTreeSite[] {
  const { x, y, w, h } = layout.bounds
  const occupied = [...(layout.rooms?.map((room) => room.rect) ?? [layout.bounds]),
    ...layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ ...tile, w: 1, h: 1 }))),
    layout.intake.rect, ...reserved]
  const sites: PaperTreeSite[] = []
  const add = (px: number, pz: number, small = false) => {
    const variation = seed(px, pz)
    const height = small ? 1.05 + variation * .3 : 1.85 + variation * .65
    const radius = CROWN_RADIUS * height / TREE_HEIGHT + .4
    if (occupied.some((rect) => px + radius > rect.x && px - radius < rect.x + rect.w &&
      pz + radius > rect.y && pz - radius < rect.y + rect.h)) return
    sites.push({ x: px, z: pz, height, turn: variation * Math.PI })
  }
  // Fixed world-grid spacing means growth extends the grove without shuffling
  // existing trees. Side sites are beyond even the outer conveyor corridors.
  for (let px = x + 2.5; px < x + w - 1; px += 5.5) add(px, y - 2)
  for (let pz = y + 2.5; pz < y + h - 1; pz += 5.5) {
    add(x - 1.65, pz)
    add(x + w + 1.65, pz + .8)
  }
  // Only small trees at the far foreground corners; no screen across the truck.
  add(x - 2, y + h + 2.8, true)
  add(x + w + 2, y + h + 2.8, true)
  return sites
}

type Triangle = (a: readonly number[], b: readonly number[], c: readonly number[], color: THREE.Color) => void

/** Vertex-coloured triangles gathered into one geometry. */
function paperGeometry(build: (triangle: Triangle) => void): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = []
  build((a, b, c, color) => {
    positions.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

const lerp = (a: readonly number[], b: readonly number[], t: number) => a.map((value, i) => value + (b[i]! - value) * t)

/** Three layers of folded, cut green card, with pale exposed paper edges.
 * Under snow, the upper half of every fold wears a white cap and the cut
 * edges are frosted, so the same grove reads as wintry without new art. */
export function canopyGeometry(snowy = false): THREE.BufferGeometry {
  const palette = (snowy ? [0x5f7f5a, 0x6f8f66, 0x52704f, 0x67875f] : [0x77955e, 0x91ab72, 0x648354, 0x839f66]).map((color) => new THREE.Color(color))
  const caps = [0xf7fafc, 0xe6eef4].map((color) => new THREE.Color(color))
  const edge = new THREE.Color(snowy ? 0xeef3f7 : 0xc3d09f)
  return paperGeometry((triangle) => {
    for (const [bottom, height, radius] of [[.7, .82, .83], [1.23, .77, .65], [1.74, .68, .45]]) {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4
        const ra = radius! * (i % 2 ? .82 : 1), rb = radius! * (i % 2 ? 1 : .82)
        const apex = [0, bottom! + height!, 0]
        const left = [Math.cos(a) * ra, bottom!, Math.sin(a) * ra]
        const right = [Math.cos(b) * rb, bottom!, Math.sin(b) * rb]
        const lowerLeft = [left[0]!, bottom! - .035, left[2]!]
        const lowerRight = [right[0]!, bottom! - .035, right[2]!]
        const color = palette[i % palette.length]!
        if (snowy) {
          // The cap's hem dips on alternate folds, like snow settling unevenly.
          const hem = i % 2 ? .52 : .62
          const capLeft = lerp(apex, left, hem), capRight = lerp(apex, right, hem)
          triangle(apex, capRight, capLeft, caps[i % caps.length]!)
          triangle(capLeft, capRight, right, color)
          triangle(capLeft, right, left, color)
        } else {
          triangle(apex, right, left, color)
        }
        triangle(left, right, lowerRight, edge)
        triangle(left, lowerRight, lowerLeft, edge)
        triangle([0, bottom! - .035, 0], lowerLeft, lowerRight, palette[2]!)
      }
    }
  })
}

/** A ribbed, folded column of green card between two points, closed by a low dome. */
function cactusLimb(triangle: Triangle, from: readonly number[], to: readonly number[], radius: number, dome: boolean) {
  const ribs = 8
  const lit = [0x86a462, 0x6a8a4f].map((color) => new THREE.Color(color))
  const tip = new THREE.Color(0x9cb878)
  const axis = new THREE.Vector3(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!)
  axis.normalize()
  const side = new THREE.Vector3(...(Math.abs(axis.y) > .9 ? [1, 0, 0] : [0, 1, 0]) as [number, number, number]).cross(axis).normalize()
  const up = new THREE.Vector3().crossVectors(axis, side)
  // Alternate radii fold the card into ribs; each rib face takes the light differently.
  const ring = (at: readonly number[], scale: number) => Array.from({ length: ribs }, (_, i) => {
    const angle = i * Math.PI * 2 / ribs
    const r = radius * scale * (i % 2 ? .78 : 1)
    return [at[0]! + (side.x * Math.cos(angle) + up.x * Math.sin(angle)) * r,
      at[1]! + (side.y * Math.cos(angle) + up.y * Math.sin(angle)) * r,
      at[2]! + (side.z * Math.cos(angle) + up.z * Math.sin(angle)) * r]
  })
  const bottom = ring(from, 1), top = ring(to, 1)
  for (let i = 0; i < ribs; i++) {
    const j = (i + 1) % ribs, color = lit[i % 2]!
    triangle(bottom[i]!, top[i]!, top[j]!, color)
    triangle(bottom[i]!, top[j]!, bottom[j]!, color)
  }
  if (!dome) return
  const along = [axis.x, axis.y, axis.z]
  const shoulder = ring(to.map((value, i) => value + along[i]! * radius * .45), .72)
  const crown = to.map((value, i) => value + along[i]! * radius * .8)
  for (let i = 0; i < ribs; i++) {
    const j = (i + 1) % ribs
    triangle(top[i]!, shoulder[i]!, shoulder[j]!, lit[i % 2]!)
    triangle(top[i]!, shoulder[j]!, top[j]!, lit[i % 2]!)
    triangle(shoulder[i]!, crown, shoulder[j]!, tip)
  }
}

/** A folded paper saguaro of the same height as a tree, so desert groves keep the grove's sites. */
export function cactusGeometry(): THREE.BufferGeometry {
  return paperGeometry((triangle) => {
    cactusLimb(triangle, [0, 0, 0], [0, 2.1, 0], .27, true)
    // Two arms, each an elbow out from the trunk and a column turning up.
    cactusLimb(triangle, [0, .95, 0], [.56, .95, 0], .15, false)
    cactusLimb(triangle, [.56, .79, 0], [.56, 1.62, 0], .16, true)
    cactusLimb(triangle, [0, 1.28, 0], [-.5, 1.28, 0], .14, false)
    cactusLimb(triangle, [-.5, 1.13, 0], [-.5, 1.82, 0], .15, true)
  })
}

/** Two instanced meshes for the whole grove; resources belong to this drawing.
 * The sites are the same in every biome; only what stands on them changes. */
export function drawPaperTrees(layout: Layout, reserved: readonly Rect[] = [], biomeName: Biome = DEFAULT_BIOME): THREE.Group {
  const group = new THREE.Group()
  group.name = "paper-trees"
  const biome = paperBiome(biomeName)
  group.userData.biome = biomeName
  const sites = paperTreeSites(layout, reserved)
  const crowns = new THREE.InstancedMesh(biome.grove === "cactus" ? cactusGeometry() : canopyGeometry(biome.grove === "snowy"),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), sites.length)
  crowns.name = biome.names.crowns
  // A cactus stands on a low drift of sand paper; trees on a kraft trunk.
  const trunks = new THREE.InstancedMesh(biome.grove === "cactus" ?
    new THREE.CylinderGeometry(.36, .46, .1, 7).translate(0, .05, 0) :
    new THREE.BoxGeometry(.18, .95, .13).translate(0, .475, 0),
  new THREE.MeshLambertMaterial({ color: biome.grove === "cactus" ? 0xcfb27a : 0xb19a70 }), sites.length)
  trunks.name = biome.names.trunks
  const transform = new THREE.Object3D()
  sites.forEach((site, i) => {
    transform.position.set(site.x, PAPER_GROUND_Y, site.z)
    transform.rotation.y = site.turn
    transform.scale.setScalar(site.height / TREE_HEIGHT)
    transform.updateMatrix()
    crowns.setMatrixAt(i, transform.matrix)
    trunks.setMatrixAt(i, transform.matrix)
  })
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }
  return group
}
