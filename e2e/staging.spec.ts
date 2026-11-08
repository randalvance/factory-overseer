import { expect, test } from "@playwright/test"

test("staging appears for queued boxes, then disappears after assignments land", async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/e2e/fixtures/room-grid.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  expect(await page.evaluate(() => window.grid.layout!.rooms!.some((room) => room.kind === "staging"))).toBe(false)
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.agents = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `builder-${i}`, name: `Builder ${i}`, role: "implementer", roomId: "implementation", status: "idle" as const })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `planner-${i}`, name: `Planner ${i}`, role: "planner", roomId: "planning", status: "idle" as const })),
    ]
    state.snapshot.tasks = Array.from({ length: 10 }, (_, i) => ({ id: `ready-${i}`, label: `Planned feature ${i + 1}`, at: { kind: "room", roomId: "implementation" } }))
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.layout?.rooms?.filter((room) => room.kind === "staging").length)).toBe(1)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.waitForTimeout(1500)
  const stacks = await page.evaluate(() => {
    const layout = window.grid.layout!
    return { boxes: layout.boxes.length, tiles: new Set(layout.boxes.map((box) => JSON.stringify(box.tile))).size,
      logicalRooms: layout.routing!.configuration.rooms.length, implementation: layout.rooms!.find((room) => room.id === "room:implementation")!.rect }
  })
  expect(stacks.boxes).toBe(10)
  expect(stacks.tiles).toBe(5)
  expect(await page.evaluate(() => {
    const layout = window.grid.layout!
    return layout.boxes.every((box) => !layout.belts.some((belt) => belt.tiles.some((tile) => tile.x === box.tile.x && tile.y === box.tile.y)))
  })).toBe(true)
  expect(stacks.logicalRooms).toBe(5)
  await page.screenshot({ path: "test-results/staging-queued.png" })
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks = state.snapshot.tasks.slice(0, 5).map((task, i) => ({ ...task, at: {
      kind: "room", roomId: "implementation", assignment: { agentIds: [`builder-${i}`], completedAgentIds: [] },
    } }))
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 45000 }).toBeGreaterThanOrEqual(5)
  await expect.poll(() => page.evaluate(() => window.grid.layout?.rooms?.filter((room) => room.kind === "staging").length), { timeout: 15000 }).toBe(0)
  expect(await page.evaluate(() => window.grid.layout!.rooms!.find((room) => room.id === "room:implementation")!.rect)).not.toEqual(stacks.implementation)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "test-results/staging-drained.png" })
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})

test("planning drops queued work onto the floor before a forklift returns it to the tip", async ({ page }) => {
  await page.goto("/e2e/fixtures/room-grid.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "planning", assignment: { agentIds: ["planning"], completedAgentIds: [] } }
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBe(1)
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation" }
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBe(2)
  expect(await page.evaluate(() => window.grid.layout!.routing!.bufferStorage.implementation!.piles)).toContainEqual(
    await page.evaluate(() => window.grid.layout!.boxes[0]!.tile))
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["pet-1"], completedAgentIds: [] } }
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBe(3)
  await expect.poll(() => page.evaluate(() => window.grid.layout!.rooms!.some((room) => room.kind === "staging"))).toBe(false)
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
})
