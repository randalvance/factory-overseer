import { afterEach, expect, it, vi } from "vitest"
import * as THREE from "three"
import { ROOM_THEMES, ROOM_THEME_SLOTS } from "~/model/roomThemes"
import { paperPieces } from "./paper"
import { bench } from "./pieces"
import { disposeMeshes } from "./drawing"
import { isShared, type Pieces } from "./models"

vi.mock("./textures", async (original) => ({ ...await original<typeof import("./textures")>(), canvasTexture: () => new THREE.Texture() }))
const libraries: Pieces[] = []
function library() {
  const texture = new THREE.Texture()
  const value = paperPieces({ floor: texture, cardboard: texture, belts: { forward: texture, rework: texture }, clone: () => new THREE.Group() })
  libraries.push(value)
  return value
}
afterEach(() => { for (const value of libraries.splice(0)) value.dispose?.() })

it.each(Object.values(ROOM_THEMES))("keeps $id station surfaces and the parcel travel strip aligned", (theme) => {
  const station = bench({ x: 0, y: 0 }, false, library(), "unrelated-role", theme)
  station.position.set(0, 0, 0)
  station.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(station)
  expect(bounds.min.x).toBeGreaterThanOrEqual(-1.40001)
  expect(bounds.max.x).toBeLessThanOrEqual(1.40001)
  expect(bounds.min.z).toBeGreaterThanOrEqual(-.65001)
  expect(bounds.max.z).toBeLessThanOrEqual(.65001)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0))
  expect(ray.intersectObject(station, true)[0]!.point.y).toBeCloseTo(.85)
  const parcelLane = new THREE.Box3(new THREE.Vector3(-1.4, .8501, -.3), new THREE.Vector3(1.4, 1.45, .3))
  station.traverse((object) => {
    if (object instanceof THREE.Mesh) expect(new THREE.Box3().setFromObject(object).intersectsBox(parcelLane), object.name).toBe(false)
  })
  const signature = { lab: "lab-drawer", foundry: "foundry-brace", assembly: "assembly-bin", precision: "precision-rule" }[theme.station]
  expect(station.getObjectByName(signature)).toBeDefined()
  disposeMeshes(station)
})

it("uses the custom accessory slot without changing the fixed functional bench", () => {
  const pieces = library()
  const theme = { ...ROOM_THEMES.factory, assets: { station: { url: "/tool.glb", footprint: { width: .5, depth: .26, height: .45 } } } }
  const accessory = new THREE.Mesh(new THREE.BoxGeometry(.5, .45, .26).translate(0, .225, 0), new THREE.MeshLambertMaterial())
  accessory.name = "host-accessory"
  const assets = { model: vi.fn(() => accessory), floor: () => undefined, update: () => {}, dispose: () => {} }
  const station = bench({ x: 0, y: 0 }, false, pieces, "planner", theme, assets)
  station.position.set(0, 0, 0)
  const model = station.getObjectByName("host-accessory")!
  expect(model).toBeDefined()
  expect(model.position.toArray()).toEqual([...ROOM_THEME_SLOTS.station.anchor])
  expect(station.getObjectByName("station-accessory")).toBeUndefined()
  const bounds = new THREE.Box3().setFromObject(model)
  expect(bounds.max.z).toBeLessThanOrEqual(-.3 - ROOM_THEME_SLOTS.station.clearance)
  disposeMeshes(station)
})

it("owns live palette materials per drawing so later edits cannot grow the shared library", () => {
  const pieces = library()
  const first = bench({ x: 0, y: 0 }, false, pieces, undefined, { ...ROOM_THEMES.factory, accent: 0x112233 })
  const second = bench({ x: 1, y: 0 }, false, pieces, undefined, { ...ROOM_THEMES.factory, accent: 0x445566 })
  const accents: THREE.Material[] = []
  for (const group of [first, second]) group.traverse((object) => {
    if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.name === "room-theme-accent" && !accents.includes(object.material)) accents.push(object.material)
  })
  expect(accents).toHaveLength(2)
  expect(accents.every((material) => !isShared(material))).toBe(true)
  const disposed = vi.fn(); accents[0]!.addEventListener("dispose", disposed)
  disposeMeshes(first)
  expect(disposed).toHaveBeenCalled()
  disposeMeshes(second)
})


it("releases the undimmed live palette when a themed station becomes vacant", () => {
  const pieces = library()
  const piece = pieces.themedBench!(ROOM_THEMES.factory)
  let accent: THREE.Material | undefined
  piece.traverse((object) => {
    if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.name === "room-theme-accent") accent = object.material
  })
  const disposed = vi.fn()
  accent!.addEventListener("dispose", disposed)
  const vacant = bench({ x: 0, y: 0 }, true, { ...pieces, themedBench: () => piece }, undefined, ROOM_THEMES.factory)
  expect(disposed).toHaveBeenCalledTimes(1)
  disposeMeshes(vacant)
})


it("shares live accents within one drawing without letting vacant stations dispose them", () => {
  const pieces = library(), palette = new Map<number, THREE.MeshLambertMaterial>()
  const first = bench({ x: 0, y: 0 }, false, pieces, undefined, ROOM_THEMES.factory, undefined, palette)
  const shared = palette.get(ROOM_THEMES.factory.accent)!
  const disposed = vi.fn(); shared.addEventListener("dispose", disposed)
  const second = bench({ x: 4, y: 0 }, false, pieces, undefined, ROOM_THEMES.factory, undefined, palette)
  const vacant = bench({ x: 8, y: 0 }, true, pieces, undefined, ROOM_THEMES.factory, undefined, palette)
  expect(palette.size).toBe(1)
  for (const station of [first, second]) {
    const accents: THREE.Material[] = []
    station.traverse((object) => { if (object instanceof THREE.Mesh && object.material === shared) accents.push(object.material) })
    expect(accents.length).toBeGreaterThan(0)
  }
  expect(disposed).not.toHaveBeenCalled()
  disposeMeshes(vacant)
  expect(disposed).not.toHaveBeenCalled()
  const drawing = new THREE.Group(); drawing.add(first, second)
  disposeMeshes(drawing)
})
