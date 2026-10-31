// The agents on the floor and the tablets on the benches. Like the boxes,
// they stay from one snapshot to the next: a status change shows on the same
// figure as a new pose, icon, bubble and tablet face, and a check shown once
// stays brief. Nothing here is laid out; every agent stands where the layout
// puts its station.

import * as THREE from "three"
import { stationed } from "~/floor/layout"
import type { Layout, Station, Tile } from "~/floor/types"
import { type AgentStatus, type StatusIcon, type StatusStyle, bubbleText } from "~/model/status"
import type { Agent, Snapshot, Task } from "~/model/types"
import { disposeMeshes } from "./drawing"
import {
  AGENT_H,
  BENCH_H,
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
import { sheetFrame } from "./sprites"
import { type TabletLook, tabletTexture } from "./tablets"

export type StatusStyles = Readonly<Record<AgentStatus, StatusStyle>>
/** The icon textures, loaded, by the name the style table uses. */
export type Icons = Readonly<Record<Exclude<StatusIcon, "none">, THREE.Texture>>

/** How agents look in each status: the resolved style table and the icons it names. */
export interface StatusLooks {
  styles: StatusStyles
  icons: Icons
}

export interface Agents {
  /**
   * Stand every agent the layout has a station for at it, in its sheet,
   * looking as its status says, and give every bench a tablet. Agents without
   * a station or a sheet go, as do the tablets of benches no longer laid out.
   */
  update(layout: Layout, snapshot: Snapshot, sheets: ReadonlyMap<string, THREE.Texture>, looks: StatusLooks): void
  /** Carry every pose, jump, spark and tablet dt seconds on. Real seconds: a status is not scaled with the belts. */
  tick(dt: number): void
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
  /** The body's own copy of its sheet, offset to the cell of its pose. */
  frame: THREE.Texture
  icon: THREE.Sprite
  bubble?: { text: string; sprite: THREE.Sprite }
  /** Over the bench, in floor coordinates, so they are not children of the group. */
  sparks: Spark[]
  /** Whether the sparks fly: the agent is working and has a box on its bench. */
  sparking: boolean
  bench: Tile
  style: StatusStyle
  /** Seconds in the current status. */
  inStatus: number
  /** Seconds on its own clock, started at random so a bay does not jump in step. */
  clock: number
}

export function createAgents(parent: THREE.Object3D): Agents {
  const figures = new Map<string, Figure>()
  const tablets = new Map<string, TabletPiece>()
  const layer = new THREE.Group()
  parent.add(layer)
  /** Tablet faces the lines have scrolled by. */
  let scrolled = 0

  function update(layout: Layout, snapshot: Snapshot, sheets: ReadonlyMap<string, THREE.Texture>, looks: StatusLooks) {
    const taskById = new Map(snapshot.tasks.map((task) => [task.id, task]))
    const onBench = new Map<string, Task>()
    for (const { taskId, spot } of layout.boxes) {
      const task = taskById.get(taskId)
      if (spot.kind === "bench" && task) onBench.set(spot.stationId, task)
    }
    const standing = new Set<string>()
    const benches = new Set<string>()

    for (const { station, agent } of stationed(layout, snapshot.agents)) {
      const sheet = agent && sheets.get(agent.id)
      // A status outside the table is shown as idle rather than not at all.
      const style = agent && (looks.styles[agent.status] ?? looks.styles.idle)
      if (agent && sheet && style) {
        stand(agent, station, sheet, style, looks, onBench.has(station.id))
        standing.add(agent.id)
      }
      showTablet(station.id, station.bench, tabletLook(style, onBench.get(station.id), looks.icons))
      benches.add(station.id)
    }
    showTablet("staging", layout.staging.bench, { kind: "dim" })
    benches.add("staging")

    for (const id of figures.keys()) if (!standing.has(id)) removeFigure(id)
    for (const id of tablets.keys()) if (!benches.has(id)) removeTablet(id)
  }

  function stand(agent: Agent, station: Station, sheet: THREE.Texture, style: StatusStyle, looks: StatusLooks, hasBox: boolean) {
    let figure = figures.get(agent.id)
    if (figure && figure.frame.source !== sheet.source) {
      removeFigure(agent.id)
      figure = undefined
    }
    if (!figure) {
      const body = agentSprite(sheet)
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
        frame: body.material.map!,
        icon,
        sparks,
        sparking: false,
        bench: station.bench,
        style,
        inStatus: 0,
        clock: Math.random() * 60,
      }
      figures.set(agent.id, figure)
    } else if (figure.agent.status !== agent.status) {
      figure.inStatus = 0
    }

    const { x, z } = tileCenter(station.agentTile)
    figure.group.position.set(x, 0, z)
    figure.agent = agent
    figure.bench = station.bench
    figure.style = style
    figure.sparking = style.motion === "work" && hasBox
    fade(figure.body.material, style.opacity)
    fade(figure.icon.material, style.opacity)
    if (style.icon !== "none" && figure.icon.material.map !== looks.icons[style.icon]) {
      figure.icon.material.map = looks.icons[style.icon]
      figure.icon.material.needsUpdate = true
    }
    const text = bubbleText(agent.status, agent.activity, looks.styles)
    if (figure.bubble && figure.bubble.text !== text) {
      figure.group.remove(figure.bubble.sprite)
      figure.bubble.sprite.material.dispose()
      figure.bubble = undefined
    }
    if (text !== null && !figure.bubble) {
      const sprite = bubble(text)
      figure.group.add(sprite)
      figure.bubble = { text, sprite }
    }
    if (figure.bubble) figure.bubble.sprite.material.opacity = style.opacity
    pose(figure)
  }

  /** Put the figure as its status has it at this moment of its clock. */
  function pose(figure: Figure) {
    const { style, clock, inStatus } = figure
    let column = style.pose === "hurt" ? COLUMN.hurt : COLUMN.stand
    let lift = 0
    if (style.motion === "work") {
      column = Math.floor(clock / WORK_BEAT) % 2 === 0 ? COLUMN.raisedArm : COLUMN.armForward
    } else if (style.motion === "jump") {
      lift = JUMP_H * Math.abs(Math.sin((Math.PI * clock) / JUMP_PERIOD))
      if (style.pose !== "hurt") column = lift > JUMP_H / 2 ? COLUMN.step : COLUMN.stand
    }
    const frame = sheetFrame(column, "down")
    figure.frame.offset.set(frame.offset.x, frame.offset.y)
    figure.body.position.y = 0.01 + lift

    const iconShown = style.icon !== "none" && !(style.icon === "check" && inStatus > CHECK_FOR)
    figure.icon.visible = iconShown
    figure.icon.position.y = AGENT_H + ICON_SIZE / 2 + 0.08 + lift + 0.04 * Math.sin(clock * 4)
    if (figure.bubble) figure.bubble.sprite.position.y = AGENT_H + (iconShown ? ICON_SIZE + 0.2 : 0.12)
  }

  function showTablet(id: string, bench: Tile, look: TabletLook) {
    let piece = tablets.get(id)
    if (!piece) {
      piece = tablet()
      layer.add(piece.group)
      tablets.set(id, piece)
    }
    const { x, z } = tileCenter(bench)
    piece.group.position.set(x, 0, z)
    const texture = tabletTexture(look)
    if (piece.face.map !== texture) {
      piece.face.map = texture
      piece.face.needsUpdate = true
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
    const piece = tablets.get(id)
    if (!piece) return
    layer.remove(piece.group)
    disposeMeshes(piece.group)
    tablets.delete(id)
  }

  function tick(dt: number) {
    for (const figure of figures.values()) {
      figure.clock += dt
      figure.inStatus += dt
      pose(figure)
      if (figure.sparking) sparkle(figure, dt)
      else for (const s of figure.sparks) burnOut(s)
    }
    scrolled += dt * LINES_PER_S
    // Up the face, the way a log scrolls.
    tabletTexture({ kind: "lines" }).offset.y = -(scrolled % 1)
  }

  /** Fly the sparks over the box on the bench; each flies again when it has burnt out. */
  function sparkle(figure: Figure, dt: number) {
    const { x, z } = tileCenter(figure.bench)
    for (const s of figure.sparks) {
      s.age += dt
      if (s.age >= s.life) {
        s.age = 0
        s.life = 0.25 + Math.random() * 0.3
        s.sprite.position.set(x + (Math.random() - 0.5) * 0.3, BENCH_H + BOX_SIZE, z + (Math.random() - 0.5) * 0.3)
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

  function dispose() {
    for (const id of [...figures.keys()]) removeFigure(id)
    for (const id of [...tablets.keys()]) removeTablet(id)
    parent.remove(layer)
  }

  return { update, tick, dispose }
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
