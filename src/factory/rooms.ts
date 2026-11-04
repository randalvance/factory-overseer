import * as THREE from "three"
import type { Layout, RoomFootprint } from "~/floor/types"
import { ROOM_THEME_SLOTS, type ResolvedRoomTheme } from "~/model/roomThemes"
import { wayIn } from "~/floor/walk"
import type { ThemeAssets } from "./roomThemeAssets"
import { isShared } from "./models"
import { paperWallPortSide } from "./paperWallPorts"
import { paperFloorProfile, paperFloorTexture } from "./paperFlooring"
import { roomBillboardPlacement } from "./billboardGeometry"
import { roomBillboard, roomIdentity } from "./roomBillboards"
import type { BillboardAssets } from "./roomBillboardAssets"

type Add = (name: string, piece: THREE.Object3D) => void

/** The paper room is an authored piece of scenery; routing owns all openings. */
export function drawRooms(layout: Layout, add: Add, themes?: ReadonlyMap<string, ResolvedRoomTheme>, assets?: ThemeAssets, billboards?: BillboardAssets) {
  const occupied = new Set(layout.belts.flatMap((belt) => belt.tiles.map((tile) => `${tile.x},${tile.y}`)))
  for (const room of layout.rooms ?? []) {
    const definition = layout.routing?.configuration.rooms.find((definition) => `room:${definition.id}` === room.id)
    add(`room:${room.id}:sign`, roomBillboard(room, roomBillboardPlacement(room, layout.intake.rect), definition?.billboard, billboards))
    // Intake's sign sits on its outdoor hopper; it has no room enclosure.
    if (room.kind !== "intake") drawPaperRoom(room, occupied, add, layout, themes?.get(room.id), assets)
  }
}

function drawPaperRoom(room: RoomFootprint, occupied: Set<string>, add: Add, layout: Layout, theme?: ResolvedRoomTheme, assets?: ThemeAssets) {
  const { x, y, w, h } = room.rect
  const palette = roomIdentity(room)
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

  // The rear sheet stays continuous. All configured conveyor connections
  // pass through a left/right wall, never the back or open front edge.
  for (let i = 0; i < w; i++) {
    const group = new THREE.Group()
    group.add(box(1, 2.3, .12, 0, 1.15, 0, color), box(1.02, .065, .18, 0, 2.32, 0, cream))
    group.position.set(x + i + .5, 0, y + .09)
    put(`back:${i}`, group)
  }
  const sideOpenings = new Set<string>()
  for (const belt of layout.belts) for (const tile of belt.tiles) {
    const side = paperWallPortSide(tile, room)
    if (side) sideOpenings.add(`${side}:${tile.y}`)
  }
  for (const [side, xx] of [["left", x + .08], ["right", x + w - .08]] as const) {
    for (let i = 0; i < h; i++) {
      const height = i < 2 ? 2.3 - i * .35 : .72
      if (sideOpenings.has(`${side}:${y + i}`)) {
        // The same cardstock frame surrounds each real side connection.
        // Its opening clears the dark housing and .6-tile parcels; the
        // logical belt remains on its original tile centre.
        const frame = new THREE.Group()
        for (const dz of [-.54, .54]) frame.add(box(.20, 1.63, .08, 0, .815, dz))
        frame.add(box(.20, .08, 1.16, 0, 1.59, 0))
        frame.add(box(.20, .04, 1.16, 0, .02, 0))
        frame.position.set(xx, 0, y + i + .5)
        put(`${side}-frame:${i}`, frame)
        if (height > 1.63) {
          const lintel = new THREE.Group()
          lintel.add(box(.12, height - 1.63, 1, 0, (height + 1.63) / 2, 0, color))
          lintel.add(box(.19, .06, 1.02, 0, height + .02, 0, white))
          lintel.position.copy(frame.position); put(`${side}:${i}`, lintel)
        }
        continue
      }
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
