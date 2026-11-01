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

  it("leaves a retired legacy drawing untouched during a paper resize and restores reused materials on a switch back", () => {
    const surfaces = createPaperSurfaces()
    const legacy = new THREE.MeshLambertMaterial()
    const reused = new THREE.MeshLambertMaterial()
    const originalCompile = vi.fn()
    const originalKey = () => "host-custom-material"
    reused.onBeforeCompile = originalCompile
    reused.customProgramCacheKey = originalKey
    const legacyCompile = legacy.onBeforeCompile
    const legacyKey = legacy.customProgramCacheKey
    const scene = new THREE.Group(), oldDrawing = new THREE.Group(), newDrawing = new THREE.Group()
    oldDrawing.userData.paper = false
    newDrawing.userData.paper = true
    oldDrawing.add(new THREE.Mesh(new THREE.BoxGeometry(), legacy))
    const nested = new THREE.Group()
    nested.add(new THREE.Mesh(new THREE.BoxGeometry(), legacy))
    oldDrawing.add(nested)
    scene.add(oldDrawing, newDrawing, new THREE.Mesh(new THREE.BoxGeometry(), reused))
    surfaces.apply(scene)
    expect(legacy.onBeforeCompile).toBe(legacyCompile)
    expect(legacy.customProgramCacheKey).toBe(legacyKey)
    expect(reused.onBeforeCompile).not.toBe(originalCompile)
    expect(reused.customProgramCacheKey()).toContain("paper-pulp")
    surfaces.restore(scene)
    expect(reused.onBeforeCompile).toBe(originalCompile)
    expect(reused.customProgramCacheKey).toBe(originalKey)
    // A second paper appearance decorates the same live box again.
    surfaces.apply(scene)
    expect(reused.onBeforeCompile).not.toBe(originalCompile)
    expect(reused.customProgramCacheKey()).toBe("host-custom-material:paper-pulp-v1")
    surfaces.restore(scene)
    expect(reused.onBeforeCompile).toBe(originalCompile)
    surfaces.dispose()
  })

})
