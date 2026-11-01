import * as THREE from "three"
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js"
import { afterEach, expect, it, vi } from "vitest"
import type { ResolvedRoomTheme, RoomModelAsset } from "~/model/roomThemes"
import { disposeMeshes } from "./drawing"
import { createRoomThemeAssets } from "./roomThemeAssets"

const asset: RoomModelAsset = { url: "/theme/tool.glb", footprint: { width: .4, height: .3, depth: .24 } }
const theme = (assets: ResolvedRoomTheme["assets"]) => ({ assets } as ResolvedRoomTheme)
function gltf(scene = new THREE.Group(), animations: THREE.AnimationClip[] = []): GLTF {
  return { scene, scenes: [scene], animations, cameras: [], asset: { version: "2.0" }, parser: {} as GLTF["parser"], userData: {} }
}
function cube() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshStandardMaterial({ color: 0x719881 }))
  const scene = new THREE.Group(); scene.add(mesh)
  return { scene, mesh }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
afterEach(() => vi.restoreAllMocks())

it("keeps procedural furniture available until one shared model load finishes", async () => {
  const pending = deferred<GLTF>()
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockReturnValue(pending.promise)
  const change = vi.fn()
  const cache = createRoomThemeAssets(change)
  cache.update([theme({ station: asset }), theme({ decoration: asset })])
  cache.update([theme({ station: asset })])
  expect(Boolean(cache.model(asset, "station"))).toBe(false)
  expect(load).toHaveBeenCalledExactlyOnceWith(asset.url)
  const { scene } = cube(); pending.resolve(gltf(scene)); await settle()
  expect(cache.model(asset, "station")).toBeInstanceOf(THREE.Object3D)
  expect(cache.model(asset, "decoration")).not.toBe(cache.model(asset, "station"))
  expect(change).toHaveBeenCalledTimes(1)
  cache.dispose()
})

it("fits a static model uniformly to its declared footprint at a bottom-centred origin", async () => {
  const { scene, mesh } = cube(); mesh.position.set(3, 5, -2)
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf(scene))
  const cache = createRoomThemeAssets(() => {})
  cache.update([theme({ station: asset })]); await settle()
  const model = cache.model(asset, "station")!
  const bounds = new THREE.Box3().setFromObject(model)
  expect(bounds.min.x).toBeCloseTo(-.06)
  expect(bounds.max.x).toBeCloseTo(.06)
  expect(bounds.min.y).toBeCloseTo(0)
  expect(bounds.max.y).toBeCloseTo(.18)
  expect(bounds.min.z).toBeCloseTo(-.12)
  expect(bounds.max.z).toBeCloseTo(.12)
  const drawn = model.getObjectByProperty("isMesh", true) as THREE.Mesh
  expect(drawn.material).toBeInstanceOf(THREE.MeshLambertMaterial)
  expect((drawn.material as THREE.MeshLambertMaterial).color.getHex()).toBe(0x719881)
  const second = cache.model(asset, "station")!
  model.position.x = 100
  expect(new THREE.Box3().setFromObject(second).min.x).toBeCloseTo(-.06)
  cache.dispose()
})

it("loads a floor once and gives each room its own repeating texture", async () => {
  const pending = deferred<THREE.Texture>()
  const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(pending.promise as ReturnType<THREE.TextureLoader["loadAsync"]>)
  const change = vi.fn(), cache = createRoomThemeAssets(change)
  cache.update([theme({ floor: "/theme/floor.png" }), theme({ floor: "/theme/floor.png" })])
  expect(cache.floor("/theme/floor.png", 10, 6)).toBeUndefined()
  expect(load).toHaveBeenCalledExactlyOnceWith("/theme/floor.png")
  const source = new THREE.Texture({ width: 512, height: 256 } as HTMLImageElement)
  pending.resolve(source); await settle()
  const small = cache.floor("/theme/floor.png", 10, 6)!, large = cache.floor("/theme/floor.png", 14, 9)!
  expect(small.source).toBe(large.source)
  expect(small).not.toBe(large)
  expect(small.repeat.toArray()).toEqual([5, 3])
  expect(large.repeat.toArray()).toEqual([7, 4.5])
  expect(source.repeat.toArray()).toEqual([1, 1])
  expect(small.wrapS).toBe(THREE.RepeatWrapping)
  expect(small.wrapT).toBe(THREE.RepeatWrapping)
  expect(small.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(change).toHaveBeenCalledTimes(1)
  small.dispose(); large.dispose(); cache.dispose()
})

it("retains procedural fallbacks for invalid or out-of-slot footprints without loading them", async () => {
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf(cube().scene))
  const cache = createRoomThemeAssets(() => {})
  const invalid = [
    { ...asset, footprint: { width: 0, height: .2, depth: .2 } },
    { ...asset, footprint: { width: .4, height: NaN, depth: .2 } },
    { ...asset, footprint: { width: .4, height: .2, depth: .3 } },
    { ...asset, url: " " },
  ]
  for (const value of invalid) cache.update([theme({ station: value })])
  expect(load).not.toHaveBeenCalled()
  cache.update([theme({ decoration: { ...asset, footprint: { width: .8, height: .8, depth: .6 } } })]); await settle()
  for (const value of invalid) expect(cache.model(value, "station")).toBeUndefined()
  expect(cache.model(undefined, "station")).toBeUndefined()
  cache.dispose()
})

it.each(["animated", "skinned", "light", "camera", "dense", "large-map", "empty", "flat", "nonfinite"])("keeps the procedural model for an incompatible %s asset", async (kind) => {
  const { scene, mesh } = cube()
  if (kind === "skinned") scene.add(new THREE.SkinnedMesh(mesh.geometry, mesh.material))
  if (kind === "light") scene.add(new THREE.PointLight())
  if (kind === "camera") scene.add(new THREE.PerspectiveCamera())
  if (kind === "dense") mesh.geometry = new THREE.BoxGeometry(2, 3, 4, 50, 50, 50)
  if (kind === "large-map") mesh.material.map = new THREE.Texture({ width: 2048, height: 512 } as HTMLImageElement)
  if (kind === "empty") scene.clear()
  if (kind === "flat") mesh.scale.x = 0
  if (kind === "nonfinite") mesh.position.x = Infinity
  const source = gltf(scene, kind === "animated" ? [new THREE.AnimationClip("spin", 1, [])] : [])
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(source)
  const change = vi.fn(), cache = createRoomThemeAssets(change)
  cache.update([theme({ station: asset })]); await settle()
  expect(Boolean(cache.model(asset, "station"))).toBe(false)
  expect(change).not.toHaveBeenCalled()
  cache.dispose()
})

it("owns shared model resources until view disposal and releases every resource exactly once", async () => {
  const { scene, mesh } = cube()
  scene.add(new THREE.Mesh(mesh.geometry, mesh.material))
  const texture = new THREE.Texture({ width: 512, height: 512 } as HTMLImageElement)
  mesh.material.map = texture
  const geometryDisposed = vi.fn(), originalDisposed = vi.fn(), textureDisposed = vi.fn()
  mesh.geometry.addEventListener("dispose", geometryDisposed)
  mesh.material.addEventListener("dispose", originalDisposed)
  texture.addEventListener("dispose", textureDisposed)
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf(scene))
  const floor = new THREE.Texture({ width: 512, height: 512 } as HTMLImageElement), floorDisposed = vi.fn()
  floor.addEventListener("dispose", floorDisposed)
  vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(floor as THREE.Texture<HTMLImageElement>)
  const cache = createRoomThemeAssets(() => {})
  cache.update([theme({ station: asset, floor: "/floor.png" })]); await settle()
  const model = cache.model(asset, "station")!
  const drawn = model.getObjectByProperty("isMesh", true) as THREE.Mesh
  const materialDisposed = vi.fn(); (drawn.material as THREE.Material).addEventListener("dispose", materialDisposed)
  disposeMeshes(model)
  expect(geometryDisposed).not.toHaveBeenCalled()
  expect(materialDisposed).not.toHaveBeenCalled()
  const variant = cache.floor("/floor.png", 6, 4)!, variantDisposed = vi.fn()
  variant.addEventListener("dispose", variantDisposed); variant.dispose()
  cache.dispose(); cache.dispose()
  expect(originalDisposed).toHaveBeenCalledTimes(1)
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  expect(materialDisposed).toHaveBeenCalledTimes(1)
  expect(textureDisposed).toHaveBeenCalledTimes(1)
  expect(floorDisposed).toHaveBeenCalledTimes(1)
  expect(variantDisposed).toHaveBeenCalledTimes(1)
  expect(Boolean(cache.model(asset, "station"))).toBe(false)
})

it("releases late completions after unmount without redrawing or restarting loads", async () => {
  const modelPending = deferred<GLTF>(), floorPending = deferred<THREE.Texture<HTMLImageElement>>()
  const modelLoad = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockReturnValue(modelPending.promise)
  const floorLoad = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(floorPending.promise)
  const change = vi.fn(), cache = createRoomThemeAssets(change)
  cache.update([theme({ station: asset, floor: "/late.png" })]); cache.dispose()
  const { scene, mesh } = cube()
  const geometryDisposed = vi.fn(), materialDisposed = vi.fn(), floorDisposed = vi.fn()
  mesh.geometry.addEventListener("dispose", geometryDisposed); mesh.material.addEventListener("dispose", materialDisposed)
  const bitmap = { width: 256, height: 256, close: vi.fn() }
  const floor = new THREE.Texture(bitmap as unknown as HTMLImageElement)
  floor.addEventListener("dispose", floorDisposed)
  modelPending.resolve(gltf(scene)); floorPending.resolve(floor); await settle()
  cache.update([theme({ station: asset, floor: "/late.png" })]); cache.dispose()
  expect(change).not.toHaveBeenCalled()
  expect(Boolean(cache.model(asset, "station"))).toBe(false)
  expect(cache.floor("/late.png", 4, 4)).toBeUndefined()
  expect(modelLoad).toHaveBeenCalledTimes(1); expect(floorLoad).toHaveBeenCalledTimes(1)
  expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(materialDisposed).toHaveBeenCalledTimes(1); expect(floorDisposed).toHaveBeenCalledTimes(1)
  expect(bitmap.close).toHaveBeenCalledTimes(1)
})

it("rejects oversized floor images, releases them and keeps valid floor dimensions finite", async () => {
  const bitmap = { width: 2048, height: 256, close: vi.fn() }
  const huge = new THREE.Texture(bitmap as unknown as HTMLImageElement), hugeDisposed = vi.fn()
  huge.addEventListener("dispose", hugeDisposed)
  const normal = new THREE.Texture({ width: 512, height: 512 } as HTMLImageElement)
  vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValueOnce(huge as THREE.Texture<HTMLImageElement>).mockResolvedValueOnce(normal as THREE.Texture<HTMLImageElement>)
  const cache = createRoomThemeAssets(() => {})
  cache.update([theme({ floor: "/huge.png" }), theme({ floor: "/valid.png" })]); await settle()
  expect(Boolean(cache.floor("/huge.png", 6, 6))).toBe(false)
  expect(hugeDisposed).toHaveBeenCalledTimes(1)
  expect(Boolean(cache.floor("/valid.png", NaN, 6))).toBe(false)
  expect(Boolean(cache.floor("/valid.png", 6, 0))).toBe(false)
  cache.dispose(); expect(hugeDisposed).toHaveBeenCalledTimes(1)
  expect(bitmap.close).toHaveBeenCalledTimes(1)
})

it("bounds asset requests across room changes and remembers failed URLs", async () => {
  const models = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockRejectedValue(new Error("missing model"))
  const floors = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockRejectedValue(new Error("missing floor"))
  const change = vi.fn(), cache = createRoomThemeAssets(change)
  for (let index = 0; index < 40; index++) cache.update([theme({ station: { ...asset, url: `/model-${index}.glb` }, floor: `/floor-${index}.png` })])
  await settle()
  cache.update([theme({ station: { ...asset, url: "/model-0.glb" }, floor: "/floor-0.png" })])
  expect(models.mock.calls.length + floors.mock.calls.length).toBe(32)
  expect(change).not.toHaveBeenCalled()
  expect(Boolean(cache.model({ ...asset, url: "/model-0.glb" }, "station"))).toBe(false)
  expect(cache.floor("/floor-0.png", 4, 4)).toBeUndefined()
  cache.dispose()
})

it("converts an unlit GLB material without warnings while preserving its texture and transparency", async () => {
  const map = new THREE.Texture({ width: 256, height: 256 } as HTMLImageElement)
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x778899, map, transparent: true, opacity: .6, alphaTest: .2 })))
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf(scene))
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const cache = createRoomThemeAssets(() => {})
  cache.update([theme({ station: asset })]); await settle()
  const mesh = cache.model(asset, "station")!.getObjectByProperty("isMesh", true) as THREE.Mesh
  expect(mesh.material).toMatchObject({ isMeshLambertMaterial: true, map, transparent: true, opacity: .6, alphaTest: .2 })
  expect(warn).not.toHaveBeenCalled()
  cache.dispose()
})

it("closes a shared bitmap only once when its cache-owned textures are released", async () => {
  const bitmap = { width: 512, height: 512, close: vi.fn() }
  const { scene, mesh } = cube()
  mesh.material.map = new THREE.Texture(bitmap as unknown as ImageBitmap)
  mesh.material.normalMap = new THREE.Texture(bitmap as unknown as ImageBitmap)
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf(scene))
  const cache = createRoomThemeAssets(() => {})
  cache.update([theme({ station: asset })]); await settle()
  expect(bitmap.close).not.toHaveBeenCalled()
  cache.dispose(); cache.dispose()
  expect(bitmap.close).toHaveBeenCalledTimes(1)
})
