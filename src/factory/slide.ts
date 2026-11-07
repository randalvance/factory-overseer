// One pass from a drawing to the next, as the overseer's Reorganize asks:
// every piece named in both slides from where it stood to where it stands,
// stretching where its size changed; a piece only the next drawing has fades
// in, and one only the drawing before had fades out, then goes. The agents,
// the tablets and the boxes glide on their own, in step with the pass.

import * as THREE from "three"
import { disposeMeshes } from "./drawing"

/** Seconds a pass takes at speed 1. */
export const SLIDE_S = 1.2

/** Something on its way from where it was to where it now belongs, over one pass. */
export interface Glide {
  from: THREE.Vector3
  to: THREE.Vector3
  /** Seconds into the pass, scaled with the belts. */
  elapsed: number
}

/** A glide for the object from where it is to the place given. */
export function startGlide(object: THREE.Object3D, to: THREE.Vector3): Glide {
  return { from: object.position.clone(), to: to.clone(), elapsed: 0 }
}

/** Carry the object dt seconds further along its glide at the given speed. True once it is there. */
export function glide(object: THREE.Object3D, along: Glide, dt: number, speed: number): boolean {
  along.elapsed += dt * speed
  object.position.lerpVectors(along.from, along.to, through(along.elapsed))
  return along.elapsed >= SLIDE_S
}

/** How far through a pass something is after elapsed seconds of it, slow at both ends. */
function through(elapsed: number): number {
  const t = Math.min(elapsed / SLIDE_S, 1)
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

/** A piece of the next drawing on its way from where its namesake stood. */
interface Moving {
  piece: THREE.Object3D
  from: THREE.Vector3
  to: THREE.Vector3
  scaleFrom: THREE.Vector3
  scaleTo: THREE.Vector3
}

interface FadingMesh {
  mesh: THREE.Mesh
  /** What it wore, to go back to. */
  shared: THREE.Material | THREE.Material[]
}

/** Pieces fading together share one temporary copy of each original material. */
type FadePalette = Map<THREE.Material, { material: THREE.Material; full: number }>

export interface Slide {
  /** Carry the pass dt seconds on at the given speed. True once it is over. */
  tick(dt: number, speed: number): boolean
  /** End the pass where it is: everything at its place in the next drawing, and the drawing before disposed of. */
  end(): void
}

/**
 * Start the pass from one drawing to the next. Both are in the scene: the
 * drawing before stays for its pieces to fade out and is disposed of when
 * the pass is over.
 */
export function startSlide(before: THREE.Group, next: THREE.Group): Slide {
  const stood = new Map(before.children.map((piece) => [piece.name, piece]))
  const moving: Moving[] = []
  const retired: THREE.Object3D[] = []
  const appearing: FadingMesh[] = []
  const fadeIn: FadePalette = new Map(), fadeOut: FadePalette = new Map()
  for (const piece of next.children) {
    const namesake = stood.get(piece.name)
    if (namesake) {
      moving.push({
        piece,
        from: namesake.position.clone(),
        to: piece.position.clone(),
        scaleFrom: piece.scale.clone().multiply(stretch(namesake, piece)),
        scaleTo: piece.scale.clone(),
      })
      // Keep ownership for cleanup without traversing superseded pieces each frame.
      namesake.removeFromParent()
      retired.push(namesake)
      stood.delete(piece.name)
    } else {
      appearing.push(...onFadeMaterials(piece, fadeIn))
    }
  }
  const leaving = [...stood.values()].flatMap((piece) => onFadeMaterials(piece, fadeOut))
  let elapsed = 0
  let over = false
  at(0)

  function at(t: number) {
    for (const { piece, from, to, scaleFrom, scaleTo } of moving) {
      piece.position.lerpVectors(from, to, t)
      piece.scale.lerpVectors(scaleFrom, scaleTo, t)
    }
    for (const copy of fadeIn.values()) copy.material.opacity = copy.full * t
    for (const copy of fadeOut.values()) copy.material.opacity = copy.full * (1 - t)
  }

  function end() {
    if (over) return
    over = true
    at(1)
    for (const { mesh, shared } of [...appearing, ...leaving]) mesh.material = shared
    for (const palette of [fadeIn, fadeOut]) for (const { material } of palette.values()) material.dispose()
    before.removeFromParent()
    for (const piece of retired) before.add(piece)
    disposeMeshes(before)
  }

  return {
    tick(dt, speed) {
      elapsed += dt * speed
      at(through(elapsed))
      if (elapsed < SLIDE_S) return false
      end()
      return true
    },
    end,
  }
}

/** The scale that makes a flat piece as big as its namesake was, its size being in its geometry; none for any other. */
function stretch(namesake: THREE.Object3D, piece: THREE.Object3D): THREE.Vector3 {
  const was = planeSize(namesake)
  const is = planeSize(piece)
  return was && is ? new THREE.Vector3(was.x / is.x, was.y / is.y, 1) : new THREE.Vector3(1, 1, 1)
}

function planeSize(piece: THREE.Object3D): { x: number; y: number } | undefined {
  if (!(piece instanceof THREE.Mesh) || !(piece.geometry instanceof THREE.PlaneGeometry)) return undefined
  const { width, height } = piece.geometry.parameters
  return { x: width, y: height }
}

/** Fade without changing shared originals; entering and leaving pieces use separate palettes. */
function onFadeMaterials(piece: THREE.Object3D, palette: FadePalette): FadingMesh[] {
  const meshes: FadingMesh[] = []
  piece.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const shared = object.material as THREE.Material | THREE.Material[]
    const copies = (Array.isArray(shared) ? shared : [shared]).map((material) => {
      let copy = palette.get(material)
      if (!copy) {
        const fading = material.clone()
        fading.transparent = true
        copy = { material: fading, full: material.opacity }
        palette.set(material, copy)
      }
      return copy
    })
    object.material = Array.isArray(shared) ? copies.map((copy) => copy.material) : copies[0]!.material
    meshes.push({ mesh: object, shared })
  })
  return meshes
}
