// The factory in 3D: a layout and a snapshot in, a drawing on a canvas out,
// with plain three.js behind an imperative handle (ADR 0004). The view owns
// the renderer, the camera and the render loop; the pieces and the drawing
// are built elsewhere.

import * as THREE from "three"
import { type Motions, motionsFor } from "~/floor/motion"
import type { Layout, Rect } from "~/floor/types"
import type { Agent, Snapshot } from "~/model/types"
import { BELT_SPEED, createBoxes } from "./boxes"
import { type CameraPose, PITCH, PX_PER_TILE, clampToFloor, fitFloor, panBy, zoomBy } from "./camera"
import { attachControls } from "./controls"
import { type Seated, disposeDrawing, drawFactory } from "./drawing"
import { sheetUrl } from "./sprites"
import { beltTexture, loadSheet } from "./textures"

export interface FactoryView {
  /**
   * Draw a layout with its agents and tasks; the boxes whose place changed
   * ride there from wherever they are. Resolves with the motions played once
   * drawn, or with none once a newer snapshot has taken its place. The rides
   * play on after that.
   */
  show(layout: Layout, snapshot: Snapshot): Promise<Motions>
  /** Scale every belt. */
  setSpeed(speed: number): void
  dispose(): void
}

export interface FactoryViewOptions {
  /** The app's base path, where the stock sheets are served from. */
  assetBase?: string
}

const BACKGROUND = 0x0b0d12
/** How far back along its line of sight the camera sits from the point it looks at. */
const CAMERA_DISTANCE = 60
/** The longest step the clock may take between frames, so a tab coming back does not leap. */
const MAX_FRAME_S = 0.1

export function createFactoryView(mount: HTMLElement, options: FactoryViewOptions = {}): FactoryView {
  const assetBase = options.assetBase ?? "/"
  const canvas = document.createElement("canvas")
  mount.append(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(BACKGROUND)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xe8eef7, 0x3a3e47, 1.2))
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5)
  sun.position.set(5, 12, 8)
  scene.add(sun)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 3)
  let viewport = { width: 0, height: 0 }
  /** False while the mount has no size, as when the demo hides it; nothing is drawn then. */
  let visible = false
  let floor: Rect | undefined
  let pose: CameraPose | undefined

  const belt = beltTexture()
  let drawing = new THREE.Group()
  scene.add(drawing)
  const boxes = createBoxes(scene)
  let speed = 1

  /** Frame the whole line once both the floor and the viewport are known; from then on keep the camera on its pose. */
  function aimCamera() {
    if (!pose && floor && visible) pose = fitFloor(floor, viewport)
    if (!pose) return
    const halfW = viewport.width / PX_PER_TILE / 2
    const halfH = viewport.height / PX_PER_TILE / 2
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.zoom = pose.zoom
    camera.position.set(pose.x, CAMERA_DISTANCE * Math.sin(PITCH), pose.z + CAMERA_DISTANCE * Math.cos(PITCH))
    camera.lookAt(pose.x, 0, pose.z)
    camera.updateProjectionMatrix()
  }

  function resize() {
    const width = mount.clientWidth
    const height = mount.clientHeight
    visible = width > 0 && height > 0
    if (!visible) return
    viewport = { width, height }
    renderer.setSize(width, height, false)
    aimCamera()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  const detachControls = attachControls(canvas, {
    pan(dx, dy) {
      if (!pose || !floor) return
      pose = clampToFloor(panBy(pose, dx, dy), floor)
      aimCamera()
    },
    zoom(deltaY) {
      if (!pose) return
      pose = zoomBy(pose, deltaY)
      aimCamera()
    },
  })

  // The belt texture repeats once per tile, so it scrolls as far as the boxes ride.
  let beltTravel = 0
  let lastFrame: number | undefined
  renderer.setAnimationLoop((time) => {
    const dt = lastFrame === undefined ? 0 : Math.min((time - lastFrame) / 1000, MAX_FRAME_S)
    lastFrame = time
    boxes.tick(dt, speed)
    beltTravel += dt * BELT_SPEED * speed
    belt.offset.x = -beltTravel % 1
    if (visible) renderer.render(scene, camera)
  })

  let generation = 0

  async function show(layout: Layout, snapshot: Snapshot): Promise<Motions> {
    const call = ++generation
    const seated = await seatedAgents(layout, snapshot.agents, assetBase)
    // A newer snapshot arrived while the sheets loaded; it will be drawn instead.
    if (call !== generation) return { toPlay: [], unrouted: [] }

    floor = layout.bounds
    scene.remove(drawing)
    disposeDrawing(drawing)
    drawing = drawFactory(layout, seated, belt)
    scene.add(drawing)
    // Planned only now, after the wait, so rides still playing are picked up from where they are.
    const motions = motionsFor(layout, boxes.tiles())
    boxes.update(layout, snapshot.tasks, motions.toPlay)
    aimCamera()
    if (visible) renderer.render(scene, camera)
    return motions
  }

  function dispose() {
    generation++
    renderer.setAnimationLoop(null)
    observer.disconnect()
    detachControls()
    disposeDrawing(drawing)
    boxes.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return {
    show,
    setSpeed: (next) => {
      speed = next
    },
    dispose,
  }
}

/** Every station that has an agent, with that agent's sheet loaded. */
async function seatedAgents(layout: Layout, agents: Agent[], assetBase: string): Promise<Seated[]> {
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  const stations = layout.bays.flatMap((bay) => bay.stations)
  const seated = stations.flatMap((station) => {
    const agent = station.agentId === null ? undefined : byId.get(station.agentId)
    return agent ? [{ station, agent }] : []
  })
  const sheets = await Promise.all(seated.map(({ agent }) => sheetFor(agent, assetBase)))
  return seated.map(({ station }, i) => ({ station, sheet: sheets[i]! }))
}

/** The agent's own sheet, or the stock sheet derived from its id when its own cannot be loaded. */
function sheetFor(agent: Agent, assetBase: string): Promise<THREE.Texture> {
  const own = sheetUrl(agent, assetBase)
  const fallback = sheetUrl({ id: agent.id }, assetBase)
  return loadSheet(own).catch((error: unknown) => {
    if (own === fallback) throw error
    console.warn(`Agent ${agent.id} wears ${fallback}: its sheet ${own} could not be loaded`, error)
    return loadSheet(fallback)
  })
}
