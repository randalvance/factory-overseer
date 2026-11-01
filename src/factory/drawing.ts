// A layout drawn as one group of pieces. Built whole for every snapshot and
// thrown away on the next, except when the overseer reorganizes: then every
// piece slides from where its namesake stood in the drawing before. Boxes,
// their count over the container, agents and tablets are not here: they stay
// from one snapshot to the next, so boxes can ride the belts between them
// and agents can change status in place.

import * as THREE from "three"
import type { ResolvedRoomTheme } from "~/model/roomThemes"
import type { ThemeAssets } from "./roomThemeAssets"
import { drawRooms } from "./rooms"
import { drawPaperGround } from "./paperGround"
import { drawPaperTrees } from "./paperTrees"
import { paperRoad, paperRoadFootprint } from "./paperRoad"
import { paperTruck, paperTruckPlacement } from "./paperTruck"
import { beltName, carriesRework } from "~/floor/belts"
import type { Layout } from "~/floor/types"
import { type Pieces, isShared } from "./models"
import { tileKey } from "~/floor/tiles"
import { trimPaperBeltAtBenches } from "./paperConveyors"
import { paperWallPortTile } from "./paperWallPorts"
import { beltTile, bench, containerWalls, door, floorSlab, hopper, pallet, patch } from "./pieces"

/**
 * Every piece is named for what it is of the layout: a belt tile for the
 * belt it is on, by the name a belt keeps when the floor is laid afresh, and
 * how far along it is; a bench for its station; a patch for its bay; and so
 * on. The same name in the next drawing is the same piece, slid there.
 */
export function drawFactory(layout: Layout, pieces: Pieces, themes?: ReadonlyMap<string, ResolvedRoomTheme>, assets?: ThemeAssets): THREE.Group {
  const group = new THREE.Group()
  group.userData.paper = !!pieces.paper
  const add = (name: string, piece: THREE.Object3D) => {
    piece.name = name
    group.add(piece)
  }
  if (pieces.paper && layout.rooms) {
    const truck = paperTruckPlacement(layout)
    const road = paperRoadFootprint(layout)
    const reserved = [...(truck ? [truck.footprint] : []), ...(road ? [road] : [])]
    add("floor", drawPaperGround(layout, reserved))
    add("paper-trees", drawPaperTrees(layout, reserved))
    const roadPiece = paperRoad(layout)
    if (roadPiece) add("paper-road", roadPiece)
  } else {
    const floor = floorSlab(layout.bounds, pieces.floor)
    if (layout.rooms) (floor.material as THREE.MeshLambertMaterial).color.setHex(0x303941)
    add("floor", floor)
  }
  drawRooms(layout, pieces.floor, add, pieces.paper, themes, assets)
  if (!pieces.paper) add("patch:intake", patch(layout.intake.rect, "intake"))
  if (!pieces.paper) for (const bay of layout.bays) add(`patch:${bay.id}`, patch(bay.rect, "bay"))
  if (layout.staging && !pieces.paper) add("patch:staging", patch(layout.staging.rect, "staging"))

  const paperBenches = new Set(layout.bays.flatMap((bay) => bay.stations.map((station) => tileKey(station.bench))))
  if (layout.staging) paperBenches.add(tileKey(layout.staging.bench))
  for (const belt of layout.belts) {
    const surface = carriesRework(belt) ? "rework" : "forward"
    belt.tiles.forEach((tile, i) => {
      // Cargo tiles remain routable, but the truck floor carries them once
      // they pass its open rear; conveyor feet must not pierce the sleeve.
      if (pieces.paper && layout.shippingDock?.cargoTiles.some((cargo) => cargo.x === tile.x && cargo.y === tile.y)) return
      const onPlatform = layout.rooms?.some(({ rect, kind }) => kind !== "intake" && tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h)
      const floorY = pieces.paper && layout.rooms && !onPlatform ? -.22 : 0
      const drawingTile = pieces.paper ? paperWallPortTile(tile, layout.rooms) : tile
      const piece = beltTile(drawingTile, surface, pieces, floorY)
      if (pieces.paper) trimPaperBeltAtBenches(piece, drawingTile, paperBenches)
      add(`belt:${beltName(belt)}:${i}`, piece)
    })
  }

  const stationPalette = new Map<number, THREE.MeshLambertMaterial>()
  for (const bay of layout.bays) for (const station of bay.stations) add(`bench:${station.id}`, bench(station.bench, station.vacant, pieces, station.role, themes?.get(bay.id), assets, stationPalette))
  if (layout.staging) {
    add("bench:staging", bench(layout.staging.bench, false, pieces))
    // The first staging spot is the bench itself; the rest are shelves beside the inspector.
    layout.staging.pile.slice(1).forEach((tile, i) => add(`pallet:staging:${i}`, pallet(tile)))
  }
  if (layout.rooms) {
    for (const room of layout.rooms) if (!pieces.paper || room.kind !== "intake") add(`door:${room.id}`, door(room.door, pieces))
  } else add("door", door(layout.door, pieces))
  layout.intake.pile.forEach((tile, i) => add(`pallet:intake:${i}`, pallet(tile)))
  add("hopper", hopper(layout.intake, pieces.paper, pieces.paper && layout.rooms ? -.22 : 0))
  // Configured paper factories ship through the deployment side outlet;
  // the old front-facing tray/arch would create a second, disconnected exit.
  if (!pieces.paper || !layout.shippingDock) add("container", containerWalls(layout.container, pieces.paper))
  if (pieces.paper) {
    const truck = paperTruck(layout)
    const deployment = layout.rooms?.find((room) => room.kind === "deployment")
    if (truck && deployment) add(`${deployment.id}:truck`, truck)
  }
  return group
}

/** Let go of the geometries and materials of every mesh under an object, but not what it shares with the pieces. Textures stay. */
export function disposeMeshes(root: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object instanceof THREE.InstancedMesh) object.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (object.userData.disposeTexture) for (const material of materials) {
      const map = (material as THREE.MeshBasicMaterial).map
      if (map) resources.add(map)
    }
    if (!isShared(object.geometry)) resources.add(object.geometry)
    for (const material of materials) if (!isShared(material)) resources.add(material)
  })
  for (const resource of resources) resource.dispose()
}

// Keep named pieces for layout glides, but batch repeated solid furniture and
// belt meshes while settled. Originals retain their identity for the next slide.
export function batchPaperDrawing(root: THREE.Group) {
  if (!root.userData.paper || root.userData.batch) return
  root.updateMatrixWorld(true)
  const groups = new Map<string, THREE.Mesh[]>()
  const hidden: THREE.Object3D[] = []
  for (const piece of root.children) {
    if (!piece.name.startsWith("belt:") && !piece.name.startsWith("bench:") && !piece.name.startsWith("room:")) continue
    hidden.push(piece)
    piece.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      const cell = `${Math.floor(piece.position.x / 4)},${Math.floor(piece.position.z / 4)}:`
      const key = cell + object.geometry.uuid + materials.map((material) => material.uuid).join(":")
      const group = groups.get(key) ?? []
      group.push(object); groups.set(key, group)
    })
  }
  const batch = new THREE.Group()
  for (const meshes of groups.values()) {
    const first = meshes[0]!
    const instanced = new THREE.InstancedMesh(first.geometry, first.material, meshes.length)
    const inverse = root.matrixWorld.clone().invert()
    meshes.forEach((mesh, i) => instanced.setMatrixAt(i, inverse.clone().multiply(mesh.matrixWorld)))
    instanced.castShadow = true
    instanced.receiveShadow = true
    instanced.computeBoundingSphere()
    batch.add(instanced)
  }
  for (const piece of hidden) piece.visible = false
  root.add(batch)
  root.userData.batch = { batch, hidden }
}

export function unbatchPaperDrawing(root: THREE.Group) {
  const data = root.userData.batch as { batch: THREE.Group; hidden: THREE.Object3D[] } | undefined
  if (!data) return
  for (const piece of data.hidden) piece.visible = true
  root.remove(data.batch)
  // Shared geometry/materials still belong to the original pieces.
  data.batch.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose() })
  delete root.userData.batch
}
