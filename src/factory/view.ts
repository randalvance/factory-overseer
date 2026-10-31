// The factory in 3D: a layout and a snapshot in, a drawing on a canvas out,
// with plain three.js behind an imperative handle (ADR 0004). The view owns
// the renderer, the camera and the render loop; the pieces, the drawing, the
// agents and the boxes are built elsewhere.

import * as THREE from "three"
import { stationed } from "~/floor/layout"
import { type Motions, motionsFor } from "~/floor/motion"
import type { Layout, Rect } from "~/floor/types"
import { type AgentStatus, STATUS_ICONS, type StatusStyle } from "~/model/status"
import type { ComingsAndGoings } from "~/floor/walk"
import type { Agent, Snapshot } from "~/model/types"
import { INSPECTOR, type Icons, createAgents } from "./agents"
import { BELT_SPEED, createBoxes } from "./boxes"
import { type CameraPose, PITCH, PX_PER_TILE, clampToFloor, fitFloor, panBy, zoomBy } from "./camera"
import { attachControls } from "./controls"
import { disposeMeshes, drawFactory } from "./drawing"
import { type Wardrobes, sheetUrl } from "./sprites"
import { beltTexture, blankTexture, loadTexture, returnBeltTexture } from "./textures"

export interface FactoryView {
  /**
   * Draw a layout with its agents and tasks, the agents looking as the
   * styling says, those who arrive walking in and those who have left fading;
   * the boxes whose place changed ride there from wherever they are. Resolves
   * with the motions played once drawn, or with none once a newer snapshot
   * has taken its place. The rides play on after that.
   */
  show(layout: Layout, snapshot: Snapshot, styling: Styling, traffic: ComingsAndGoings): Promise<Motions>
  /** Scale every belt. */
  setSpeed(speed: number): void
  dispose(): void
}

/** How the host wants agents to look. */
export interface Styling {
  /** What each status looks like, resolved. */
  styles: Readonly<Record<AgentStatus, StatusStyle>>
  /** The stock sheets each role draws from, over the defaults. */
  wardrobes: Wardrobes
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
  /** The last layout drawn, so the next one's motions know where every box rested. */
  let shown: Layout | undefined

  const surfaces = { forward: beltTexture(), rework: returnBeltTexture() }
  let drawing = new THREE.Group()
  scene.add(drawing)
  const agents = createAgents(scene)
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

  // The belt textures repeat once per tile, so they scroll as far as the boxes ride.
  let beltTravel = 0
  let lastFrame: number | undefined
  renderer.setAnimationLoop((time) => {
    const dt = lastFrame === undefined ? 0 : Math.min((time - lastFrame) / 1000, MAX_FRAME_S)
    lastFrame = time
    agents.tick(dt, speed, boxes.tick(dt, speed))
    beltTravel += dt * BELT_SPEED * speed
    for (const surface of Object.values(surfaces)) surface.offset.x = -beltTravel % 1
    if (visible) renderer.render(scene, camera)
  })

  let generation = 0

  async function show(layout: Layout, snapshot: Snapshot, styling: Styling, traffic: ComingsAndGoings): Promise<Motions> {
    const call = ++generation
    const [sheets, icons] = await Promise.all([
      sheetsOf(layout, snapshot.agents, assetBase, styling.wardrobes),
      iconsAt(assetBase),
    ])
    // A newer snapshot arrived while the sheets loaded; it will be drawn instead.
    if (call !== generation) return { toPlay: [], unrouted: [] }

    floor = layout.bounds
    scene.remove(drawing)
    disposeMeshes(drawing)
    drawing = drawFactory(layout, surfaces)
    scene.add(drawing)
    agents.update(layout, snapshot, sheets, { styles: styling.styles, icons }, traffic)
    // Planned only now, after the wait, so rides still playing are picked up from where they are.
    const motions = motionsFor(layout, boxes.tiles(), shown)
    boxes.update(layout, snapshot.tasks, motions.toPlay)
    shown = layout
    aimCamera()
    if (visible) renderer.render(scene, camera)
    return motions
  }

  function dispose() {
    generation++
    renderer.setAnimationLoop(null)
    observer.disconnect()
    detachControls()
    disposeMeshes(drawing)
    agents.dispose()
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

/** Enough of an agent to pick its sheet. */
type Wearer = Pick<Agent, "id" | "role" | "sprite">

/** The sheet of every agent the layout has a station for, by agent id, and the inspector's while there is a staging area. */
async function sheetsOf(
  layout: Layout,
  agents: Agent[],
  assetBase: string,
  wardrobes: Wardrobes,
): Promise<Map<string, THREE.Texture>> {
  const standing: Wearer[] = stationed(layout, agents).flatMap(({ agent }) => (agent ? [agent] : []))
  if (layout.staging) standing.push(INSPECTOR)
  const sheets = await Promise.all(standing.map((wearer) => sheetOf(wearer, assetBase, wardrobes)))
  return new Map(standing.map((wearer, i) => [wearer.id, sheets[i]!]))
}

/** The agent's own sheet, or the one derived from its id when its own cannot be loaded. */
function sheetOf(agent: Wearer, assetBase: string, wardrobes: Wardrobes): Promise<THREE.Texture> {
  const own = sheetUrl(agent, assetBase, wardrobes)
  const fallback = sheetUrl({ id: agent.id, role: agent.role }, assetBase, wardrobes)
  return loadTexture(own).catch((error: unknown) => {
    if (own === fallback) throw error
    console.warn(`Agent ${agent.id} wears ${fallback}: its sheet ${own} could not be loaded`, error)
    return loadTexture(fallback)
  })
}

/** The status icons, loaded from under the base path. One that cannot be loaded shows nothing, rather than stopping the floor. */
async function iconsAt(assetBase: string): Promise<Icons> {
  const loaded = await Promise.all(
    STATUS_ICONS.map(async (name) => {
      const url = `${assetBase}assets/icons/${name}.png`
      const texture = await loadTexture(url).catch((error: unknown) => {
        console.warn(`The ${name} icon at ${url} could not be loaded, so it is not shown`, error)
        return blankTexture()
      })
      return [name, texture] as const
    }),
  )
  return Object.fromEntries(loaded) as Icons
}
