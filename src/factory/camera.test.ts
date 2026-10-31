import { describe, expect, it } from "vitest"
import type { Rect } from "~/floor/types"
import { type CameraPose, clampToFloor, fitFloor, panBy, zoomBy } from "./camera"

const centred: CameraPose = { x: 10, z: 2.5, zoom: 1 }
const floor: Rect = { x: 0, y: 0, w: 30, h: 5 }

describe("wheel zoom", () => {
  // Five hundred pixels of wheel is one doubling, either way.
  it("zooms in on wheel up and out on wheel down", () => {
    expect(zoomBy(centred, -500).zoom).toBeCloseTo(2, 6)
    expect(zoomBy(centred, 500).zoom).toBeCloseTo(0.5, 6)
  })

  it("stops at four times, close enough to read a tablet", () => {
    expect(zoomBy({ ...centred, zoom: 4 }, -500).zoom).toBe(4)
  })

  it("stops at half, far enough to see the whole floor", () => {
    expect(zoomBy({ ...centred, zoom: 0.5 }, 500).zoom).toBe(0.5)
  })

  it("leaves the target where it was", () => {
    expect(zoomBy(centred, -100)).toMatchObject({ x: 10, z: 2.5 })
  })
})

describe("drag pan", () => {
  // At zoom 1 a tile is 64 pixels wide on screen. Dragging the floor right
  // by a tile brings what was a tile to the left under the centre.
  it("drags the floor sideways a tile per 64 pixels at zoom 1", () => {
    expect(panBy(centred, 64, 0)).toMatchObject({ x: 9, z: 2.5 })
  })

  it("drags half as far on the floor when zoomed in twice", () => {
    expect(panBy({ ...centred, zoom: 2 }, 64, 0).x).toBeCloseTo(9.5, 6)
  })

  // The camera looks down at 50 degrees, so a tile of depth covers only
  // sin(50°) of a tile on screen: 64 pixels of drag is 1 / 0.7660 tiles.
  it("drags the floor forward further than sideways because depth is foreshortened", () => {
    expect(panBy(centred, 0, 64).z).toBeCloseTo(2.5 - 1.3054, 3)
    expect(panBy(centred, 0, -64).z).toBeCloseTo(2.5 + 1.3054, 3)
  })
})

describe("pan limits", () => {
  it("keeps the target over the floor plus a two tile margin", () => {
    expect(clampToFloor({ ...centred, x: -10 }, floor).x).toBe(-2)
    expect(clampToFloor({ ...centred, x: 40 }, floor).x).toBe(32)
    expect(clampToFloor({ ...centred, z: -5 }, floor).z).toBe(-2)
    expect(clampToFloor({ ...centred, z: 10 }, floor).z).toBe(7)
  })

  it("leaves a target over the floor alone", () => {
    expect(clampToFloor(centred, floor)).toEqual(centred)
  })
})

describe("framing the whole line", () => {
  const viewport = { width: 1280, height: 800 }

  it("looks at the middle of the floor", () => {
    expect(fitFloor({ x: 0, y: 0, w: 10, h: 5 }, viewport)).toMatchObject({ x: 5, z: 2.5 })
  })

  // Ten tiles plus a tile of margin each side is 12 tiles, 768 pixels at
  // zoom 1, so 1280 pixels fit at 1.6667; the depth would allow more.
  it("zooms so a short floor fills the width with a tile of margin", () => {
    expect(fitFloor({ x: 0, y: 0, w: 10, h: 5 }, viewport).zoom).toBeCloseTo(1.6667, 3)
  })

  it("never zooms past the limits to fit", () => {
    expect(fitFloor({ x: 0, y: 0, w: 400, h: 5 }, viewport).zoom).toBe(0.5)
    expect(fitFloor({ x: 0, y: 0, w: 2, h: 1 }, { width: 1280, height: 1600 }).zoom).toBe(4)
  })
})
