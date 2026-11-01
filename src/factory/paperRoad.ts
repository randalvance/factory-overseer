import * as THREE from "three"
import type { Layout, Rect } from "~/floor/types"
import { paperTruckPlacement } from "./paperTruck"

const ROAD_WIDTH = 3.4
const ROAD_LENGTH = 240
const DASH_LENGTH = .7
const DASH_PITCH = 1.6

/** A continuous exit corridor. Its long foreground extent is decoration,
 * not factory content for Fit All; grass uses it only to keep tufts clear.
 */
export function paperRoadFootprint(layout: Layout): Rect | undefined {
  const truck = paperTruckPlacement(layout)
  if (!truck) return undefined
  return { x: truck.x - ROAD_LENGTH / 2, y: truck.z - ROAD_WIDTH / 2, w: ROAD_LENGTH, h: ROAD_WIDTH }

}

/** Charcoal construction paper with cut cream edges and printed lane dashes.
 * The road continues past both sides of the scene and is deliberately omitted
 * from camera fitting. All geometry is local so it glides with deployment.
 */
export function paperRoad(layout: Layout): THREE.Group | undefined {
  const rect = paperRoadFootprint(layout)
  const truck = paperTruckPlacement(layout)
  if (!rect || !truck) return undefined
  const group = new THREE.Group()
  group.name = "paper-road"
  group.position.set(truck.x, truck.groundY, truck.z)
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const edge = new THREE.MeshLambertMaterial({ color: 0xd5ccb2 })
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x69716d })
  const ink = new THREE.MeshLambertMaterial({ color: 0xf6edd6 })
  const seam = new THREE.MeshLambertMaterial({ color: 0x899087 })
  const slab = (name: string, width: number, height: number, length: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(cube, material)
    mesh.name = name; mesh.scale.set(width, height, length)
    mesh.position.set(x, y, z); mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  slab("road-cut-edge", rect.w, .022, rect.h, 0, .003, 0, edge)
  slab("road-asphalt", rect.w, .012, rect.h - .14, 0, .02, 0, asphalt)
  for (const side of [-1, 1]) {
    // Narrow score lines, rather than curbs or raised barriers.
    slab("road-fold", rect.w, .005, .025, 0, .028, side * (rect.h / 2 - .115), seam)
  }
  const count = Math.floor((rect.w - .4) / DASH_PITCH)
  const dashes = new THREE.InstancedMesh(cube, ink, count)
  dashes.name = "road-center-dashes"
  const transform = new THREE.Object3D()
  transform.scale.set(DASH_LENGTH, .004, .085)
  for (let i = 0; i < count; i++) {
    transform.position.set(-rect.w / 2 + .65 + i * DASH_PITCH, .03, 0)
    transform.updateMatrix()
    dashes.setMatrixAt(i, transform.matrix)
  }
  dashes.receiveShadow = true
  dashes.computeBoundingSphere()
  group.add(dashes)
  return group
}
