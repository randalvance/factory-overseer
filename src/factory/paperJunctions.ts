import * as THREE from "three"
import type { BeltTile, Direction } from "~/floor/types"
import type { Pieces } from "./models"
import { BELT_DECK_H, PAPER_BELT_H } from "./paperConveyors"

type Junction = Extract<BeltTile, { kind: "junction" }>
type Own = <T extends THREE.BufferGeometry | THREE.Material>(resource: T) => T
type Renderer = (tile: Junction, floorY: number) => THREE.Group
const renderers = new WeakMap<Pieces, Renderer>()
const OPPOSITE: Record<Direction, Direction> = { n: "s", s: "n", e: "w", w: "e" }
const VECTOR: Record<Direction, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }
const YAW: Record<Direction, number> = { n: Math.PI, e: Math.PI / 2, s: 0, w: -Math.PI / 2 }
const ORDER: Direction[] = ["n", "e", "s", "w"]

/** Travel directions on entries point into a junction, so their physical
 * ports lie on the opposite edge. One side can carry both directions.
 */
export function paperJunctionPorts(tile: Junction): Direction[] {
  const connected = new Set([...tile.entries.map((entry) => OPPOSITE[entry]), ...tile.exits])
  return ORDER.filter((side) => connected.has(side))
}

/** Open scenery for shared two-port routes; routing continues to use the original tile. */
export function openPaperBeltTile(tile: BeltTile): BeltTile {
  if (tile.kind !== "junction" || paperJunctionPorts(tile).length !== 2) return tile
  // Opposing routes can share two physical ports without branching. Pick a
  // real through movement for the artwork, never an entry's immediate U-turn.
  for (const to of [tile.dir, ...tile.exits]) {
    if (!tile.exits.includes(to)) continue
    const from = tile.entries.find((entry) => OPPOSITE[entry] !== to)
    if (from) return from === to
      ? { kind: "straight", x: tile.x, y: tile.y, dir: to }
      : { kind: "corner", x: tile.x, y: tile.y, from, to }
  }
  return tile
}

export function paperJunctionKind(tile: Junction): "splitter" | "merger" | "splitter-merger" {
  const split = new Set(tile.exits).size > 1
  const merge = new Set(tile.entries).size > 1
  return split && merge ? "splitter-merger" : merge ? "merger" : "splitter"
}

export function registerPaperJunctions(pieces: Pieces, render: Renderer): void {
  renderers.set(pieces, render)
}

/** The paper library supplies one complete junction module for its registered pieces. */
export function paperJunctionFor(pieces: Pieces, tile: Junction, floorY: number): THREE.Group | undefined {
  return renderers.get(pieces)?.(tile, floorY)
}

/** Outline of one continuous center plate, with only the connected ports
 * extended to tile edges. Narrow green entries match the neighbouring belt.
 */
function outline(ports: readonly Direction[], center: number, halfPort: number): THREE.Shape {
  const points: [number, number][] = [[-center, -center]]
  const edge = (side: Direction, transform: (along: number, outward: number) => [number, number]) => {
    if (ports.includes(side)) points.push(
      transform(-halfPort, center), transform(-halfPort, .5),
      transform(halfPort, .5), transform(halfPort, center),
    )
    points.push(transform(center, center))
  }
  edge("n", (a, b) => [a, -b])
  edge("e", (a, b) => [b, a])
  edge("s", (a, b) => [-a, b])
  edge("w", (a, b) => [-b, -a])
  const shape = new THREE.Shape()
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  return shape
}

/** One per paper library: topology-specific plates and all small hardware
 * share owned geometry/materials, and normal drawing disposal leaves them alive.
 */
export function createPaperJunctions(own: Own): Renderer {
  const cream = own(new THREE.MeshLambertMaterial({ color: 0xf4e6c9 }))
  const edge = own(new THREE.MeshLambertMaterial({ color: 0xc6b28f }))
  const green = own(new THREE.MeshLambertMaterial({ color: 0x779886 }))
  const cube = own(new THREE.BoxGeometry(1, 1, 1))
  const shade = own(new THREE.MeshBasicMaterial({ color: 0x101713 }))
  const fadingShade = own(new THREE.MeshBasicMaterial({ color: 0x101713, transparent: true, depthWrite: false, vertexColors: true }))
  // Several light layers leave the mouth open and let both the belt and a
  // passing parcel lose contrast progressively as they enter the housing.
  const shadows = [.04, .08, .12, .2, .32, .5].map((opacity) =>
    own(new THREE.MeshBasicMaterial({ color: 0x101713, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, vertexColors: true })))
  const backShadow = own(new THREE.MeshBasicMaterial({ color: 0x101713, side: THREE.DoubleSide }))
  const curtain = own(new THREE.PlaneGeometry(.78, .635, 1, 8))
  const curtainColors: number[] = []
  const curtainPosition = curtain.getAttribute("position")
  for (let i = 0; i < curtainPosition.count; i++) {
    const height = curtainPosition.getY(i) + .3175
    const alpha = Math.min(1, height / .22)
    curtainColors.push(1, 1, 1, alpha * alpha * (3 - 2 * alpha))
  }
  curtain.setAttribute("color", new THREE.Float32BufferAttribute(curtainColors, 4))
  // Vertex alpha fades the existing sage surface and its arrows into the
  // recess without allocating textures or replacing the neighbouring belt.
  const fadeStrip = (outer: number) => {
    const positions: number[] = [], colors: number[] = [], indices: number[] = []
    const rows = Array.from({ length: 9 }, (_, index) => {
      const t = index / 8
      return [.305 + (outer - .305) * t, .015 + .985 * t * t * (3 - 2 * t)] as const
    })
    for (const [z, value] of rows) for (const x of [-Math.min(.35, z), Math.min(.35, z)]) {
      positions.push(x, 0, z); colors.push(1, 1, 1, 1 - value)
    }
    for (let row = 0; row < rows.length - 1; row++) {
      const at = row * 2
      indices.push(at, at + 2, at + 1, at + 1, at + 2, at + 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return own(geometry)
  }
  const connectedFade = fadeStrip(.85)
  const plates = new Map<string, { base: THREE.BufferGeometry; surface: THREE.BufferGeometry }>()

  return (tile, floorY) => {
    const ports = paperJunctionPorts(tile)
    const key = ports.join("")
    let plate = plates.get(key)
    if (!plate) {
      plate = {
        base: own(new THREE.ExtrudeGeometry(outline(ports, .45, .45), { depth: BELT_DECK_H, bevelEnabled: false }).rotateX(-Math.PI / 2)),
        surface: own(new THREE.ShapeGeometry(outline(ports, .4, .35)).rotateX(-Math.PI / 2)),
      }
      plates.set(key, plate)
    }
    const group = new THREE.Group()
    group.name = "paper-junction"
    group.userData.junctionKind = paperJunctionKind(tile)
    group.userData.ports = ports
    const base = new THREE.Mesh(plate.base, cream)
    base.name = "junction-deck"; base.position.y = PAPER_BELT_H - BELT_DECK_H
    base.castShadow = true; base.receiveShadow = true
    const surface = new THREE.Mesh(plate.surface, green)
    surface.name = "junction-surface"; surface.position.y = PAPER_BELT_H + .001
    surface.receiveShadow = true; group.add(base, surface)
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(cube, material)
      mesh.name = name; mesh.scale.set(w, h, d); mesh.position.set(x, y, z)
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh)
      return mesh
    }
    const legTop = PAPER_BELT_H - BELT_DECK_H
    for (const x of [-.32, .32]) for (const z of [-.32, .32]) {
      box("junction-leg", .12, legTop - floorY, .12, x, (floorY + legTop) / 2, z, cream)
      box("junction-foot", .22, .035, .22, x, floorY + .0175, z, edge)
    }
    // A four-port housing opens only the faces connected to conveyors.
    // Connected passages keep .78 width and .64 headroom so .6-tile
    // parcels remain clear while crossing or turning.
    const headerBottom = PAPER_BELT_H + .64
    const headerTop = headerBottom + .055
    const roofTop = headerTop + .035
    for (const x of [-.45, .45]) for (const z of [-.45, .45]) {
      box("junction-post", .12, headerTop - PAPER_BELT_H, .12,
        x, (PAPER_BELT_H + headerTop) / 2, z, cream)
    }
    for (const side of ORDER) {
      const [x, z] = VECTOR[side]
      const alongX = side === "n" || side === "s"
      box("junction-header-" + side, alongX ? 1.04 : .12, .055, alongX ? .12 : 1.04,
        x * .46, (headerBottom + headerTop) / 2, z * .46, green)
      // The pale inner fold is a cut edge, above the clear portal opening.
      box("junction-header-fold-" + side, alongX ? .8 : .018, .025, alongX ? .018 : .8,
        x * .521, headerBottom + .0125, z * .521, cream)
      if (!ports.includes(side)) {
        // A fitted card blank closes unused sockets; its sage face and
        // exposed cream edge belong to the same housing as the open ports.
        box("junction-cover-" + side, alongX ? .78 : .05, .64, alongX ? .05 : .78,
          x * .485, PAPER_BELT_H + .32, z * .485, cream)
        box("junction-cover-face-" + side, alongX ? .73 : .008, .59, alongX ? .008 : .73,
          x * .514, PAPER_BELT_H + .32, z * .514, green)
      }
    }
    box("junction-roof", 1.04, .035, 1.04, 0, headerTop + .0175, 0, cream)
    box("junction-roof-face", .99, .008, .99, 0, roofTop + .004, 0, green)
    // Optical darkness is recessed behind the real openings. It is scenery,
    // not collision geometry: parcels disappear into this inner shadow and
    // reappear through the selected port while their route stays unchanged.
    const shadow = (mesh: THREE.Mesh) => {
      mesh.userData.junctionShadow = true
      mesh.castShadow = false; mesh.receiveShadow = false
      return mesh
    }
    shadow(box("junction-shadow-core", .62, .635, .62,
      0, PAPER_BELT_H + .3175, 0, shade))
    shadow(box("junction-shadow-ceiling", .78, .006, .78,
      0, headerBottom + .003, 0, shade))
    for (const side of ports) {
      const [x, z] = VECTOR[side]
      const fade = new THREE.Mesh(connectedFade, fadingShade)
      fade.name = "junction-mouth-fade-" + side
      fade.position.y = PAPER_BELT_H + .009
      fade.rotation.y = YAW[side]
      fade.receiveShadow = true
      group.add(fade)
      // The housing softly shades the approaching deck before the portal,
      // and the opaque centre still hides a parcel fully inside the module.
      const layers = shadows.map((material, index) => [.49 - index * .03, material] as const)
      layers.push([.31, backShadow])
      for (const [depth, material] of layers) {
        const veil = shadow(new THREE.Mesh(curtain, material))
        veil.name = "junction-mouth-shadow-" + side
        veil.position.set(x * depth, PAPER_BELT_H + .3175, z * depth)
        veil.rotation.y = YAW[side]
        group.add(veil)
      }
    }
    return group
  }
}
