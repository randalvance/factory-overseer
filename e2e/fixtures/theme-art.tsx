import * as THREE from "three"
import { createRoomThemeAssets } from "~/factory/roomThemeAssets"
import { createPaperSurfaces } from "~/factory/paperMaterial"
import { resolveRoomTheme } from "~/model/roomThemes"

interface ArtMeasurements {
  triangles: number
  materials: number
  vertexColoredMeshes: number
  textureDimensions: number[][]
  bounds: { min: number[]; max: number[]; size: number[] }
  renderedTriangles: number
  drawCalls: number
}
declare global { interface Window { themeArt: { loaded: boolean; measurements?: ArtMeasurements } } }
window.themeArt = { loaded: false }

const canvas = document.querySelector("canvas")!
const caption = document.querySelector("output")!
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
const surfaces = createPaperSurfaces()
const theme = resolveRoomTheme({ theme: "research-lab" })
let model: THREE.Object3D | undefined
const assets = createRoomThemeAssets(show)

function render() {
  const width = canvas.clientWidth, height = canvas.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
  if (window.themeArt.measurements) {
    window.themeArt.measurements.renderedTriangles = renderer.info.render.triangles
    window.themeArt.measurements.drawCalls = renderer.info.render.calls
  }
}
function show() {
  if (model) return
  model = assets.model(theme.assets.decoration, "decoration")
  if (!model) return
  scene.add(model)
  surfaces.apply(model)
  const bounds = new THREE.Box3().setFromObject(model)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const distance = Math.max(size.y, size.x / (canvas.clientWidth / canvas.clientHeight)) / (2 * Math.tan(THREE.MathUtils.degToRad(10))) * 1.55
  const elevation = THREE.MathUtils.degToRad(38)
  camera.position.copy(center).add(new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance))
  camera.lookAt(center)
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
  window.themeArt.measurements = {
    triangles, materials: materials.size, vertexColoredMeshes,
    textureDimensions: [...textures].map((texture) => {
      const image = texture.image as { width: number; height: number }
      return [image.width, image.height]
    }),
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
    renderedTriangles: 0, drawCalls: 0,
  }
  render()
  window.themeArt.loaded = true
  canvas.dataset.loaded = "true"
  caption.textContent = "Paper finish, open shelves and cream cut edges · 38° camera"
}
const resize = new ResizeObserver(render)
resize.observe(canvas)
assets.update([theme])
const timeout = window.setTimeout(() => {
  if (!model) caption.textContent = "The cabinet has not loaded. Confirm the pilot GLB is available."
}, 15_000)
window.addEventListener("pagehide", () => {
  clearTimeout(timeout)
  resize.disconnect()
  if (model) surfaces.restore(model)
  assets.dispose()
  surfaces.dispose()
  renderer.dispose()
}, { once: true })
