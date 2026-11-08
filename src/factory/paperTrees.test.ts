import { expect, it } from "vitest"
import * as THREE from "three"
import { exampleRooms } from "~/model/roomExamples"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { paperRoadFootprint } from "./paperRoad"
import { drawPaperTrees, paperTreeSites } from "./paperTrees"

const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
  agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").map((room) => ({
    id: room.id, name: room.label, roomId: room.id, role: room.role, status: "idle",
  })), tasks: [], humanRequests: [],
} }, undefined, 28)
const reserved = [paperRoadFootprint(layout)!, layout.shippingDock!.footprint]

it("places deterministic trees around the perimeter with room for crowns and circulation", () => {
  const sites = paperTreeSites(layout, reserved)
  expect(sites.length).toBeGreaterThan(7)
  expect(sites).toEqual(paperTreeSites(layout, reserved))
  const occupied = [...layout.rooms!.map((room) => room.rect), ...reserved,
    ...layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ ...tile, w: 1, h: 1 })))]
  for (const site of sites) {
    const radius = .83 * site.height / 2.42 + .4
    expect(occupied.some((rect) => site.x + radius > rect.x && site.x - radius < rect.x + rect.w &&
      site.z + radius > rect.y && site.z - radius < rect.y + rect.h)).toBe(false)
    expect(site.z < layout.bounds.y || site.x < layout.bounds.x || site.x > layout.bounds.x + layout.bounds.w).toBe(true)
    if (site.z > layout.bounds.y + layout.bounds.h) expect(site.height).toBeLessThanOrEqual(1.35)
  }
})

it("uses two instanced meshes with drawing-owned paper resources and no textures", () => {
  const grove = drawPaperTrees(layout, reserved)
  expect(grove.children).toHaveLength(2)
  for (const object of grove.children) {
    expect(object).toBeInstanceOf(THREE.InstancedMesh)
    const mesh = object as THREE.InstancedMesh
    expect(mesh.count).toBe(paperTreeSites(layout, reserved).length)
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial)
    expect((mesh.material as THREE.MeshLambertMaterial).map).toBeNull()
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true)
  }
})

it("stands cacti in the desert and snow-capped trees on snowy plains, on the same sites", () => {
  const sites = paperTreeSites(layout, reserved)
  const colorsOf = (mesh: THREE.InstancedMesh) => {
    const attribute = mesh.geometry.getAttribute("color")
    return new Set(Array.from({ length: attribute.count }, (_, i) => new THREE.Color(attribute.getX(i), attribute.getY(i), attribute.getZ(i)).getHex()))
  }
  const heightOf = (mesh: THREE.InstancedMesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox! }

  const desert = drawPaperTrees(layout, reserved, "desert")
  const cacti = desert.getObjectByName("folded-paper-cacti") as THREE.InstancedMesh
  const mounds = desert.getObjectByName("sand-paper-mounds") as THREE.InstancedMesh
  expect(cacti.count).toBe(sites.length)
  expect(mounds.count).toBe(sites.length)
  expect(desert.getObjectByName("folded-paper-crowns")).toBeUndefined()
  // A cactus is a column with arms from the ground up, as tall as a tree but slimmer than a crown.
  const cactus = heightOf(cacti)
  expect(cactus.min.y).toBeCloseTo(0)
  expect(cactus.max.y).toBeGreaterThan(2)
  expect(cactus.max.y).toBeLessThanOrEqual(2.42)
  expect(Math.max(-cactus.min.x, cactus.max.x, -cactus.min.z, cactus.max.z)).toBeLessThan(.83)
  expect(heightOf(mounds).max.y).toBeLessThan(.2)

  const snowy = drawPaperTrees(layout, reserved, "snow")
  const crowns = snowy.getObjectByName("snowy-paper-crowns") as THREE.InstancedMesh
  expect(crowns.count).toBe(sites.length)
  expect(snowy.getObjectByName("kraft-paper-trunks")).toBeDefined()
  // The same three folded layers, now with white caps.
  expect(colorsOf(crowns).has(0xf7fafc)).toBe(true)
  const leafy = drawPaperTrees(layout, reserved).getObjectByName("folded-paper-crowns") as THREE.InstancedMesh
  expect(colorsOf(leafy).has(0xf7fafc)).toBe(false)
  expect(heightOf(crowns).max.y).toBeCloseTo(heightOf(leafy).max.y)
  for (const grove of [desert, snowy]) for (const object of grove.children) {
    expect(((object as THREE.InstancedMesh).material as THREE.MeshLambertMaterial).map).toBeNull()
  }
})
