// Which cell of a paper pet animation sheet to show. Pure: the view applies
// the result to a texture.

/** The animation layout: 6 columns with 2:3 cells, one row per facing. */
export const SHEET = { cols: 6, rows: 4 } as const

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
