import { expect, test, type Page } from "@playwright/test"

/** The public layout exposes directed belt tiles; compare each edge with
 * room bounds so a route cannot silently return to a front/rear doorway. */
async function expectSideWallRoutes(page: Page) {
  const crossings = await page.evaluate(() => {
    const layout = window.grid.layout!
    const vectors = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const
    const step = (tile: { x: number; y: number }, direction: keyof typeof vectors, sign: number) => ({ x: tile.x + vectors[direction][0] * sign, y: tile.y + vectors[direction][1] * sign })
    const crossings: { room: string; from: { x: number; y: number }; to: { x: number; y: number } }[] = []
    for (const belt of layout.belts) for (const tile of belt.tiles) {
      const incoming = tile.kind === "junction" ? tile.entries : [tile.kind === "corner" ? tile.from : tile.dir]
      const outgoing = tile.kind === "junction" ? tile.exits : [tile.kind === "corner" ? tile.to : tile.dir]
      const edges = [...incoming.map((direction) => ({ from: step(tile, direction, -1), to: tile })), ...outgoing.map((direction) => ({ from: tile, to: step(tile, direction, 1) }))]
      for (const { from, to } of edges) {
        if (from.y === to.y) continue
        for (const room of layout.rooms ?? []) {
          if (room.kind === "intake") continue
          const { x, y, w, h } = room.rect
          const inside = (tile: { x: number; y: number }) => tile.x >= x && tile.x < x + w && tile.y >= y && tile.y < y + h
          if (inside(from) !== inside(to)) crossings.push({ room: room.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } })
        }
      }
    }
    return crossings
  })
  expect(crossings, "Conveyors must cross only the left or right room wall").toEqual([])
}

async function startHandoff(page: Page, roomId: string, agentId: string) {
  const before = await page.evaluate(() => ({ landed: window.grid.landed.length, draws: window.grid.draws }))
  await page.evaluate(({ roomId, agentId }) => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId, assignment: { agentIds: [agentId], completedAgentIds: [] } }
    window.grid.update(state)
  }, { roomId, agentId })
  await expect.poll(() => page.evaluate(() => window.grid.draws)).toBeGreaterThan(before.draws)
  return before.landed
}
async function expectArrival(page: Page, before: number) {
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBe(before + 1)
  await expect(page.getByLabel("Counts")).toContainText("0 shipped")
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
  await expectSideWallRoutes(page)
}

test("side-wall handoffs reach deployment before shipping through growth and Reorganize", async ({ page }) => {
  test.setTimeout(150000)
  await page.setViewportSize({ width: 1536, height: 1024 })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/e2e/fixtures/room-grid.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await expectSideWallRoutes(page)
  await page.evaluate(() => window.grid.handle!.inspect({ task: "task" }))

  let landed = await startHandoff(page, "implementation", "pet-1")
  expect(await page.evaluate(() => window.grid.landed.length)).toBe(landed)
  await page.evaluate(() => window.grid.setAgents(7))
  await expect.poll(() => page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations.length)).toBe(7)
  await expectArrival(page, landed)

  landed = await startHandoff(page, "review", "review")
  await expectArrival(page, landed)
  landed = await startHandoff(page, "deployment", "deployment")
  expect(await page.evaluate(() => window.grid.landed.length)).toBe(landed)
  await page.evaluate(() => window.grid.setAgents(8))
  await expect.poll(() => page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations.length)).toBe(8)
  await expectSideWallRoutes(page)
  await page.evaluate(() => window.grid.setAgents(7))
  await expect.poll(() => page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations.filter((station) => !station.vacant).length)).toBe(7)
  await page.getByRole("button", { name: "Reorganize", exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations.length)).toBe(7)
  await expectArrival(page, landed)
  const arrival = await page.evaluate(() => {
    const layout = window.grid.layout!
    return { box: layout.boxes[0]!, station: layout.bays.find((bay) => bay.id === "room:deployment")!.stations[0]! }
  })
  expect(arrival.box.tile).toEqual(arrival.station.bench)
  expect(arrival.box.spot).toMatchObject({ kind: "bench", stationId: arrival.station.id })
  await expect(page.getByRole("complementary", { name: "Card for Grid task" })).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: "/tmp/deployment-side-flow-arrived.png" })

  landed = await page.evaluate(() => window.grid.landed.length)
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "shipped", roomId: "deployment" }
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBe(landed + 1)
  await expect(page.getByLabel("Counts")).toContainText("1 shipped")
  expect(await page.evaluate(() => window.grid.layout!.boxes)).toHaveLength(1)
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
  await expectSideWallRoutes(page)
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.screenshot({ path: "/tmp/deployment-side-flow-shipped.png" })
  expect(errors).toEqual([])
})
