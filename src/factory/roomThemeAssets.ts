import { resolveAssetUrl } from "./assetUrl"
import * as THREE from "three"
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js"
import { ROOM_THEME_SLOTS, type ResolvedRoomTheme, type RoomModelAsset } from "~/model/roomThemes"
import { shareResource } from "./models"

export interface ThemeAssets {
  update(themes: Iterable<ResolvedRoomTheme>): void
  model(asset: RoomModelAsset | undefined, slot: "station" | "decoration"): THREE.Object3D | undefined
  floor(url: string | undefined, width: number, depth: number): THREE.Texture | undefined
  dispose(): void
}

/** Per-view cache: at most 32 model/floor URLs are admitted, including failed
 * loads. Additional URLs retain procedural art. Resources stay alive until
 * the view closes, so a room changing theme cannot invalidate another room.
 * Model copies share cache resources; callers own/dispose floor clones.
 */
export function createRoomThemeAssets(onChange: () => void, base = "/"): ThemeAssets {
  let disposed = false
  const owned = new Set<Resource>(), released = new WeakSet<Resource>(), closedImages = new WeakSet<object>()
  const release = (resource: Resource) => {
    if (released.has(resource)) return
    released.add(resource); owned.delete(resource); resource.dispose()
    if (resource instanceof THREE.Texture) for (const image of textureImages(resource)) {
      if (closedImages.has(image) || typeof image.close !== "function") continue
      // Another accepted texture may use the same bitmap. A host-enabled
      // THREE.Cache owns its globally cached bitmaps outside this view.
      if ([...owned].some((other) => other instanceof THREE.Texture && textureImages(other).includes(image))) continue
      if (THREE.Cache.enabled && Object.values(THREE.Cache.files).includes(image)) continue
      closedImages.add(image); image.close()
    }
  }
  const models = new Map<string, THREE.Object3D | undefined>()
  const floors = new Map<string, THREE.Texture | undefined>()
  const loader = new GLTFLoader(), textures = new THREE.TextureLoader()
  return {
    update(themes) {
      if (disposed) return
      for (const theme of themes) {
        const url = theme.assets.floor?.trim() ? resolveAssetUrl(theme.assets.floor.trim(), base) : undefined
        if (url && !floors.has(url) && floors.size + models.size < 32) {
          floors.set(url, undefined)
          void textures.loadAsync(url).then((texture) => {
            if (disposed || !smallTexture(texture)) { release(texture); return }
            owned.add(texture); floors.set(url, texture); onChange()
          }).catch(() => {})
        }
        for (const slot of ["station", "decoration"] as const) {
          const asset = theme.assets[slot]
          if (!validAsset(asset, slot)) continue
          const url = resolveAssetUrl(asset.url, base)
          if (models.has(url) || floors.size + models.size >= 32) continue
          models.set(url, undefined)
          void loader.loadAsync(url).then((gltf) => {
            const resources = modelResources(gltf)
            if (disposed || !compatibleModel(gltf)) { resources.forEach(release); return }
            resources.forEach((resource) => owned.add(resource))
            const converted = new Map<THREE.Material, THREE.Material>()
            gltf.scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return
              shareResource(object.geometry)
              const convert = (source: THREE.Material) => {
                let material = converted.get(source)
                if (!material) {
                  const lit = source as THREE.MeshStandardMaterial
                  material = new THREE.MeshLambertMaterial({ color: lit.color ?? 0xffffff, map: lit.map ?? null, emissive: lit.emissive ?? 0x000000, emissiveMap: lit.emissiveMap ?? null, emissiveIntensity: lit.emissiveIntensity ?? 1, transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest, side: source.side, vertexColors: source.vertexColors })
                  shareResource(material); owned.add(material)
                  converted.set(source, material); release(source)
                }
                return material
              }
              object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material)
            })
            models.set(url, gltf.scene); onChange()
          }).catch(() => {})
        }
      }
    },
    model(asset, slot) {
      if (!validAsset(asset, slot)) return undefined
      const source = models.get(resolveAssetUrl(asset.url, base))
      if (!source) return undefined
      const bounds = new THREE.Box3().setFromObject(source)
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
      const copy = source.clone(true)
      copy.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z))
      const result = new THREE.Group(); result.add(copy)
      result.scale.setScalar(Math.min(asset.footprint.width / size.x, asset.footprint.height / size.y, asset.footprint.depth / size.z))
      return result
    },
    floor(url, width, depth) {
      const source = url ? floors.get(resolveAssetUrl(url, base)) : undefined
      if (!source || ![width, depth].every((value) => Number.isFinite(value) && value > 0)) return undefined
      const texture = source.clone()
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(width / 2, depth / 2)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      return texture
    },
    dispose() { disposed = true; models.clear(); floors.clear(); owned.forEach(release) },
  }
}

function validAsset(asset: RoomModelAsset | undefined, slot: keyof typeof ROOM_THEME_SLOTS): asset is RoomModelAsset {
  if (!asset?.url.trim() || !asset.footprint) return false
  const values = [asset.footprint.width, asset.footprint.height, asset.footprint.depth]
  return values.every((value, index) => Number.isFinite(value) && value > 0 && value <= ROOM_THEME_SLOTS[slot].size[index]!)
}

function smallTexture(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | undefined
  return !!image && [image.width, image.height].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1024)
}
function materialTextures(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture)
}
function compatibleModel(gltf: GLTF): boolean {
  if (gltf.animations.length || gltf.cameras.length) return false
  let compatible = true, triangles = 0
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Camera || object instanceof THREE.Light || object instanceof THREE.SkinnedMesh || object instanceof THREE.Bone || object instanceof THREE.InstancedMesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) compatible = false
    if (![...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()].every(Number.isFinite)) compatible = false
    if (!(object instanceof THREE.Mesh)) return
    const positions = object.geometry.getAttribute("position")
    if (!positions) { compatible = false; return }
    triangles += (object.geometry.index?.count ?? positions.count) / 3
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (materials.some((material) => materialTextures(material).some((texture) => !smallTexture(texture)))) compatible = false
  })
  if (!compatible || triangles === 0 || triangles > 10_000) return false
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3())
  return size.toArray().every((value) => Number.isFinite(value) && value > 0)
}

type Resource = THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh
function modelResources(gltf: GLTF): Set<Resource> {
  const resources = new Set<Resource>()
  for (const scene of new Set([gltf.scene, ...gltf.scenes])) scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) resources.add(object)
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return
    resources.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material)
      materialTextures(material).forEach((texture) => resources.add(texture))
    }
  })
  return resources
}

function textureImages(texture: THREE.Texture): Array<{ close?: () => void }> {
  const images: unknown[] = Array.isArray(texture.image) ? texture.image : [texture.image]
  return images.filter((image): image is { close?: () => void } => typeof image === "object" && image !== null)
}
