import { describe, expect, it } from "vitest"
import { DEFAULT_PET_ASSETS, DEFAULT_PET_ANIMATIONS } from "./petAssets"
import { petBodyPose, petFrame, petMotionState } from "./petMotion"

describe("pet activity animation", () => {
  it("gives every bundled species a working clip and a separate raised-paw attention clip", () => {
    for (const asset of Object.values(DEFAULT_PET_ASSETS.byRole!)) {
      expect(asset.layout).toBe("sheet")
      expect(asset.src).toMatch(/-sheet\.svg$/)
      expect(petFrame("working", 0, asset.animations)).toBe(3)
      expect(petFrame("working", .2, asset.animations)).toBe(4)
      expect(petFrame("attention", 0, asset.animations)).toBe(5)
      expect(petFrame("attention", .4, asset.animations)).toBe(0)
    }
  })

  it("shows attention over working until the human request clears without changing the host status", () => {
    expect(petMotionState(false, true, true)).toBe("attention")
    expect(petMotionState(false, false, true)).toBe("working")
    expect(petMotionState(true, true, true)).toBe("walking")
    expect(petMotionState(false, false, false)).toBe("idle")
  })

  it("uses host timing and frame order while rejecting out-of-range atlas columns", () => {
    const custom = { attention: { frames: [-1, 8, 2.5, 4, 1], fps: 2 } }
    expect(petFrame("attention", 0, custom)).toBe(4)
    expect(petFrame("attention", .6, custom)).toBe(1)
    expect(petFrame("attention", 1.1, custom)).toBe(4)
    expect(petFrame("working", .2, { working: { frames: [], fps: NaN } })).toBe(4)
    expect(petFrame("idle", 10, DEFAULT_PET_ANIMATIONS)).toBeUndefined()
  })

  it("animates static custom pets differently for working and attention, returning to their original size when idle", () => {
    const working = petBodyPose("working", .12, true)
    const attention = petBodyPose("attention", .12, true)
    expect(working.roll).not.toBe(0)
    expect(working.scaleY).toBeLessThan(1)
    expect(attention.scaleY).toBeGreaterThan(1)
    expect(attention.lift).toBeGreaterThan(working.lift)
    expect(attention.roll).not.toBe(working.roll)
    expect(petBodyPose("idle", 10, true)).toEqual({ lift: 0, roll: 0, scaleX: 1, scaleY: 1, offsetX: 0 })
  })
})
