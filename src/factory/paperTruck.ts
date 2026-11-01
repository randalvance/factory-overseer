import * as THREE from "three"
import type { Layout } from "~/floor/types"
import { shippingDock, type ShippingDock } from "~/floor/shippingDock"
import { PAPER_BELT_H } from "./paperConveyors"

const GROUND_Y = -.22
const HEIGHT = 2.1

export interface PaperTruckPlacement extends ShippingDock {
  groundY: number
  height: number
  topY: number
}

/** The renderer consumes the same terminal dock that owns the real parcel
 * route. Older room previews derive it from their existing outdoor geometry.
 */
export function paperTruckPlacement(layout: Layout): PaperTruckPlacement | undefined {
  const room = layout.rooms?.find((room) => room.kind === "deployment")
  if (!room) return undefined
  const recorded = layout.shippingDock
  const blockers = [
    ...layout.rooms!.filter((other) => other !== room).map((other) => other.rect),
    ...layout.belts.filter((belt) => !belt.id.includes("truck")).flatMap((belt) => belt.tiles
      .filter((tile) => !(tile.x >= room.rect.x && tile.x < room.rect.x + room.rect.w &&
        tile.y >= room.rect.y && tile.y < room.rect.y + room.rect.h))
      .map((tile) => ({ ...tile, w: 1, h: 1 }))),
  ]
  const at = recorded ?? shippingDock(room.rect, blockers)
  return { ...at, groundY: GROUND_Y, height: HEIGHT, topY: GROUND_Y + HEIGHT }
}

/** A delivery truck folded from card, in side view: cab left, open loading door on the right.
 * The single local group follows deployment during a normal named-piece glide.
 * Geometry/materials are reused within this drawing and disposed with it.
 */
export function paperTruck(layout: Layout): THREE.Group | undefined {
  const at = paperTruckPlacement(layout)
  if (!at) return undefined
  const group = new THREE.Group()
  group.name = "deployment-truck"
  group.position.set(at.x, at.groundY, at.z)
  group.rotation.y = -Math.PI / 2
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const card = new THREE.MeshLambertMaterial({ color: 0xf3e5c9 })
  const cut = new THREE.MeshLambertMaterial({ color: 0xfff5df })
  const crease = new THREE.MeshLambertMaterial({ color: 0xc9b58f })
  const terracotta = new THREE.MeshLambertMaterial({ color: 0xc78060 })
  const dark = new THREE.MeshLambertMaterial({ color: 0x57615c })
  const glass = new THREE.MeshLambertMaterial({ color: 0x7b9fa2 })
  const light = new THREE.MeshLambertMaterial({ color: 0xffe6ad })
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = card) => {
    const mesh = new THREE.Mesh(cube, material)
    mesh.name = name
    mesh.scale.set(w, h, d); mesh.position.set(x, y, z)
    mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  // Folded undercarriage and four octagonal paper wheels.
  box("chassis", 1.96, .18, 3.25, 0, .43, 0, crease)
  const wheelGeometry = new THREE.CylinderGeometry(.3, .3, .18, 12)
  const hubGeometry = new THREE.CylinderGeometry(.16, .16, .195, 12)
  for (const x of [-1.04, 1.04]) for (const z of [-1.06, 1.07]) {
    const wheel = new THREE.Mesh(wheelGeometry, dark)
    wheel.name = "paper-truck-wheel"; wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, .3, z); wheel.castShadow = true; wheel.receiveShadow = true
    const hub = new THREE.Mesh(hubGeometry, cut)
    hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position)
    group.add(wheel, hub)
  }
  // A cream card sleeve: broad color fields, bright cut edges and scored seams.
  const cargoFloor = PAPER_BELT_H - at.groundY
  box("cargo-floor", 1.95, .06, 1.92, 0, cargoFloor - .03, -.65)
  box("cargo", 1.95, 1.95 - cargoFloor, .045, 0, (1.95 + cargoFloor) / 2, .29)
  for (const x of [-.97, .97]) {
    box("cargo-side", .045, 1.95 - cargoFloor, 1.92, x, (1.95 + cargoFloor) / 2, -.65)
    box("bed-support", .10, cargoFloor - .5, 1.92, x * .85, (cargoFloor + .5) / 2, -.65, crease)
  }
  box("cargo-roof", 2.02, .055, 1.98, 0, 1.98, -.65, cut)
  for (const x of [-.985, .985]) {
    box("cargo-fold", .035, 1.95 - cargoFloor, .055, x, (1.95 + cargoFloor) / 2, -1.58, cut)
    box("cargo-seam", .02, .03, 1.86, x, cargoFloor + .10, -.65, crease)
    box("cargo-top-fold", .035, .045, 1.98, x, 1.94, -.65, cut)
    // A printed parcel emblem on the cargo sleeve.
    box("parcel-mark", .025, .45, .55, x, 1.51, -.7, terracotta)
    box("parcel-tape", .028, .47, .09, x, 1.51, -.7, card)
  }
  // Raised open shutter: parcels enter at the same height as the conveyor.
  box("rear-header", 1.94, .08, .055, 0, 1.93, -1.625, cut)
  for (const x of [-.93, .93]) box("rear-opening-fold", .06, 1.95 - cargoFloor, .06, x, (1.95 + cargoFloor) / 2, -1.625, cut)
  // Cab profile slopes toward the windshield rather than reading as another box.
  const profile = new THREE.Shape()
  profile.moveTo(.34, .52); profile.lineTo(1.68, .52)
  profile.lineTo(1.68, 1.05); profile.lineTo(1.29, 1.65)
  profile.lineTo(.34, 1.65); profile.closePath()
  const cabGeometry = new THREE.ExtrudeGeometry(profile, { depth: 1.86, bevelEnabled: false })
  cabGeometry.rotateY(-Math.PI / 2); cabGeometry.translate(.93, 0, 0)
  const cab = new THREE.Mesh(cabGeometry, terracotta)
  cab.name = "cab"; cab.castShadow = true; cab.receiveShadow = true; group.add(cab)
  box("cab-roof", 1.96, .055, 1.02, 0, 1.68, .8, cut)
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.55, .53), glass)
  windshield.name = "windshield"; windshield.rotation.x = -Math.atan(.39 / .6)
  windshield.position.set(0, 1.33, 1.511); group.add(windshield)
  box("windshield-divider", .045, .52, .028, 0, 1.33, 1.535, cut).rotation.x = windshield.rotation.x
  // Side windows and a scored door on either face of the folded cab.
  for (const x of [-.945, .945]) {
    box("side-window", .025, .49, .65, x, 1.32, .8, glass)
    box("door-score", .027, .027, .75, x, .89, .8, crease)
    box("cab-handle", .04, .045, .18, x, 1.0, .54, cut)
    box("step", .2, .075, .6, x, .51, .67, cut)
  }
  box("front-panel", 1.88, .36, .035, 0, .79, 1.695, terracotta)
  box("bumper", 2.12, .14, .13, 0, .51, 1.75, cut)
  box("grille", .68, .16, .035, 0, .78, 1.723, dark)
  for (const x of [-.69, .69]) box("headlight", .25, .17, .04, x, .88, 1.733, light)
  box("number-plate", .4, .105, .025, 0, .535, 1.822, terracotta)

  return group
}
