import { describe, expect, it } from "vitest"
import type { Rect } from "~/floor/types"
import { type CameraPose, clampToFloor, fitFloor, panBy, pinchBy, zoomBy, zoomStep } from "./camera"

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

describe("zoom keys", () => {
  // Six presses take the zoom from half to four times, each one the square root of two.
  it("zooms in a step on plus and out a step on minus", () => {
    expect(zoomStep(centred, 1).zoom).toBeCloseTo(1.4142, 3)
    expect(zoomStep(centred, -1).zoom).toBeCloseTo(0.7071, 3)
  })

  it("stops at the limits", () => {
    expect(zoomStep({ ...centred, zoom: 4 }, 1).zoom).toBe(4)
    expect(zoomStep({ ...centred, zoom: 0.5 }, -1).zoom).toBe(0.5)
    let pose = { ...centred, zoom: 0.5 }
    for (let i = 0; i < 6; i++) pose = zoomStep(pose, 1)
    expect(pose.zoom).toBeCloseTo(4, 6)
  })
})

describe("pinch zoom", () => {
  it("scales the zoom as the fingers spread or close", () => {
    expect(pinchBy(centred, 100, 200).zoom).toBeCloseTo(2, 6)
    expect(pinchBy(centred, 200, 100).zoom).toBeCloseTo(0.5, 6)
  })

  it("stops at the limits and leaves the target where it was", () => {
    expect(pinchBy({ ...centred, zoom: 3 }, 100, 300)).toEqual({ x: 10, z: 2.5, zoom: 4 })
    expect(pinchBy(centred, 100, 10).zoom).toBe(0.5)
  })

  it("pinches nothing while the fingers have no distance between them", () => {
    expect(pinchBy(centred, 0, 100)).toEqual(centred)
    expect(pinchBy(centred, 100, 0)).toEqual(centred)
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

describe("framing the floor's width", () => {
  const viewport = { width: 1280, height: 800 }

  it("looks at the middle of a floor that fits the viewport", () => {
    expect(fitFloor({ x: 0, y: 0, w: 10, h: 5 }, viewport)).toMatchObject({ x: 5, z: 2.5 })
  })

  // Ten tiles plus a tile of margin each side is 12 tiles, 768 pixels at
  // zoom 1, so 1280 pixels fit at 1.6667; the depth would allow more.
  it("zooms so a short floor fills the width with a tile of margin", () => {
    expect(fitFloor({ x: 0, y: 0, w: 10, h: 5 }, viewport).zoom).toBeCloseTo(1.6667, 3)
  })

  // Twenty tiles plus the margins fill 1280 pixels at 0.9091, though the
  // floor's twenty-five rows would need 0.56 to fit: the width wins, so the
  // overseer never scrolls sideways.
  it("zooms to the width however tall the floor is", () => {
    expect(fitFloor({ x: 0, y: 0, w: 20, h: 25 }, viewport).zoom).toBeCloseTo(0.9091, 3)
  })

  // At that zoom the viewport is 13.75 tiles tall on screen; with a tile of
  // margin and two tiles of headroom foreshortened by the pitch above the
  // back wall, the centre of the screen falls 5.99 tiles into the floor.
  it("starts at the back of a floor taller than the viewport, from where the overseer pans toward the camera", () => {
    expect(fitFloor({ x: 0, y: 0, w: 20, h: 25 }, viewport)).toMatchObject({ x: 10 })
    expect(fitFloor({ x: 0, y: 0, w: 20, h: 25 }, viewport).z).toBeCloseTo(5.991, 2)
  })

  it("never zooms past the limits to fit", () => {
    expect(fitFloor({ x: 0, y: 0, w: 400, h: 5 }, viewport).zoom).toBe(0.5)
    expect(fitFloor({ x: 0, y: 0, w: 2, h: 1 }, { width: 1280, height: 1600 }).zoom).toBe(4)
  })
})
