import { describe, expect, it } from "vitest"
import { sheetFrame } from "./sprites"

describe("sheet frame selection", () => {
  // The paper pet sheets have 6 by 4 cells, one row per facing,
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
