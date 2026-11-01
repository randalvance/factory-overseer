// The boxes on the floor. Unlike the pieces, boxes stay from one snapshot to
// the next and ride the belts between their resting places, so a box in
// transit keeps going when the floor around it is redrawn. A task new to the
// intake drops out of the hopper onto its pile tile. When the overseer
// reorganizes, every box glides to its new place in step with the floor, a
// box in transit onto the belt laid afresh, and rides on from there. The
// count over the container is kept here too: it counts the boxes resting
// inside, so it goes up as each one lands.

import * as THREE from "three"
import { type BoxTiles, type Motion, restingTiles, tileAfterSlide } from "~/floor/motion"
import { sameTile, tileKey } from "~/floor/tiles"
import type { BoxSpot, Layout, Tile } from "~/floor/types"
import type { Task } from "~/model/types"
import { BOX_SIZE, box, boxFace, containerCount, heightsOver, hopperMouth, recount, tileCenter } from "./pieces"
import { type Glide, glide, startGlide } from "./slide"

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
  /** Its way to where the floor laid afresh has it, while the floor slides; its ride, if any, sets off from there. */
  glide?: Glide
}

/** A ride that ended this tick: whose box, and the tile it now rests on. */
export interface Landing {
  taskId: string
  tile: Tile
}

export interface Boxes {
  /**
   * Rest every box where the layout puts it, riding the motions given. Boxes
   * of tasks no longer on the floor go. Given the tiles the boxes are over
   * once the floor has slid, every box first glides there in step with the
   * floor, or to its resting place when it has no route on from there, and
   * rides on once there.
   */
  update(layout: Layout, tasks: Task[], motions: Motion[], slid?: BoxTiles): void
  /**
   * Where each box is once the floor has slid from the layout shown to the
   * next, as the overseer's Reorganize has it: a box in transit over the
   * same tile of the same belt laid afresh, and any other, or one whose belt
   * is no longer laid, where the next layout rests it.
   */
  tilesAfterSlide(shown: Layout, next: Layout): BoxTiles
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
  /** The count over the container, and its way to the container's new place while the floor slides. */
  let plate: THREE.Mesh | undefined
  let plateGlide: Glide | undefined
  /** Whether a snapshot has been shown: the first finds its boxes in place, later ones drop newcomers out of the hopper. */
  let opened = false

  function update(layout: Layout, tasks: Task[], motions: Motion[], slid?: BoxTiles) {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const motionOf = new Map(motions.map((motion) => [motion.taskId, motion]))
    const heightOver = heightsOver(layout)
    const over = (tile: Tile) => {
      const centre = tileCenter(tile)
      return new THREE.Vector3(centre.x, heightOver(tile) + BOX_SIZE / 2, centre.z)
    }
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
      const slidTile = slid?.[placement.taskId]
      // With a route on from the tile it slides to, the box glides there; without one it glides to rest instead.
      floorBox.glide = slidTile ? startGlide(floorBox.mesh, motion ? over(slidTile) : rest) : undefined
      if (motion) {
        const waypoints = motion.path.map((tile, i) => (i === motion.path.length - 1 ? rest.clone() : over(tile)))
        // Set off from wherever the box is, mid-tile if it was already riding; after a glide, from where that ends.
        waypoints[0] = floorBox.mesh.position.clone()
        floorBox.ride = { path: motion.path, waypoints, progress: 0 }
      } else if (floorBox.glide) {
        floorBox.ride = undefined
      } else if (floorBox.ride) {
        // Nothing to ride, but still riding: finish at the new resting place from here.
        floorBox.ride = { path: [placement.tile], waypoints: [floorBox.mesh.position.clone(), rest.clone()], progress: 0 }
      } else {
        floorBox.mesh.position.copy(rest)
      }
    }

    for (const taskId of boxes.keys()) if (!kept.has(taskId)) remove(taskId)
    const plateStood = plate?.position.clone()
    removePlate()
    plate = containerCount(layout.container, restingInContainer())
    group.add(plate)
    plateGlide = undefined
    if (slid && plateStood && !plateStood.equals(plate.position)) {
      const to = plate.position.clone()
      plate.position.copy(plateStood)
      plateGlide = startGlide(plate, to)
    }
    opened = true
  }

  function tilesAfterSlide(shown: Layout, next: Layout): BoxTiles {
    const resting = restingTiles(next)
    const now = tiles()
    const slid: BoxTiles = {}
    for (const [taskId, floorBox] of boxes) {
      const rest = resting[taskId]
      const at = now[taskId]
      if (!rest || !at) continue
      slid[taskId] = (floorBox.ride && !sameTile(at, rest) && tileAfterSlide(shown, next, at)) || rest
    }
    return slid
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
    if (plate && plateGlide && glide(plate, plateGlide, dt, speed)) plateGlide = undefined
    for (const [taskId, floorBox] of boxes) {
      if (floorBox.glide) {
        if (!glide(floorBox.mesh, floorBox.glide, dt, speed)) continue
        floorBox.glide = undefined
        // The ride sets off from where the glide ended.
        if (floorBox.ride) floorBox.ride.waypoints[0] = floorBox.mesh.position.clone()
        continue
      }
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

  return { update, tilesAfterSlide, tick, tiles, dispose }
}
