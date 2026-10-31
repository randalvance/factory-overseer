// Which cell of a stock sheet to show, and which sheet an agent wears. Pure:
// the view applies the result to a texture.

import type { Agent } from "~/model/types"

/** The stock layout: 6 columns of 32 by 48 pixel cells, one row per facing. */
export const SHEET = { cols: 6, rows: 4, cellW: 32, cellH: 48 } as const

/** How many stock sheets ship with the package, char_0 to char_131. */
export const CAST_SIZE = 132

export type Facing = "down" | "left" | "right" | "up"

/** Row per facing, counted from the top of the sheet. */
const FACING_ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 }

/** Texture offset and repeat that show exactly one cell. Texture space puts v = 0 at the bottom of the image. */
export interface SheetFrame {
  offset: { x: number; y: number }
  repeat: { x: number; y: number }
}

export function sheetFrame(col: number, facing: Facing): SheetFrame {
  const row = FACING_ROW[facing]
  return {
    offset: { x: col / SHEET.cols, y: 1 - (row + 1) / SHEET.rows },
    repeat: { x: 1 / SHEET.cols, y: 1 / SHEET.rows },
  }
}

/**
 * The sheet an agent wears: the stock sheet of an explicit index, an explicit
 * URL as it is, or a stock sheet derived from the id so the agent looks the
 * same in every snapshot.
 */
export function sheetUrl(agent: Pick<Agent, "id" | "sprite">, base = "/"): string {
  if (typeof agent.sprite === "string") return agent.sprite
  const index = agent.sprite ?? hash(agent.id) % CAST_SIZE
  return `${base}assets/characters/char_${index}.png`
}

/** FNV-1a over the id's code points. Small and stable; nothing cryptographic is asked of it. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (const ch of text) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
