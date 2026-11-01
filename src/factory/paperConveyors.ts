import * as THREE from "three"
import type { BeltPieceName } from "./beltPieces"
import type { BeltTile } from "~/floor/types"
import { tileKey } from "~/floor/tiles"

/** The original GLB deck is a shallow slab; the paper deck stands level with desks. */
export const LEGACY_BELT_H = .12
export const PAPER_BELT_H = .85

/** A pair of folded card supports for the primary piece of one belt tile.
 * Geometry and materials belong to the paper piece library. Corridor feet
 * extend to the ground below the room platforms, without changing deck height.
 */
export function paperBeltSupport(name: BeltPieceName, floorY: number, geometry: THREE.BufferGeometry, card: THREE.Material, edge: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  group.name = "paper-belt-support"
  const legTop = PAPER_BELT_H - LEGACY_BELT_H
  const legHeight = legTop - floorY
  const corner = name.includes("corner")
  const turn = name.includes("right") ? -1 : 1
  const positions = corner
    ? [.2, .8].map((radius) => [-.5 + radius / Math.SQRT2, turn * (-.5 + radius / Math.SQRT2)])
    : [[0, -.34], [0, .34]]
  for (const [x, z] of positions) {
    const leg = new THREE.Mesh(geometry, card)
    leg.name = "paper-belt-leg"
    leg.scale.set(.14, legHeight, .14)
    leg.position.set(x!, floorY + legHeight / 2, z!)
    leg.castShadow = true; leg.receiveShadow = true
    const foot = new THREE.Mesh(geometry, edge)
    foot.name = "paper-belt-foot"
    foot.scale.set(.25, .035, .25)
    foot.position.set(x!, floorY + .0175, z!)
    foot.castShadow = true; foot.receiveShadow = true
    group.add(leg, foot)
  }
  return group
}

/** Desks bridge their whole 2.8-tile width at deck height. Only the exposed
 * strip of a neighbouring straight bridge remains visible, with no leg under
 * the desk. The root stays at its logical tile for slides and routing; all
 * geometry/materials remain shared with the original piece library.
 */
export function trimPaperBeltAtBenches(piece: THREE.Group, tile: BeltTile, benches: ReadonlySet<string>, benchWidth = 2.8): void {
  if (tile.kind !== "straight" || (tile.dir !== "e" && tile.dir !== "w")) return
  const left = benches.has(tileKey({ x: tile.x - 1, y: tile.y }))
  const right = benches.has(tileKey({ x: tile.x + 1, y: tile.y }))
  if (!left && !right) return
  const halfWidth = benchWidth / 2
  const start = left ? halfWidth - 1 : -.5
  const end = right ? 1 - halfWidth : .5
  const deck = new THREE.Group()
  deck.name = "paper-belt-exposed-deck"
  for (const child of [...piece.children]) {
    piece.remove(child)
    if (child.name !== "paper-belt-support") deck.add(child)
  }
  if (end <= start) return
  deck.scale.x = end - start
  deck.position.x = (start + end) / 2
  piece.add(deck)
}
