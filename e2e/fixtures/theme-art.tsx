import * as THREE from "three"
import { createRoomThemeAssets } from "~/factory/roomThemeAssets"
import { createPaperSurfaces } from "~/factory/paperMaterial"
import { resolveRoomTheme, ROOM_THEMES, type ResolvedRoomTheme } from "~/model/roomThemes"

interface ArtMeasurements {
  triangles: number
  materials: number
  vertexColoredMeshes: number
  textureDimensions: number[][]
  bounds: { min: number[]; max: number[]; size: number[] }
  renderedTriangles: number
  drawCalls: number
}
declare global { interface Window { themeArt: { loaded: boolean; assets: Record<string, ArtMeasurements>; measurements?: ArtMeasurements } } }
window.themeArt = { loaded: false, assets: {} }

const selected = new URLSearchParams(location.search).get("theme")
const themes = Object.keys(ROOM_THEMES).filter((id) => !selected || selected === id).map((theme) => resolveRoomTheme({ theme }))
const gallery = document.querySelector("#gallery")!
const caption = document.querySelector("output")!
const surfaces = createPaperSurfaces()
const assets = createRoomThemeAssets(show)
if (themes.length === 1) gallery.classList.add("single")
const views = themes.map(createView)

function createView(theme: ResolvedRoomTheme) {
  const panel = document.createElement("article")
  const heading = document.createElement("h2")
  const link = document.createElement("a")
  link.href = `?theme=${theme.id}`
  link.textContent = theme.label
  heading.append(link)
  const canvas = document.createElement("canvas")
  canvas.setAttribute("role", "img")
  canvas.setAttribute("aria-label", `${theme.label} furnishing at the factory camera angle`)
  canvas.dataset.loaded = "false"
  panel.append(heading, canvas)
  gallery.append(panel)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0xf6f0e6)
  const scene = new THREE.Scene()
  // Match the paper branch in the factory view, including its soft fill.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcae94, 2.0))
  const sun = new THREE.DirectionalLight(0xffffff, .9)
  sun.position.set(-12, 30, 15)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(20, 1, .01, 100)
  let model: THREE.Object3D | undefined
  let bounds: THREE.Box3 | undefined
  function render() {
    const width = canvas.clientWidth, height = canvas.clientHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (bounds) {
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(10))) * 1.55
      const elevation = THREE.MathUtils.degToRad(38)
      camera.position.copy(center).add(new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance))
      camera.lookAt(center)
    }
    renderer.render(scene, camera)
    const measurements = window.themeArt.assets[theme.id]
    if (measurements) {
      measurements.renderedTriangles = renderer.info.render.triangles
      measurements.drawCalls = renderer.info.render.calls
    }
  }
  const resize = new ResizeObserver(render)
  resize.observe(canvas)
  return {
    load() {
      if (model) return
      model = assets.model(theme.assets.decoration, "decoration")
      if (!model) return
      scene.add(model)
      surfaces.apply(model)
      bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      let triangles = 0, vertexColoredMeshes = 0
      const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3
        if (object.geometry.hasAttribute("color")) vertexColoredMeshes++
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material)
          if (material instanceof THREE.MeshLambertMaterial && material.map) textures.add(material.map)
        }
      })
      const measurements: ArtMeasurements = {
        triangles, materials: materials.size, vertexColoredMeshes,
        textureDimensions: [...textures].map((texture) => {
          const image = texture.image as { width: number; height: number }
          return [image.width, image.height]
        }),
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
        renderedTriangles: 0, drawCalls: 0,
      }
      window.themeArt.assets[theme.id] = measurements
      if (themes.length === 1) window.themeArt.measurements = measurements
      render()
      canvas.dataset.loaded = "true"
    },
    dispose() {
      resize.disconnect()
      if (model) surfaces.restore(model)
      renderer.dispose()
    },
  }
}
function show() {
  for (const view of views) view.load()
  window.themeArt.loaded = themes.length > 0 && Object.keys(window.themeArt.assets).length === themes.length
  if (window.themeArt.loaded) caption.textContent = "Paper colors, cut edges and distinct silhouettes · 38° camera"
}
assets.update(themes)
const timeout = window.setTimeout(() => {
  if (!window.themeArt.loaded) caption.textContent = "A furnishing has not loaded. Confirm the theme GLBs are available."
}, 15_000)
window.addEventListener("pagehide", () => {
  clearTimeout(timeout)
  for (const view of views) view.dispose()
  assets.dispose()
  surfaces.dispose()
}, { once: true })
