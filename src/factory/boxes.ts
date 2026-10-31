// The boxes on the floor. Unlike the pieces, boxes stay from one snapshot to
// the next and ride the belts between their resting places, so a box in
// transit keeps going when the floor around it is redrawn. A task new to the
// intake drops out of the hopper onto its pile tile. The count over the
// container is kept here too: it counts the boxes resting inside, so it goes
// up as each one lands.

import * as THREE from "three"
import type { BoxTiles, Motion } from "~/floor/motion"
import { tileKey } from "~/floor/tiles"
import type { BoxSpot, Layout, Tile } from "~/floor/types"
import type { Task } from "~/model/types"
import { BOX_SIZE, box, boxFace, containerCount, heightsOver, hopperMouth, recount, tileCenter } from "./pieces"

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
  spot: BoxSpot
  rest: THREE.Vector3
  ride?: Ride
}

/** A ride that ended this tick: whose box, and the tile it now rests on. */
export interface Landing {
  taskId: string
  tile: Tile
}

export interface Boxes {
  /** Rest every box where the layout puts it, riding the motions given. Boxes of tasks no longer on the floor go. */
  update(layout: Layout, tasks: Task[], motions: Motion[]): void
  /** Carry every ride dt seconds further at the given speed; the rides that ended on the way. */
  tick(dt: number, speed: number): Landing[]
  /** Where each box is now: at rest, or over a tile of its ride. */
  tiles(): BoxTiles
  dispose(): void
}

export function createBoxes(parent: THREE.Object3D): Boxes {
  const boxes = new Map<string, FloorBox>()
  const group = new THREE.Group()
  parent.add(group)
  /** The count over the container. */
  let plate: THREE.Mesh | undefined
  /** Whether a snapshot has been shown: the first finds its boxes in place, later ones drop newcomers out of the hopper. */
  let opened = false

  function update(layout: Layout, tasks: Task[], motions: Motion[]) {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const motionOf = new Map(motions.map((motion) => [motion.taskId, motion]))
    const heightOver = heightsOver(layout)
    const mouth = hopperMouth(layout.intake)
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
        floorBox = { mesh, tile: placement.tile, spot: placement.spot, rest }
        boxes.set(placement.taskId, floorBox)
        if (opened && placement.spot.kind === "intake") {
          mesh.position.copy(mouth)
          floorBox.ride = { path: [placement.tile], waypoints: [mouth.clone(), rest.clone()], progress: 0 }
        }
      } else {
        floorBox.tile = placement.tile
        floorBox.spot = placement.spot
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
    removePlate()
    plate = containerCount(layout.container, restingInContainer())
    group.add(plate)
    opened = true
  }

  function restingInContainer(): number {
    let count = 0
    for (const floorBox of boxes.values()) if (floorBox.spot.kind === "container" && !floorBox.ride) count++
    return count
  }

  function removePlate() {
    if (!plate) return
    group.remove(plate)
    plate.geometry.dispose()
    ;(plate.material as THREE.Material).dispose()
    plate = undefined
  }

  function remove(taskId: string) {
    const floorBox = boxes.get(taskId)
    if (!floorBox) return
    group.remove(floorBox.mesh)
    floorBox.mesh.geometry.dispose()
    ;(floorBox.mesh.material as THREE.Material).dispose()
    boxes.delete(taskId)
  }

  function tick(dt: number, speed: number): Landing[] {
    const steps = dt * BELT_SPEED * speed
    const landings: Landing[] = []
    for (const [taskId, floorBox] of boxes) {
      const ride = floorBox.ride
      if (!ride) continue
      const last = ride.waypoints.length - 1
      ride.progress = Math.min(ride.progress + steps, last)
      const i = Math.floor(ride.progress)
      floorBox.mesh.position.lerpVectors(ride.waypoints[i]!, ride.waypoints[Math.min(i + 1, last)]!, ride.progress - i)
      if (ride.progress >= last) {
        floorBox.ride = undefined
        floorBox.mesh.position.copy(floorBox.rest)
        landings.push({ taskId, tile: floorBox.tile })
      }
    }
    if (landings.length > 0 && plate) recount(plate, restingInContainer())
    return landings
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
    removePlate()
    parent.remove(group)
  }

  return { update, tick, tiles, dispose }
}
