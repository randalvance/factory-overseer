import * as THREE from "three"
import type { RoomFootprint } from "~/floor/types"
import type { RoomBillboard } from "~/model/rooms"
import type { BillboardAssets } from "./roomBillboardAssets"
import type { roomBillboardPlacement } from "./billboardGeometry"
import { canvasTexture } from "./textures"

/** A folded card, with independently filtered artwork beside a readable label. */
export function roomBillboard(room: RoomFootprint, placement: ReturnType<typeof roomBillboardPlacement>, billboard?: RoomBillboard, assets?: BillboardAssets): THREE.Group {
  const { width, height, x, y, z } = placement
  const palette = roomIdentity(room)
  const sign = new THREE.Group()
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, .12), new THREE.MeshLambertMaterial({ color: 0xfff1d5 }))
  board.castShadow = board.receiveShadow = true
  sign.add(board)
  const graphic = assets?.image(billboard)
  const map = canvasTexture(768, 160, (ctx, width, height) => {
    ctx.fillStyle = "#fff0d5"; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = "#eedabc"; ctx.lineWidth = 3; ctx.strokeRect(2, 2, width - 4, height - 4)
    if (!graphic) {
      ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.roundRect(20, 18, 124, 124, 17); ctx.fill()
      drawIcon(ctx, palette.icon)
    }
    ctx.fillStyle = "#283a45"; ctx.font = "bold 46px Arial, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"
    ctx.fillText(room.label.toUpperCase(), 172, height / 2 + 1, width - 195)
  })
  const faceW = width - .035, faceH = height - .035
  const face = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceH), new THREE.MeshBasicMaterial({ map }))
  face.position.z = .065
  face.userData.disposeTexture = true
  sign.add(face)
  if (graphic) {
    const image = graphic.image as { width: number; height: number }
    const size = Math.min(faceW * 124 / 768, faceH * 124 / 160)
    const ratio = image.width / image.height
    const artwork = new THREE.Mesh(new THREE.PlaneGeometry(size * Math.min(ratio, 1), size / Math.max(ratio, 1)),
      new THREE.MeshBasicMaterial({ map: graphic, transparent: true, depthWrite: false }))
    artwork.position.set(faceW * (82 / 768 - .5), 0, .069)
    artwork.userData.disposeTexture = true
    sign.add(artwork)
  }
  sign.position.set(x, y, z)
  return sign
}

export function roomIdentity(room: RoomFootprint) {
  const name = room.id.toLowerCase()
  if (room.kind === "staging") return { color: 0xc5ad82, ink: "#9b8055", icon: "parcel" }
  if (room.kind === "deployment") return { color: 0xc98366, ink: "#b97055", icon: "truck" }
  if (name.includes("plan") || name.includes("research")) return { color: 0x82a8bd, ink: "#618fae", icon: "bulb" }
  if (name.includes("implement") || name.includes("foundry")) return { color: 0xe2b45d, ink: "#d5a145", icon: "hammer" }
  if (name.includes("review") || name.includes("qa")) return { color: 0x9db79b, ink: "#719881", icon: "code" }
  return { color: 0xa6b88d, ink: "#71967b", icon: "parcel" }
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
