import { describe, expect, it } from "vitest"
import { CAST_SIZE, sheetFrame, sheetUrl } from "./sprites"

describe("sheet frame selection", () => {
  // The stock sheets are 6 by 4 cells of 32 by 48 pixels, one row per facing,
  // top to bottom: down, left, right, up. Texture space puts v = 0 at the
  // bottom of the image, so the top row starts three quarters of the way up.
  it.each([
    ["down", 0, { x: 0, y: 0.75 }],
    ["left", 3, { x: 0.5, y: 0.5 }],
    ["right", 4, { x: 4 / 6, y: 0.25 }],
    ["up", 5, { x: 5 / 6, y: 0 }],
  ] as const)("facing %s, column %i starts at %o", (facing, col, offset) => {
    const frame = sheetFrame(col, facing)
    expect(frame.offset.x).toBeCloseTo(offset.x, 6)
    expect(frame.offset.y).toBeCloseTo(offset.y, 6)
  })

  it("covers exactly one cell", () => {
    const frame = sheetFrame(0, "down")
    expect(frame.repeat.x).toBeCloseTo(1 / 6, 6)
    expect(frame.repeat.y).toBeCloseTo(1 / 4, 6)
  })
})

describe("which sheet an agent wears", () => {
  it("uses the stock sheet of an explicit index", () => {
    expect(sheetUrl({ id: "imp-1", sprite: 7 })).toBe("/assets/characters/char_7.png")
  })

  it("uses an explicit URL as it is", () => {
    const url = "https://example.test/cast/ada.png"
    expect(sheetUrl({ id: "imp-1", sprite: url })).toBe(url)
  })

  it("serves stock sheets under the app's base path", () => {
    expect(sheetUrl({ id: "imp-1", sprite: 7 }, "/overseer/")).toBe("/overseer/assets/characters/char_7.png")
  })

  it("derives a stable stock sheet from the id when none is given", () => {
    const url = sheetUrl({ id: "imp-1" })
    const index = Number(/char_(\d+)\.png$/.exec(url)?.[1])
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(CAST_SIZE)
    expect(sheetUrl({ id: "imp-1" })).toBe(url)
    expect(sheetUrl({ id: "imp-2" })).not.toBe(url)
  })
})
