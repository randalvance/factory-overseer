import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { ROOM_RETURN_ROW } from "~/floor/roomGeometry"
import { exampleRooms } from "~/model/roomExamples"
import { roomSnapshotForView } from "~/model/roomRouting"
import { DEFAULT_STATUS_STYLES } from "~/model/status"
import type { RoomFactoryState } from "~/model/types"
import { createAgents } from "./agents"
import { PAPER_PITCH } from "./camera"
import type { Pieces } from "./models"
import { createPaperJunctions } from "./paperJunctions"

beforeEach(() => vi.stubGlobal("document", { createElement: () => ({
  width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }),
}) }))
afterEach(() => vi.unstubAllGlobals())

/** Sprite bounds must face the camera, not use their untilted Object3D box.
 * These triangles use the actual rendered body's scale, anchor and roll.
 * Protecting the whole supplied quad also supports opaque host pet images.
 */
function spriteTriangles(sprite: THREE.Sprite, camera: THREE.Camera): THREE.Triangle[] {
  const origin = sprite.getWorldPosition(new THREE.Vector3()), scale = sprite.getWorldScale(new THREE.Vector3())
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const angle = sprite.material.rotation, cosine = Math.cos(angle), sine = Math.sin(angle)
  const points = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
    const x = (u! - sprite.center.x) * scale.x, y = (v! - sprite.center.y) * scale.y
    return origin.clone().addScaledVector(right, cosine * x - sine * y).addScaledVector(up, sine * x + cosine * y)
  })
  return [new THREE.Triangle(points[0]!, points[1]!, points[2]!), new THREE.Triangle(points[0]!, points[2]!, points[3]!)]
}

function intersections(count: number, movePetsTowardReturn = 0): string[] {
  const state: RoomFactoryState = { configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").flatMap((room) => Array.from({ length: room.id === "implementation" ? count : 1 }, (_, index) => ({ id: `${room.id}-${index}`, name: room.label, role: room.role, roomId: room.id, status: "idle" as const }))),
    tasks: [], humanRequests: [],
  } }
  const layout = layoutConfiguredRooms(state, undefined, 28)
  for (const bay of layout.bays) for (const station of bay.stations) station.agentTile.y -= movePetsTowardReturn
  const scene = new THREE.Group(), agents = createAgents(scene)
  const texture = new THREE.Texture()
  const sheets = new Map(state.snapshot.agents.map((agent) => {
    const sheet = new THREE.Texture()
    sheet.userData = { paper: true, pet: true, petLayout: "image", agentId: agent.id }
    return [agent.id, sheet] as const
  }))
  const pieces: Pieces = { paper: true, floor: texture, cardboard: texture, belts: { forward: texture, rework: texture }, clone: () => new THREE.Group() }
  agents.update(layout, roomSnapshotForView(state), { pieces, sheets, looks: { styles: DEFAULT_STATUS_STYLES, icons: { hand: texture, check: texture, warning: texture } } }, { arrivals: [], departures: [] })
  scene.updateMatrixWorld(true)
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100)
  camera.position.set(0, 50 * Math.sin(PAPER_PITCH), 50 * Math.cos(PAPER_PITCH))
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
  const resources: Array<THREE.BufferGeometry | THREE.Material> = []
  const renderJunction = createPaperJunctions((resource) => { resources.push(resource); return resource })
  const obstacles: THREE.Box3[] = []
  for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) for (const belt of layout.belts) for (const tile of belt.tiles) {
    if (tile.y !== room.rect.y + ROOM_RETURN_ROW || tile.x < room.rect.x || tile.x >= room.rect.x + room.rect.w) continue
    const module = renderJunction(tile.kind === "junction" ? tile : { ...tile, kind: "junction", dir: "e", entries: ["e"], exits: ["e"] }, 0)
    module.position.set(tile.x + .5, 0, tile.y + .5); module.updateMatrixWorld(true)
    if (tile.kind === "junction") {
      // Actual paper housings, including the dark masks that can obscure a face.
      module.traverse((object) => { if (object instanceof THREE.Mesh) obstacles.push(new THREE.Box3().setFromObject(object)) })
    } else {
      // The shared paper deck has the same raised height and .9-tile width
      // as a straight return. Use its authored mesh instead of floor tiles.
      obstacles.push(new THREE.Box3().setFromObject(module.getObjectByName("junction-deck")!))
    }
  }
  expect(obstacles.length).toBeGreaterThan(0)
  const hits: string[] = []
  let bodies = 0
  scene.traverse((object) => {
    if (!(object instanceof THREE.Sprite) || !object.material.map?.userData.agentId) return
    bodies++
    const triangles = spriteTriangles(object, camera)
    if (obstacles.some((bounds) => triangles.some((triangle) => bounds.intersectsTriangle(triangle)))) hits.push(object.material.map.userData.agentId as string)
  })
  expect(bodies).toBe(state.snapshot.agents.length)
  agents.dispose(); texture.dispose(); sheets.forEach((sheet) => sheet.dispose()); resources.forEach((resource) => resource.dispose())
  return hits
}

it.each([1, 3, 7])("keeps the rendered pet planes clear of raised return belts and housings with %s implementation pets at the paper camera angle", (count) => {
  expect(intersections(count)).toEqual([])
})

it("detects the prior one-tile-too-close pet placement rather than only checking layout constants", () => {
  expect(intersections(3, 1).length).toBeGreaterThan(0)
})
