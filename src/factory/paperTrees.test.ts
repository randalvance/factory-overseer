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
