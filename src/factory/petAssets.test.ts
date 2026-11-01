import { describe, expect, it, vi } from "vitest"
import * as THREE from "three"
import { createPetTextures, DEFAULT_PET_ASSETS, petAssetFor, petDimensions } from "./petAssets"

const agent = { id: "piper", role: "planner" }
const image = (width = 256, height = 320) => new THREE.Texture({ width, height } as HTMLImageElement)

describe("host pet assets", () => {
  it("selects agent, then role, then component default without replacing explicit stock sprites", () => {
    const pets = { default: { src: "default.png" }, byRole: { planner: { src: "role.png" } }, byAgent: { piper: { src: "agent.png" } } }
    expect(petAssetFor(agent, pets, true)?.src).toBe("agent.png")
    expect(petAssetFor({ ...agent, id: "robin" }, pets, true)?.src).toBe("role.png")
    expect(petAssetFor({ id: "alex", role: "tester" }, pets, true)?.src).toBe("default.png")
    expect(petAssetFor({ ...agent, sprite: 0 }, pets, true)).toBeUndefined()
    expect(petAssetFor({ ...agent, sprite: "/custom-sheet.png" }, pets, true)).toBeUndefined()
  })

  it("keeps legacy defaults and custom wardrobes, while accepting an explicit pet in either appearance", () => {
    expect(petAssetFor(agent, undefined, false)).toBeUndefined()
    expect(petAssetFor(agent, undefined, true, { planner: [1] })).toBeUndefined()
    expect(petAssetFor(agent, undefined, true)).toEqual(DEFAULT_PET_ASSETS.byRole!.planner)
    const custom = { default: { src: "bunny.png" } }
    expect(petAssetFor(agent, custom, false, { planner: [1] })).toEqual(custom.default)
  })

  it("uses image or frame dimensions and ignores nonpositive/nonfinite overrides", () => {
    expect(petDimensions({ src: "pet.png" }, 256, 320)).toEqual({ height: 2.3, aspectRatio: .8 })
    expect(petDimensions({ src: "sheet.png", layout: "sheet" }, 768, 768).aspectRatio).toBeCloseTo(2 / 3)
    expect(petDimensions({ src: "pet.png", height: 3, aspectRatio: 1 }, 256, 320)).toEqual({ height: 3, aspectRatio: 1 })
    expect(petDimensions({ src: "bad.png", height: NaN, aspectRatio: -1 }, 0, 0)).toEqual({ height: 2.3, aspectRatio: 2 / 3 })
  })
})

describe("view-owned pet textures", () => {
  it("loads a shared source once and identifies dimension/layout changes without mutating another agent", async () => {
    const source = image()
    const load = vi.fn(async () => source)
    const pets = createPetTextures("/demo/", load)
    const small = await pets.get({ src: "pets/cat.svg", height: 2 })
    const tall = await pets.get({ src: "pets/cat.svg", height: 3 })
    const sheet = await pets.get({ src: "pets/cat.svg", layout: "sheet" })
    expect(load).toHaveBeenCalledExactlyOnceWith("/demo/pets/cat.svg")
    expect(small?.source).toBe(tall?.source)
    expect(small?.userData.height).toBe(2)
    expect(tall?.userData.height).toBe(3)
    expect(small?.userData.petKey).not.toBe(tall?.userData.petKey)
    expect(small?.userData.petLayout).toBe("image")
    expect(sheet?.userData.petLayout).toBe("sheet")
    expect((await pets.get({ src: "pets/cat.svg", height: 2 }))).toBe(small)
    expect(source.userData.pet).toBeUndefined()
    pets.dispose()
  })

  it("falls back to bundled pet art when a host image fails, and permits the drawn fallback if both fail", async () => {
    const load = vi.fn(async (url: string) => {
      if (!url.endsWith("assets/pets/cat-sheet.svg")) throw new Error("missing")
      return image()
    })
    const pets = createPetTextures("/", load)
    expect((await pets.get({ src: "https://host.test/missing.png" }))?.userData.pet).toBe(true)
    expect(load.mock.calls.map(([url]) => url)).toEqual(["https://host.test/missing.png", "/assets/pets/cat-sheet.svg"])
    pets.dispose()
    const offline = createPetTextures("/", async () => { throw new Error("offline") })
    expect(await offline.get({ src: "missing.png" })).toBeUndefined()
    offline.dispose()
  })

  it("releases source and variant textures with the view, including loads that finish after unmount", async () => {
    const source = image()
    const sourceDisposed = vi.fn()
    source.addEventListener("dispose", sourceDisposed)
    const pets = createPetTextures("/", async () => source)
    const shown = await pets.get({ src: "/cat.svg" })
    const variantDisposed = vi.fn()
    shown!.addEventListener("dispose", variantDisposed)
    pets.dispose()
    expect(sourceDisposed).toHaveBeenCalledTimes(1)
    expect(variantDisposed).toHaveBeenCalledTimes(1)
    expect(await pets.get({ src: "/cat.svg" })).toBeUndefined()

    let finish!: (texture: THREE.Texture) => void
    const pending = createPetTextures("/", () => new Promise((resolve) => { finish = resolve }))
    const loading = pending.get({ src: "/slow.svg" })
    pending.dispose()
    const late = image()
    const lateDisposed = vi.fn()
    late.addEventListener("dispose", lateDisposed)
    finish(late)
    await loading
    expect(lateDisposed).toHaveBeenCalledTimes(1)
  })
})
