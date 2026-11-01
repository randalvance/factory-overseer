import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import { paperRoad, paperRoadFootprint } from "./paperRoad"
import { paperTruckPlacement } from "./paperTruck"
import { shippingDock } from "~/floor/shippingDock"

function floor() {
  return layoutConfiguredRooms({
    configuration: structuredClone(exampleRooms),
    snapshot: {
      agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-1", name: room.label, roomId: room.id, role: room.role, status: "idle" })),
      tasks: [], humanRequests: [],
    },
  }, undefined, 28)
}

describe("deployment exit road", () => {
  it("runs horizontally beneath the side-facing truck and continues past both sides", () => {
    const layout = floor()
    const road = paperRoadFootprint(layout)!
    const truck = paperTruckPlacement(layout)!
    const room = layout.rooms!.find((room) => room.kind === "deployment")!
    expect(road.y).toBeGreaterThan(room.rect.y + room.rect.h)
    expect(road.x + road.w / 2).toBeCloseTo(truck.x)
    expect(road.x).toBeLessThan(truck.bodyFootprint.x - 100)
    expect(road.x + road.w).toBeGreaterThan(truck.bodyFootprint.x + truck.bodyFootprint.w + 100)
    expect(road.y).toBeLessThan(truck.bodyFootprint.y)
    expect(road.y + road.h).toBeGreaterThan(truck.bodyFootprint.y + truck.bodyFootprint.h)
    expect(road.y + road.h / 2).toBeCloseTo(truck.z)
  })

  it("keeps the paper road thin and within its reserved footprint", () => {
    const layout = floor()
    const rect = paperRoadFootprint(layout)!
    const truck = paperTruckPlacement(layout)!
    const road = paperRoad(layout)!
    const bounds = new THREE.Box3().setFromObject(road)
    expect(road.name).toBe("paper-road")
    expect(road.position.toArray()).toEqual([truck.x, truck.groundY, truck.z])
    expect(bounds.min.x).toBeCloseTo(rect.x)
    expect(bounds.max.x).toBeCloseTo(rect.x + rect.w)
    expect(bounds.min.z).toBeCloseTo(rect.y)
    expect(bounds.max.z).toBeCloseTo(rect.y + rect.h)
    expect(bounds.max.y).toBeLessThan(truck.groundY + .04)
    expect(road.getObjectByName("road-center-dashes")).toBeInstanceOf(THREE.InstancedMesh)
  })

  it("does not pave through another room when the forecourt becomes occupied", () => {
    const layout = floor()
    const truck = paperTruckPlacement(layout)!
    const obstruction = { x: truck.bodyFootprint.x - 1, y: truck.bodyFootprint.y, w: 5, h: 4 }
    const room = layout.rooms!.find((room) => room.kind === "deployment")!
    Object.assign(layout, { shippingDock: shippingDock(room.rect, [obstruction]) })
    const road = paperRoadFootprint(layout)!
    expect(road.y).toBeGreaterThan(obstruction.y + obstruction.h)
  })
})
