import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import type { Layout } from "~/floor/types"
import { paperWallPortSide } from "./paperWallPorts"
import { drawRooms } from "./rooms"
import { ROOM_THEMES, type ResolvedRoomTheme } from "~/model/roomThemes"
import { wayIn } from "~/floor/walk"

beforeEach(() => vi.stubGlobal("document", { createElement: () => ({
  width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }),
}) }))
afterEach(() => vi.unstubAllGlobals())

function fixture(count = 1, theme?: ResolvedRoomTheme) {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
    agents: exampleRooms.rooms.filter((room) => room.kind !== "intake").flatMap((room) =>
      Array.from({ length: room.id === "implementation" ? count : 1 }, (_, i) => ({
        id: `${room.id}-${i}`, name: room.label, roomId: room.id, role: room.role, status: "idle" as const,
      }))), tasks: [], humanRequests: [],
  } }, undefined, 28)
  const scene = new THREE.Group()
  drawRooms(layout, (name, piece) => { piece.name = name; scene.add(piece) },
    theme ? new Map(layout.rooms!.map((room) => [room.id, theme])) : undefined)
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

it("keeps every rear wall solid with no doorway or conveyor cutouts", () => {
  const { layout, scene } = fixture()
  for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) {
    for (let i = 0; i < room.rect.w; i++) {
      const x = room.rect.x + i, y = room.rect.y
      const wall = scene.getObjectByName(`room:${room.id}:back:${i}`)!
      const ray = new THREE.Raycaster(new THREE.Vector3(x + .5, 1, y + 1), new THREE.Vector3(0, 0, -1))
      const hit = ray.intersectObject(wall, true).length > 0
      expect(hit, `${room.id}: back wall at ${x}`).toBe(true)
      expect(scene.getObjectByName(`room:${room.id}:back-frame:${i}`)).toBeUndefined()
    }
  }
})


it.each(Object.values(ROOM_THEMES))("applies $id walls and flooring independently of room identity", (theme) => {
  const { scene } = fixture(3, theme)
  const wall = scene.getObjectByName("room:room:implementation:back:2")!.children[0] as THREE.Mesh
  expect((wall.material as THREE.MeshLambertMaterial).color.getHex()).toBe(theme.wall)
  const floor = scene.getObjectByName("room:room:implementation:floor") as THREE.Mesh
  expect((floor.material as THREE.MeshLambertMaterial).map!.userData.paperFloor).toBe(theme.floor)
  expect(scene.getObjectByName("room:room:implementation:side-furnishing")?.userData.themeDecoration).toBe(theme.decoration)
})

it.each([1, 3, 7])("keeps full themed decoration footprints clear of belts, stations and walk paths with %s pets", (count) => {
  for (const theme of Object.values(ROOM_THEMES)) {
    const { layout, scene } = fixture(count, theme)
    const obstacles = layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))
    for (const station of layout.bays.flatMap((bay) => bay.stations)) {
      obstacles.push({ x: station.bench.x + .5 - 1.4, y: station.bench.y + .5 - .65, w: 2.8, h: 1.3 })
      obstacles.push(...wayIn(layout, station).map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))
    }
    for (const room of layout.rooms!) for (const name of ["plant", "side-furnishing"]) {
      const prop = scene.getObjectByName(`room:${room.id}:${name}`)
      if (!prop) continue
      const bounds = new THREE.Box3().setFromObject(prop)
      for (const rect of obstacles) expect(bounds.max.x + .099 > rect.x && bounds.min.x - .099 < rect.x + rect.w &&
        bounds.max.z + .099 > rect.y && bounds.min.z - .099 < rect.y + rect.h, `${theme.id}:${room.id}:${name}`).toBe(false)
    }
  }
})


it("places host decoration at the checked rear slot and owns only its floor texture clone", () => {
  const { layout } = fixture(3)
  const room = layout.rooms!.find((room) => room.id === "room:implementation")!
  const map = new THREE.Texture()
  const asset = { url: "/host.glb", footprint: { width: .8, depth: .5, height: .9 } }
  const theme = { ...ROOM_THEMES.factory, assets: { decoration: asset, floor: "/floor.png" } }
  const model = new THREE.Mesh(new THREE.BoxGeometry(.8, .9, .5).translate(0, .45, 0), new THREE.MeshLambertMaterial())
  model.name = "host-model"
  const assets = { model: vi.fn(() => model.clone()), floor: vi.fn(() => map), update: () => {}, dispose: () => {} }
  const scene = new THREE.Group()
  drawRooms(layout, (name, piece) => { piece.name = name; scene.add(piece) },
    new Map([[room.id, theme]]), assets)
  const floor = scene.getObjectByName(`room:${room.id}:floor`) as THREE.Mesh
  expect((floor.material as THREE.MeshLambertMaterial).map).toBe(map)
  expect(floor.userData.disposeTexture).toBe(true)
  const prop = scene.getObjectByName(`room:${room.id}:side-furnishing`)!
  expect(prop).toBeDefined()
  expect(prop.position.toArray()).toEqual([room.rect.x + 2.75, .02, room.rect.y + .77])
  expect(assets.model).toHaveBeenCalledWith(asset, "decoration")
})

it.each([1, 3, 7])("frames only actual left/right conveyor crossings with %s implementation pets", (count) => {
  const { layout, scene } = fixture(count)
  let crossings = 0
  for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) {
    for (const side of ["left", "right"] as const) for (let index = 0; index < room.rect.h; index++) {
      const tileX = side === "left" ? room.rect.x : room.rect.x + room.rect.w - 1
      const tileY = room.rect.y + index
      const crosses = layout.belts.some((belt) => belt.tiles.some((tile) => tile.x === tileX && tile.y === tileY && paperWallPortSide(tile, room) === side))
      const frame = scene.getObjectByName(`room:${room.id}:${side}-frame:${index}`)
      expect(Boolean(frame), `${room.id} ${side} row ${index}`).toBe(crosses)
      if (!frame) continue
      crossings++
      expect(new THREE.Box3().setFromObject(frame).max.y).toBeCloseTo(1.63)
      const ray = new THREE.Raycaster(new THREE.Vector3(tileX + (side === "left" ? -1 : 2), 1.15, tileY + .5), new THREE.Vector3(side === "left" ? 1 : -1, 0, 0))
      expect(ray.intersectObject(frame, true)).toHaveLength(0)
    }
  }
  expect(crossings).toBeGreaterThan(0)
})

it.each([1, 3, 7])("retains themed furnishings behind the internal return with %s implementation pets", (count) => {
  for (const theme of Object.values(ROOM_THEMES)) {
    const { layout, scene } = fixture(count, theme)
    for (const room of layout.rooms!.filter((room) => room.kind !== "intake")) {
      const furnishing = scene.getObjectByName(`room:${room.id}:side-furnishing`)
      expect(furnishing, `${theme.id}:${room.id} furnishing disappeared`).toBeDefined()
      const bounds = new THREE.Box3().setFromObject(furnishing!)
      expect(bounds.max.z, `${theme.id}:${room.id} reaches the return lane`).toBeLessThan(room.rect.y + 1.9)
      expect(bounds.min.z).toBeGreaterThan(room.rect.y)
    }
  }
})
