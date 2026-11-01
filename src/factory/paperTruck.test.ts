import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import type { RoomFactoryState } from "~/model/types"
import { paperTruck, paperTruckPlacement } from "./paperTruck"
import { shippingDock } from "~/floor/shippingDock"

function state(): RoomFactoryState {
  return {
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-1", name: room.label, roomId: room.id, role: room.role, status: "idle" })),
      tasks: [], humanRequests: [],
    },
  }
}

describe("paper deployment truck", () => {
  it("waits beyond the deployment platform, aligned to the loading door without covering belts", () => {
    const layout = layoutConfiguredRooms(state(), undefined, 28)
    const truck = paperTruckPlacement(layout)!
    const deployment = layout.rooms!.find((room) => room.kind === "deployment")!
    expect(truck.outlet).toEqual({ x: deployment.rect.x, y: deployment.rect.y + 3 })
    expect(truck.bodyFootprint.y).toBeGreaterThan(deployment.rect.y + deployment.rect.h)
    expect(truck.cargoTiles).toHaveLength(2)
    for (const belt of layout.belts.filter((belt) => !belt.id.includes("truck"))) for (const tile of belt.tiles) {
      const intersects = tile.x < truck.bodyFootprint.x + truck.bodyFootprint.w && tile.x + 1 > truck.bodyFootprint.x &&
        tile.y < truck.bodyFootprint.y + truck.bodyFootprint.h && tile.y + 1 > truck.bodyFootprint.y
      expect(intersects).toBe(false)
    }
  })

  it("keeps wheels grounded and every piece inside the footprint reserved for grass and framing", () => {
    const layout = layoutConfiguredRooms(state(), undefined, 28)
    const at = paperTruckPlacement(layout)!
    const group = paperTruck(layout)!
    const bounds = new THREE.Box3().setFromObject(group)
    expect(group.name).toBe("deployment-truck")
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2)
    expect(group.position.toArray()).toEqual([at.x, at.groundY, at.z])
    expect(bounds.min.y).toBeCloseTo(at.groundY)
    expect(bounds.max.y).toBeLessThanOrEqual(at.topY)
    expect(bounds.min.x).toBeGreaterThanOrEqual(at.footprint.x)
    expect(bounds.max.x).toBeLessThanOrEqual(at.footprint.x + at.footprint.w)
    expect(bounds.min.z).toBeGreaterThanOrEqual(at.footprint.y)
    expect(bounds.max.z).toBeLessThanOrEqual(at.footprint.y + at.footprint.h)
    expect(group.children.filter((piece) => piece.name === "paper-truck-wheel")).toHaveLength(4)
  })

  it("moves with deployment growth while retaining its local model and named-piece identity", () => {
    const before = state()
    const layout = layoutConfiguredRooms(before, undefined, 28)
    const after = structuredClone(before)
    for (let i = 2; i <= 4; i++) after.snapshot.agents.push({ id: "deployment-" + i, name: "Deployer " + i, role: "deployer", roomId: "deployment", status: "idle" })
    const grown = layoutConfiguredRooms(after, layout, 28)
    const oldTruck = paperTruck(layout)!, newTruck = paperTruck(grown)!
    expect(newTruck.name).toBe(oldTruck.name)
    expect(newTruck.position.z).toBeGreaterThan(oldTruck.position.z)
    expect(newTruck.getObjectByName("cargo")!.position.toArray()).toEqual(oldTruck.getObjectByName("cargo")!.position.toArray())
  })

  it("loads two tile-aligned parcels through the open rear at conveyor height", () => {
    const layout = layoutConfiguredRooms(state(), undefined, 28)
    const at = paperTruckPlacement(layout)!
    const group = paperTruck(layout)!
    group.updateMatrixWorld(true)
    const floor = new THREE.Box3().setFromObject(group.getObjectByName("cargo-floor")!)
    expect(floor.max.y).toBeCloseTo(.85)
    for (const tile of at.cargoTiles) {
      expect(tile.x + .5 - .3).toBeGreaterThan(floor.min.x)
      expect(tile.x + .5 + .3).toBeLessThan(floor.max.x)
      expect(tile.y + .5).toBeCloseTo(at.z)
    }
    expect(group.getObjectByName("rear-doors")).toBeUndefined()
    const cab = new THREE.Box3().setFromObject(group.getObjectByName("cab")!)
    expect(cab.max.x).toBeLessThan(at.rear.x)
  })

  it("leaves a crowded forecourt clear instead of overlapping a later room", () => {
    const layout = layoutConfiguredRooms(state(), undefined, 28)
    const room = layout.rooms!.find((room) => room.kind === "deployment")!
    const original = shippingDock(room.rect)
    const blocker = { x: original.bodyFootprint.x - 1, y: original.bodyFootprint.y, w: 5, h: 4 }
    const moved = shippingDock(room.rect, [blocker])
    expect(moved.x).toBe(original.x)
    expect(moved.bodyFootprint.y).toBeGreaterThan(blocker.y + blocker.h)
  })
})
