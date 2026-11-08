import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import { type HopperDragState, attachHopperDrop, hopperDragState, hopperDropEffect } from "./hopperDrop"
import { hopperBounds, hopperGlow, hopperMouth, hopperRim } from "./pieces"

/** A canvas as far as the drag wiring sees one: an event target at the page's corner. */
function fakeCanvas() {
  return Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 10, top: 20 }) }) as unknown as HTMLCanvasElement
}

/** A drag event as the browser sends one, carrying data of these types. */
function drag(type: string, at: { x: number; y: number }, data: Record<string, string> = { "application/x-task": "{}" }) {
  const event = new Event(type, { cancelable: true }) as Event & { clientX: number; clientY: number; dataTransfer: unknown }
  const transfer = { types: Object.keys(data), dropEffect: "move", getData: (key: string) => data[key] ?? "" }
  return Object.assign(event, { clientX: at.x, clientY: at.y, dataTransfer: transfer })
}

describe("the hopper's drag states", () => {
  it("arms for an accepted drag and offers a copy only over the hopper", () => {
    expect(hopperDragState(false, true)).toBe("none")
    expect(hopperDragState(true, false)).toBe("armed")
    expect(hopperDragState(true, true)).toBe("over")
    expect(hopperDropEffect("over")).toBe("copy")
    expect(hopperDropEffect("armed")).toBe("none")
  })

  it("takes an accepted drag let go over the hopper, and leaves every other drag to the page", () => {
    const canvas = fakeCanvas()
    const states: HopperDragState[] = []
    const drops: { data: string; point: { x: number; y: number } }[] = []
    const detach = attachHopperDrop(canvas, {
      accepts: (types) => types.includes("application/x-task"),
      // The hopper covers the canvas's left half.
      over: (point) => point.x < 100,
      changed: (state) => states.push(state),
      drop: (transfer, point) => drops.push({ data: transfer.getData("application/x-task"), point }),
    })

    const foreign = drag("dragover", { x: 50, y: 50 }, { "text/uri-list": "https://example.com" })
    canvas.dispatchEvent(foreign)
    expect(foreign.defaultPrevented).toBe(false)

    const entering = drag("dragenter", { x: 300, y: 50 })
    canvas.dispatchEvent(entering)
    expect(entering.defaultPrevented).toBe(true)
    expect((entering.dataTransfer as { dropEffect: string }).dropEffect).toBe("none")
    const overHopper = drag("dragover", { x: 60, y: 50 })
    canvas.dispatchEvent(overHopper)
    expect((overHopper.dataTransfer as { dropEffect: string }).dropEffect).toBe("copy")
    canvas.dispatchEvent(drag("drop", { x: 60, y: 50 }, { "application/x-task": "{\"label\":\"Write docs\"}" }))
    expect(drops).toEqual([{ data: "{\"label\":\"Write docs\"}", point: { x: 50, y: 30 } }])

    // Let go beside the hopper: nothing is queued.
    canvas.dispatchEvent(drag("dragover", { x: 300, y: 50 }))
    canvas.dispatchEvent(drag("drop", { x: 300, y: 50 }))
    canvas.dispatchEvent(drag("dragover", { x: 300, y: 50 }))
    canvas.dispatchEvent(new Event("dragleave"))
    expect(drops).toHaveLength(1)
    expect(states).toEqual(["armed", "over", "none", "armed", "none", "armed", "none"])

    detach()
    canvas.dispatchEvent(drag("dragover", { x: 60, y: 50 }))
    expect(states).toHaveLength(7)
  })
})

describe("the hopper as a target", () => {
  const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: { agents: [], tasks: [], humanRequests: [] } }, undefined, 28)

  it("stands from the ground to over its rim around the mouth, and a ray down into it lands", () => {
    const bounds = hopperBounds(layout.intake)
    const mouth = hopperMouth(layout.intake), rim = hopperRim(layout.intake)
    expect(bounds.containsPoint(mouth)).toBe(true)
    expect(bounds.containsPoint(rim)).toBe(true)
    expect(bounds.min.y).toBeCloseTo(-.22)
    expect(bounds.max.y).toBeGreaterThan(rim.y)
    // From the camera's side, looking down into the funnel, and looking at open paper beside it.
    const into = new THREE.Ray(new THREE.Vector3(mouth.x, 30, mouth.z + 24), new THREE.Vector3(0, -30, -24).normalize())
    expect(into.intersectsBox(bounds)).toBe(true)
    const beside = new THREE.Ray(new THREE.Vector3(mouth.x + 4, 30, mouth.z + 24), new THREE.Vector3(0, -30, -24).normalize())
    expect(beside.intersectsBox(bounds)).toBe(false)
  })

  it("keeps the glow hidden until a drag lights it, outside the hopper's rim", () => {
    const glow = hopperGlow()
    expect(glow.visible).toBe(false)
    glow.geometry.computeBoundingBox()
    expect(glow.geometry.boundingBox!.max.x).toBeGreaterThan(1.2)
    expect(glow.geometry.boundingBox!.max.y - glow.geometry.boundingBox!.min.y).toBeCloseTo(0)
  })
})
