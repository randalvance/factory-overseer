// A layout drawn as one group of placeholder pieces. Built whole for every
// snapshot and thrown away on the next. Boxes are not here: they stay from
// one snapshot to the next so they can ride the belts between them.

import * as THREE from "three"
import type { Layout, Station } from "~/floor/types"
import { agentSprite, beltSurface, beltTile, bench, containerWalls, floorSlab, pallet, patch } from "./pieces"

/** A station and the sheet its agent wears. */
export interface Seated {
  station: Station
  sheet: THREE.Texture
}

export function drawFactory(layout: Layout, seated: Seated[], belt: THREE.Texture): THREE.Group {
  const group = new THREE.Group()
  group.add(floorSlab(layout.bounds))
  group.add(patch(layout.intake.rect, "intake"))
  for (const bay of layout.bays) group.add(patch(bay.rect, "bay"))
  group.add(patch(layout.staging.rect, "staging"))

  const surface = beltSurface(belt)
  for (const run of layout.belts) for (const tile of run.tiles) group.add(beltTile(tile, surface))

  for (const bay of layout.bays) for (const station of bay.stations) group.add(bench(station.bench))
  group.add(bench(layout.staging.bench))
  for (const tile of layout.intake.pile) group.add(pallet(tile))
  // The first staging spot is the bench itself; the rest are shelves beside the inspector.
  for (const tile of layout.staging.pile.slice(1)) group.add(pallet(tile))
  group.add(containerWalls(layout.container))

  for (const { station, sheet } of seated) group.add(agentSprite(station.agentTile, sheet))
  return group
}

/** Free what a drawing owns: its geometries and materials, and the per-sprite sheet clones. Shared textures stay. */
export function disposeDrawing(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose()
      object.material.dispose()
    } else if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    }
  })
}
