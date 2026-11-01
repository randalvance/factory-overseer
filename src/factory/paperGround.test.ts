import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import type { Rect } from "~/floor/types"
import { drawPaperGround, paperGrassSites, paperGroundBounds, PAPER_GROUND_Y } from "./paperGround"

const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
  agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-1", name: room.label, roomId: room.id, role: room.role, status: "idle" })),
  tasks: [], humanRequests: [],
} }, undefined, 28)
const truck: Rect = { x: 7, y: layout.bounds.h + .25, w: 2.4, h: 3.7 }

describe("paper lawn", () => {
  it("keeps the lawn top at the feet of the exterior conveyors, below room floors", () => {
    const ground = drawPaperGround(layout, [truck])
    const base = ground.getObjectByName("grass-cardstock")!
    const bounds = new THREE.Box3().setFromObject(base)
    expect(bounds.max.y).toBeCloseTo(PAPER_GROUND_Y)
    expect(bounds.min.y).toBeCloseTo(PAPER_GROUND_Y)
    expect(bounds.max.y).toBeLessThan(0)
    expect((base as THREE.Mesh).receiveShadow).toBe(true)
  })

  it("covers the visible ground while keeping tuft sampling bounded near the factory", () => {
    const ground = paperGroundBounds(layout)
    expect(ground.x).toBeLessThanOrEqual(layout.bounds.x - 100)
    expect(ground.y).toBeLessThanOrEqual(layout.bounds.y - 100)
    expect(ground.x + ground.w).toBeGreaterThanOrEqual(layout.bounds.x + layout.bounds.w + 100)
    expect(ground.y + ground.h).toBeGreaterThanOrEqual(layout.bounds.y + layout.bounds.h + 100)
    const road = { x: 7, y: layout.bounds.h, w: 3.4, h: 120 }
    const sites = paperGrassSites(layout, [truck, road])
    expect(sites.every((site) => site.z <= layout.bounds.y + layout.bounds.h + 6)).toBe(true)
    expect(sites.length).toBeLessThan(500)
    const base = drawPaperGround(layout).getObjectByName("grass-cardstock") as THREE.Mesh
    const material = base.material as THREE.MeshLambertMaterial
    expect(material.map?.wrapS).toBe(THREE.RepeatWrapping)
    expect(base.userData.disposeTexture).toBe(true)
  })

  it("keeps all raised grass clear of rooms, conveyors and the loading apron", () => {
    const sites = paperGrassSites(layout, [truck])
    expect(sites.length).toBeGreaterThan(0)
    expect(sites).toEqual(paperGrassSites(layout, [truck]))
    const occupied = [...layout.rooms!.map((room) => room.rect), truck,
      ...layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))]
    for (const point of sites) {
      expect(occupied.some(({ x, y, w, h }) => point.x > x - .38 && point.x < x + w + .38 && point.z > y - .38 && point.z < y + h + .38)).toBe(false)
    }
    const tufts = drawPaperGround(layout, [truck]).getObjectByName("grass-folded-tufts") as THREE.InstancedMesh
    expect(tufts.isInstancedMesh).toBe(true)
    expect(tufts.count).toBe(sites.length)
  })
})
