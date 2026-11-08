import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import type { Rect } from "~/floor/types"
import { drawPaperGround, paperGrassSites, paperGroundBounds, PAPER_GROUND_Y } from "./paperGround"
import { PAPER_BIOMES } from "./paperBiomes"

const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: {
  agents: exampleRooms.rooms.map((room) => ({ id: room.id + "-1", name: room.label, roomId: room.id, role: room.role, status: "idle" })),
  tasks: [], humanRequests: [],
} }, undefined, 28)
const truck: Rect = { x: 7, y: layout.bounds.h + .25, w: 2.4, h: 3.7 }

describe("paper lawn", () => {
  it("keeps the lawn top at the feet of the exterior conveyors, below room floors", () => {
    const ground = drawPaperGround(layout, [truck])
    const base = ground.getObjectByName("grass-cardstock")!
    const bounds = new THREE.Box3().setFromObject(base)
    expect(bounds.max.y).toBeCloseTo(PAPER_GROUND_Y)
    expect(bounds.min.y).toBeCloseTo(PAPER_GROUND_Y)
    expect(bounds.max.y).toBeLessThan(0)
    expect((base as THREE.Mesh).receiveShadow).toBe(true)
  })

  it("covers the visible ground while keeping tuft sampling bounded near the factory", () => {
    const ground = paperGroundBounds(layout)
    expect(ground.x).toBeLessThanOrEqual(layout.bounds.x - 100)
    expect(ground.y).toBeLessThanOrEqual(layout.bounds.y - 100)
    expect(ground.x + ground.w).toBeGreaterThanOrEqual(layout.bounds.x + layout.bounds.w + 100)
    expect(ground.y + ground.h).toBeGreaterThanOrEqual(layout.bounds.y + layout.bounds.h + 100)
    const road = { x: 7, y: layout.bounds.h, w: 3.4, h: 120 }
    const sites = paperGrassSites(layout, [truck, road])
    expect(sites.every((site) => site.z <= layout.bounds.y + layout.bounds.h + 6)).toBe(true)
    expect(sites.length).toBeLessThan(500)
    const base = drawPaperGround(layout).getObjectByName("grass-cardstock") as THREE.Mesh
    const material = base.material as THREE.MeshLambertMaterial
    expect(material.map?.wrapS).toBe(THREE.RepeatWrapping)
    expect(base.userData.disposeTexture).toBe(true)
  })

  it("keeps all raised grass clear of rooms, conveyors and the loading apron", () => {
    const sites = paperGrassSites(layout, [truck])
    expect(sites.length).toBeGreaterThan(0)
    expect(sites).toEqual(paperGrassSites(layout, [truck]))
    const occupied = [...layout.rooms!.map((room) => room.rect), truck,
      ...layout.belts.flatMap((belt) => belt.tiles.map((tile) => ({ x: tile.x, y: tile.y, w: 1, h: 1 })))]
    for (const point of sites) {
      expect(occupied.some(({ x, y, w, h }) => point.x > x - .38 && point.x < x + w + .38 && point.z > y - .38 && point.z < y + h + .38)).toBe(false)
    }
    const tufts = drawPaperGround(layout, [truck]).getObjectByName("grass-folded-tufts") as THREE.InstancedMesh
    expect(tufts.isInstancedMesh).toBe(true)
    expect(tufts.count).toBe(sites.length)
  })
})

describe("paper biomes", () => {
  const texel = (biome: "grass" | "desert" | "snow") => {
    const base = drawPaperGround(layout, [truck], biome).getObjectByName(PAPER_BIOMES[biome].names.ground) as THREE.Mesh
    const data = ((base.material as THREE.MeshLambertMaterial).map as THREE.DataTexture).image.data as Uint8Array
    // Average the grain away to recover the cardstock colour.
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!
    return sum.map((value) => Math.round(value / (data.length / 4)))
  }

  it("keeps grass as it was when no biome is given", () => {
    expect(drawPaperGround(layout, [truck]).getObjectByName("grass-cardstock")).toBeDefined()
    expect(paperGrassSites(layout, [truck])).toEqual(paperGrassSites(layout, [truck], "grass"))
    const [r, g, b] = texel("grass")
    expect(Math.abs(r! - 167) + Math.abs(g! - 188) + Math.abs(b! - 124)).toBeLessThan(6)
  })

  it("cuts desert sand and snow from their own procedural paper, with sparser tufts", () => {
    const grass = paperGrassSites(layout, [truck])
    for (const biome of ["desert", "snow"] as const) {
      const { names, ground, patches } = PAPER_BIOMES[biome]
      const drawn = drawPaperGround(layout, [truck], biome)
      for (const name of [names.ground, names.patches, names.tufts]) expect(drawn.getObjectByName(name)).toBeDefined()
      expect(drawn.getObjectByName("grass-cardstock")).toBeUndefined()
      const [r, g, b] = texel(biome)
      expect(Math.abs(r! - (ground >> 16 & 255)) + Math.abs(g! - (ground >> 8 & 255)) + Math.abs(b! - (ground & 255))).toBeLessThan(6)
      const sites = paperGrassSites(layout, [truck], biome)
      expect(sites.length).toBeGreaterThan(0)
      expect(sites.length).toBeLessThan(grass.length)
      // Every site still clears circulation: a sparser biome only drops sites.
      expect(sites.every((site) => grass.some((kept) => kept.x === site.x && kept.z === site.z))).toBe(true)
      const colors = (drawn.getObjectByName(names.patches) as THREE.Mesh).geometry.getAttribute("color")
      const sand = new THREE.Color(patches[0]!)
      expect(colors.getX(0)).toBeCloseTo(sand.r)
      const material = (drawn.getObjectByName(names.ground) as THREE.Mesh).material as THREE.MeshLambertMaterial
      expect(material.map).toBeInstanceOf(THREE.DataTexture)
    }
    expect(texel("snow")[0]).toBeGreaterThan(texel("desert")[2]!)
  })
})
