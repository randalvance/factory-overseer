// A layout drawn as one group of placeholder pieces. Built whole for every
// snapshot and thrown away on the next. Boxes, their count over the
// container, agents and tablets are not here: they stay from one snapshot to
// the next, so boxes can ride the belts between them and agents can change
// status in place.

import * as THREE from "three"
import { carriesRework } from "~/floor/belts"
import type { Layout } from "~/floor/types"
import { beltSurface, beltTile, bench, containerWalls, door, floorSlab, hopper, pallet, patch } from "./pieces"

/** The moving surfaces of the belts: one for the trunk and the bays' belts, one for rework on the return belt. */
export interface BeltTextures {
  forward: THREE.Texture
  rework: THREE.Texture
}

export function drawFactory(layout: Layout, textures: BeltTextures): THREE.Group {
  const group = new THREE.Group()
  group.add(floorSlab(layout.bounds))
  group.add(patch(layout.intake.rect, "intake"))
  for (const bay of layout.bays) group.add(patch(bay.rect, "bay"))
  if (layout.staging) group.add(patch(layout.staging.rect, "staging"))

  const forward = beltSurface(textures.forward)
  const rework = beltSurface(textures.rework)
  for (const belt of layout.belts) {
    const surface = carriesRework(belt) ? rework : forward
    for (const tile of belt.tiles) group.add(beltTile(tile, surface))
  }

  for (const bay of layout.bays) for (const station of bay.stations) group.add(bench(station.bench, station.vacant))
  if (layout.staging) {
    group.add(bench(layout.staging.bench))
    // The first staging spot is the bench itself; the rest are shelves beside the inspector.
    for (const tile of layout.staging.pile.slice(1)) group.add(pallet(tile))
  }
  group.add(door(layout.door))
  for (const tile of layout.intake.pile) group.add(pallet(tile))
  group.add(hopper(layout.intake))
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
