import * as THREE from "three"
import type { Layout, Rect } from "~/floor/types"
import { PAPER_GROUND_Y } from "./paperGround"

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

/** Three layers of folded, cut green card, with pale exposed paper edges. */
function canopyGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = []
  const palette = [0x77955e, 0x91ab72, 0x648354, 0x839f66].map((color) => new THREE.Color(color))
  const edge = new THREE.Color(0xc3d09f)
  const triangle = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    positions.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b)
  }
  for (const [bottom, height, radius] of [[.7, .82, .83], [1.23, .77, .65], [1.74, .68, .45]]) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4
      const ra = radius! * (i % 2 ? .82 : 1), rb = radius! * (i % 2 ? 1 : .82)
      const left = [Math.cos(a) * ra, bottom!, Math.sin(a) * ra]
      const right = [Math.cos(b) * rb, bottom!, Math.sin(b) * rb]
      const lowerLeft = [left[0]!, bottom! - .035, left[2]!]
      const lowerRight = [right[0]!, bottom! - .035, right[2]!]
      triangle([0, bottom! + height!, 0], right, left, palette[i % palette.length]!)
      triangle(left, right, lowerRight, edge)
      triangle(left, lowerRight, lowerLeft, edge)
      triangle([0, bottom! - .035, 0], lowerLeft, lowerRight, palette[2]!)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Two instanced meshes for the whole grove; resources belong to this drawing. */
export function drawPaperTrees(layout: Layout, reserved: readonly Rect[] = []): THREE.Group {
  const group = new THREE.Group()
  group.name = "paper-trees"
  const sites = paperTreeSites(layout, reserved)
  const crowns = new THREE.InstancedMesh(canopyGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), sites.length)
  crowns.name = "folded-paper-crowns"
  const trunks = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .95, .13).translate(0, .475, 0),
    new THREE.MeshLambertMaterial({ color: 0xb19a70 }), sites.length)
  trunks.name = "kraft-paper-trunks"
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
