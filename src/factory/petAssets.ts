import * as THREE from "three"
import type { Agent } from "~/model/types"
import type { Wardrobes } from "./sprites"

/** Columns of a 6×4 sheet, in playback order; repeated columns can hold a pose. */
export interface PetAnimation {
  frames: readonly number[]
  fps?: number
}
export interface PetAnimations {
  working?: PetAnimation
  attention?: PetAnimation
}

/** A transparent pet illustration, or a six-column/four-facing animation sheet. */
export interface PetAsset {
  src: string
  layout?: "image" | "sheet"
  /** Display height in floor tiles; defaults to 2.3. */
  height?: number
  /** Frame width divided by height; defaults to the image's intrinsic ratio. */
  aspectRatio?: number
  /** State clips for sheets. Static images still use distinct procedural body motions. */
  animations?: PetAnimations
}

/** Host-owned art: agent overrides role, then the shared default. */
export interface PetAssets {
  default?: PetAsset
  byRole?: Readonly<Record<string, PetAsset>>
  byAgent?: Readonly<Record<string, PetAsset>>
}

/** Example assets can be replaced by any host-served transparent image URLs. */
export const DEFAULT_PET_ANIMATIONS: Readonly<PetAnimations> = {
  working: { frames: [3, 4], fps: 5.5 },
  attention: { frames: [5, 0], fps: 3.2 },
}
const bundledPet = (name: string): PetAsset => ({ src: `assets/pets/${name}-sheet.svg`, layout: "sheet", animations: DEFAULT_PET_ANIMATIONS })
export const DEFAULT_PET_ASSETS: Readonly<PetAssets> = {
  default: bundledPet("cat"),
  byRole: {
    router: bundledPet("corgi"),
    planner: bundledPet("rabbit"),
    implementer: bundledPet("cat"),
    reviewer: bundledPet("owl"),
    deployer: bundledPet("fox"),
  },
}

type Wearer = Pick<Agent, "id" | "role" | "sprite">

/** Explicit stock sprites remain an escape hatch; custom wardrobes precede built-in pets. */
export function petAssetFor(agent: Wearer, assets: PetAssets | undefined, paper: boolean, wardrobes: Wardrobes = {}): PetAsset | undefined {
  if (agent.sprite !== undefined) return undefined
  const requested = assets?.byAgent?.[agent.id] ?? assets?.byRole?.[agent.role] ?? assets?.default
  if (requested) return requested
  if (!paper || Object.hasOwn(wardrobes, agent.role)) return undefined
  return DEFAULT_PET_ASSETS.byRole?.[agent.role] ?? DEFAULT_PET_ASSETS.default
}

export function petDimensions(asset: PetAsset, width: number, height: number) {
  const valid = (number: number | undefined, fallback: number) => number !== undefined && Number.isFinite(number) && number > 0 ? number : fallback
  return {
    height: valid(asset.height, 2.3),
    aspectRatio: valid(asset.aspectRatio, width > 0 && height > 0 ? width / height * (asset.layout === "sheet" ? 4 / 6 : 1) : 2 / 3),
  }
}

/** One view owns source images and their display variants; animated frame clones belong to agents. */
export function createPetTextures(base: string, load: (url: string) => Promise<THREE.Texture> = (url) => new THREE.TextureLoader().loadAsync(url)) {
  const sources = new Map<string, Promise<THREE.Texture>>()
  const variants = new Map<string, Promise<THREE.Texture>>()
  const owned = new Set<THREE.Texture>()
  let disposed = false
  const own = (texture: THREE.Texture) => { if (disposed) texture.dispose(); else owned.add(texture); return texture }
  const urlFor = (src: string) => /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(src) ? src : base + src
  function source(src: string) {
    const url = urlFor(src)
    let pending = sources.get(url)
    if (!pending) {
      pending = load(url).then(own)
      sources.set(url, pending)
    }
    return pending
  }
  function variant(asset: PetAsset): Promise<THREE.Texture> {
    const key = JSON.stringify([asset.src, asset.layout ?? "image", asset.height ?? 2.3, asset.aspectRatio, asset.animations])
    let pending = variants.get(key)
    if (!pending) {
      pending = source(asset.src).then((original) => {
        const texture = own(original.clone())
        const image = original.image as { width?: number; height?: number }
        const dimensions = petDimensions(asset, image?.width ?? 0, image?.height ?? 0)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.magFilter = texture.minFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        texture.userData = { paper: true, pet: true, petLayout: asset.layout ?? "image", petKey: key, petAnimations: asset.animations ?? DEFAULT_PET_ANIMATIONS, ...dimensions }
        texture.needsUpdate = true
        return texture
      })
      variants.set(key, pending)
    }
    return pending
  }
  return {
    async get(asset: PetAsset): Promise<THREE.Texture | undefined> {
      if (disposed) return undefined
      try { return await variant(asset) }
      catch {
        // A missing host asset must not stop task rendering. If the bundled
        // pet is also unavailable the agent layer supplies a drawn pet.
        try { return await variant(DEFAULT_PET_ASSETS.default!) } catch { return undefined }
      }
    },
    dispose() {
      disposed = true
      for (const texture of owned) texture.dispose()
      owned.clear(); sources.clear(); variants.clear()
    },
  }
}
