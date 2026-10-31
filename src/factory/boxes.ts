// The boxes on the floor. Unlike the pieces, boxes stay from one snapshot to
// the next and ride the belts between their resting places, so a box in
// transit keeps going when the floor around it is redrawn.

import * as THREE from "three"
import type { BoxTiles, Motion } from "~/floor/motion"
import { tileKey } from "~/floor/tiles"
import type { Layout, Tile } from "~/floor/types"
import type { Task } from "~/model/types"
import { BOX_SIZE, box, boxFace, heightsOver, tileCenter } from "./pieces"

/** Belt travel in tiles per second at speed 1. */
export const BELT_SPEED = 2

interface Ride {
  /** The tiles under the ride, the first being where it set off. */
  path: Tile[]
  /** Where the box is at each whole step. The first is where it set off from, wherever that was. */
  waypoints: THREE.Vector3[]
  /** How far along the waypoints, in steps. */
  progress: number
}

interface FloorBox {
  mesh: THREE.Mesh
  /** Where the layout rests it. */
  tile: Tile
  rest: THREE.Vector3
  ride?: Ride
}

export interface Boxes {
  /** Rest every box where the layout puts it, riding the motions given. Boxes of tasks no longer on the floor go. */
  update(layout: Layout, tasks: Task[], motions: Motion[]): void
  /** Carry every ride dt seconds further at the given speed. */
  tick(dt: number, speed: number): void
  /** Where each box is now: at rest, or over a tile of its ride. */
  tiles(): BoxTiles
  dispose(): void
}

export function createBoxes(parent: THREE.Object3D): Boxes {
  const boxes = new Map<string, FloorBox>()
  const group = new THREE.Group()
  parent.add(group)

  function update(layout: Layout, tasks: Task[], motions: Motion[]) {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const motionOf = new Map(motions.map((motion) => [motion.taskId, motion]))
    const heightOver = heightsOver(layout)
    const stackedAt = new Map<string, number>()
    const kept = new Set<string>()

    for (const placement of layout.boxes) {
      kept.add(placement.taskId)
      const task = taskById.get(placement.taskId)
      const label = task?.label ?? placement.taskId
      const stacked = stackedAt.get(tileKey(placement.tile)) ?? 0
      stackedAt.set(tileKey(placement.tile), stacked + 1)
      const underside = heightOver(placement.tile) + stacked * BOX_SIZE
      const at = tileCenter(placement.tile)
      const rest = new THREE.Vector3(at.x, underside + BOX_SIZE / 2, at.z)

      let floorBox = boxes.get(placement.taskId)
      if (!floorBox) {
        const mesh = box(placement.tile, underside, label, task?.color)
        group.add(mesh)
        floorBox = { mesh, tile: placement.tile, rest }
        boxes.set(placement.taskId, floorBox)
      } else {
        floorBox.tile = placement.tile
        floorBox.rest = rest
        ;(floorBox.mesh.material as THREE.MeshLambertMaterial).map = boxFace(label, task?.color)
      }

      const motion = motionOf.get(placement.taskId)
      if (motion) {
        const waypoints = motion.path.map((tile, i) => {
          if (i === motion.path.length - 1) return rest.clone()
          const centre = tileCenter(tile)
          return new THREE.Vector3(centre.x, heightOver(tile) + BOX_SIZE / 2, centre.z)
        })
        // Set off from wherever the box is, mid-tile if it was already riding.
        waypoints[0] = floorBox.mesh.position.clone()
        floorBox.ride = { path: motion.path, waypoints, progress: 0 }
      } else if (floorBox.ride) {
        // Nothing to ride, but still riding: finish at the new resting place from here.
        floorBox.ride = { path: [placement.tile], waypoints: [floorBox.mesh.position.clone(), rest.clone()], progress: 0 }
      } else {
        floorBox.mesh.position.copy(rest)
      }
    }

    for (const taskId of boxes.keys()) if (!kept.has(taskId)) remove(taskId)
  }

  function remove(taskId: string) {
    const floorBox = boxes.get(taskId)
    if (!floorBox) return
    group.remove(floorBox.mesh)
    floorBox.mesh.geometry.dispose()
    ;(floorBox.mesh.material as THREE.Material).dispose()
    boxes.delete(taskId)
  }

  function tick(dt: number, speed: number) {
    const steps = dt * BELT_SPEED * speed
    for (const floorBox of boxes.values()) {
      const ride = floorBox.ride
      if (!ride) continue
      const last = ride.waypoints.length - 1
      ride.progress = Math.min(ride.progress + steps, last)
      const i = Math.floor(ride.progress)
      floorBox.mesh.position.lerpVectors(ride.waypoints[i]!, ride.waypoints[Math.min(i + 1, last)]!, ride.progress - i)
      if (ride.progress >= last) {
        floorBox.ride = undefined
        floorBox.mesh.position.copy(floorBox.rest)
      }
    }
  }

  function tiles(): BoxTiles {
    const tiles: BoxTiles = {}
    for (const [taskId, floorBox] of boxes) {
      const ride = floorBox.ride
      tiles[taskId] = ride ? ride.path[Math.min(Math.round(ride.progress), ride.path.length - 1)]! : floorBox.tile
    }
    return tiles
  }

  function dispose() {
    for (const taskId of [...boxes.keys()]) remove(taskId)
    parent.remove(group)
  }

  return { update, tick, tiles, dispose }
}
