import { describe, expect, it } from "vitest"
import type { Agent } from "~/model/types"
import { CAST_SIZE, DEFAULT_WARDROBES, type Wardrobes, sheetFrame, sheetUrl } from "./sprites"

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

interface Wearing {
  wears: string
  agent: Pick<Agent, "id" | "role" | "sprite">
  base?: string
  wardrobes?: Wardrobes
  url: string
}

interface Deriving {
  who: string
  agent: Pick<Agent, "id" | "role">
  wardrobes?: Wardrobes
  from: readonly number[]
}

describe("which sheet an agent wears", () => {
  const ada = { id: "imp-1", role: "implementer" }

  it.each<Wearing>([
    {
      wears: "the stock sheet of an explicit index, whatever its wardrobe",
      agent: { ...ada, sprite: 7 },
      wardrobes: { implementer: [9] },
      url: "/assets/characters/char_7.png",
    },
    { wears: "an explicit URL as it is", agent: { ...ada, sprite: "https://example.test/cast/ada.png" }, url: "https://example.test/cast/ada.png" },
    { wears: "a stock sheet from under the app's base path", agent: { ...ada, sprite: 7 }, base: "/overseer/", url: "/overseer/assets/characters/char_7.png" },
    { wears: "the host's wardrobe for its role", agent: ada, wardrobes: { implementer: [9] }, url: "/assets/characters/char_9.png" },
    {
      wears: "the host's wardrobe for a role with none by default",
      agent: { id: "sec-1", role: "security" },
      wardrobes: { security: [3] },
      url: "/assets/characters/char_3.png",
    },
  ])("wears $wears", ({ agent, base, wardrobes, url }) => {
    expect(sheetUrl(agent, base, wardrobes)).toBe(url)
  })

  it.each<Deriving>([
    { who: "an implementer", agent: ada, from: DEFAULT_WARDROBES["implementer"]! },
    { who: "a reviewer", agent: { id: "rev-1", role: "reviewer" }, from: DEFAULT_WARDROBES["reviewer"]! },
    { who: "a qa", agent: { id: "qa-1", role: "qa" }, from: DEFAULT_WARDROBES["qa"]! },
    {
      who: "a reviewer while another role's wardrobe is overridden",
      agent: { id: "rev-1", role: "reviewer" },
      wardrobes: { implementer: [9] },
      from: DEFAULT_WARDROBES["reviewer"]!,
    },
    { who: "a role with no wardrobe, from the whole cast", agent: { id: "sec-1", role: "security" }, from: wholeCast },
  ])("derives the sheet of $who from its id", ({ agent, wardrobes, from }) => {
    expect(from).toContain(sheetIndex(sheetUrl(agent, "/", wardrobes)))
  })

  it("tells agents of one role apart by their ids", () => {
    expect(sheetUrl({ id: "imp-2", role: "implementer" })).not.toBe(sheetUrl(ada))
  })
})

const wholeCast = Array.from({ length: CAST_SIZE }, (_, i) => i)

function sheetIndex(url: string): number {
  return Number(/char_(\d+)\.png$/.exec(url)?.[1])
}
