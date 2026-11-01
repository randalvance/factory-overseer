// The Blender-built pieces, loaded once from the GLB the script under
// tools/blender writes (ADR 0005), and handed out as copies that share the
// pieces' geometries and materials, so a drawing of hundreds of belt tiles
// costs no more than placing them. What a copy shares is never disposed
// with it. The pieces come with their own textures, nearest-filtered, and
// are shaded like everything else on the floor.

import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { BeltPieceName } from "./beltPieces"
import { pixelated } from "./textures"

/** Every piece in the GLB, by the name its object has there. */
export type PieceName = BeltPieceName | "floor-tile" | "bench" | "tablet" | "box" | "wall" | "window" | "door" | "lamp"

/** The materials in the GLB the view reads by name: the textures it shares out, and the face it draws on. */
type MaterialName = "belt-surface" | "belt-surface-return" | "floor" | "box" | "tablet-face"

/** The tablet piece's face, which the view puts a face of its own on. */
export const TABLET_FACE: MaterialName = "tablet-face"

/** The moving surfaces of the belts: one for the trunk and the bays' belts, one for rework on the return belt. */
export interface BeltTextures {
  forward: THREE.Texture
  rework: THREE.Texture
}

export interface Pieces {
  /** A copy of the piece standing at the origin, on the piece's own geometry and materials: a mesh, or a group of them when it wears more than one material. */
  clone(name: PieceName): THREE.Object3D
  /** The floor tile's texture, which the floor wears once a tile. */
  floor: THREE.Texture
  /** The box's cardboard, which each box's label is drawn over. */
  cardboard: THREE.Texture
  /** The belts' surfaces, scrolled as the belts run. */
  belts: BeltTextures
}

/** What the copies share with the pieces, and what is never disposed with a copy. */
const shared = new WeakSet<THREE.BufferGeometry | THREE.Material>()

/** Whether a geometry or material is a piece's own, shared by every copy, so disposing a copy must leave it be. */
export function isShared(thing: THREE.BufferGeometry | THREE.Material): boolean {
  return shared.has(thing)
}

/** Put every mesh under an object on the material the function gives for each one it wears. */
export function replaceMaterials(root: THREE.Object3D, by: (material: THREE.Material) => THREE.Material): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material) ? object.material.map(by) : by(object.material)
  })
}

const loads = new Map<string, Promise<Pieces>>()

/** The pieces in the GLB at the URL, loaded once; a failed load is tried again next time. */
export function loadPieces(url: string): Promise<Pieces> {
  let pieces = loads.get(url)
  if (!pieces) {
    pieces = new GLTFLoader().loadAsync(url).then((gltf) => piecesOf(gltf.scene, url))
    pieces.catch(() => loads.delete(url))
    loads.set(url, pieces)
  }
  return pieces
}

function piecesOf(scene: THREE.Group, url: string): Pieces {
  const pieceByName = new Map<string, THREE.Object3D>()
  const converted = new Map<THREE.Material, THREE.Material>()
  const materialByName = new Map<string, THREE.Material>()
  for (const piece of scene.children) {
    piece.traverse((object) => {
      if (object instanceof THREE.Mesh) shared.add(object.geometry)
    })
    replaceMaterials(piece, (material) => {
      const lit = asFloorMaterial(material, converted)
      materialByName.set(lit.name, lit)
      return lit
    })
    pieceByName.set(piece.name, piece)
  }
  const texture = (name: MaterialName): THREE.Texture => {
    const map = (materialByName.get(name) as THREE.MeshLambertMaterial | undefined)?.map
    if (!map) throw new Error(`The pieces at ${url} have no ${name} texture`)
    return map
  }
  return {
    clone(name) {
      const piece = pieceByName.get(name)
      if (!piece) throw new Error(`The pieces at ${url} have no ${name}`)
      return piece.clone()
    },
    floor: texture("floor"),
    cardboard: texture("box"),
    belts: { forward: texture("belt-surface"), rework: texture("belt-surface-return") },
  }
}

/** The material as the floor is lit, in place of the one the GLB came with, converted once however many meshes wear it. */
function asFloorMaterial(source: THREE.Material, converted: Map<THREE.Material, THREE.Material>): THREE.Material {
  let material = converted.get(source)
  if (!material) {
    const standard = source as THREE.MeshStandardMaterial
    material = new THREE.MeshLambertMaterial({
      color: standard.color,
      map: standard.map ? pixelated(standard.map) : null,
      emissive: standard.emissive,
      emissiveIntensity: standard.emissiveIntensity,
      side: standard.side,
    })
    material.name = source.name
    source.dispose()
    shared.add(material)
    converted.set(source, material)
  }
  return material
}
