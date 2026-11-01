// A layout drawn as one group of pieces. Built whole for every snapshot and
// thrown away on the next, except when the overseer reorganizes: then every
// piece slides from where its namesake stood in the drawing before. Boxes,
// their count over the container, agents and tablets are not here: they stay
// from one snapshot to the next, so boxes can ride the belts between them
// and agents can change status in place.

import * as THREE from "three"
import { beltName, carriesRework } from "~/floor/belts"
import type { Layout } from "~/floor/types"
import { type Pieces, isShared } from "./models"
import { beltTile, bench, containerWalls, door, floorSlab, hopper, pallet, patch } from "./pieces"

/**
 * Every piece is named for what it is of the layout: a belt tile for the
 * belt it is on, by the name a belt keeps when the floor is laid afresh, and
 * how far along it is; a bench for its station; a patch for its bay; and so
 * on. The same name in the next drawing is the same piece, slid there.
 */
export function drawFactory(layout: Layout, pieces: Pieces): THREE.Group {
  const group = new THREE.Group()
  const add = (name: string, piece: THREE.Object3D) => {
    piece.name = name
    group.add(piece)
  }
  add("floor", floorSlab(layout.bounds, pieces.floor))
  add("patch:intake", patch(layout.intake.rect, "intake"))
  for (const bay of layout.bays) add(`patch:${bay.id}`, patch(bay.rect, "bay"))
  if (layout.staging) add("patch:staging", patch(layout.staging.rect, "staging"))

  for (const belt of layout.belts) {
    const surface = carriesRework(belt) ? "rework" : "forward"
    belt.tiles.forEach((tile, i) => add(`belt:${beltName(belt)}:${i}`, beltTile(tile, surface, pieces)))
  }

  for (const bay of layout.bays) for (const station of bay.stations) add(`bench:${station.id}`, bench(station.bench, station.vacant, pieces))
  if (layout.staging) {
    add("bench:staging", bench(layout.staging.bench, false, pieces))
    // The first staging spot is the bench itself; the rest are shelves beside the inspector.
    layout.staging.pile.slice(1).forEach((tile, i) => add(`pallet:staging:${i}`, pallet(tile)))
  }
  add("door", door(layout.door, pieces))
  layout.intake.pile.forEach((tile, i) => add(`pallet:intake:${i}`, pallet(tile)))
  add("hopper", hopper(layout.intake))
  add("container", containerWalls(layout.container))
  return group
}

/** Let go of the geometries and materials of every mesh under an object, but not what it shares with the pieces. Textures stay. */
export function disposeMeshes(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (!isShared(object.geometry)) object.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) if (!isShared(material)) material.dispose()
  })
}
