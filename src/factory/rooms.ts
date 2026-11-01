import * as THREE from "three"
import type { Layout, RoomFootprint } from "~/floor/types"
import { ROOM_THEME_SLOTS, type ResolvedRoomTheme } from "~/model/roomThemes"
import { wayIn } from "~/floor/walk"
import type { ThemeAssets } from "./roomThemeAssets"
import { isShared } from "./models"
import { floorSlab } from "./pieces"
import { paperFloorProfile, paperFloorTexture } from "./paperFlooring"
import { canvasTexture, pixelated } from "./textures"

type Add = (name: string, piece: THREE.Object3D) => void

/** The paper room is an authored piece of scenery; routing owns all openings. */
export function drawRooms(layout: Layout, floorTexture: THREE.Texture, add: Add, paper = false, themes?: ReadonlyMap<string, ResolvedRoomTheme>, assets?: ThemeAssets) {
  const occupied = new Set(layout.belts.flatMap((belt) => belt.tiles.map((tile) => `${tile.x},${tile.y}`)))
  for (const room of layout.rooms ?? []) {
    // Intake remains a logical routing endpoint, with its hopper on grass.
    if (paper && room.kind === "intake") continue
    if (paper) { drawPaperRoom(room, occupied, add, layout, themes?.get(room.id), assets); continue }
    const { x, y, w, h } = room.rect
    const color = room.kind === "intake" ? 0x5278ab : room.kind === "deployment" ? 0xb17a49 : room.kind === "staging" ? 0xc7a454 : 0x638a7d
    const floor = floorSlab(room.rect, floorTexture)
    ;(floor.material as THREE.MeshLambertMaterial).color.setHex(color).lerp(new THREE.Color(0xffffff), .7)
    floor.position.y = .012
    add(`room:${room.id}:floor`, floor)
    const wall = (key: string, cx: number, cy: number, width: number, depth: number, height: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshLambertMaterial({ color: 0x50616a }))
      mesh.position.set(cx, height / 2, cy)
      add(`room:${room.id}:${key}`, mesh)
    }
    for (let i = 0; i < w; i++) {
      if (x + i !== room.door.x && !occupied.has(`${x + i},${y}`)) wall(`back:${i}`, x + i + .5, y + .12, 1, .24, 1.1)
      wall(`front:${i}`, x + i + .5, y + h - .12, 1, .24, .18)
    }
    for (let i = 1; i < h - 1; i++) for (const [side, xx] of [["left", x], ["right", x + w - 1]] as const) {
      if (!occupied.has(`${xx},${y + i}`)) wall(`${side}:${i}`, xx + (side === "left" ? .12 : .88), y + i + .5, .24, 1, .45)
    }
    const texture = pixelated(canvasTexture(256, 40, (ctx, width, height) => {
      ctx.fillStyle = "#17252d"; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = "#d8e5dd"; ctx.font = "bold 22px monospace"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(room.label, width / 2, height / 2, width - 16)
    }))
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w - 2.3, .65), new THREE.MeshBasicMaterial({ map: texture }))
    label.position.set(x + w / 2 + .3, 1.25, y + .26)
    label.userData.disposeTexture = true
    add(`room:${room.id}:label`, label)
  }
}

function identity(room: RoomFootprint) {
  const name = room.id.toLowerCase()
  if (room.kind === "deployment") return { color: 0xc98366, ink: "#b97055", icon: "truck" }
  if (name.includes("plan") || name.includes("research")) return { color: 0x82a8bd, ink: "#618fae", icon: "bulb" }
  if (name.includes("implement") || name.includes("foundry")) return { color: 0xe2b45d, ink: "#d5a145", icon: "hammer" }
  if (name.includes("review") || name.includes("qa")) return { color: 0x9db79b, ink: "#719881", icon: "code" }
  return { color: 0xa6b88d, ink: "#71967b", icon: "parcel" }
}

function drawPaperRoom(room: RoomFootprint, occupied: Set<string>, add: Add, layout: Layout, theme?: ResolvedRoomTheme, assets?: ThemeAssets) {
  const { x, y, w, h } = room.rect
  const palette = identity(room)
  const cream = new THREE.MeshLambertMaterial({ color: 0xfff1d5 })
  const edge = new THREE.MeshLambertMaterial({ color: 0xd5bf96 })
  const white = new THREE.MeshLambertMaterial({ color: 0xfff9e9 })
  const color = new THREE.MeshLambertMaterial({ color: theme?.wall ?? palette.color })
  const cardGeometry = new THREE.BoxGeometry(1, 1, 1)
  const box = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, material: THREE.Material = cream) => {
    const mesh = new THREE.Mesh(cardGeometry, material)
    mesh.scale.set(sx, sy, sz)
    mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true
    return mesh
  }
  const put = (key: string, piece: THREE.Object3D) => add(`room:${room.id}:${key}`, piece)
  // The floor's visible thickness and bright cut edge establish the cardstock scale.
  put("plinth", box(w + .16, .20, h + .16, x + w / 2, -.12, y + h / 2, edge))
  const floorMap = (theme?.assets.floor ? assets?.floor(theme.assets.floor, w + .12, h + .12) : undefined) ??
    paperFloorTexture(theme?.floor ?? paperFloorProfile(room), w + .12, h + .12)
  const floorMaterial = new THREE.MeshLambertMaterial({ map: floorMap })
  const floor = box(w + .12, .045, h + .12, x + w / 2, -.005, y + h / 2, floorMaterial)
  floor.userData.disposeTexture = true
  put("floor", floor)
  put("cut-edge", box(w + .14, .035, .035, x + w / 2, -.04, y + h + .06, cream))

  for (let i = 0; i < w; i++) {
    // Paper rooms have no separate rear door model; only a real conveyor
    // crossing cuts through the wall. The logical arrival tile stays unchanged.
    const opening = occupied.has(`${x + i},${y}`)
    const group = new THREE.Group()
    // A card lintel bridges conveyor openings; the wall reads as one folded
    // sheet while leaving the raised deck and its parcels clear underneath.
    const bottom = opening ? 1.55 : 0
    group.add(box(1, 2.3 - bottom, .12, 0, (2.3 + bottom) / 2, 0, color), box(1.02, .065, .18, 0, 2.32, 0, cream))
    group.position.set(x + i + .5, 0, y + .09)
    put(`back:${i}`, group)
    if (opening) {
      // Raised cardstock trim surrounds the cutout. Jambs sit outside the
      // belt tile, the header stays above parcels, and the sill hugs the floor.
      const frame = new THREE.Group()
      for (const dx of [-.54, .54]) frame.add(box(.08, 1.63, .20, dx, .815, .035))
      frame.add(box(1.16, .08, .20, 0, 1.59, .035))
      frame.add(box(1.16, .04, .20, 0, .02, .035))
      frame.position.set(x + i + .5, 0, y + .09)
      put(`back-frame:${i}`, frame)
    }
  }
  for (const [side, xx] of [["left", x + .08], ["right", x + w - .08]] as const) {
    for (let i = 0; i < h; i++) {
      const tileX = side === "left" ? x : x + w - 1
      if (occupied.has(`${tileX},${y + i}`)) continue
      const height = i < 2 ? 2.3 - i * .35 : .72
      const group = new THREE.Group()
      group.add(box(.12, height, 1, 0, height / 2, 0, i < 2 ? color : cream))
      group.add(box(.19, .06, 1.02, 0, height + .02, 0, white))
      group.position.set(xx, 0, y + i + .5)
      put(`${side}:${i}`, group)
    }
    // A triangular folded foot at the open front of each side panel.
    const shape = new THREE.Shape()
    shape.moveTo(0, 0); shape.lineTo(.66, 0); shape.lineTo(0, .72); shape.closePath()
    const brace = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: false }), cream)
    brace.rotation.y = side === "left" ? Math.PI : 0
    brace.position.set(side === "left" ? xx + .68 : xx - .68, .02, y + h - .3)
    brace.castShadow = true; brace.receiveShadow = true
    put(`${side}:folded-foot`, brace)
  }
  // The vertical card sits directly on the back wall cap, without support posts.
  const sign = new THREE.Group()
  // A wider station grid adds floor space without stretching the sign artwork.
  const boardW = Math.min(w, 7) * .79, boardH = 1.12
  const board = box(boardW, boardH, .12, 0, 0, 0)
  sign.add(board)
  const map = canvasTexture(768, 160, (ctx, width, height) => {
    ctx.fillStyle = "#fff0d5"; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = "#eedabc"; ctx.lineWidth = 3; ctx.strokeRect(2, 2, width - 4, height - 4)
    ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.roundRect(20, 18, 124, 124, 17); ctx.fill()
    drawIcon(ctx, palette.icon)
    ctx.fillStyle = "#283a45"; ctx.font = "bold 46px Arial, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"
    ctx.fillText(room.label.toUpperCase(), 172, height / 2 + 1, width - 195)
  })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW - .035, boardH - .035), new THREE.MeshBasicMaterial({ map }))
  face.position.set(0, 0, .065)
  face.userData.disposeTexture = true; sign.add(face)
  const wallTop = 2.32 + .065 / 2
  sign.position.set(x + w / 2, wallTop + boardH / 2, y + .09)
  put("sign", sign)

  // Test complete world footprints, not just their center tile: tall folded
  // props cannot intrude into conveyors, station surfaces or arriving pets.
  const obstacles = layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))
  for (const station of layout.bays.flatMap((bay) => bay.stations)) {
    obstacles.push({ x: station.bench.x + .5 - 1.4, y: station.bench.y + .5 - .65, w: 2.8, h: 1.3 })
    obstacles.push(...wayIn(layout, station).map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))
  }
  const placed: THREE.Box3[] = []
  const clear = (piece: THREE.Object3D) => {
    piece.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(piece)
    const margin = ROOM_THEME_SLOTS.decoration.clearance
    const expanded = bounds.clone().expandByScalar(margin)
    if (expanded.min.x < x + .16 || expanded.max.x > x + w - .16 || expanded.min.z < y + .16 || expanded.max.z > y + h - .16) return false
    if (obstacles.some((rect) => expanded.max.x > rect.x && expanded.min.x < rect.x + rect.w &&
      expanded.max.z > rect.y && expanded.min.z < rect.y + rect.h)) return false
    if (placed.some((other) => expanded.intersectsBox(other))) return false
    placed.push(bounds)
    return true
  }
  const discard = (piece: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    piece.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (object.geometry !== cardGeometry && !isShared(object.geometry)) geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (![cream, edge, white, color].includes(material) && !isShared(material)) materials.add(material)
      }
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
  }
  const furnishing = theme?.decoration ?? (palette.icon === "hammer" ? "press" : palette.icon === "code" ? "parts" : palette.icon === "truck" ? "cutter" : "shelves")
  let furniture = theme?.assets.decoration ? assets?.model(theme.assets.decoration, "decoration") : undefined
  if (!furniture) {
    const accent = new THREE.MeshLambertMaterial({ color: theme?.accent ?? palette.color })
    furniture = new THREE.Group()
    const putPart = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, material: THREE.Material = accent) => {
      const mesh = box(sx, sy, sz, px, py, pz, material); furniture!.add(mesh); return mesh
    }
    if (furnishing === "shelves") {
      for (const dx of [-.52, .52]) putPart(.08, 1.24, .74, dx, .62, 0, cream)
      for (const cy of [.08, .58, 1.08]) {
        putPart(1.12, .07, .80, 0, cy, 0)
        if (cy < 1) for (const [index, dx] of [-.31, 0, .29].entries()) {
          putPart(.20, .31, .48, dx, cy + .19, .04, index % 2 ? cream : color)
          putPart(.025, .27, .025, dx - .06, cy + .19, .29, edge)
        }
      }
    } else if (furnishing === "press") {
      putPart(1.12, .13, .80, 0, .065, 0, edge)
      for (const dx of [-.45, .45]) putPart(.16, 1.1, .67, dx, .65, 0)
      putPart(1.1, .16, .78, 0, 1.20, 0)
      putPart(.14, .34, .18, 0, .95, 0, cream)
      putPart(.52, .10, .52, 0, .73, 0, edge)
      putPart(.70, .12, .62, 0, .28, 0, cream)
    } else if (furnishing === "parts") {
      putPart(1.12, .10, .80, 0, .08, 0, edge)
      for (const dx of [-.51, .51]) putPart(.08, 1.18, .76, dx, .64, 0, cream)
      for (const cy of [.30, .83]) {
        putPart(1.05, .07, .78, 0, cy - .12, 0)
        for (const dx of [-.26, .26]) {
          putPart(.44, .31, .60, dx, cy + .07, .05)
          putPart(.20, .08, .025, dx, cy + .08, .365, cream)
        }
      }
    } else {
      for (const dx of [-.45, .45]) putPart(.10, .65, .72, dx, .33, 0, cream)
      putPart(1.12, .10, .80, 0, .70, 0)
      putPart(.9, .025, .65, 0, .763, .02, cream)
      putPart(.09, .51, .12, -.43, 1.0, -.26, edge)
      const blade = putPart(.85, .07, .09, -.03, 1.11, -.26)
      blade.rotation.z = -.23
      for (const dx of [-.2, 0, .2]) putPart(.012, .012, .5, dx, .783, .02, edge)
    }
  }
  furniture.userData.themeDecoration = furnishing
  furniture.position.set(x + 2.75, .02, y + .77)
  if (clear(furniture)) put("side-furnishing", furniture)
  else discard(furniture)

  const plant = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.28, .21, .45, 4, 1), cream)
  pot.rotation.y = Math.PI / 4; pot.position.y = .225; pot.castShadow = true; plant.add(pot)
  const greens = [0x718c5e, 0x8eaa72, 0x618268]
  for (let i = 0; i < 4; i++) {
    const leafShape = new THREE.Shape()
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(-.32, .42, 0, .95); leafShape.quadraticCurveTo(.31, .42, 0, 0)
    const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape), new THREE.MeshLambertMaterial({ color: greens[i % 3], side: THREE.DoubleSide }))
    leaf.position.set(0, .37, 0); leaf.rotation.z = (i - 1.5) * .40; leaf.rotation.y = i * 1.5
    leaf.castShadow = true; plant.add(leaf)
  }
  plant.scale.setScalar(.65)
  plant.position.set(x + w - 2.55, .03, y + 1.0)
  if (clear(plant)) put("plant", plant)
  else discard(plant)
  // The entire note cluster fits within one solid wall tile. Decorative
  // notes must not float over a conveyor cutout as the room grows or mirrors.
  let noteColumn = w - 3
  while (noteColumn >= 1 && occupied.has(`${x + noteColumn},${y}`)) noteColumn--
  if (room.kind !== "intake" && noteColumn >= 1) {
    const notes = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const note = box(.35, .48, .015, (i % 2) * .48, i === 2 ? 1.25 : .65, .09, i === 1 ? cream : white)
      note.rotation.z = (i - 1) * .07; notes.add(note)
    }
    notes.position.set(x + noteColumn + .26, 0, y + .08); put("notes", notes)
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: string) {
  ctx.save(); ctx.translate(82, 80); ctx.strokeStyle = "#fff5dd"; ctx.fillStyle = "#fff5dd"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round"
  if (icon === "bulb") {
    ctx.beginPath(); ctx.arc(0, -13, 25, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-13, 10); ctx.lineTo(-9, 27); ctx.lineTo(9, 27); ctx.lineTo(13, 10); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-8, 39); ctx.lineTo(8, 39); ctx.stroke()
  } else if (icon === "hammer") {
    ctx.rotate(-.65); ctx.fillRect(-6, -10, 12, 55); ctx.fillRect(-29, -31, 58, 23)
  } else if (icon === "code") {
    ctx.beginPath(); ctx.moveTo(-19, -24); ctx.lineTo(-40, 0); ctx.lineTo(-19, 24)
    ctx.moveTo(19, -24); ctx.lineTo(40, 0); ctx.lineTo(19, 24); ctx.moveTo(8, -30); ctx.lineTo(-8, 30); ctx.stroke()
  } else if (icon === "truck") {
    ctx.strokeRect(-38, -24, 47, 40); ctx.beginPath(); ctx.moveTo(9, -9); ctx.lineTo(29, -9); ctx.lineTo(38, 5); ctx.lineTo(38, 16); ctx.lineTo(9, 16); ctx.stroke()
    for (const x of [-23, 24]) { ctx.beginPath(); ctx.arc(x, 23, 8, 0, Math.PI * 2); ctx.fill() }
  } else {
    ctx.strokeRect(-27, -30, 54, 60); ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(13, -8); ctx.moveTo(-11, 11); ctx.lineTo(13, 11); ctx.stroke()
  }
  ctx.restore()
}
