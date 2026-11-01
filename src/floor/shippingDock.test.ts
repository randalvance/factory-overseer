import { describe, expect, it } from "vitest"
import { shippingDock } from "./shippingDock"

const deployment = { x: 6, y: 11, w: 7, h: 6 }

describe("terminal shipping dock", () => {
  it("connects the left station-row outlet to two cargo tiles through a clear exterior route", () => {
    const dock = shippingDock(deployment)
    expect(dock.connectorPath[0]).toEqual({ x: 6, y: 16 })
    expect(dock.connectorPath[1]).toEqual({ x: 5, y: 16 })
    expect(dock.connectorPath.slice(-2)).toEqual(dock.cargoTiles)
    expect(dock.cargoTiles).toEqual([{ x: 5, y: 19 }, { x: 4, y: 19 }])
    for (let i = 1; i < dock.connectorPath.length; i++) {
      const a = dock.connectorPath[i - 1]!, b = dock.connectorPath[i]!
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
    }
    expect(dock.x).toBeLessThan(dock.rear.x)
    expect(dock.z).toBe(dock.streetY + .5)
  })

  it("routes around later rooms while keeping the parked truck clear", () => {
    const blocker = { x: 6, y: 18, w: 7, h: 5 }
    const dock = shippingDock(deployment, [blocker])
    expect(dock.bodyFootprint.y).toBeGreaterThan(blocker.y + blocker.h)
    for (const tile of dock.connectorPath) {
      expect(tile.x < blocker.x + blocker.w && tile.x + 1 > blocker.x &&
        tile.y < blocker.y + blocker.h && tile.y + 1 > blocker.y).toBe(false)
    }
    for (let i = 1; i < dock.connectorPath.length; i++) {
      const a = dock.connectorPath[i - 1]!, b = dock.connectorPath[i]!
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
    }
  })
})
