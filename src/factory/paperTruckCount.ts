import * as THREE from "three"
import type { PaperTruckPlacement } from "./paperTruck"
import { canvasTexture } from "./textures"

/** A printed paper counter attached to the camera-facing cargo side. */
export function truckCount(truck: PaperTruckPlacement, count: number): THREE.Mesh {
  const map = canvasTexture(256, 112, () => {})
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .68), new THREE.MeshBasicMaterial({ map }))
  plate.name = "truck-shipped-count"
  plate.position.set(truck.x + .65, truck.groundY + 1.51, truck.z + 1.025)
  plate.userData.truckCount = true
  plate.userData.disposeTexture = true
  recountTruck(plate, count)
  return plate
}

/** Reuse one canvas as boxes land; zero remains visible on an empty truck. */
export function recountTruck(plate: THREE.Mesh, count: number) {
  if (plate.userData.count === count) return
  const map = (plate.material as THREE.MeshBasicMaterial).map!
  const canvas = map.image as HTMLCanvasElement
  const ctx = canvas.getContext("2d")!
  const { width, height } = canvas
  ctx.fillStyle = "#fff2d7"; ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = "#809a83"; ctx.lineWidth = 3; ctx.strokeRect(3, 3, width - 6, height - 6)
  ctx.fillStyle = "#36574c"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.font = "bold 60px Arial, sans-serif"; ctx.fillText(String(count), width / 2, 42, width - 22)
  ctx.font = "bold 23px Arial, sans-serif"; ctx.fillText("SHIPPED", width / 2, 88)
  plate.userData.count = count
  map.needsUpdate = true
}
