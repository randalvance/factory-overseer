import { describe, expect, it, vi } from "vitest"
import * as THREE from "three"
import { layoutFloor } from "~/floor/layout"
import type { Pieces } from "./models"
import { beltTile, containerWalls, heightsOver } from "./pieces"
import { LEGACY_BELT_H, PAPER_BELT_H, paperBeltSupport, trimPaperBeltAtBenches } from "./paperConveyors"

// Texture drawing belongs to browser checks; these tests inspect real mesh
// bounds and parcel surfaces without a DOM or WebGL context.
vi.mock("./textures", async (original) => ({
  ...await original<typeof import("./textures")>(),
  canvasTexture: () => new THREE.Texture(),
}))

const geometry = new THREE.BoxGeometry(1, 1, 1)
const card = new THREE.MeshLambertMaterial()
const edge = new THREE.MeshLambertMaterial()

function library(paper: boolean): Pieces {
  const texture = new THREE.Texture()
  return {
    paper, floor: texture, cardboard: texture, belts: { forward: texture, rework: texture },
    clone() {
      const deck = new THREE.Mesh(geometry, card)
      deck.scale.set(1, LEGACY_BELT_H, .9)
      deck.position.y = (paper ? PAPER_BELT_H : LEGACY_BELT_H) - LEGACY_BELT_H / 2
      return deck
    },
    beltSupport: paper ? (name, floorY) => paperBeltSupport(name, floorY, geometry, card, edge) : undefined,
  }
}

describe("raised paper conveyors", () => {
  it.each([0, -.22])("grounds feet at %s while supporting the same deck height", (floorY) => {
    const support = paperBeltSupport("belt-straight", floorY, geometry, card, edge)
    const bounds = new THREE.Box3().setFromObject(support)
    expect(bounds.min.y).toBeCloseTo(floorY)
    expect(bounds.max.y).toBeCloseTo(PAPER_BELT_H - LEGACY_BELT_H)
    expect(support.children.filter((child) => child.name === "paper-belt-leg")).toHaveLength(2)
    expect(support.children.filter((child) => child.name === "paper-belt-foot")).toHaveLength(2)
    expect(support.children.every((child) => (child as THREE.Mesh).geometry === geometry)).toBe(true)
  })

  it("supports a junction once even when several arms share its deck", () => {
    const belt = beltTile({ kind: "junction", x: 3, y: 4, dir: "e", entries: ["e", "n"], exits: ["e", "s"] }, "forward", library(true), -.22)
    const legs: THREE.Object3D[] = []
    belt.traverse((object) => { if (object.name === "paper-belt-leg") legs.push(object) })
    expect(legs).toHaveLength(2)
    expect(new THREE.Box3().setFromObject(belt).max.y).toBeCloseTo(PAPER_BELT_H)
    expect(new THREE.Box3().setFromObject(belt).min.y).toBeCloseTo(-.22)
  })

  it("keeps corner supports under the curved deck after the tile turns", () => {
    const belt = beltTile({ kind: "corner", x: 0, y: 0, from: "s", to: "e" }, "rework", library(true))
    const support = belt.children.at(-1)!
    expect(support.rotation.y).toBeCloseTo(-Math.PI / 2)
    const legs = support.children.filter((child) => child.name === "paper-belt-leg")
    // Both legs lie on the corner's diagonal, between its inner and outer rims.
    expect(legs[0]!.position.x).toBeCloseTo(legs[0]!.position.z)
    expect(legs[1]!.position.x).toBeCloseTo(legs[1]!.position.z)
  })

  it("retains the original floor-level legacy deck without adding supports", () => {
    const belt = beltTile({ kind: "straight", x: 0, y: 0, dir: "e" }, "forward", library(false))
    expect(belt.children).toHaveLength(1)
    expect(new THREE.Box3().setFromObject(belt).max.y).toBeCloseTo(LEGACY_BELT_H)
  })

  it("rests parcels on the raised belts and deployment tray, level with desks", () => {
    const layout = layoutFloor({ roles: ["implementer"] }, {
      agents: [{ id: "a", name: "Ada", role: "implementer", status: "idle" }], tasks: [],
    })
    const paper = heightsOver(layout, true)
    const legacy = heightsOver(layout)
    const bench = layout.bays[0]!.stations[0]!.bench
    for (const belt of layout.belts) for (const tile of belt.tiles) expect(paper(tile)).toBe(PAPER_BELT_H)
    expect(paper(bench)).toBe(PAPER_BELT_H)
    expect(legacy(bench)).toBe(.5)
    const belt = layout.belts[0]!.tiles[0]!
    expect(legacy(belt)).toBe(LEGACY_BELT_H)
    const stack = { x: layout.container.rect.x + 1, y: layout.container.rect.y }
    expect(paper(stack)).toBe(PAPER_BELT_H)
    const tray = containerWalls(layout.container, true).children[0]!
    expect(new THREE.Box3().setFromObject(tray).max.y).toBeCloseTo(paper(stack))
  })
})


describe("paper desks replacing the deck beneath them", () => {
  it.each(["e", "w"] as const)("joins a %s bridge exactly at both desk edges without changing the logical anchors", (dir) => {
    const bench = { x: 4, y: 3 }
    const benches = new Set(["4,3"])
    for (const side of [-1, 1]) {
      const tile = { kind: "straight" as const, x: bench.x + side, y: bench.y, dir }
      const piece = beltTile(tile, "forward", library(true))
      const anchor = piece.position.clone()
      trimPaperBeltAtBenches(piece, tile, benches)
      expect(piece.position).toEqual(anchor)
      const bounds = new THREE.Box3().setFromObject(piece)
      const deskEdge = bench.x + .5 + side * 1.4
      if (side < 0) {
        expect(bounds.min.x).toBeCloseTo(tile.x)
        expect(bounds.max.x).toBeCloseTo(deskEdge)
      } else {
        expect(bounds.min.x).toBeCloseTo(deskEdge)
        expect(bounds.max.x).toBeCloseTo(tile.x + 1)
      }
      expect(bounds.max.y).toBeCloseTo(PAPER_BELT_H)
      const legs: THREE.Object3D[] = []
      piece.traverse((object) => { if (object.name === "paper-belt-leg") legs.push(object) })
      expect(legs).toHaveLength(0)
      expect((piece.children[0]!.children[0] as THREE.Mesh).geometry).toBe(geometry)
    }
  })

  it("leaves junctions and perpendicular or unrelated straights untouched", () => {
    for (const tile of [
      { kind: "junction" as const, x: 3, y: 3, dir: "e" as const, entries: ["e" as const], exits: ["e" as const, "s" as const] },
      { kind: "straight" as const, x: 3, y: 3, dir: "n" as const },
      { kind: "straight" as const, x: 1, y: 3, dir: "e" as const },
    ]) {
      const piece = beltTile(tile, "forward", library(true))
      const children = [...piece.children]
      trimPaperBeltAtBenches(piece, tile, new Set(["4,3"]))
      expect(piece.children).toEqual(children)
    }
  })
})
