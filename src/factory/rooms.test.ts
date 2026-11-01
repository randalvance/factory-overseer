import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import type { Layout } from "~/floor/types"
import { drawRooms } from "./rooms"

beforeEach(() => vi.stubGlobal("document", { createElement: () => ({
  width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }),
}) }))
afterEach(() => vi.unstubAllGlobals())

function fixture(count = 1) {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: room.id === "implementation" ? count : 1 }, (_, i) => ({
        id: `${room.id}-${i}`, name: room.label, roomId: room.id, role: room.role, status: "idle" as const,
      }))), tasks: [], humanRequests: [],
  } }, undefined, 28)
  const scene = new THREE.Group()
  drawRooms(layout, new THREE.Texture(), (name, piece) => { piece.name = name; scene.add(piece) }, true)
  scene.updateMatrixWorld(true)
  return { layout, scene }
}
function hasBelt(layout: Layout, x: number, y: number) {
  return layout.belts.some((belt) => belt.tiles.some((tile) => tile.x === x && tile.y === y))
}

it.each([1, 3, 7])("keeps paper wall notes out of conveyor openings with %s implementation pets", (count) => {
  const { layout, scene } = fixture(count)
  let notesSeen = 0
  for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) {
    const notes = scene.getObjectByName(`room:${room.id}:notes`)
    for (const note of notes?.children ?? []) {
      notesSeen++
      const bounds = new THREE.Box3().setFromObject(note)
      for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) {
        if (!hasBelt(layout, x, room.rect.y)) continue
        const opening = new THREE.Box3(new THREE.Vector3(x, 0, room.rect.y), new THREE.Vector3(x + 1, 1.55, room.rect.y + .3))
        expect(bounds.intersectsBox(opening), `${room.id}: decorative note overlaps opening at ${x}`).toBe(false)
      }
    }
  }
  expect(notesSeen).toBeGreaterThan(0)
})

it("closes the unused rear doorway cutout while preserving conveyor passages", () => {
  const { layout, scene } = fixture()
  for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) {
    for (let i = 0; i < room.rect.w; i++) {
      const x = room.rect.x + i, y = room.rect.y
      const wall = scene.getObjectByName(`room:${room.id}:back:${i}`)!
      const ray = new THREE.Raycaster(new THREE.Vector3(x + .5, 1, y + 1), new THREE.Vector3(0, 0, -1))
      const hit = ray.intersectObject(wall, true).length > 0
      expect(hit, `${room.id}: back wall at ${x}`).toBe(!hasBelt(layout, x, y))
    }
  }
})
