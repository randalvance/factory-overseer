// A layout drawn as one group of placeholder pieces. Built whole for every
// snapshot and thrown away on the next. Boxes, agents and tablets are not
// here: they stay from one snapshot to the next, so boxes can ride the belts
// between them and agents can change status in place.

import * as THREE from "three"
import type { Layout } from "~/floor/types"
import { beltSurface, beltTile, bench, containerWalls, door, floorSlab, pallet, patch } from "./pieces"

export function drawFactory(layout: Layout, belt: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  group.add(floorSlab(layout.bounds))
  group.add(patch(layout.intake.rect, "intake"))
  for (const bay of layout.bays) group.add(patch(bay.rect, "bay"))
  group.add(patch(layout.staging.rect, "staging"))

  const surface = beltSurface(belt)
  for (const run of layout.belts) for (const tile of run.tiles) group.add(beltTile(tile, surface))

  for (const bay of layout.bays) for (const station of bay.stations) group.add(bench(station.bench, station.vacant))
  group.add(bench(layout.staging.bench))
  group.add(door(layout.door))
  for (const tile of layout.intake.pile) group.add(pallet(tile))
  // The first staging spot is the bench itself; the rest are shelves beside the inspector.
  for (const tile of layout.staging.pile.slice(1)) group.add(pallet(tile))
  group.add(containerWalls(layout.container))
  return group
}

/** Let go of the geometries and materials of every mesh under an object. Shared textures stay. */
export function disposeMeshes(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) material.dispose()
  })
}
