import * as THREE from "three"
import type { Layout, RoomFootprint } from "~/floor/types"
import { floorSlab } from "./pieces"
import { paperFloorProfile, paperFloorTexture } from "./paperFlooring"
import { canvasTexture, pixelated } from "./textures"

type Add = (name: string, piece: THREE.Object3D) => void

/** The paper room is an authored piece of scenery; routing owns all openings. */
export function drawRooms(layout: Layout, floorTexture: THREE.Texture, add: Add, paper = false) {
  const occupied = new Set(layout.belts.flatMap((belt) => belt.tiles.map((tile) => `${tile.x},${tile.y}`)))
  for (const room of layout.rooms ?? []) {
    // Intake remains a logical routing endpoint, with its hopper on grass.
    if (paper && room.kind === "intake") continue
    if (paper) { drawPaperRoom(room, occupied, add); continue }
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

function drawPaperRoom(room: RoomFootprint, occupied: Set<string>, add: Add) {
  const { x, y, w, h } = room.rect
  const palette = identity(room)
  const cream = new THREE.MeshLambertMaterial({ color: 0xfff1d5 })
  const edge = new THREE.MeshLambertMaterial({ color: 0xd5bf96 })
  const white = new THREE.MeshLambertMaterial({ color: 0xfff9e9 })
  const color = new THREE.MeshLambertMaterial({ color: palette.color })
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
  const floorMap = paperFloorTexture(paperFloorProfile(room), w + .12, h + .12)
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

  const clear = (px: number, pz: number) => !occupied.has(`${Math.floor(px)},${Math.floor(pz)}`)
  // Paper plant and a few pasted notes communicate scale without filling circulation.
  const plantX = x + w - 2.65, plantZ = y + 1.45
  if (clear(plantX, plantZ)) {
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
    plant.position.set(plantX, .03, plantZ); put("plant", plant)
  }
  const furnishingX = x + 2.65, furnishingZ = y + .55
  if (clear(furnishingX, furnishingZ) && ["bulb", "code", "hammer"].includes(palette.icon)) {
    const furniture = new THREE.Group()
    // A scored card sleeve: two sides, a folded foot and a colored front flap.
    furniture.add(box(1.15, .08, .82, 0, .72, 0, color))
    for (const dx of [-.51, .51]) {
      furniture.add(box(.06, .70, .76, dx, .35, 0))
      furniture.add(box(.22, .025, .76, dx - Math.sign(dx) * .08, .025, 0, white))
    }
    if (palette.icon === "hammer") {
      furniture.add(box(1.06, .66, .05, 0, .36, .38, color))
      // Cream inset drawer faces with a narrow crease and flat pull tabs.
      for (const cy of [.22, .52]) {
        furniture.add(box(.90, .22, .025, 0, cy, .414, cream))
        furniture.add(box(.24, .045, .035, 0, cy + .03, .44, edge))
      }
      const toolbox = box(.64, .28, .40, .08, .90, -.08, color)
      furniture.add(toolbox, box(.32, .035, .025, .08, 1.06, -.08, cream))
    } else {
      // Three paper books. Separate thin covers and page blocks make their
      // folded construction legible without photographic texture.
      for (let i = 0; i < 3; i++) {
        const book = new THREE.Group()
        const cy = .80 + i * .16
        book.add(box(.80, .10, .56, 0, cy, 0, white))
        book.add(box(.84, .025, .60, 0, cy - .057, 0, i === 1 ? cream : color))
        book.add(box(.84, .025, .60, 0, cy + .057, 0, i === 1 ? cream : color))
        book.add(box(.025, .14, .60, -.41, cy, 0, i === 1 ? cream : color))
        book.rotation.y = (i - 1) * .07
        furniture.add(book)
      }
    }
    furniture.position.set(furnishingX, .02, furnishingZ)
    put("side-furnishing", furniture)
  }
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
