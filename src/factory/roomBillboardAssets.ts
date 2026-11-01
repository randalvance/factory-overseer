import * as THREE from "three"
import type { RoomBillboard } from "~/model/types"

export interface BillboardAssets {
  update(billboards: Iterable<RoomBillboard | undefined>): void
  image(billboard?: RoomBillboard): THREE.Texture | undefined
  dispose(): void
}

/** Per-view source textures; every image copy belongs to its caller. */
export function createRoomBillboardAssets(
  onChange: () => void,
  base = "/",
  load: (url: string) => Promise<THREE.Texture> = (url) => new THREE.TextureLoader().loadAsync(url),
): BillboardAssets {
  const urlFor = (billboard?: RoomBillboard) => {
    const image = billboard?.image?.trim()
    if (!image) return undefined
    return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(image) ? image : `${base.replace(/\/?$/, "/")}${image.replace(/^\.\//, "")}`
  }
  let disposed = false
  const images = new Map<string, { texture?: THREE.Texture }>()
  return {
    update(billboards) {
      if (disposed) return
      const urls = new Set([...billboards].flatMap((billboard) => {
        const url = urlFor(billboard)
        return url ? [url] : []
      }))
      for (const [url, entry] of images) if (!urls.has(url)) {
        entry.texture?.dispose()
        images.delete(url)
      }
      for (const url of urls) {
        if (images.has(url)) continue
        const entry: { texture?: THREE.Texture } = {}
        images.set(url, entry)
        try {
          void load(url).then((texture) => {
            if (images.get(url) !== entry || !smallImage(texture)) { texture.dispose(); return }
            entry.texture = texture; onChange()
          }).catch(() => {})
        } catch { /* Keep the default graphic after a synchronous loader failure too. */ }
      }
    },
    image(billboard) {
      const url = urlFor(billboard)
      const source = url ? images.get(url)?.texture : undefined
      if (!source) return undefined
      const texture = source.clone()
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
      texture.magFilter = texture.minFilter = billboard?.filter === "nearest" ? THREE.NearestFilter : THREE.LinearFilter
      if (billboard?.filter === "nearest") texture.generateMipmaps = false
      texture.needsUpdate = true
      return texture
    },
    dispose() {
      disposed = true
      for (const entry of images.values()) entry.texture?.dispose()
      images.clear()
    },
  }
}

function smallImage(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined
  return !!image && [image.naturalWidth ?? image.width, image.naturalHeight ?? image.height]
    .every((size) => typeof size === "number" && Number.isFinite(size) && size > 0 && size <= 1024)
}
