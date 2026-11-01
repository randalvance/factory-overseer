import { describe, expect, it } from "vitest"
import type { BeltTile } from "~/floor/types"
import { beltPieces } from "./beltPieces"

const QUARTER = Math.PI / 2

describe("the pieces a belt tile is laid with", () => {
  it.each([
    { dir: "e", yaw: 0 },
    { dir: "n", yaw: QUARTER },
    { dir: "w", yaw: Math.PI },
    { dir: "s", yaw: -QUARTER },
  ] as const)("lays a straight tile running $dir as one straight piece turned to run that way", ({ dir, yaw }) => {
    expect(beltPieces({ kind: "straight", x: 0, y: 0, dir }, "forward")).toEqual([{ piece: "belt-straight", yaw }])
  })

  // A corner piece enters along its own +x; the turn it makes is to its left or its right.
  it.each([
    { from: "e", to: "n", piece: "belt-corner-left", yaw: 0 },
    { from: "e", to: "s", piece: "belt-corner-right", yaw: 0 },
    { from: "s", to: "w", piece: "belt-corner-right", yaw: -QUARTER },
    { from: "s", to: "e", piece: "belt-corner-left", yaw: -QUARTER },
    { from: "n", to: "w", piece: "belt-corner-left", yaw: QUARTER },
    { from: "w", to: "s", piece: "belt-corner-left", yaw: Math.PI },
    { from: "w", to: "n", piece: "belt-corner-right", yaw: Math.PI },
  ] as const)("lays a corner from $from to $to as a $piece turned to enter from $from", ({ from, to, piece, yaw }) => {
    expect(beltPieces({ kind: "corner", x: 0, y: 0, from, to }, "forward")).toEqual([{ piece, yaw }])
  })

  // A junction is the straight through it, a merge arm on each side boxes join from, a split arm on each side they leave by.
  it("lays a bay's merge junction with an arm joining from the south and an arm leaving to the north", () => {
    const tile: BeltTile = { kind: "junction", x: 6, y: 3, dir: "e", entries: ["e", "n"], exits: ["e", "n"] }
    expect(beltPieces(tile, "forward")).toEqual([
      { piece: "belt-straight", yaw: 0 },
      { piece: "belt-merge", yaw: 0 },
      { piece: "belt-split", yaw: Math.PI },
    ])
  })

  it("lays a bay's split junction with the drop joining from the north and the feeder leaving to the south", () => {
    const tile: BeltTile = { kind: "junction", x: 4, y: 3, dir: "e", entries: ["e", "s"], exits: ["e", "s"] }
    expect(beltPieces(tile, "forward")).toEqual([
      { piece: "belt-straight", yaw: 0 },
      { piece: "belt-merge", yaw: Math.PI },
      { piece: "belt-split", yaw: 0 },
    ])
  })

  it("lays a junction on a westward trunk with only the riser leaving to the north", () => {
    const tile: BeltTile = { kind: "junction", x: 8, y: 13, dir: "w", entries: ["w"], exits: ["w", "n"] }
    expect(beltPieces(tile, "forward")).toEqual([
      { piece: "belt-straight", yaw: Math.PI },
      { piece: "belt-split", yaw: Math.PI },
    ])
  })

  it("lays a junction with an arm to the east as one turned a quarter to the east", () => {
    const tile: BeltTile = { kind: "junction", x: 0, y: 0, dir: "n", entries: ["n", "w"], exits: ["n"] }
    expect(beltPieces(tile, "forward")).toEqual([
      { piece: "belt-straight", yaw: QUARTER },
      { piece: "belt-merge", yaw: QUARTER },
    ])
  })

  it("lays the return belt and its risers and drops with the rework pieces", () => {
    expect(beltPieces({ kind: "straight", x: 0, y: 1, dir: "w" }, "rework")).toEqual([{ piece: "belt-straight-return", yaw: Math.PI }])
    expect(beltPieces({ kind: "corner", x: 19, y: 1, from: "n", to: "w" }, "rework")).toEqual([{ piece: "belt-corner-left-return", yaw: QUARTER }])
  })
})
