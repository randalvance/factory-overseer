import { expect, type Locator, type Page, test as base } from "@playwright/test"

// Exercise the shipped paper demo through host controls and the canvas, without
// reaching into the renderer. Detailed routes and room growth have their own suites.
const screenshots = process.env.SCREENSHOT_DIR ?? "test-results"
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
    page.on("pageerror", (error) => errors.push(error.message))
    await use(errors)
    expect(errors, "errors on the page").toEqual([])
  }, { auto: true }],
})

async function openFactory(page: Page, url = "/") {
  await page.setViewportSize({ width: 1536, height: 1000 })
  await page.goto(url)
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory).toHaveAttribute("data-drawn", "1")
  await expect(factory.locator("canvas")).toBeVisible()
  return factory.locator("canvas")
}

async function drag(page: Page, canvas: Locator, dx: number, dy: number) {
  const rect = (await canvas.boundingBox())!
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

/** Compare the rendered scene, allowing small pet/belt animation between frames. */
async function changedFraction(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(async ([first, second]) => {
    async function pixels(encoded: string) {
      const image = new Image()
      image.src = `data:image/png;base64,${encoded}`
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext("2d")!
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const [a, b] = await Promise.all([pixels(first!), pixels(second!)])
    let changed = 0
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 80) changed++
    }
    return changed / (a.length / 4)
  }, [before.toString("base64"), after.toString("base64")])
}

/** A focused subject stands above the canvas center. Find its public pointer
 * affordance, then open its card with a real canvas click. No scene data is read. */
async function pickCentered(page: Page, canvas: Locator, title: string, focus: () => Promise<void>) {
  await focus()
  const rect = (await canvas.boundingBox())!
  const x = rect.x + rect.width / 2
  const middle = rect.y + rect.height / 2
  const card = page.getByRole("complementary", { name: `Card for ${title}`, exact: true })
  for (let y = middle + 12; y > Math.max(rect.y + 4, middle - 180); y -= 4) {
    await page.mouse.move(x, y)
    if (await canvas.evaluate((element) => element.style.cursor) !== "pointer") continue
    await page.mouse.click(x, y)
    if (await card.isVisible()) return card
    // Another nearby figure may share the center column. Restore the selected
    // subject's public focus before continuing up its silhouette.
    await focus()
  }
  await expect(card, `the centered ${title} can be picked on the 3D canvas`).toBeVisible()
  return card
}

for (const url of ["/?layout=legacy&art=legacy", "/?layout=rooms"]) {
  test(`old demo links open the paper workshop: ${url}`, async ({ page }) => {
    const requestedAssets: string[] = []
    page.on("request", (request) => requestedAssets.push(request.url()))
    await openFactory(page, url)
    await expect(page.getByText("Paper workshop", { exact: true })).toBeVisible()
    await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-rooms", "5")
    await expect(page.getByLabel("Counts")).toContainText("4 agents")
    await expect(page.getByLabel("Counts")).toContainText("2 in flight")
    await expect.poll(() => requestedAssets.some((url) => url.includes("/assets/pets/"))).toBe(true)
    expect(requestedAssets.filter((url) => url.includes("/assets/characters/"))).toEqual([])
    await expect(page.getByRole("button", { name: "Next beat", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Debug view", exact: true })).toHaveCount(0)
  })
}

test("paper navigation pans, zooms, fits, follows tasks and picks task and pet cards", async ({ page }) => {
  test.setTimeout(120000)
  const canvas = await openFactory(page)
  await page.getByRole("slider", { name: "Speed" }).fill("8")
  await page.waitForTimeout(1000)
  const initial = await canvas.screenshot()
  await drag(page, canvas, 150, 80)
  await page.keyboard.down("d")
  await page.waitForTimeout(150)
  await page.keyboard.up("d")
  await page.keyboard.press("ArrowUp")
  const panned = await canvas.screenshot()
  expect(await changedFraction(page, initial, panned)).toBeGreaterThan(.03)
  await page.keyboard.press("f")
  const fitted = await canvas.screenshot()
  expect(await changedFraction(page, panned, fitted)).toBeGreaterThan(.03)
  await page.mouse.wheel(0, -500)
  await page.keyboard.press("+")
  const zoomed = await canvas.screenshot()
  expect(await changedFraction(page, fitted, zoomed)).toBeGreaterThan(.03)
  await page.screenshot({ path: `${screenshots}/paper-navigation.png` })
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  expect(await changedFraction(page, zoomed, await canvas.screenshot())).toBeGreaterThan(.03)

  await page.getByRole("combobox", { name: "Task", exact: true }).selectOption("task-2")
  await page.getByRole("button", { name: "Follow task", exact: true }).click()
  const taskCard = await pickCentered(page, canvas, "Fix a typo directly", async () => {
    await page.getByRole("button", { name: "Inspect task", exact: true }).click()
    await page.getByRole("button", { name: "Close", exact: true }).click()
  })
  await expect(taskCard).toContainText("Task intake")
  await page.getByRole("button", { name: "Send to Implementation", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("in Implementation", { timeout: 45000 })
  await expect(taskCard).toContainText("Task intake → Implementation")
  await page.screenshot({ path: `${screenshots}/paper-following.png` })
  await page.getByRole("button", { name: "Close", exact: true }).click()
  // Following keeps the landed box under the camera center without refocusing.
  await pickCentered(page, canvas, "Fix a typo directly", async () => {})
  await page.getByRole("button", { name: "Close", exact: true }).click()

  await page.getByRole("button", { name: "Assign two implementers", exact: true }).click()
  const participants = page.getByRole("region", { name: "Shared implementation", exact: true })
  const agentCard = await pickCentered(page, canvas, "Implementation agent", async () => {
    await participants.getByRole("button", { name: "Implementation agent", exact: true }).click()
    await page.getByRole("button", { name: "Close", exact: true }).click()
  })
  await expect(agentCard).toContainText("implementer")
  await expect(agentCard).toContainText("Fix a typo directly")
  await page.screenshot({ path: `${screenshots}/paper-pet-card.png` })
  await drag(page, canvas, -100, 0)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(agentCard).toBeHidden()
  await expect(page.getByLabel("Counts")).toContainText("2 in flight")
  await expect(page.getByRole("alert")).toHaveCount(0)
})
