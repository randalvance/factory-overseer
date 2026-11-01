import * as THREE from "three"
import type { Layout, Rect } from "~/floor/types"

/** Continuous paper grass lies below the cream room platforms. */
export const PAPER_GROUND_Y = -.22
export const PAPER_GRASS_COLOR = 0xa7bc7c
const GROUND_MARGIN = 100
const DECORATION_MARGIN = 6
interface GroundPoint { x: number; z: number }

function rectangles(layout: Layout, reserved: readonly Rect[]): Rect[] {
  return [
    ...(layout.rooms?.length ? layout.rooms.map((room) => room.rect) : [layout.bounds]),
    ...layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 }))),
    ...reserved,
  ]
}

/** Ground extends beyond every pan and zoom, independently of the road length.
 * These bounds must never participate in Fit All: the floor is scenery.
 */
export function paperGroundBounds(layout: Layout): Rect {
  const { x, y, w, h } = layout.bounds
  return { x: x - GROUND_MARGIN, y: y - GROUND_MARGIN, w: w + GROUND_MARGIN * 2, h: h + GROUND_MARGIN * 2 }
}

/** A repeating low-contrast fiber grain; no DOM or photographic texture needed. */
function paperGrassTexture(): THREE.DataTexture {
  const size = 128
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.round((hash(x + 41, y + 97) - .5) * 7)
    const fiber = hash(Math.floor(x / 3) + 71, y + 13) > .975 ? 4 : 0
    const at = (y * size + x) * 4
    pixels[at] = 167 + grain + fiber
    pixels[at + 1] = 188 + grain + fiber
    pixels[at + 2] = 124 + grain + fiber
    pixels[at + 3] = 255
  }
  const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter
  map.generateMipmaps = true; map.needsUpdate = true
  return map
}

function hash(x: number, z: number): number {
  let value = Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663)
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

/** Deterministic tuft sites leave circulation and the truck's loading apron clear. */
export function paperGrassSites(layout: Layout, reserved: readonly Rect[] = []): GroundPoint[] {
  const bounds = { x: layout.bounds.x - DECORATION_MARGIN, y: layout.bounds.y - DECORATION_MARGIN,
    w: layout.bounds.w + DECORATION_MARGIN * 2, h: layout.bounds.h + DECORATION_MARGIN * 2 }
  const occupied = rectangles(layout, reserved)
  const sites: GroundPoint[] = []
  for (let row = Math.floor(bounds.y); row < bounds.y + bounds.h; row++) {
    for (let col = Math.floor(bounds.x); col < bounds.x + bounds.w; col++) {
      const seed = hash(col + 17, row + 31)
      if (seed > .23) continue
      const point = { x: col + .25 + seed * .5, z: row + .3 + hash(col + 59, row + 7) * .4 }
      if (occupied.some(({ x, y, w, h }) => point.x > x - .38 && point.x < x + w + .38 && point.z > y - .38 && point.z < y + h + .38)) continue
      sites.push(point)
    }
  }
  return sites
}

/** Continuous green paper, flat cut-paper patches and a few scored, folded blades. */
export function drawPaperGround(layout: Layout, reserved: readonly Rect[] = []): THREE.Group {
  const group = new THREE.Group()
  const bounds = paperGroundBounds(layout)
  const geometry = new THREE.PlaneGeometry(bounds.w, bounds.h).rotateX(-Math.PI / 2)
  const map = paperGrassTexture()
  map.repeat.set(bounds.w / 4, bounds.h / 4)
  map.offset.set(bounds.x / 4, -bounds.y / 4)
  const mat = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map }))
  mat.name = "grass-cardstock"
  mat.position.set(bounds.x + bounds.w / 2, PAPER_GROUND_Y, bounds.y + bounds.h / 2)
  mat.receiveShadow = true
  mat.userData.disposeTexture = true
  group.add(mat)

  // Small irregular polygons suggest layered colored paper, not a noisy photo texture.
  const positions: number[] = [], colors: number[] = []
  const greens = [0xadc286, 0xa0b775, 0xb4c78d, 0x9db476].map((color) => new THREE.Color(color))
  const sites = paperGrassSites(layout, reserved)
  for (let index = 0; index < sites.length; index++) {
    const site = sites[index]!, color = greens[index % greens.length]!
    const radius = .20 + hash(index + 11, 61) * .13
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3
      positions.push(site.x, PAPER_GROUND_Y + .003, site.z,
        site.x + Math.cos(a) * radius, PAPER_GROUND_Y + .003, site.z + Math.sin(a) * radius * .65,
        site.x + Math.cos(b) * radius, PAPER_GROUND_Y + .003, site.z + Math.sin(b) * radius * .65)
      for (let v = 0; v < 3; v++) colors.push(color.r, color.g, color.b)
    }
  }
  const patches = new THREE.BufferGeometry()
  patches.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  patches.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  patches.computeVertexNormals()
  const patchMesh = new THREE.Mesh(patches, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))
  patchMesh.name = "grass-paper-patches"; patchMesh.receiveShadow = true; group.add(patchMesh)

  // Each blade has a pale lit fold and a darker return face. All tufts share
  // one geometry/material and one draw call, even on a grown factory floor.
  const bladePositions: number[] = [], bladeColors: number[] = []
  const light = new THREE.Color(0xc0d191), dark = new THREE.Color(0x789957)
  for (const [lean, height, offset] of [[-.16, .35, -.10], [.02, .47, 0], [.20, .30, .11]]) {
    for (const [side, color] of [[-1, light], [1, dark]] as const) {
      bladePositions.push(offset!, 0, 0, offset! + side * .10, 0, .02, lean!, height!, -.035)
      for (let v = 0; v < 3; v++) bladeColors.push(color.r, color.g, color.b)
    }
  }
  const blade = new THREE.BufferGeometry()
  blade.setAttribute("position", new THREE.Float32BufferAttribute(bladePositions, 3))
  blade.setAttribute("color", new THREE.Float32BufferAttribute(bladeColors, 3)); blade.computeVertexNormals()
  const tufts = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), sites.length)
  const transform = new THREE.Object3D()
  sites.forEach((site, i) => {
    transform.position.set(site.x, PAPER_GROUND_Y + .004, site.z)
    transform.rotation.y = hash(i + 9, 37) * Math.PI
    transform.scale.setScalar(.72 + hash(i + 3, 19) * .35)
    transform.updateMatrix(); tufts.setMatrixAt(i, transform.matrix)
  })
  tufts.name = "grass-folded-tufts"; tufts.castShadow = true; tufts.receiveShadow = true
  tufts.computeBoundingSphere(); group.add(tufts)
  return group
}
