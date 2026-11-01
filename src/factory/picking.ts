// What a ray from the pointer lands on. Each layer of the scene, the boxes
// and the figures, offers the nearest of its pieces on the ray, and the view
// picks the nearer of the two.

import type * as THREE from "three"
import type { Subject } from "~/model/types"

/** The nearest of a layer's pieces on the ray: whose it is, and how far along the ray. */
export interface Candidate {
  id: string
  distance: number
}

/** The nearest of the pieces on the ray, by the id each is listed under. */
export function nearestOf(raycaster: THREE.Raycaster, pieces: ReadonlyArray<readonly [string, THREE.Object3D]>): Candidate | undefined {
  const [first] = raycaster.intersectObjects(
    pieces.map(([, piece]) => piece),
    false,
  )
  if (!first) return undefined
  const struck = pieces.find(([, piece]) => piece === first.object)
  return struck && { id: struck[0], distance: first.distance }
}

/** What the ray lands on: the nearer of the box and the figure it strikes, the box when they tie, or nothing. */
export function nearer(box: Candidate | undefined, agent: Candidate | undefined): Subject | undefined {
  if (box && (!agent || box.distance <= agent.distance)) return { task: box.id }
  if (agent) return { agent: agent.id }
  return undefined
}
