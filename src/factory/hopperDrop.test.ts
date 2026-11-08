import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { layoutConfiguredRooms } from "~/floor/configuredRooms"
import { exampleRooms } from "~/model/roomExamples"
import {
  type HopperDragState,
  attachHopperDrop,
  hitsHopper,
  hopperDragState,
  hopperDropEffect,
  hopperHitTarget,
} from "./hopperDrop"
import { PAPER_GROUND_Y } from "./paperGround"
import { hopper, hopperGlow, hopperMouth, hopperRim, pallet, placeHopperGlow } from "./pieces"
import { SLIDE_S, startSlide } from "./slide"

/** A canvas as far as the drag wiring sees one: an event target at the page's corner. */
function fakeCanvas() {
  return Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 10, top: 20 }) }) as unknown as HTMLCanvasElement
}

/** A drag event as the browser sends one, carrying data of these types. */
function drag(
  type: string,
  at: { x: number; y: number },
  data: Record<string, string> = { "application/x-task": "{}" },
  effectAllowed: DataTransfer["effectAllowed"] = "all",
) {
  const event = new Event(type, { cancelable: true }) as Event & { clientX: number; clientY: number; dataTransfer: unknown }
  const transfer = { types: Object.keys(data), effectAllowed, dropEffect: "none", getData: (key: string) => data[key] ?? "" }
  return Object.assign(event, { clientX: at.x, clientY: at.y, dataTransfer: transfer })
}

function rayAimedAt(from: THREE.Vector3, to: THREE.Vector3): THREE.Raycaster {
  return new THREE.Raycaster(from.clone(), to.clone().sub(from).normalize())
}

describe("the hopper's drag states", () => {
  it("arms for an accepted drag and chooses a drop effect from what effectAllowed permits", () => {
    expect(hopperDragState(false, true)).toBe("none")
    expect(hopperDragState(true, false)).toBe("armed")
    expect(hopperDragState(true, true)).toBe("over")
    expect(hopperDropEffect("over")).toBe("copy")
    for (const allowed of ["copy", "copyMove", "copyLink", "all", "uninitialized"] as const) {
      expect(hopperDropEffect("over", allowed)).toBe("copy")
      expect(hopperDropEffect("armed", allowed)).toBe("none")
      expect(hopperDropEffect("none", allowed)).toBe("none")
    }
    for (const allowed of ["move", "linkMove"] as const) {
      expect(hopperDropEffect("over", allowed)).toBe("move")
      expect(hopperDropEffect("armed", allowed)).toBe("none")
    }
    expect(hopperDropEffect("over", "link")).toBe("link")
    expect(hopperDropEffect("armed", "link")).toBe("none")
    expect(hopperDropEffect("over", "none")).toBe("none")
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
    const moveOnly = drag("dragover", { x: 60, y: 50 }, { "application/x-task": "{}" }, "move")
    canvas.dispatchEvent(moveOnly)
    expect((moveOnly.dataTransfer as { dropEffect: string }).dropEffect).toBe("move")
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

  function buildDrawing(intake = layout.intake) {
    const drawing = new THREE.Group()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2))
    floor.name = "floor"
    floor.position.y = PAPER_GROUND_Y
    drawing.add(floor)
    intake.pile.forEach((tile, i) => {
      const piece = pallet(tile)
      piece.name = `pallet:intake:${i}`
      drawing.add(piece)
    })
    const hopperPiece = hopper(intake)
    hopperPiece.name = "hopper"
    drawing.add(hopperPiece)
    return drawing
  }

  it("hits the hopper's drawn meshes and ignores open ground, pallets under the overhang, and occluded rays", () => {
    const drawing = buildDrawing()
    const target = hopperHitTarget(drawing)
    const bounds = new THREE.Box3().setFromObject(target.hopper!)
    const mouth = hopperMouth(layout.intake), rim = hopperRim(layout.intake)
    expect(bounds.min.y).toBeCloseTo(PAPER_GROUND_Y)
    expect(bounds.max.y).toBeGreaterThan(rim.y)

    const cameraPos = new THREE.Vector3(mouth.x, 30, mouth.z + 24)
    // Looking down into the open funnel hits the hopper.
    expect(hitsHopper(rayAimedAt(cameraPos, new THREE.Vector3(mouth.x, mouth.y + .6, mouth.z)), target)).toBe(true)
    // Open ground beside the hopper misses it.
    expect(hitsHopper(rayAimedAt(cameraPos, new THREE.Vector3(mouth.x + 4, PAPER_GROUND_Y, mouth.z)), target)).toBe(false)
    // Ground under the funnel's overhang (inside the rim's horizontal span, clear of the funnel and legs) misses it.
    const underOverhang = new THREE.Vector3(mouth.x + 1.05, PAPER_GROUND_Y, mouth.z + 1.05)
    expect(hitsHopper(rayAimedAt(cameraPos, underOverhang), target)).toBe(false)
    // From the camera, a ray onto the intake pallet under the funnel's overhang misses the funnel above it.
    const onPallet = new THREE.Vector3(mouth.x, .05, mouth.z + .4)
    expect(hitsHopper(rayAimedAt(cameraPos, onPallet), target)).toBe(false)
    // A ray that strikes the intake pallet before a hopper leg behind it is blocked by the pallet.
    const rearLeg = new THREE.Vector3(mouth.x - .5, -.15, mouth.z - .5)
    const throughPallet = rayAimedAt(new THREE.Vector3(mouth.x - .2, .25, mouth.z + .4), rearLeg)
    expect(hitsHopper(throughPallet, target)).toBe(false)

    // A box, agent or room piece nearer along the ray blocks the drop; one farther away does not.
    const intoFunnel = rayAimedAt(cameraPos, new THREE.Vector3(mouth.x, mouth.y + .6, mouth.z))
    expect(hitsHopper(intoFunnel, target, 5)).toBe(false)
    expect(hitsHopper(intoFunnel, target, 200)).toBe(true)

    const blocker = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .5))
    blocker.name = "room:front:wall"
    blocker.position.set(mouth.x, 6, mouth.z + 3)
    drawing.add(blocker)
    expect(hitsHopper(intoFunnel, hopperHitTarget(drawing))).toBe(false)
  })

  it("follows the drawn hopper and its glow mid-slide instead of jumping to the new layout early", () => {
    const before = buildDrawing(layout.intake)
    const movedIntake = {
      ...layout.intake,
      rect: { ...layout.intake.rect, x: layout.intake.rect.x + 12 },
    }
    const next = buildDrawing(movedIntake)
    const slide = startSlide(before, next)
    const target = hopperHitTarget(next)
    const glow = hopperGlow()
    glow.visible = true

    const oldMouth = hopperMouth(layout.intake)
    const newMouth = hopperMouth(movedIntake)
    const midX = (oldMouth.x + newMouth.x) / 2

    // At the start of the slide, the hopper and glow still stand at the old intake.
    placeHopperGlow(glow, target.hopper!)
    expect(glow.position.x).toBeCloseTo(oldMouth.x)
    expect(hitsHopper(rayAimedAt(new THREE.Vector3(oldMouth.x, 30, oldMouth.z + 24), new THREE.Vector3(oldMouth.x, oldMouth.y + .6, oldMouth.z)), target)).toBe(true)
    expect(hitsHopper(rayAimedAt(new THREE.Vector3(newMouth.x, 30, newMouth.z + 24), new THREE.Vector3(newMouth.x, newMouth.y + .6, newMouth.z)), target)).toBe(false)

    // Halfway through the slide, both the glow and hit test are halfway between old and new.
    slide.tick(SLIDE_S / 2, 1)
    placeHopperGlow(glow, target.hopper!)
    expect(glow.position.x).toBeCloseTo(midX)
    expect(hitsHopper(rayAimedAt(new THREE.Vector3(midX, 30, oldMouth.z + 24), new THREE.Vector3(midX, oldMouth.y + .6, oldMouth.z)), target)).toBe(true)
    expect(hitsHopper(rayAimedAt(new THREE.Vector3(newMouth.x, 30, newMouth.z + 24), new THREE.Vector3(newMouth.x, newMouth.y + .6, newMouth.z)), target)).toBe(false)

    slide.end()
    placeHopperGlow(glow, target.hopper!)
    expect(glow.position.x).toBeCloseTo(newMouth.x)
    expect(hitsHopper(rayAimedAt(new THREE.Vector3(newMouth.x, 30, newMouth.z + 24), new THREE.Vector3(newMouth.x, newMouth.y + .6, newMouth.z)), target)).toBe(true)
  })

  it("keeps the glow hidden until a drag lights it, outside the hopper's rim", () => {
    const glow = hopperGlow()
    expect(glow.visible).toBe(false)
    glow.geometry.computeBoundingBox()
    expect(glow.geometry.boundingBox!.max.x).toBeGreaterThan(1.2)
    expect(glow.geometry.boundingBox!.max.y - glow.geometry.boundingBox!.min.y).toBeCloseTo(0)
  })
})
