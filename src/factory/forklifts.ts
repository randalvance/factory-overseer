import * as THREE from "three"
import type { BufferStorage } from "~/floor/types"
import { disposeMeshes } from "./drawing"
import { type Glide, glide, startGlide } from "./slide"

/** Small folded-paper forklift. Local +Z is the mast/fork direction. */
export function paperForklift(): THREE.Group {
  const truck = new THREE.Group()
  const yellow = new THREE.MeshLambertMaterial({ color: 0xdca846 })
  const cream = new THREE.MeshLambertMaterial({ color: 0xffefd0 })
  const dark = new THREE.MeshLambertMaterial({ color: 0x44564f })
  const rubber = new THREE.MeshLambertMaterial({ color: 0x343c3b })
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, material = yellow, parent: THREE.Object3D = truck) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z); mesh.receiveShadow = true; parent.add(mesh)
    return mesh
  }
  part(.78, .34, .94, 0, .35, -.16)
  part(.8, .55, .3, 0, .52, -.59)
  part(.42, .13, .32, 0, .61, -.23, dark)
  part(.42, .35, .09, 0, .79, -.39, dark)
  for (const x of [-.4, .4]) for (const z of [-.43, .23]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .16, 10), rubber)
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .23, z); wheel.receiveShadow = true; truck.add(wheel)
    part(.09, .09, .09, x * 1.23, .23, z, cream)
  }
  for (const x of [-.32, .32]) {
    part(.06, .83, .06, x, 1.02, -.46, cream)
    part(.06, .83, .06, x, 1.02, .23, cream)
    part(.085, 1.22, .09, x, .75, .42, dark)
  }
  part(.82, .09, .93, 0, 1.47, -.13)
  const forks = new THREE.Group(); forks.name = "forks"; truck.add(forks)
  part(.69, .11, .12, 0, .04, .48, dark, forks)
  for (const x of [-.23, .23]) part(.085, .055, .79, x, .015, .82, dark, forks)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.67, 20), new THREE.MeshBasicMaterial({ color: 0x333b30, transparent: true, opacity: .14, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, .004, -.1); shadow.scale.y = 1.25; truck.add(shadow)
  truck.name = "forklift"
  return truck
}

interface Vehicle {
  mesh: THREE.Group
  forks: THREE.Object3D
  home: THREE.Vector3
  taskId?: string
  approach?: Glide
  returning?: Glide
}

/** One forklift per floor buffer, serializing pickups while other boxes wait. */
export function createForklifts(parent: THREE.Object3D) {
  const vehicles = new Map<string, Vehicle>()
  return {
    update(storage: Record<string, BufferStorage>) {
      for (const [owner, area] of Object.entries(storage)) {
        const home = new THREE.Vector3(area.floor.x + area.floor.w - .2, 0, area.floor.y + 2.35)
        let vehicle = vehicles.get(owner)
        if (!vehicle) {
          const mesh = paperForklift(); mesh.position.copy(home); mesh.rotation.y = Math.PI
          parent.add(mesh)
          vehicle = { mesh, forks: mesh.getObjectByName("forks")!, home }; vehicles.set(owner, vehicle)
        } else {
          vehicle.home = home
          vehicle.taskId = undefined; vehicle.approach = undefined
          vehicle.returning = startGlide(vehicle.mesh, home)
        }
      }
      for (const [owner, vehicle] of vehicles) if (!storage[owner]) {
        parent.remove(vehicle.mesh); disposeMeshes(vehicle.mesh); vehicles.delete(owner)
      }
    },
    /** Reach a waiting box before its carried leg starts. Busy forklifts queue pickups. */
    acquire(owner: string, taskId: string, box: THREE.Vector3, dt: number, speed: number): boolean {
      const vehicle = vehicles.get(owner)
      if (!vehicle || vehicle.returning || (vehicle.taskId && vehicle.taskId !== taskId)) return false
      if (!vehicle.taskId) {
        vehicle.taskId = taskId
        const pickup = new THREE.Vector3(box.x, 0, box.z + .85)
        vehicle.mesh.rotation.y = Math.PI
        vehicle.forks.position.y = Math.max(.06, box.y - .3)
        vehicle.approach = startGlide(vehicle.mesh, pickup)
      }
      if (vehicle.approach) {
        if (!glide(vehicle.mesh, vehicle.approach, dt, speed)) return false
        vehicle.approach = undefined
      }
      return true
    },
    carry(owner: string, box: THREE.Vector3, next: THREE.Vector3, underside: number) {
      const vehicle = vehicles.get(owner)
      if (!vehicle) return
      const direction = next.clone().sub(box); direction.y = 0
      if (direction.lengthSq() > .0001) vehicle.mesh.rotation.y = Math.atan2(direction.x, direction.z)
      const yaw = vehicle.mesh.rotation.y
      vehicle.mesh.position.set(box.x - Math.sin(yaw) * .85, 0, box.z - Math.cos(yaw) * .85)
      vehicle.forks.position.y = Math.max(.06, underside)
    },
    release(owner: string) {
      const vehicle = vehicles.get(owner)
      if (!vehicle) return
      vehicle.returning = startGlide(vehicle.mesh, vehicle.home)
    },
    tick(dt: number, speed: number) {
      for (const vehicle of vehicles.values()) if (vehicle.returning && glide(vehicle.mesh, vehicle.returning, dt, speed)) {
        vehicle.returning = undefined; vehicle.taskId = undefined
        vehicle.forks.position.y = .06; vehicle.mesh.rotation.y = Math.PI
      }
    },
    dispose() {
      for (const vehicle of vehicles.values()) { parent.remove(vehicle.mesh); disposeMeshes(vehicle.mesh) }
      vehicles.clear()
    },
  }
}
