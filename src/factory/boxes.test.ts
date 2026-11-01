import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { motionsFor, restingTiles } from "~/floor/motion"
import { exampleRooms } from "~/model/roomExamples"
import { roomSnapshotForView } from "~/model/roomRouting"
import type { RoomFactoryState } from "~/model/types"
import { createBoxes } from "./boxes"
import type { Pieces } from "./models"
import { paperTruckPlacement } from "./paperTruck"

beforeEach(() => {
  vi.stubGlobal("document", { createElement: () => {
    const context = { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), scale: vi.fn() }
    return { width: 0, height: 0, getContext: () => context }
  } })
})
afterEach(() => vi.unstubAllGlobals())

function fixture(shipped = false) {
  const state: RoomFactoryState = { configuration: structuredClone(exampleRooms), snapshot: {
    agents: [{ id: "deployer", name: "Deployer", role: "deployer", roomId: "deployment", status: "working" }],
    tasks: [{ id: "task", label: "Ship this", at: shipped ? { kind: "shipped", roomId: "deployment" } :
      { kind: "room", roomId: "deployment", assignment: { agentIds: ["deployer"], completedAgentIds: [] } } }],
    humanRequests: [],
  } }
  const parent = new THREE.Group(), boxes = createBoxes(parent)
  const texture = new THREE.Texture(); texture.userData.paper = true
  const geometry = new THREE.BoxGeometry(.6, .6, .6)
  const pieces: Pieces = { paper: true, floor: texture, cardboard: texture,
    belts: { forward: texture, rework: texture }, clone: () => new THREE.Mesh(geometry, new THREE.MeshLambertMaterial()) }
  const plate = () => parent.getObjectByName("truck-shipped-count") as THREE.Mesh
  const close = () => { boxes.dispose(); geometry.dispose(); texture.dispose() }
  return { state, parent, boxes, pieces, plate, close }
}

it("shows zero on the truck and counts each shipped box only after it arrives", () => {
  const { state, boxes, pieces, plate, close } = fixture()
  const before = layoutConfiguredRooms(state, undefined, 28)
  boxes.update(before, roomSnapshotForView(state).tasks, [], pieces)
  expect(plate().visible).toBe(true)
  expect(plate().userData.count).toBe(0)
  const owned = (plate().material as THREE.MeshBasicMaterial).map!
  const disposed = vi.spyOn(owned, "dispose")
  state.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
  const after = layoutConfiguredRooms(state, before)
  boxes.update(after, roomSnapshotForView(state).tasks, motionsFor(after, restingTiles(before), before).toPlay, pieces)
  expect(disposed).toHaveBeenCalledOnce()
  expect(plate().userData.count).toBe(0)
  boxes.tick(.1, 1)
  expect(plate().userData.count).toBe(0)
  const liveMap = (plate().material as THREE.MeshBasicMaterial).map!
  expect(boxes.tick(100, 1)).toHaveLength(1)
  expect(plate().userData.count).toBe(1)
  expect((plate().material as THREE.MeshBasicMaterial).map).toBe(liveMap)
  expect(boxes.tick(100, 1)).toEqual([])
  expect(plate().userData.count).toBe(1)
  close()
})

it("loads existing shipments, follows the truck through growth and releases the counter texture", () => {
  const { state, boxes, pieces, plate, close } = fixture(true)
  state.snapshot.tasks.push({ id: "second", label: "Already shipped", at: { kind: "shipped", roomId: "deployment" } })
  const before = layoutConfiguredRooms(state, undefined, 28)
  boxes.update(before, roomSnapshotForView(state).tasks, [], pieces)
  expect(plate().userData.count).toBe(2)
  state.snapshot.agents.push({ id: "extra", name: "Extra", role: "deployer", roomId: "deployment", status: "idle" })
  const after = layoutConfiguredRooms(state, before)
  const slid = boxes.tilesAfterSlide(before, after)
  boxes.update(after, roomSnapshotForView(state).tasks, [], pieces, slid)
  boxes.tick(2, 1)
  const truck = paperTruckPlacement(after)!
  expect(plate().position.toArray()).toEqual([truck.x + .65, truck.groundY + 1.51, truck.z + 1.025])
  expect(plate().userData.count).toBe(2)
  const disposed = vi.spyOn((plate().material as THREE.MeshBasicMaterial).map!, "dispose")
  close()
  expect(disposed).toHaveBeenCalledOnce()
})
