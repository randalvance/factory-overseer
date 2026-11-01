// The factory in 3D: a layout and a snapshot in, a drawing on a canvas out,
// with plain three.js behind an imperative handle (ADR 0004). The view owns
// the renderer, the camera and the render loop, and what the overseer does
// with them: panning and zooming within the floor, following a box, and
// looking under the pointer (ADR 0008); the pieces, the drawing, the agents
// and the boxes are built elsewhere.

import * as THREE from "three"
import { roomGeometryChanged, stationed } from "~/floor/layout"
import { type Motions, motionsFor } from "~/floor/motion"
import type { Layout, Rect } from "~/floor/types"
import { type AgentStatus, STATUS_ICONS, type StatusStyle } from "~/model/status"
import { comingsAndGoings, type ComingsAndGoings } from "~/floor/walk"
import type { Agent, Snapshot, Subject } from "~/model/types"
import { INSPECTOR, type Dressed, type Icons, type Settling, createAgents } from "./agents"
import { BELT_SPEED, createBoxes } from "./boxes"
import { type CameraPose, PITCH, PX_PER_TILE, clampToFloor, fitFloor, panBy, pinchBy, zoomBy, zoomStep } from "./camera"
import { type Point, attachControls } from "./controls"
import { disposeMeshes, drawFactory } from "./drawing"
import { type BeltTextures, loadPieces } from "./models"
import { nearer } from "./picking"
import { BOX_SIZE, halo } from "./pieces"
import { type Slide, startSlide } from "./slide"
import { type Wardrobes, sheetUrl } from "./sprites"
import { blankTexture, loadTexture } from "./textures"

export interface FactoryView {
  /**
   * Draw a layout with its agents and tasks, the agents looking as the
   * styling says, those who arrive walking in and those who have left fading;
   * the boxes whose place changed ride there from wherever they are. Resolves
   * with the motions played once drawn, or with none once a newer snapshot
   * has taken its place. The rides play on after that.
   */
  show(layout: Layout, snapshot: Snapshot, styling: Styling, traffic: ComingsAndGoings): Promise<Motions>
  /**
   * Draw the layout the overseer's Reorganize laid, every piece, agent,
   * tablet and box sliding from where it is to its new place in one pass, in
   * step with the belts; a box in transit rides on from the belt laid afresh
   * once there. The camera keeps its pose, within the new floor. Resolves as
   * show does.
   */
  reorganize(layout: Layout, snapshot: Snapshot, styling: Styling): Promise<Motions>
  /** Scale every belt. */
  setSpeed(speed: number): void
  /** Frame the floor's width, and the whole floor when it fits, as the view opened. A box being followed is let go. */
  fitAll(): void
  /** Put the agent's figure under the middle of the screen. A box being followed is let go. */
  focusAgent(id: string): void
  /** Keep the task's box under the middle of the screen until the overseer pans, fits all or focuses elsewhere. */
  followTask(taskId: string): void
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
  /** Called with what a click on the canvas lands on, or nothing when it lands on the floor. */
  onClick?: (picked: Subject | undefined) => void
  /** Called with the task whose box has just come to rest at the end of its ride. */
  onLanded?: (taskId: string) => void
}

const BACKGROUND = 0x0b0d12
/** How far back along its line of sight the camera sits from the point it looks at. */
const CAMERA_DISTANCE = 60
/** The longest step the clock may take between frames, so a tab coming back does not leap. */
const MAX_FRAME_S = 0.1
/** What a drawing overtaken by a newer one plays. */
const NONE: Motions = { toPlay: [], unrouted: [] }

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

  /** The belts' moving surfaces, once the pieces are loaded. */
  let belts: BeltTextures | undefined
  let drawing = new THREE.Group()
  scene.add(drawing)
  /** The pass from the drawing before to this one, while the floor slides. */
  let slide: Slide | undefined
  let disposed = false
  const waitingForSlide: (() => void)[] = []
  const finishSlideWaits = () => waitingForSlide.splice(0).forEach((done) => done())
  const agents = createAgents(scene)
  const boxes = createBoxes(scene)
  let speed = 1
  /** The box the camera keeps under the middle of the screen, until the overseer pans. */
  let following: string | undefined
  /** Where the pointer rests on the canvas, if it does; what is under it wears the halo. */
  let pointerAt: Point | undefined
  const ring = halo()
  scene.add(ring)
  const raycaster = new THREE.Raycaster()

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

  /** Look at a point of the floor, within the floor's margin. */
  function lookAt(x: number, z: number) {
    if (!pose || !floor) return
    pose = clampToFloor({ ...pose, x, z }, floor)
    aimCamera()
  }

  function fitAll() {
    following = undefined
    if (floor && visible) pose = fitFloor(floor, viewport)
    aimCamera()
  }

  /** What is under a point of the canvas: the nearer of the box and the figure on the ray through it. */
  function pickAt(point: Point): Subject | undefined {
    raycaster.setFromCamera(new THREE.Vector2((point.x / viewport.width) * 2 - 1, 1 - (point.y / viewport.height) * 2), camera)
    return nearer(boxes.pick(raycaster), agents.pick(raycaster))
  }

  /** The point under an agent's feet or a box's underside, where it is this frame. */
  function underfoot(subject: Subject): THREE.Vector3 | undefined {
    if ("agent" in subject) return agents.positionOf(subject.agent)
    const at = boxes.positionOf(subject.task)
    return at?.setY(at.y - BOX_SIZE / 2)
  }

  /** Ring whatever is under the pointer this frame: a box that rides out from under a still pointer leaves the ring behind. */
  function placeRing() {
    const hovered = pointerAt && pickAt(pointerAt)
    const at = hovered && underfoot(hovered)
    ring.visible = at !== undefined
    if (at) ring.position.set(at.x, at.y + 0.02, at.z)
  }

  const detachControls = attachControls(canvas, {
    pan(dx, dy) {
      if (!pose || !floor) return
      following = undefined
      pose = clampToFloor(panBy(pose, dx, dy), floor)
      aimCamera()
    },
    zoom(deltaY) {
      if (!pose) return
      pose = zoomBy(pose, deltaY)
      aimCamera()
    },
    pinch(from, to) {
      if (!pose) return
      pose = pinchBy(pose, from, to)
      aimCamera()
    },
    zoomStep(direction) {
      if (!pose) return
      pose = zoomStep(pose, direction)
      aimCamera()
    },
    fitAll,
    click(point) {
      const picked = pickAt(point)
      if (picked && "task" in picked) following = picked.task
      options.onClick?.(picked)
    },
    hover(point) {
      pointerAt = point
      return point !== undefined && pickAt(point) !== undefined
    },
  })

  // The belt textures repeat once per tile, so they scroll as far as the boxes ride.
  let beltTravel = 0
  let lastFrame: number | undefined
  renderer.setAnimationLoop((time) => {
    const dt = lastFrame === undefined ? 0 : Math.min((time - lastFrame) / 1000, MAX_FRAME_S)
    lastFrame = time
    if (slide?.tick(dt, speed)) {
      slide = undefined
      finishSlideWaits()
      // The floor has settled; the camera keeps its pose, within the floor as it now is.
      if (pose && floor) {
        pose = clampToFloor(pose, floor)
        aimCamera()
      }
    }
    const landings = boxes.tick(dt, speed)
    agents.tick(dt, speed, landings)
    for (const landing of landings) options.onLanded?.(landing.taskId)
    beltTravel += dt * BELT_SPEED * speed
    if (belts) for (const surface of [belts.forward, belts.rework]) surface.offset.x = -beltTravel % 1
    if (following) {
      const at = boxes.positionOf(following)
      if (at) lookAt(at.x, at.z)
      else following = undefined
    }
    placeRing()
    if (visible) renderer.render(scene, camera)
  })

  let generation = 0
  /**
   * Whether the floor has been laid afresh since the last drawing: Reorganize
   * was asked for and is not drawn yet, so the next drawing slides, even a
   * snapshot's that overtook it.
   */
  let laidAfresh = false

  /** The sheets, icons and pieces a snapshot needs, or nothing once a newer one has been asked for while they loaded. */
  async function dressed(layout: Layout, snapshot: Snapshot, styling: Styling): Promise<Dressed | undefined> {
    const call = ++generation
    const [sheets, icons, pieces] = await Promise.all([
      sheetsOf(layout, snapshot.agents, assetBase, styling.wardrobes),
      iconsAt(assetBase),
      loadPieces(`${assetBase}assets/models/pieces.glb`),
    ])
    return call === generation ? { sheets, looks: { styles: styling.styles, icons }, pieces } : undefined
  }

  async function show(layout: Layout, snapshot: Snapshot, styling: Styling, traffic: ComingsAndGoings): Promise<Motions> {
    const ready = await dressed(layout, snapshot, styling)
    // A newer snapshot arrived while the sheets loaded; it will be drawn instead.
    if (!ready) return NONE
    const call = generation
    // Finish one coherent room resize before accepting another snapshot.
    // Newer snapshots supersede older waiters instead of snapping midway.
    if (layout.rooms && slide) await new Promise<void>((resolve) => waitingForSlide.push(resolve))
    if (disposed || call !== generation) return NONE
    const glide = laidAfresh || roomGeometryChanged(shown, layout)
    return draw(layout, snapshot, ready, layout.rooms ? comingsAndGoings(shown, layout) : traffic, glide ? "glide" : "stand")
  }

  async function reorganize(layout: Layout, snapshot: Snapshot, styling: Styling): Promise<Motions> {
    laidAfresh = true
    const ready = await dressed(layout, snapshot, styling)
    if (!ready) return NONE
    const call = generation
    if (layout.rooms && slide) await new Promise<void>((resolve) => waitingForSlide.push(resolve))
    if (disposed || call !== generation) return NONE
    return draw(layout, snapshot, ready, layout.rooms ? comingsAndGoings(shown, layout) : { arrivals: [], departures: [] }, "glide")
  }

  /** Draw the layout in place of the one shown, everything standing where it now is at once, or gliding there as the drawing slides. */
  function draw(layout: Layout, snapshot: Snapshot, ready: Dressed, traffic: ComingsAndGoings, settling: Settling): Motions {
    floor = layout.bounds
    slide?.end()
    const stood = drawing
    belts = ready.pieces.belts
    drawing = drawFactory(layout, ready.pieces)
    scene.add(drawing)
    if (settling === "glide") {
      slide = startSlide(stood, drawing)
    } else {
      slide = undefined
      scene.remove(stood)
      disposeMeshes(stood)
    }
    agents.update(layout, snapshot, ready, traffic, settling)
    // Derived only now, after the wait, so rides still playing are picked up from where they are, or from where the slide leaves them.
    const slid = settling === "glide" && shown ? boxes.tilesAfterSlide(shown, layout) : undefined
    const motions = motionsFor(layout, slid ?? boxes.tiles(), shown)
    boxes.update(layout, snapshot.tasks, motions.toPlay, ready.pieces, slid, layout.routing ? new Set(motions.unrouted) : undefined)
    shown = layout
    laidAfresh = false
    aimCamera()
    if (visible) renderer.render(scene, camera)
    return motions
  }

  function dispose() {
    disposed = true
    generation++
    finishSlideWaits()
    renderer.setAnimationLoop(null)
    observer.disconnect()
    detachControls()
    slide?.end()
    disposeMeshes(drawing)
    disposeMeshes(ring)
    agents.dispose()
    boxes.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return {
    show,
    reorganize,
    setSpeed: (next) => {
      speed = next
    },
    fitAll,
    focusAgent(id) {
      following = undefined
      const at = agents.positionOf(id)
      if (at) lookAt(at.x, at.z)
    },
    followTask(taskId) {
      following = taskId
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
