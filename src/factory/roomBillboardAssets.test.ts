import * as THREE from "three"
import { expect, it, vi } from "vitest"
import { createRoomBillboardAssets } from "./roomBillboardAssets"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
const texture = (width = 512, height = 256) => new THREE.Texture({ width, height } as HTMLImageElement)

it("loads a shared billboard once and gives each room its own full-color texture", async () => {
  const pending = deferred<THREE.Texture>(), load = vi.fn(() => pending.promise), change = vi.fn()
  const assets = createRoomBillboardAssets(change, "/", load)
  const billboard = { image: "/rooms/planning.png" }
  assets.update([billboard, billboard, undefined])
  assets.update([billboard])
  expect(load).toHaveBeenCalledExactlyOnceWith("/rooms/planning.png")
  expect(assets.image(billboard)).toBeUndefined()
  expect(assets.image()).toBeUndefined()
  const source = texture()
  pending.resolve(source); await settle()
  const first = assets.image(billboard)!, second = assets.image(billboard)!
  expect(first).toBeInstanceOf(THREE.Texture)
  expect(first).not.toBe(source)
  expect(first).not.toBe(second)
  expect(first.source).toBe(source.source)
  expect(first.image).toMatchObject({ width: 512, height: 256 })
  expect(first.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(first.wrapS).toBe(THREE.ClampToEdgeWrapping)
  expect(first.wrapT).toBe(THREE.ClampToEdgeWrapping)
  expect(first.magFilter).toBe(THREE.LinearFilter)
  expect(first.minFilter).toBe(THREE.LinearFilter)
  expect(source.colorSpace).toBe(THREE.NoColorSpace)
  expect(change).toHaveBeenCalledTimes(1)
  first.dispose(); second.dispose(); assets.dispose()
})

it("keeps nearest filtering local to a room without changing other copies", async () => {
  const source = texture(), assets = createRoomBillboardAssets(() => {}, "/", async () => source)
  const linear = { image: "/rooms/shared.png" }, pixel = { ...linear, filter: "nearest" as const }
  assets.update([linear, pixel]); await settle()
  const pixelCopy = assets.image(pixel)!, linearCopy = assets.image(linear)!
  expect(pixelCopy.magFilter).toBe(THREE.NearestFilter)
  expect(pixelCopy.minFilter).toBe(THREE.NearestFilter)
  expect(pixelCopy.generateMipmaps).toBe(false)
  expect(linearCopy.magFilter).toBe(THREE.LinearFilter)
  expect(linearCopy.minFilter).toBe(THREE.LinearFilter)
  expect(source.magFilter).toBe(THREE.LinearFilter)
  expect(source.generateMipmaps).toBe(true)
  pixelCopy.dispose(); linearCopy.dispose(); assets.dispose()
})

it("releases a source when the last room removes it while leaving caller copies alone", async () => {
  const source = texture(), released = vi.fn()
  source.addEventListener("dispose", released)
  const assets = createRoomBillboardAssets(() => {}, "/", async () => source)
  const billboard = { image: "/rooms/shared.png" }
  assets.update([billboard, { ...billboard, alt: "Second room" }]); await settle()
  const copy = assets.image(billboard)!, copyReleased = vi.fn()
  copy.addEventListener("dispose", copyReleased)
  assets.update([billboard])
  expect(released).not.toHaveBeenCalled()
  assets.update([])
  expect(released).toHaveBeenCalledTimes(1)
  expect(assets.image(billboard)).toBeUndefined()
  expect(copyReleased).not.toHaveBeenCalled()
  expect(copy.image).toMatchObject({ width: 512, height: 256 })
  assets.dispose(); assets.dispose()
  expect(released).toHaveBeenCalledTimes(1)
  copy.dispose()
  expect(copyReleased).toHaveBeenCalledTimes(1)
})

it("discards a removed URL's late completion even if that URL has been reintroduced", async () => {
  const oldLoad = deferred<THREE.Texture>(), newLoad = deferred<THREE.Texture>()
  const load = vi.fn().mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(newLoad.promise)
  const change = vi.fn(), assets = createRoomBillboardAssets(change, "/", load)
  const billboard = { image: "/rooms/changing.png" }
  assets.update([billboard]); assets.update([]); assets.update([billboard])
  expect(load).toHaveBeenCalledTimes(2)
  const oldSource = texture(), oldReleased = vi.fn()
  oldSource.addEventListener("dispose", oldReleased)
  oldLoad.resolve(oldSource); await settle()
  expect(oldReleased).toHaveBeenCalledTimes(1)
  expect(assets.image(billboard)).toBeUndefined()
  expect(change).not.toHaveBeenCalled()
  const newSource = texture(1024, 512)
  newLoad.resolve(newSource); await settle()
  const copy = assets.image(billboard)!
  expect(copy.source).toBe(newSource.source)
  expect(change).toHaveBeenCalledTimes(1)
  copy.dispose(); assets.dispose()
  expect(oldReleased).toHaveBeenCalledTimes(1)
})

it("disposes loaded and late textures once after unmount without new requests or redraws", async () => {
  const pending = deferred<THREE.Texture>(), loaded = texture()
  const load = vi.fn().mockResolvedValueOnce(loaded).mockReturnValueOnce(pending.promise)
  const change = vi.fn(), assets = createRoomBillboardAssets(change, "/", load)
  const billboard = { image: "/ready.png" }, lateBillboard = { image: "/late.png" }
  const loadedReleased = vi.fn(), lateReleased = vi.fn(), late = texture()
  loaded.addEventListener("dispose", loadedReleased); late.addEventListener("dispose", lateReleased)
  assets.update([billboard, lateBillboard]); await settle()
  expect(change).toHaveBeenCalledTimes(1)
  assets.dispose(); assets.dispose()
  pending.resolve(late); await settle()
  assets.update([billboard])
  expect(loadedReleased).toHaveBeenCalledTimes(1)
  expect(lateReleased).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(2)
  expect(assets.image(billboard)).toBeUndefined()
  expect(assets.image(lateBillboard)).toBeUndefined()
})

it.each([
  [0, 256], [256, 0], [-1, 256], [256, NaN], [Infinity, 256], [1025, 256], [256, 1025],
])("keeps the fallback and releases an image with native dimensions %s × %s", async (width, height) => {
  const source = texture(width, height), released = vi.fn(), change = vi.fn()
  source.addEventListener("dispose", released)
  const load = vi.fn(async () => source), assets = createRoomBillboardAssets(change, "/", load)
  const billboard = { image: "/rooms/invalid.png" }
  assets.update([billboard]); await settle()
  expect(assets.image(billboard)).toBeUndefined()
  expect(released).toHaveBeenCalledTimes(1)
  expect(change).not.toHaveBeenCalled()
  assets.update([billboard]); await settle()
  expect(load).toHaveBeenCalledTimes(1)
  assets.dispose()
  expect(released).toHaveBeenCalledTimes(1)
})

it("checks natural image dimensions rather than resized display dimensions", async () => {
  const source = new THREE.Texture({ width: 512, height: 256, naturalWidth: 2048, naturalHeight: 1024 } as HTMLImageElement)
  const released = vi.fn(); source.addEventListener("dispose", released)
  const assets = createRoomBillboardAssets(() => {}, "/", async () => source)
  const billboard = { image: "/rooms/large-native.png" }
  assets.update([billboard]); await settle()
  expect(assets.image(billboard)).toBeUndefined()
  expect(released).toHaveBeenCalledTimes(1)
  assets.dispose()
})

it.each([
  ["/", "/rooms/relative.png"],
  ["/factory/", "/factory/rooms/relative.png"],
  ["https://example.test/factory/", "https://example.test/factory/rooms/relative.png"],
])("resolves relative images against %s while keeping absolute URLs unchanged", async (base, expected) => {
  const load = vi.fn(async (_url: string) => texture()), assets = createRoomBillboardAssets(() => {}, base, load)
  const relative = { image: "rooms/relative.png" }
  assets.update([relative, { image: expected }, { image: "/rooms/root.png" },
    { image: "https://cdn.test/room.png" }, { image: "data:image/png;base64,abc" }, { image: " " }, {}, undefined])
  await settle()
  expect(load.mock.calls.map(([url]) => url)).toEqual([
    expected, "/rooms/root.png", "https://cdn.test/room.png", "data:image/png;base64,abc",
  ])
  const copy = assets.image(relative)!
  expect(copy).toBeInstanceOf(THREE.Texture)
  expect(assets.image({ image: " " })).toBeUndefined()
  assets.update([{ image: expected }])
  const retained = assets.image(relative)!
  expect(retained.source).toBe(copy.source)
  copy.dispose(); retained.dispose(); assets.dispose()
})

it.each(["reject", "throw"])("keeps a failed load quiet after a %s and retries only after removal", async (failure) => {
  const load = vi.fn((_url: string): Promise<THREE.Texture> => {
    if (failure === "throw") throw new Error("Network unavailable")
    return Promise.reject(new Error("Network unavailable"))
  })
  const change = vi.fn(), assets = createRoomBillboardAssets(change, "/", load)
  const billboard = { image: "/rooms/missing.png" }
  expect(() => assets.update([billboard])).not.toThrow()
  await settle()
  assets.update([billboard]); await settle()
  expect(load).toHaveBeenCalledTimes(1)
  expect(assets.image(billboard)).toBeUndefined()
  expect(change).not.toHaveBeenCalled()
  const source = texture()
  load.mockResolvedValueOnce(source)
  assets.update([]); assets.update([billboard]); await settle()
  const copy = assets.image(billboard)!
  expect(copy.source).toBe(source.source)
  expect(change).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(2)
  copy.dispose(); assets.dispose()
})
