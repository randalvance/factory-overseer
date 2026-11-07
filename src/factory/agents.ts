// The agents on the floor and the tablets on the benches. Like the boxes,
// they stay from one snapshot to the next: a status change shows on the same
// figure as a new pose, icon, bubble and tablet face, and a check shown once
// stays brief. An agent that arrives walks in from the door; one that has
// left fades where it stands. When the overseer reorganizes, every figure
// and tablet glides to where its
// station now is, in step with the floor. Nothing here is laid out: every
// agent stands where the layout puts its station, and the floor core says
// who comes and goes. The one exception has no station: the host's main
// agent roams the open paper between the rooms, pausing by them, on strolls
// the floor core plans and this layer only walks.

import * as THREE from "three"
import { stationed } from "~/floor/layout"
import { type Ground, type Spot, type Whereabouts, nearestOpen, nextStroll, roamingGround } from "~/floor/roam"
import { directionBetween, sameTile, tileKey } from "~/floor/tiles"
import type { Direction, Layout, Station, Tile } from "~/floor/types"
import type { ComingsAndGoings } from "~/floor/walk"
import { type AgentStatus, type StatusIcon, type StatusStyle, bubbleText } from "~/model/status"
import type { Agent, Snapshot, Task } from "~/model/types"
import { type Candidate, nearestOf } from "./picking"
import { disposeMeshes } from "./drawing"
import type { Pieces } from "./models"
import { type Glide, glide, startGlide } from "./slide"
import {
  BOX_SIZE,
  ICON_SIZE,
  type TabletPiece,
  agentSprite,
  bubble,
  spark,
  statusIcon,
  tablet,
  tileCenter,
} from "./pieces"
import { type Facing, sheetFrame } from "./sprites"
import { PAPER_PITCH } from "./camera"
import { PAPER_BELT_H } from "./paperConveyors"
import { PAPER_GROUND_Y } from "./paperGround"
import { createPaperCharacters, PAPER_AGENT_H } from "./paperCharacters"
import { type TabletLook, tabletTexture } from "./tablets"
import type { PetAnimations } from "./petAssets"
import { petBodyPose, petFrame, petMotionState } from "./petMotion"

export type StatusStyles = Readonly<Record<AgentStatus, StatusStyle>>
/** How the figures and tablets already on the floor get to their stations: standing there at once, or gliding there while the floor slides. */
export type Settling = "stand" | "glide"
/** The icon textures, loaded, by the name the style table uses. */
export type Icons = Readonly<Record<Exclude<StatusIcon, "none">, THREE.Texture>>

/** How agents look in each status: the resolved style table and the icons it names. */
export interface StatusLooks {
  styles: StatusStyles
  icons: Icons
}

/** What a snapshot's figures wear and how they look, and the pieces their tablets are, all loaded. */
export interface Dressed {
  pets: ReadonlyMap<string, THREE.Texture>
  styles: StatusStyles
  pieces: Pieces
}

export interface AgentsOptions {
  /** Called as the main agent sets out for a spot, gets there, or comes to a stop short of one. */
  onRoam?: (id: string, whereabouts: Whereabouts) => void
}

export interface Agents {
  /**
   * Stand every agent the layout has a station for at it, in its sheet,
   * looking as its status says, and give every bench a tablet. Those who
   * arrive walk in from the door along their way in; those who have left,
   * and any other figure without a station or a sheet, fade. The tablets of
   * benches no longer laid out go. While the floor slides, as the overseer's
   * Reorganize has it, every figure and tablet already there glides to its
   * station instead of standing there at once. The snapshot's main agent,
   * which has no station, roams the open paper instead.
   */
  update(layout: Layout, snapshot: Snapshot, dressed: Dressed, traffic: ComingsAndGoings, settling?: Settling): void
  /**
   * Carry every walk, fade, pose, jump, spark and tablet dt seconds on.
   * Walks are scaled with the belts; a status, and the main agent's stroll,
   * play in real seconds.
   */
  tick(dt: number, speed: number): void
  /** The nearest figure on the ray, by agent id. A figure fading out is past clicking. */
  pick(raycaster: THREE.Raycaster): Candidate | undefined
  /** Where the agent's feet are now, in the scene. */
  positionOf(id: string): THREE.Vector3 | undefined
  dispose(): void
}

/** Seconds each work pose is held. */
const WORK_BEAT = 0.35
/** Seconds per jump. */
const JUMP_PERIOD = 0.6
/** Tiles a jump rises. */
const JUMP_H = 0.3
/** Seconds a check stays over the head once a status shows one. */
const CHECK_FOR = 2.5
const SPARKS_PER_AGENT = 5
/** Tiles per second squared, pulling sparks back down. */
const GRAVITY = 4
/** Tablet faces the lines scroll by in a second. */
const LINES_PER_S = 0.5
/** The sheet columns of each pose. */
const COLUMN = { stand: 0, step: 1, raisedArm: 3, armForward: 4, hurt: 5 }
/** The walk cycle's columns, one foot forward then the other. */
const WALK_CYCLE = [0, 1, 2, 1]
/** Tiles walked in a second at speed 1. */
const WALK_SPEED = 3
/** Walk frames a second. */
const WALK_FPS = 8
/** Seconds an agent that has left takes to fade. */
const FADE_S = 1
/** Tiles the main agent strolls in a second, in real time: an amble, however fast the belts run. */
const ROAM_SPEED = 1.7
/** Seconds the main agent pauses at a spot, at the least and at the most. */
const PAUSE_S = { least: 1.5, most: 4 }
/** The sheet row that faces the way an agent steps. */
const FACING: Record<Direction, Facing> = { e: "right", w: "left", s: "down", n: "up" }
/** Sheets and icons are cut out at half alpha. */
const CUTOUT = 0.5

interface Spark {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  /** Seconds since it flew; at its life it flies again. */
  age: number
  life: number
}

/** One agent as drawn: its body, what floats over its head, and its sparks. */
interface Figure {
  agent: Agent
  /** At the agent's tile; holds the body, the icon and the bubble. */
  group: THREE.Group
  body: THREE.Sprite
  height: number
  artKey?: string
  staticImage: boolean
  pet: boolean
  baseScale: THREE.Vector3
  needsHuman: boolean
  /** The body's own copy of its sheet, offset to the cell of its pose. */
  frame: THREE.Texture
  icon: THREE.Sprite
  bubble?: { text: string; sprite: THREE.Sprite }
  /** Over the bench, in floor coordinates, so they are not children of the group. */
  sparks: Spark[]
  /** Whether the sparks fly: the agent is working and has a box on its bench. */
  sparking: boolean
  bench: Tile
  /** Where it stands once in: its station's agent tile. */
  home: THREE.Vector3
  style: StatusStyle
  /** Seconds in the current status. */
  inStatus: number
  /** Seconds on its own clock, started at random so a bay does not jump in step. */
  clock: number
  /** The way it faces: the camera, or the way it steps while walking in. */
  facing: Facing
  /** Its way in from the door and how far along it is, in tiles, while it walks. */
  walk?: { wayIn: Tile[]; progress: number }
  /** Seconds into its fade, once it has left. */
  fading?: number
  /** Its way to its station while the floor slides. */
  glide?: Glide
  /** The main agent's roaming; no other figure has it. */
  roam?: Roam
}

/** Where the main agent may walk and where it is: on a stroll to a spot, or pausing, or held where it stands. */
interface Roam {
  ground: Ground
  /** The tile it stands on, or set out from. */
  at: Tile
  /** The spot it is going to, its way there, and how far along it is in tiles, while it strolls. */
  stroll?: { spot: Spot; path: Tile[]; progress: number }
  /** The spot it is at, once there. */
  spot?: Spot
  /** Seconds left of its pause before it sets out again. */
  pause: number
  /** Whether it is free to roam: by its status, not working, asking for a human or offline. */
  free: boolean
}

/** Where the main agent roams and how it looks for one snapshot. */
interface Roaming {
  ground: Ground
  /** Where it stands when there is no open paper at all. */
  origin: Tile
  sheet: THREE.Texture
  needsHuman: boolean
  style: StatusStyle
  bubble: string | null
  settling: Settling
}

/** Where a figure stands and how it looks for one snapshot. */
interface Posting {
  station: Pick<Station, "agentTile" | "bench">
  sheet: THREE.Texture
  needsHuman?: boolean
  style: StatusStyle
  /** What its bubble says, or null for none. */
  bubble: string | null
  /** Whether a box is on its bench, for the sparks. */
  hasBox?: boolean
  /** Its way in from the door when it is new to the floor. */
  wayIn?: Tile[]
  /** How it gets to its station when it is already on the floor. */
  settling?: Settling
}

export function createAgents(parent: THREE.Object3D, options: AgentsOptions = {}): Agents {
  const figures = new Map<string, Figure>()
  const paperCast = createPaperCharacters()
  const tablets = new Map<string, { piece: TabletPiece; glide?: Glide }>()
  const layer = new THREE.Group()
  parent.add(layer)
  /** Tablet faces the lines have scrolled by. */
  let scrolled = 0

  function update(layout: Layout, snapshot: Snapshot, { pets, styles, pieces }: Dressed, traffic: ComingsAndGoings, settling: Settling = "stand") {
    const looks = { styles, icons: paperCast.icons() }
    const humanNeeded = new Set(snapshot.humanNeededAgentIds ?? [])
    const wayInOf = new Map(traffic.arrivals.map((arrival) => [arrival.agentId, arrival.wayIn]))
    const taskById = new Map(snapshot.tasks.map((task) => [task.id, task]))
    const onBench = new Map<string, Task>()
    for (const { taskId, spot } of layout.boxes) {
      const task = taskById.get(taskId)
      if (spot.kind === "bench" && task) onBench.set(spot.stationId, task)
    }
    // All participants share the same task; first task in snapshot order owns
    // each tablet. No extra boxes or task counts are created.
    if (snapshot.assignments) onBench.clear()
    for (const task of snapshot.tasks) {
      const assignment = snapshot.assignments?.[task.id]
      if (!assignment) continue
      for (const id of assignment.agentIds) {
        const station = layout.bays.flatMap((bay) => bay.stations).find((station) => station.agentId === id)
        if (station && !onBench.has(station.id)) onBench.set(station.id, task)
      }
    }
    const standing = new Set<string>()
    const benches = new Set<string>()

    for (const { station, agent } of stationed(layout, snapshot.agents)) {
      const sheet = agent && (pets.get(agent.id) ?? paperCast.sheet(agent))
      // A status outside the table is shown as idle rather than not at all.
      const needsHuman = !!agent && (humanNeeded.has(agent.id) || agent.status === "waiting")
      const baseStyle = agent && (looks.styles[agent.status] ?? looks.styles.idle)
      const style = baseStyle && needsHuman ? { ...baseStyle, icon: "hand" as const } : baseStyle
      if (agent && sheet && style) {
        const task = onBench.get(station.id)
        const assignment = task && snapshot.assignments?.[task.id]
        const shared = assignment && assignment.agentIds.length > 1
        const completed = assignment?.completedAgentIds.includes(agent.id)
        const activity = needsHuman ? looks.styles.waiting.bubble : bubbleText(agent.status, agent.activity, looks.styles)
        const bubble = shared ? `${task!.id} · ${completed ? "Complete" : activity ?? "Assigned"}` : activity
        const posting = { station, sheet, needsHuman, style, bubble, hasBox: onBench.has(station.id) && !completed, wayIn: wayInOf.get(agent.id), settling }
        stand(agent, posting, looks)
        standing.add(agent.id)
      }
      const task = onBench.get(station.id)
      const complete = agent && task && snapshot.assignments?.[task.id]?.completedAgentIds.includes(agent.id)
      showTablet(station.id, station.bench, complete ? { kind: "bar", progress: 1 } : tabletLook(style, task, looks.icons), settling, pieces)
      benches.add(station.id)
    }

    const main = snapshot.mainAgent
    if (main) {
      const sheet = pets.get(main.id) ?? paperCast.sheet(main)
      const needsHuman = humanNeeded.has(main.id) || main.status === "waiting"
      const baseStyle = looks.styles[main.status] ?? looks.styles.idle
      const style = needsHuman ? { ...baseStyle, icon: "hand" as const } : baseStyle
      const bubble = needsHuman ? looks.styles.waiting.bubble : bubbleText(main.status, main.activity, looks.styles)
      const roaming = { ground: roamingGround(layout), origin: { x: layout.bounds.x, y: layout.bounds.y }, sheet, needsHuman, style, bubble, settling }
      roam(main, roaming, looks)
      standing.add(main.id)
    }

    for (const id of traffic.departures) {
      const figure = figures.get(id)
      if (figure) figure.fading ??= 0
    }
    for (const [id, figure] of figures) if (!standing.has(id)) figure.fading ??= 0
    for (const id of tablets.keys()) if (!benches.has(id)) removeTablet(id)
  }

  /**
   * Put the agent at its station, or at the start of its way in when it has
   * one and is new to the floor; while the floor slides, one already there
   * glides to its station, a walk under way given up.
   */
  function stand(agent: Agent, posting: Posting, looks: StatusLooks) {
    const { station, sheet, needsHuman = false, style, bubble: text, hasBox = false, wayIn, settling = "stand" } = posting
    const { figure, fresh } = dressed(agent, sheet, station.bench, looks)
    if (fresh && wayIn && wayIn.length > 1) figure.walk = { wayIn, progress: 0 }
    const { x, z } = tileCenter(station.agentTile)
    figure.home.set(x, 0, z)
    if (settling === "glide" && !fresh && !figure.group.position.equals(figure.home)) {
      figure.walk = undefined
      figure.facing = "down"
      figure.glide = startGlide(figure.group, figure.home)
    } else {
      figure.glide = undefined
      if (figure.walk) advance(figure, 0)
      else figure.group.position.copy(figure.home)
    }
    figure.bench = station.bench
    figure.sparking = style.motion === "work" && hasBox && !needsHuman
    restyle(figure, agent, style, needsHuman, text, looks)
  }

  /**
   * Put the main agent on the open paper: one new to the floor at the road's
   * end, setting out for a spot; one already there where it is, its stroll
   * kept while every tile of it is still open and its spot still there, else
   * stopped on the nearest open tile, glided to while the floor slides. It
   * roams only while idle; working, asking for a human or offline, it holds
   * still where it is once its step is done.
   */
  function roam(agent: Agent, roaming: Roaming, looks: StatusLooks) {
    const { ground, origin, sheet, needsHuman, style, bubble: text, settling } = roaming
    const { figure, fresh } = dressed(agent, sheet, origin, looks)
    // By what the host says it is doing, not by how a status is styled: a host may draw working as standing still.
    const free = !needsHuman && agent.status !== "working" && agent.status !== "offline"
    const open = (tile: Tile) => ground.open.has(tileKey(tile))
    const there = (spot: Spot) => ground.spots.some((other) => other.kind === spot.kind && other.roomId === spot.roomId && sameTile(other.tile, spot.tile))
    let roam = figure.roam
    if (!roam || fresh) {
      roam = figure.roam = { ground, at: ground.entry ?? origin, pause: 0, free }
      figure.walk = undefined
      figure.glide = undefined
      figure.facing = "down"
      figure.group.position.copy(groundCenter(roam.at))
      tell(figure, { kind: "standing" })
      if (free) setOut(figure)
    } else {
      roam.ground = ground
      roam.free = free
      const { stroll } = roam
      if (stroll && (!stroll.path.every(open) || !there(stroll.spot))) {
        // The paper changed under its stroll: it stops where it is.
        const here = stroll.path[Math.min(Math.round(stroll.progress), stroll.path.length - 1)]!
        roam.stroll = undefined
        roam.spot = undefined
        roam.at = nearestOpen(ground, here) ?? here
        roam.pause = pauseLength()
        settle(figure, settling)
        tell(figure, { kind: "standing" })
      } else if (!stroll && !open(roam.at)) {
        roam.at = nearestOpen(ground, roam.at) ?? roam.at
        roam.spot = undefined
        settle(figure, settling)
        tell(figure, { kind: "standing" })
      } else if (!stroll && roam.spot && !there(roam.spot)) {
        roam.spot = undefined
        tell(figure, { kind: "standing" })
      }
    }
    figure.sparking = false
    restyle(figure, agent, style, needsHuman, text, looks)
  }

  /** Stand the main agent on its tile, or glide it there while the floor slides. */
  function settle(figure: Figure, settling: Settling) {
    const at = groundCenter(figure.roam!.at)
    figure.facing = "down"
    if (settling === "glide" && !figure.group.position.equals(at)) figure.glide = startGlide(figure.group, at)
    else {
      figure.glide = undefined
      figure.group.position.copy(at)
    }
  }

  /** Send the main agent off to another spot, if a walk can reach one; else it waits a while and tries again. */
  function setOut(figure: Figure) {
    const roam = figure.roam!
    const next = nextStroll(roam.ground, roam.at, Math.random())
    if (next && next.path.length > 1) {
      roam.stroll = { spot: next.spot, path: next.path, progress: 0 }
      roam.spot = undefined
      tell(figure, { kind: "walking", spot: next.spot })
    } else {
      roam.pause = pauseLength()
    }
  }

  function tell(figure: Figure, whereabouts: Whereabouts) {
    options.onRoam?.(figure.agent.id, whereabouts)
  }

  /**
   * The agent's figure in its sheet: the one it has, redressed in place when
   * its sheet changed, an arrival walk or room glide kept alive; or a new one.
   */
  function dressed(agent: Agent, sheet: THREE.Texture, bench: Tile, looks: StatusLooks): { figure: Figure; fresh: boolean } {
    let figure = figures.get(agent.id)
    const artKey = sheet.userData.petKey as string | undefined
    if (figure && (figure.frame.source !== sheet.source || figure.artKey !== artKey)) {
      figure.group.remove(figure.body)
      figure.frame.dispose(); figure.body.material.dispose()
      figure.body = petBody(sheet)
      figure.frame = figure.body.material.map!
      figure.artKey = artKey
      figure.staticImage = sheet.userData.petLayout === "image"
      figure.pet = !!sheet.userData.pet
      figure.baseScale = figure.body.scale.clone()
      figure.height = displayHeight(sheet)
      figure.group.add(figure.body)
    }
    if (figure) {
      if (figure.agent.status !== agent.status) figure.inStatus = 0
      return { figure, fresh: false }
    }
    const body = petBody(sheet)
    const icon = statusIcon(looks.icons.hand)
    const group = new THREE.Group()
    group.add(body, icon)
    layer.add(group)
    const sparks = Array.from({ length: SPARKS_PER_AGENT }, (): Spark => {
      const sprite = spark()
      sprite.visible = false
      layer.add(sprite)
      return { sprite, velocity: new THREE.Vector3(), age: 0, life: 0 }
    })
    figure = {
      agent,
      group,
      body,
      height: displayHeight(sheet),
      artKey,
      staticImage: sheet.userData.petLayout === "image",
      pet: !!sheet.userData.pet,
      baseScale: body.scale.clone(),
      needsHuman: false,
      frame: body.material.map!,
      icon,
      sparks,
      sparking: false,
      bench,
      home: new THREE.Vector3(),
      style: looks.styles.idle,
      inStatus: 0,
      clock: Math.random() * 60,
      facing: "down",
    }
    figures.set(agent.id, figure)
    return { figure, fresh: true }
  }

  /** Give the figure its status's look, icon and bubble, all of it shown, and pose it. */
  function restyle(figure: Figure, agent: Agent, style: StatusStyle, needsHuman: boolean, text: string | null, looks: StatusLooks) {
    figure.fading = undefined
    figure.agent = agent
    figure.style = style
    figure.needsHuman = needsHuman
    dim(figure, 1)
    if (style.icon !== "none" && figure.icon.material.map !== looks.icons[style.icon]) {
      figure.icon.material.map = looks.icons[style.icon]
      figure.icon.material.needsUpdate = true
    }
    if (figure.bubble && figure.bubble.text !== text) {
      figure.group.remove(figure.bubble.sprite)
      figure.bubble.sprite.material.dispose()
      figure.bubble = undefined
    }
    if (text !== null && !figure.bubble) {
      const sprite = bubble(text)
      figure.group.add(sprite)
      figure.bubble = { text, sprite }
      figure.bubble.sprite.material.opacity = style.opacity
    }
    pose(figure)
  }

  /** Carry a walk steps tiles on, from tile centre to tile centre, facing the way of each step; at the end, home. */
  function advance(figure: Figure, steps: number) {
    const walk = figure.walk
    if (!walk) return
    const last = walk.wayIn.length - 1
    walk.progress = Math.min(walk.progress + steps, last)
    along(figure, walk.wayIn, walk.progress, 0)
    if (walk.progress >= last) {
      figure.walk = undefined
      figure.facing = "down"
      figure.group.position.copy(figure.home)
    }
  }

  /** Put the figure progress tiles along the path, between tile centres, at height y, facing the way of its step. */
  function along(figure: Figure, path: Tile[], progress: number, y: number) {
    const last = path.length - 1
    const i = Math.min(Math.floor(progress), last - 1)
    const from = tileCenter(path[i]!)
    const to = tileCenter(path[i + 1]!)
    const t = Math.min(progress - i, 1)
    figure.group.position.set(from.x + (to.x - from.x) * t, y, from.z + (to.z - from.z) * t)
    figure.facing = FACING[directionBetween(path[i]!, path[i + 1]!) ?? "s"]
  }

  /**
   * Carry the main agent's stroll dt seconds on, or its pause, and send it
   * out again when the pause is over. Held, it finishes the step it is on
   * and stops there, to set out again from that tile once free.
   */
  function wander(figure: Figure, dt: number) {
    const roam = figure.roam!
    if (figure.glide) return
    const { stroll } = roam
    if (stroll) {
      const last = stroll.path.length - 1
      const until = roam.free ? last : Math.min(last, Math.ceil(stroll.progress))
      stroll.progress = Math.min(stroll.progress + dt * ROAM_SPEED, until)
      along(figure, stroll.path, stroll.progress, PAPER_GROUND_Y)
      if (stroll.progress < until) return
      roam.at = stroll.path[until]!
      roam.stroll = undefined
      roam.pause = pauseLength()
      figure.facing = "down"
      figure.group.position.copy(groundCenter(roam.at))
      if (until === last) {
        roam.spot = stroll.spot
        tell(figure, { kind: "pausing", spot: stroll.spot })
      } else {
        roam.spot = undefined
        tell(figure, { kind: "standing" })
      }
    } else if (roam.free) {
      roam.pause -= dt
      if (roam.pause <= 0) setOut(figure)
    }
  }

  /** Put the figure as its status has it at this moment of its clock, or mid-step while it walks in. */
  function pose(figure: Figure) {
    const { style, clock, inStatus } = figure
    const walking = figure.walk !== undefined || figure.roam?.stroll !== undefined
    let column = style.pose === "hurt" ? COLUMN.hurt : COLUMN.stand
    let lift = 0
    if (walking) {
      column = WALK_CYCLE[Math.floor(clock * WALK_FPS) % WALK_CYCLE.length]!
    } else if (style.motion === "work") {
      column = Math.floor(clock / WORK_BEAT) % 2 === 0 ? COLUMN.raisedArm : COLUMN.armForward
    } else if (style.motion === "jump") {
      lift = JUMP_H * Math.abs(Math.sin((Math.PI * clock) / JUMP_PERIOD))
      if (style.pose !== "hurt") column = lift > JUMP_H / 2 ? COLUMN.step : COLUMN.stand
    }
    const movement = petMotionState(walking, figure.needsHuman, style.motion === "work")
    if (figure.pet) {
      column = petFrame(movement, clock, figure.frame.userData.petAnimations as PetAnimations | undefined) ?? column
      const motion = petBodyPose(movement, clock, figure.staticImage)
      // Attention replaces the generic waiting jump; the paw frames and sway
      // are its own loop rather than a badge over an unchanged animal.
      lift = movement === "attention" ? motion.lift : lift + motion.lift
      figure.body.position.x = motion.offsetX
      figure.body.material.rotation = motion.roll
      figure.body.scale.set(figure.baseScale.x * motion.scaleX, figure.baseScale.y * motion.scaleY, figure.baseScale.z)
    } else if (figure.needsHuman && !walking) {
      column = Math.floor(clock * 3.2) % 2 ? COLUMN.stand : COLUMN.raisedArm
    }
    if (!figure.staticImage) {
      const frame = sheetFrame(column, figure.facing)
      figure.frame.offset.set(frame.offset.x, frame.offset.y)
    }
    figure.body.position.y = 0.01 + lift

    const iconShown = style.icon !== "none" && !(style.icon === "check" && inStatus > CHECK_FOR)
    figure.icon.visible = iconShown
    figure.icon.position.y = figure.height + ICON_SIZE / 2 + 0.08 + lift + 0.04 * Math.sin(clock * 4)
    if (figure.bubble) figure.bubble.sprite.position.y = figure.height + (iconShown ? ICON_SIZE + 0.2 : 0.12)
  }

  /** Put the tablet at its bench, or glide it there from where it is while the floor slides. */
  function showTablet(id: string, bench: Tile, look: TabletLook, settling: Settling, pieces: Pieces) {
    const { x, z } = tileCenter(bench)
    const at = new THREE.Vector3(x, 0, z)
    let shown = tablets.get(id)
    if (!shown) {
      shown = { piece: tablet(pieces) }
      shown.piece.group.position.copy(at)
      layer.add(shown.piece.group)
      tablets.set(id, shown)
    } else if (settling === "glide" && !shown.piece.group.position.equals(at)) {
      shown.glide = startGlide(shown.piece.group, at)
    } else {
      shown.glide = undefined
      shown.piece.group.position.copy(at)
    }
    const texture = tabletTexture(look)
    if (shown.piece.face.map !== texture) {
      shown.piece.face.map = texture
      shown.piece.face.needsUpdate = true
    }
  }

  function removeFigure(id: string) {
    const figure = figures.get(id)
    if (!figure) return
    layer.remove(figure.group)
    figure.frame.dispose()
    figure.body.material.dispose()
    figure.icon.material.dispose()
    figure.bubble?.sprite.material.dispose()
    for (const { sprite } of figure.sparks) {
      layer.remove(sprite)
      sprite.material.dispose()
    }
    figures.delete(id)
  }

  function removeTablet(id: string) {
    const shown = tablets.get(id)
    if (!shown) return
    layer.remove(shown.piece.group)
    disposeMeshes(shown.piece.group)
    tablets.delete(id)
  }

  function tick(dt: number, speed: number) {
    for (const [id, figure] of figures) {
      figure.clock += dt
      figure.inStatus += dt
      if (figure.walk) advance(figure, dt * WALK_SPEED * speed)
      if (figure.glide && glide(figure.group, figure.glide, dt, speed)) figure.glide = undefined
      if (figure.roam && figure.fading === undefined) wander(figure, dt)
      if (figure.fading !== undefined) {
        figure.fading += dt
        if (figure.fading >= FADE_S) {
          removeFigure(id)
          continue
        }
        dim(figure, 1 - figure.fading / FADE_S)
      }
      pose(figure)
      if (figure.sparking && !figure.walk && !figure.glide && figure.fading === undefined) sparkle(figure, dt)
      else for (const s of figure.sparks) burnOut(s)
    }
    for (const shown of tablets.values()) {
      if (shown.glide && glide(shown.piece.group, shown.glide, dt, speed)) shown.glide = undefined
    }
    scrolled += dt * LINES_PER_S
    // Up the face, the way a log scrolls.
    // The face reads from the top, so a growing offset sends the lines up it.
    tabletTexture({ kind: "lines" }).offset.y = scrolled % 1
  }

  /** Fly the sparks over the box on the bench; each flies again when it has burnt out. */
  function sparkle(figure: Figure, dt: number) {
    const { x, z } = tileCenter(figure.bench)
    for (const s of figure.sparks) {
      s.age += dt
      if (s.age >= s.life) {
        s.age = 0
        s.life = 0.25 + Math.random() * 0.3
        s.sprite.position.set(x + (Math.random() - 0.5) * 0.3, PAPER_BELT_H + BOX_SIZE, z + (Math.random() - 0.5) * 0.3)
        s.velocity.set((Math.random() - 0.5) * 1.4, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6)
        s.sprite.visible = true
      }
      s.velocity.y -= GRAVITY * dt
      s.sprite.position.addScaledVector(s.velocity, dt)
    }
  }

  /** Out of sight, and due to fly again at a moment of its own once the work resumes. */
  function burnOut(s: Spark) {
    s.sprite.visible = false
    s.life = 0.3
    s.age = Math.random() * s.life
  }

  function pick(raycaster: THREE.Raycaster): Candidate | undefined {
    const clickable = [...figures.values()].filter((figure) => figure.fading === undefined)
    return nearestOf(
      raycaster,
      clickable.map((figure) => [figure.agent.id, figure.body] as const),
    )
  }

  function positionOf(id: string): THREE.Vector3 | undefined {
    return figures.get(id)?.group.position.clone()
  }

  function dispose() {
    for (const id of [...figures.keys()]) removeFigure(id)
    for (const id of [...tablets.keys()]) removeTablet(id)
    paperCast.dispose()
    parent.remove(layer)
  }

  return { update, tick, pick, positionOf, dispose }
}

/** The middle of a tile of the open paper, on the ground outside the rooms. */
function groundCenter(tile: Tile): THREE.Vector3 {
  const { x, z } = tileCenter(tile)
  return new THREE.Vector3(x, PAPER_GROUND_Y, z)
}

/** How long the main agent pauses this time. */
function pauseLength(): number {
  return PAUSE_S.least + Math.random() * (PAUSE_S.most - PAUSE_S.least)
}

/** Show the figure at a fraction of its status's opacity: all of it, or less as it fades. */
function dim(figure: Figure, fraction: number) {
  const opacity = figure.style.opacity * fraction
  fade(figure.body.material, opacity)
  fade(figure.icon.material, opacity)
  if (figure.bubble) figure.bubble.sprite.material.opacity = opacity
}

/** Dim a cut-out sprite. Opacity scales the alpha before the cutout test, so the test scales with it or the sprite vanishes. */
function fade(material: THREE.SpriteMaterial, opacity: number) {
  material.opacity = opacity
  material.alphaTest = Math.max(CUTOUT * opacity, 0.01)
}

/** What a station's tablet shows: the work going by, what its agent is waiting for, or not much. */
function tabletLook(style: StatusStyle | undefined, task: Task | undefined, icons: Icons): TabletLook {
  if (!style) return { kind: "dim" }
  if (style.motion === "work") return task?.progress === undefined ? { kind: "lines" } : { kind: "bar", progress: task.progress }
  if (style.icon === "hand" || style.icon === "warning") return { kind: "icon", name: style.icon, icon: icons[style.icon] }
  return { kind: "dim" }
}

/** Static pets use the whole image; animated sheets retain existing frame timing. */
function petBody(sheet: THREE.Texture): THREE.Sprite {
  const body = agentSprite(sheet)
  if (sheet.userData.petLayout === "image") {
    body.material.map!.offset.set(0, 0)
    body.material.map!.repeat.set(1, 1)
  }
  const height = (sheet.userData.height as number | undefined) ?? PAPER_AGENT_H
  const aspect = (sheet.userData.aspectRatio as number | undefined) ?? 2 / 3
  body.scale.set(height * aspect, height, 1)
  return body
}

function displayHeight(sheet: THREE.Texture): number {
  return ((sheet.userData.height as number | undefined) ?? PAPER_AGENT_H) / Math.cos(PAPER_PITCH)
}
