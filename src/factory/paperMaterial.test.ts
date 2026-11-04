import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"
import { createPaperSurfaces, paperPulpTexture } from "./paperMaterial"

describe("paper surfaces", () => {
  it("uses repeatable pulp, fiber and grain channels with mipmaps for distant views", () => {
    const first = paperPulpTexture(), second = paperPulpTexture()
    expect(first.image.data).toEqual(second.image.data)
    const samples = Array.from(first.image.data as Uint8Array)
    expect(new Set(samples.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(70)
    expect(new Set(samples.filter((_, i) => i % 4 === 1)).size).toBeGreaterThan(2)
    expect(first.wrapS).toBe(THREE.RepeatWrapping)
    expect(first.generateMipmaps).toBe(true)
    first.dispose(); second.dispose()
  })

  it("preserves printed maps and text, decorates shared materials once and owns one texture", () => {
    const surfaces = createPaperSurfaces()
    const map = new THREE.Texture()
    const lit = new THREE.MeshLambertMaterial({ map })
    const text = new THREE.MeshBasicMaterial({ map })
    const textCompile = text.onBeforeCompile
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), lit), new THREE.Mesh(new THREE.BoxGeometry(), lit), new THREE.Mesh(new THREE.PlaneGeometry(), text))
    surfaces.apply(root)
    const compile = lit.onBeforeCompile
    surfaces.apply(root)
    expect(lit.onBeforeCompile).toBe(compile)
    expect(lit.map).toBe(map)
    expect(text.onBeforeCompile).toBe(textCompile)
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }
    lit.onBeforeCompile(shader as Parameters<THREE.Material["onBeforeCompile"]>[0], {} as THREE.WebGLRenderer)
    const owned = (shader.uniforms as Record<string, { value: THREE.Texture }>).paperPulp!.value
    const dispose = vi.spyOn(owned, "dispose")
    const mapDispose = vi.spyOn(map, "dispose")
    surfaces.dispose()
    expect(dispose).toHaveBeenCalledOnce()
    expect(mapDispose).not.toHaveBeenCalled()
  })

  it("preserves host shader extensions while adding paper grain once", () => {
    const surfaces = createPaperSurfaces()
    const material = new THREE.MeshLambertMaterial()
    const originalCompile = vi.fn()
    material.onBeforeCompile = originalCompile
    material.customProgramCacheKey = () => "host-custom-material"
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
    surfaces.apply(scene)
    surfaces.apply(scene)
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }
    const renderer = {} as THREE.WebGLRenderer
    material.onBeforeCompile(shader as Parameters<THREE.Material["onBeforeCompile"]>[0], renderer)
    expect(originalCompile).toHaveBeenCalledExactlyOnceWith(shader, renderer)
    expect(material.customProgramCacheKey()).toBe("host-custom-material:paper-pulp-v1")
    surfaces.dispose()
  })
})
