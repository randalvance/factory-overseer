import { describe, expect, it } from "vitest"
import * as THREE from "three"
import type { BeltTile, Direction } from "~/floor/types"
import type { Pieces } from "./models"
import { beltTile } from "./pieces"
import { createPaperJunctions, paperJunctionKind, paperJunctionPorts, registerPaperJunctions } from "./paperJunctions"
import { PAPER_BELT_H } from "./paperConveyors"

type Junction = Extract<BeltTile, { kind: "junction" }>
const make = (entries: Direction[], exits: Direction[]): Junction => ({ kind: "junction", x: 3, y: 4, dir: exits[0]!, entries, exits })
const render = createPaperJunctions((resource) => resource)
const sides: Record<Direction, readonly [number, number]> = { n: [0, -.49], e: [.49, 0], s: [0, .49], w: [-.49, 0] }

describe("paper splitter and merger modules", () => {
  it.each([
    { tile: make(["e"], ["e", "s"]), ports: ["e", "s", "w"], kind: "splitter" },
    { tile: make(["e", "n"], ["e"]), ports: ["e", "s", "w"], kind: "merger" },
    { tile: make(["e", "n"], ["e", "n"]), ports: ["n", "e", "s", "w"], kind: "splitter-merger" },
    { tile: make(["e", "w"], ["e", "w"]), ports: ["e", "w"], kind: "splitter-merger" },
  ])("builds one connected surface for $kind with exactly its physical ports", ({ tile, ports, kind }) => {
    expect(paperJunctionPorts(tile)).toEqual(ports)
    expect(paperJunctionKind(tile)).toBe(kind)
    const group = render(tile, 0)
    const surface = group.getObjectByName("junction-surface") as THREE.Mesh
    expect(group.children.filter((child) => child.name === "junction-deck")).toHaveLength(1)
    expect(group.children.filter((child) => child.name === "junction-surface")).toHaveLength(1)
    expect(group.userData.junctionKind).toBe(kind)
    group.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0))
    expect(ray.intersectObject(surface)).not.toHaveLength(0)
    for (const [side, [x, z]] of Object.entries(sides)) {
      ray.ray.origin.set(x, 2, z)
      expect(ray.intersectObject(surface).length > 0).toBe(ports.includes(side))
    }
    expect((surface.material as THREE.MeshLambertMaterial).color.getHex()).toBe(0x779886)
  })

  it("keeps the low roof plain and leaves no visible internal arrows", () => {
    const group = render(make(["e", "n"], ["e", "n"]), 0)
    expect(group.children.filter((child) => child.name.startsWith("junction-entry-"))).toHaveLength(0)
    expect(group.children.filter((child) => child.name.startsWith("junction-exit-"))).toHaveLength(0)
    expect(group.children.filter((child) => child.name.startsWith("junction-roof-")).map((child) => child.name)).toEqual(["junction-roof-face"])
  })

  it("fades sage belts into a recessed shadow that hides passing parcels", () => {
    const group = render(make(["e"], ["e", "s"]), 0)
    group.updateMatrixWorld(true)
    for (const side of paperJunctionPorts(make(["e"], ["e", "s"]))) {
      const fade = group.getObjectByName("junction-mouth-fade-" + side) as THREE.Mesh
      const colors = fade.geometry.getAttribute("color")
      expect(colors.getW(0)).toBeGreaterThan(.98)
      expect(colors.getW(colors.count - 1)).toBe(0)
      expect(fade.material).toMatchObject({ transparent: true, depthWrite: false })
      const [x, z] = sides[side as Direction]
      const outward = new THREE.Vector3(x, 0, z).normalize()
      const ray = new THREE.Raycaster(outward.clone().setY(1.15), outward.negate(), 0, 1)
      const hits = ray.intersectObject(group, true)
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((hit) => hit.object.userData.junctionShadow)).toBe(true)
      // The first dark layer is recessed inside the .5-tile outer face.
      expect(hits[0]!.distance).toBeGreaterThanOrEqual(.509)
      expect(hits.some((hit) => hit.object.name === "junction-shadow-core")).toBe(true)
    }
    const core = new THREE.Box3().setFromObject(group.getObjectByName("junction-shadow-core")!)
    expect(core.containsBox(new THREE.Box3(new THREE.Vector3(-.3, PAPER_BELT_H + .001, -.3), new THREE.Vector3(.3, PAPER_BELT_H + .6, .3)))).toBe(true)
    const frontFade = group.getObjectByName("junction-mouth-fade-s") as THREE.Mesh
    const positions = frontFade.geometry.getAttribute("position")
    expect(positions.getZ(positions.count - 1) - positions.getZ(0)).toBeGreaterThan(.45)
    const frontLayers = group.children.filter((child) => child.name === "junction-mouth-shadow-s") as THREE.Mesh[]
    expect(frontLayers.at(-1)!.position.z).toBeCloseTo(.31)
    expect(frontLayers.at(-1)!.material).toMatchObject({ transparent: false })
    const opacities = frontLayers.slice(0, -1).map((mesh) => (mesh.material as THREE.Material).opacity)
    expect(opacities[0]).toBeLessThan(.05)
    expect(opacities.every((opacity, index) => index === 0 || opacity > opacities[index - 1]!)).toBe(true)
  })

  it("grounds all four feet while keeping the same deck and parcel turning clearance", () => {
    const group = render(make(["s"], ["s", "e"]), -.22)
    const feet = group.children.filter((child) => child.name === "junction-foot")
    expect(feet).toHaveLength(4)
    for (const foot of feet) expect(new THREE.Box3().setFromObject(foot).min.y).toBeCloseTo(-.22)
    expect(new THREE.Box3().setFromObject(group.getObjectByName("junction-deck")!).max.y).toBeCloseTo(PAPER_BELT_H)
    const posts = group.children.filter((child) => child.name === "junction-post")
    expect(posts).toHaveLength(4)
    for (const post of posts) {
      const bounds = new THREE.Box3().setFromObject(post)
      expect(Math.min(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeGreaterThan(.3)
      expect(Math.min(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeGreaterThan(.3)
    }
  })

  it.each([
    make(["e"], ["e", "s"]),
    make(["e", "n"], ["e", "n"]),
    make(["e", "w"], ["e", "w"]),
    make(["s", "n"], ["s", "n"]),
  ])("opens connected holes with parcel clearance and covers every unused side: %j", (tile) => {
    const ports = paperJunctionPorts(tile)
    const group = render(tile, 0)
    group.updateMatrixWorld(true)
    // Check each face independently, stopping inside the housing before
    // an unused opposite face. Optical shadows are non-structural.
    const ray = new THREE.Raycaster()
    ray.far = .7
    for (const [side, [x, z]] of Object.entries(sides)) {
      const direction = new THREE.Vector3(-x, 0, -z).normalize()
      for (const offset of [-.36, 0, .36]) for (const y of [PAPER_BELT_H + .02, PAPER_BELT_H + .62]) {
        ray.set(new THREE.Vector3(x * 2 - direction.z * offset, y, z * 2 + direction.x * offset), direction)
        const structuralHits = ray.intersectObject(group, true).filter((hit) => !hit.object.userData.junctionShadow)
        if (ports.includes(side as Direction)) expect(structuralHits).toHaveLength(0)
        else {
          expect(structuralHits.length).toBeGreaterThan(0)
          expect(structuralHits.every((hit) => hit.object.name.startsWith("junction-cover-"))).toBe(true)
        }
      }
    }
    for (const side of Object.keys(sides)) {
      expect(Boolean(group.getObjectByName("junction-cover-" + side))).toBe(!ports.includes(side as Direction))
      expect(Boolean(group.getObjectByName("junction-mouth-fade-" + side))).toBe(ports.includes(side as Direction))
      const header = group.getObjectByName("junction-header-" + side)!
      expect(new THREE.Box3().setFromObject(header).min.y).toBeCloseTo(PAPER_BELT_H + .64)
    }
    const physical = new THREE.Group()
    for (const child of group.children) if (!child.name.startsWith("junction-mouth-")) physical.add(child.clone())
    const bounds = new THREE.Box3().setFromObject(physical)
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(1.08)
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(1.08)
    expect(bounds.max.y).toBeLessThan(PAPER_BELT_H + .75)
    expect(new THREE.Box3().setFromObject(group.getObjectByName("junction-roof")!).min.y).toBeGreaterThan(PAPER_BELT_H + .6)
  })

  it("shares plate resources across equal topology without sharing mutable objects", () => {
    const a = render(make(["e"], ["e", "s"]), 0)
    const b = render(make(["e", "n"], ["e"]), -.22)
    const surfaceA = a.getObjectByName("junction-surface") as THREE.Mesh
    const surfaceB = b.getObjectByName("junction-surface") as THREE.Mesh
    expect(surfaceA).not.toBe(surfaceB)
    expect(surfaceA.geometry).toBe(surfaceB.geometry)
    expect(surfaceA.material).toBe(surfaceB.material)
  })

  it("replaces the shared junction geometry with one paper module", () => {
    let clones = 0
    const texture = new THREE.Texture()
    const pieces: Pieces = {
      paper: true, floor: texture, cardboard: texture, belts: { forward: texture, rework: texture },
      clone: () => { clones++; return new THREE.Group() },
    }
    registerPaperJunctions(pieces, render)
    const tile = make(["e"], ["e", "s"])
    const paper = beltTile(tile, "rework", pieces, -.22)
    expect(paper.position.toArray()).toEqual([3.5, 0, 4.5])
    expect(paper.children).toHaveLength(1)
    expect(paper.children[0]!.name).toBe("paper-junction")
    expect(clones).toBe(0)
  })
})
