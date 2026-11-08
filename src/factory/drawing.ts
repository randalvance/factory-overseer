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
import type { BillboardAssets } from "./roomBillboardAssets"
import { drawPaperGround, PAPER_GROUND_Y } from "./paperGround"
import { drawPaperTrees } from "./paperTrees"
import { paperRoad, paperRoadFootprint } from "./paperRoad"
import { paperTruck, paperTruckPlacement } from "./paperTruck"
import { beltName, carriesRework } from "~/floor/belts"
import type { Layout } from "~/floor/types"
import { DEFAULT_BIOME, type Biome } from "~/model/biomes"
import { type Pieces, isShared } from "./models"
import { tileKey } from "~/floor/tiles"
import { trimPaperBeltAtBenches } from "./paperConveyors"
import { paperWallPortTile } from "./paperWallPorts"
import { openPaperBeltTile } from "./paperJunctions"
import { beltTile, bench, containerWalls, door, hopper, pallet } from "./pieces"

/**
 * Every piece is named for what it is of the layout: a belt tile for the
 * belt it is on, by the name a belt keeps when the floor is laid afresh, and
 * how far along it is; a bench for its station; a wall for its room; and so
 * on. The same name in the next drawing is the same piece, slid there.
 */
export function drawFactory(layout: Layout, pieces: Pieces, themes?: ReadonlyMap<string, ResolvedRoomTheme>, assets?: ThemeAssets, billboards?: BillboardAssets, biome: Biome = DEFAULT_BIOME): THREE.Group {
  const group = new THREE.Group()
  const add = (name: string, piece: THREE.Object3D) => {
    piece.name = name
    group.add(piece)
  }
  const truckPlacement = paperTruckPlacement(layout)
  const road = paperRoadFootprint(layout)
  const reserved = [...(truckPlacement ? [truckPlacement.footprint] : []), ...(road ? [road] : [])]
  add("floor", drawPaperGround(layout, reserved, biome))
  add("paper-trees", drawPaperTrees(layout, reserved, biome))
  const roadPiece = paperRoad(layout)
  if (roadPiece) add("paper-road", roadPiece)
  drawRooms(layout, add, themes, assets, billboards)

  const paperBenches = new Set(layout.bays.flatMap((bay) => bay.stations.map((station) => tileKey(station.bench))))
  for (const belt of layout.belts) {
    const surface = carriesRework(belt) ? "rework" : "forward"
    belt.tiles.forEach((tile, i) => {
      // Cargo tiles remain routable, but the truck floor carries them once
      // they pass its open rear; conveyor feet must not pierce the sleeve.
      if (layout.shippingDock?.cargoTiles.some((cargo) => cargo.x === tile.x && cargo.y === tile.y)) return
      const onPlatform = layout.rooms?.some(({ rect, kind }) => kind !== "intake" && tile.x >= rect.x && tile.x < rect.x + rect.w && tile.y >= rect.y && tile.y < rect.y + rect.h)
      const floorY = onPlatform ? 0 : PAPER_GROUND_Y
      const isTip = Object.values(layout.routing?.bufferStorage ?? {}).some((storage) => storage.tip.x === tile.x && storage.tip.y === tile.y)
      // A spur ends in a straight drop lip, even though its logical tile
      // also accepts the forklift's return trip in the opposite direction.
      const drawingTile = isTip ? { kind: "straight" as const, x: tile.x, y: tile.y, dir: "s" as const } :
        paperWallPortTile(openPaperBeltTile(tile), layout.rooms)
      const piece = beltTile(drawingTile, surface, pieces, floorY)
      trimPaperBeltAtBenches(piece, drawingTile, paperBenches)
      add(`belt:${beltName(belt)}:${i}`, piece)
    })
  }

  const stationPalette = new Map<number, THREE.MeshLambertMaterial>()
  for (const bay of layout.bays) for (const station of bay.stations) add(`bench:${station.id}`, bench(station.bench, station.vacant, pieces, station.role, themes?.get(bay.id), assets, stationPalette))
  for (const room of layout.rooms ?? []) if (room.kind !== "intake" && room.kind !== "staging") add(`door:${room.id}`, door(room.door, pieces))
  layout.intake.pile.forEach((tile, i) => add(`pallet:intake:${i}`, pallet(tile)))
  add("hopper", hopper(layout.intake, PAPER_GROUND_Y))
  // Factories with a deployment outlet ship into the parked truck.
  if (!layout.shippingDock) add("container", containerWalls(layout.container))
  const truck = paperTruck(layout)
  const deployment = layout.rooms?.find((room) => room.kind === "deployment")
  if (truck && deployment) add(`${deployment.id}:truck`, truck)
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
  if (root.userData.batch) return
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

/** Restore the named pieces immediately; the view retires the detached instance buffers between frames. */
export function unbatchPaperDrawing(root: THREE.Group): THREE.InstancedMesh[] {
  const data = root.userData.batch as { batch: THREE.Group; hidden: THREE.Object3D[] } | undefined
  if (!data) return []
  for (const piece of data.hidden) piece.visible = true
  root.remove(data.batch)
  const meshes: THREE.InstancedMesh[] = []
  data.batch.traverse((object) => { if (object instanceof THREE.InstancedMesh) meshes.push(object) })
  delete root.userData.batch
  return meshes
}

/** Retired batches share their geometry and materials with the drawing; only their instance buffers belong here. */
export function createBatchRetirement() {
  const pending = new Set<THREE.InstancedMesh>()
  return {
    retire(meshes: readonly THREE.InstancedMesh[]) {
      for (const mesh of meshes) pending.add(mesh)
    },
    drain() {
      const deadline = performance.now() + 2
      for (const mesh of pending) {
        pending.delete(mesh)
        mesh.dispose()
        if (performance.now() >= deadline) break
      }
    },
    dispose() {
      for (const mesh of pending) {
        pending.delete(mesh)
        mesh.dispose()
      }
    },
  }
}
