import { expect, test, type Page } from "@playwright/test"

async function ready(page: Page) {
  await page.goto("/e2e/fixtures/room-grid.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
}
async function stationCount(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.grid.layout?.bays.find((bay) => bay.id === "room:implementation")?.stations.filter((station) => !station.vacant).length)).toBe(count)
}
async function place(page: Page, roomId: string, members: string[] = [], shipped = false) {
  const before = await page.evaluate(() => window.grid.landed.length)
  await page.evaluate(({ roomId, members, shipped }) => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = shipped ? { kind: "shipped", roomId } : {
      kind: "room", roomId, ...(members.length ? { assignment: { agentIds: members, completedAgentIds: [] } } : {}),
    }
    window.grid.update(state)
  }, { roomId, members, shipped })
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBeGreaterThan(before)
}

test("three columns fill before depth grows; vacancies and compaction preserve selection", async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await ready(page)
  const dimensions: { w: number; h: number }[] = []
  for (let count = 1; count <= 7; count++) {
    if (count > 1) await page.getByRole("button", { name: "Add agent", exact: true }).click()
    await stationCount(page, count)
    dimensions.push(await page.evaluate(() => {
      const layout = window.grid.layout!
      const room = layout.rooms!.find((room) => room.id === "room:implementation")!
      return { w: room.rect.w, h: room.rect.h }
    }))
  }
  expect(dimensions.map(({ w }) => w)).toEqual([7, 11, 15, 15, 15, 15, 15])
  expect(dimensions.map(({ h }) => h)).toEqual([7, 7, 7, 12, 12, 12, 17])
  const original = await page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations)
  expect(original.map((station) => station.bench.x - original[0]!.bench.x)).toEqual([0, 4, 8, 0, 4, 8, 0])
  expect(original.map((station) => station.bench.y - original[0]!.bench.y)).toEqual([0, 0, 0, 5, 5, 5, 10])
  await page.evaluate(() => window.grid.handle!.inspect({ agent: "pet-7" }))
  await expect(page.getByRole("complementary", { name: "Card for Pet 7" })).toBeVisible()
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.agents = state.snapshot.agents.filter((agent) => agent.id !== "pet-2")
    window.grid.update(state)
  })
  await stationCount(page, 6)
  await page.evaluate(() => window.grid.setAgents(7))
  await stationCount(page, 7)
  const returned = await page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations)
  expect(returned.map((station) => [station.id, station.agentId, station.bench])).toEqual(original.map((station) => [station.id, station.agentId, station.bench]))
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.agents = state.snapshot.agents.filter((agent) => !["pet-2", "pet-4"].includes(agent.id))
    window.grid.update(state)
  })
  await stationCount(page, 5)
  await page.getByRole("button", { name: "Reorganize", exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.grid.layout!.bays.find((bay) => bay.id === "room:implementation")!.stations.length)).toBe(5)
  await expect(page.getByRole("complementary", { name: "Card for Pet 7" })).toBeVisible()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: "test-results/room-grid-compacted.png" })
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
  expect(errors).toEqual([])
})

test("rides survive rapid grid growth, shared anchors, queues, human requests and shipping", async ({ page }) => {
  test.setTimeout(150000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await ready(page)
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["pet-1"], completedAgentIds: [] } }
    window.grid.update(state)
    window.grid.handle!.inspect({ task: "task" })
  })
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await stationCount(page, 7)
  await expect.poll(() => page.evaluate(() => window.grid.landed.length), { timeout: 30000 }).toBeGreaterThan(0)
  await page.evaluate(() => {
    const state = structuredClone(window.grid.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["pet-1", "pet-3", "pet-7"], completedAgentIds: [] } }
    state.snapshot.humanRequests = [{ id: "question", roomId: "implementation", taskId: "task", agentIds: ["pet-1", "pet-3", "pet-7"], kind: "question", message: "Please review this work" }]
    window.grid.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.grid.notifications)).toEqual(["question"])
  await expect(page.getByRole("complementary", { name: "Card for Grid task" })).toContainText("Pet 7")
  await page.evaluate(() => { const state = structuredClone(window.grid.state); state.snapshot.humanRequests = []; window.grid.update(state) })
  await place(page, "implementation", ["pet-7", "pet-3"])
  await place(page, "implementation", ["pet-3"])
  await place(page, "implementation")
  await place(page, "implementation", ["pet-2"])
  await place(page, "review", ["review"])
  await place(page, "deployment", ["deployment"])
  await place(page, "deployment", [], true)
  await expect(page.getByLabel("Counts")).toContainText("1 shipped")
  expect(await page.evaluate(() => window.grid.layout!.boxes.length)).toBe(1)
  expect(await page.evaluate(() => window.grid.unrouted)).toEqual([])
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})
