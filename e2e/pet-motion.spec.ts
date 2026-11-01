import { expect, test, type Page } from "@playwright/test"

type Region = { id: string; x: number; y: number; width: number; height: number }
async function petRegions(page: Page): Promise<Region[]> {
  return page.evaluate(async () => {
    const base = "/src"
    const { exampleRooms } = await import(`${base}/model/roomExamples.ts`)
    const { layoutConfiguredRooms } = await import(`${base}/floor/configuredRooms.ts`)
    const { fitDioramaLayout, projectDioramaPoint, PX_PER_TILE, PAPER_CAMERA_DISTANCE, PAPER_PITCH } = await import(`${base}/factory/camera.ts`)
    const agents = exampleRooms.rooms.map((room: { id: string; label: string; role: string }) => ({ id: room.id + "-pet", name: room.label + " pet", role: room.role, roomId: room.id, status: "idle" }))
    const layout = layoutConfiguredRooms({ configuration: exampleRooms, snapshot: { agents, tasks: [], humanRequests: [] } }, undefined, 28)
    const bounds = document.querySelector("canvas")!.getBoundingClientRect()
    const viewport = { width: bounds.width, height: bounds.height }
    const camera = fitDioramaLayout(layout, viewport)
    return layout.bays.flatMap((bay: { stations: { agentId: string; agentTile: { x: number; y: number } }[] }) => bay.stations).map((station: { agentId: string; agentTile: { x: number; y: number } }) => {
      const point = { x: station.agentTile.x + .5, y: .01, z: station.agentTile.y + .5 }
      const foot = projectDioramaPoint(point, camera, viewport)
      const depth = PAPER_CAMERA_DISTANCE - point.y * Math.sin(PAPER_PITCH) - (point.z - camera.z) * Math.cos(PAPER_PITCH)
      const pixels = PX_PER_TILE * camera.zoom * PAPER_CAMERA_DISTANCE / depth
      // Body/head only: badges and the moving front conveyors are outside.
      return { id: station.agentId, x: Math.max(0, bounds.x + foot.x - .95 * pixels), y: Math.max(bounds.y, bounds.y + foot.y - 2.18 * pixels), width: 1.9 * pixels, height: 1.58 * pixels }
    })
  })
}

for (const custom of [false, true]) test(`${custom ? "static host art" : "every bundled species"} visibly works and asks for a human`, async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  let assetRequests = 0
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => { if (request.url().includes("/assets/pets/")) assetRequests++ })
  await page.goto(`/e2e/fixtures/pet-motion.html${custom ? "?static" : ""}`)
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await page.waitForTimeout(2000)
  const regions = await petRegions(page)
  expect(regions).toHaveLength(5)
  const loaded = assetRequests
  const frames = async () => Promise.all(regions.map(async ({ id, ...clip }) => ({ id, image: await page.screenshot({ clip }) })))
  let draws = Number(await page.getByLabel("Draws").textContent())
  await page.getByRole("button", { name: "Work", exact: true }).click()
  await expect(page.getByLabel("Host statuses")).toHaveText("working,working,working,working,working")
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(draws)
  const workA = await frames()
  await page.waitForTimeout(240)
  const workB = await frames()
  for (let i = 0; i < workA.length; i++) expect(workA[i]!.image.equals(workB[i]!.image), `${workA[i]!.id} must visibly work`).toBe(false)
  await page.screenshot({ path: `test-results/pets-${custom ? "static" : "sheets"}-working.png` })

  draws = Number(await page.getByLabel("Draws").textContent())
  await page.getByRole("button", { name: "Ask human", exact: true }).click()
  await expect(page.getByLabel("Notifications")).toHaveText("5")
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(draws)
  // The host still says Working: active human requests override animation only.
  await expect(page.getByLabel("Host statuses")).toHaveText("working,working,working,working,working")
  const askingA = await frames()
  await page.waitForTimeout(240)
  const askingB = await frames()
  for (let i = 0; i < askingA.length; i++) {
    expect(askingA[i]!.image.equals(askingB[i]!.image), `${askingA[i]!.id} must visibly ask`).toBe(false)
    expect(askingA[i]!.image.equals(workA[i]!.image), `${askingA[i]!.id} asking must differ from working`).toBe(false)
  }
  await page.screenshot({ path: `test-results/pets-${custom ? "static" : "sheets"}-attention.png` })
  draws = Number(await page.getByLabel("Draws").textContent())
  await page.getByRole("button", { name: "Resolve", exact: true }).click()
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(draws)
  await expect(page.getByLabel("Notifications")).toHaveText("5")
  await expect(page.getByLabel("Counts")).toContainText("5 agents")
  expect(assetRequests).toBe(loaded)
  expect(errors).toEqual([])
})
