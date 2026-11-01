import { describe, expect, it } from "vitest"
import { PerspectiveCamera, Vector3 } from "three"
import type { Rect } from "~/floor/types"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import { type CameraPose, clampToFloor, dioramaModelPoints, fitDiorama, fitDioramaLayout, fitFloor, PAPER_CAMERA_DISTANCE, PAPER_PITCH, PX_PER_TILE, panBy, panDiorama, paperFieldOfView, projectDioramaPoint, pinchBy, zoomBy, zoomStep } from "./camera"

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

  it("keeps paper floor movement under the pointer at its lower viewing angle", () => {
    const pose = { ...centred, zoom: 1.7 }
    const moved = panBy(pose, 83, -117, PAPER_PITCH)
    expect((pose.x - moved.x) * PX_PER_TILE * pose.zoom).toBeCloseTo(83, 6)
    expect((pose.z - moved.z) * Math.sin(PAPER_PITCH) * PX_PER_TILE * pose.zoom).toBeCloseTo(-117, 6)
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

/** Use the renderer's actual projection to check the independent framing math. */
function projectPaper(point: { x: number; y: number; z: number }, pose: CameraPose, viewport: { width: number; height: number }) {
  const camera = new PerspectiveCamera(paperFieldOfView(viewport.height), viewport.width / viewport.height, .1, 2000)
  camera.zoom = pose.zoom
  camera.position.set(pose.x, PAPER_CAMERA_DISTANCE * Math.sin(PAPER_PITCH), pose.z + PAPER_CAMERA_DISTANCE * Math.cos(PAPER_PITCH))
  camera.lookAt(pose.x, 0, pose.z)
  camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  const projected = new Vector3(point.x, point.y, point.z).project(camera)
  return { x: (projected.x + 1) * viewport.width / 2, y: (1 - projected.y) * viewport.height / 2 }
}

describe("framing the paper diorama", () => {
  it.each([{ width: 1536, height: 864 }, { width: 1280, height: 640 }])("keeps the raised model below the HUD and inside $width×$height in perspective", (viewport) => {
    const floor = { x: 0, y: 0, w: 28, h: 18 }
    const pose = fitDiorama(floor, viewport)
    for (const x of [floor.x, floor.x + floor.w]) {
      const points = [
        { x, y: -.22, z: floor.y }, { x, y: -.22, z: floor.y + floor.h },
        { x, y: .95, z: floor.y }, { x, y: .95, z: floor.y + floor.h },
        { x, y: 3.4, z: floor.y + 3 }, { x, y: 3.4, z: floor.y + floor.h - 3 },
      ]
      for (const point of points) {
        const projected = projectPaper(point, pose, viewport)
        expect(projected.x).toBeGreaterThan(0)
        expect(projected.x).toBeLessThan(viewport.width)
        expect(projected.y).toBeGreaterThanOrEqual(48)
        expect(projected.y).toBeLessThan(viewport.height)
      }
    }
    expect(pose.zoom).toBeGreaterThanOrEqual(.5)
  })

  it("keeps the floor centered horizontally and starts deep maps at a pannable rear portion", () => {
    const viewport = { width: 1280, height: 800 }
    expect(fitDiorama({ x: 4, y: 8, w: 28, h: 18 }, viewport).x).toBe(18)
    const deep = fitDiorama({ x: 0, y: 0, w: 400, h: 400 }, viewport)
    expect(deep.zoom).toBe(.5)
    expect(deep.z).toBeGreaterThan(0)
    expect(deep.z).toBeLessThan(30)
  })

  it("makes nearer rooms larger while matching the framing projection to three.js", () => {
    const pose = { x: 14, z: 9, zoom: .7 }
    const viewport = { width: 1536, height: 864 }
    const near = { x: 20, y: .85, z: 16 }
    const far = { x: 20, y: .85, z: 2 }
    const nearScreen = projectPaper(near, pose, viewport)
    const farScreen = projectPaper(far, pose, viewport)
    expect(nearScreen.x - viewport.width / 2).toBeGreaterThan((farScreen.x - viewport.width / 2) * 1.2)
    for (const point of [near, far]) {
      const projected = projectDioramaPoint(point, pose, viewport)
      const rendered = projectPaper(point, pose, viewport)
      expect(projected.x).toBeCloseTo(rendered.x, 6)
      expect(projected.y).toBeCloseTo(rendered.y, 6)
    }
  })
})

describe("dragging the paper model in perspective", () => {
  it.each([2, 16])("keeps the ground point at depth %s under the pointer", (z) => {
    const viewport = { width: 1536, height: 864 }
    const pose = { x: 14, z: 9, zoom: .8 }
    const point = { x: 10, y: 0, z }
    const before = projectPaper(point, pose, viewport)
    const at = { x: before.x + 83, y: before.y - 117 }
    const moved = panDiorama(pose, viewport, 83, -117, at)
    const after = projectPaper(point, moved, viewport)
    expect(after.x).toBeCloseTo(at.x, 6)
    expect(after.y).toBeCloseTo(at.y, 6)
  })
})


describe("framing the paper rooms and deployment truck", () => {
  it.each([{ width: 1536, height: 864 }, { width: 1280, height: 640 }])("fills $width×$height using occupied geometry and keeps every physical edge below the HUD", (viewport) => {
    const configuration = structuredClone(exampleRooms)
    const layout = layoutConfiguredRooms({
      configuration,
      snapshot: {
        agents: configuration.rooms.map((room) => ({ id: room.id + "-agent", name: room.label, role: room.role, roomId: room.id, status: "working" })),
        tasks: [], humanRequests: [],
      },
    }, undefined, 28)
    const pose = fitDioramaLayout(layout, viewport)
    const projected = dioramaModelPoints(layout).map((point) => projectPaper(point, pose, viewport))
    const left = Math.min(...projected.map((point) => point.x))
    const right = Math.max(...projected.map((point) => point.x))
    const top = Math.min(...projected.map((point) => point.y))
    const bottom = Math.max(...projected.map((point) => point.y))
    expect(left).toBeGreaterThan(0)
    expect(right).toBeLessThan(viewport.width)
    expect(top).toBeGreaterThanOrEqual(48)
    expect(bottom).toBeLessThan(viewport.height)
    expect((left + right) / 2).toBeCloseTo(viewport.width / 2, 3)
    expect((top + bottom) / 2).toBeCloseTo((viewport.height + 48) / 2, 3)
    // The terminal extends beyond enclosed rooms and stays inside Fit all.
    expect(Math.max(...dioramaModelPoints(layout).map((point) => point.z))).toBeGreaterThan(
      Math.max(...layout.rooms!.map((room) => room.rect.y + room.rect.h)))
    expect(pose.zoom).toBeGreaterThanOrEqual(.5)
  })
})
