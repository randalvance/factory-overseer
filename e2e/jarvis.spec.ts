import { expect, type Locator, type Page, test } from "@playwright/test"

// Jarvis, the host's main agent, through the demo's public controls and the
// canvas: it roams the open paper between the rooms, pauses by them, works
// and asks for a human where it stands, and opens its card like any agent.
const screenshots = process.env.SCREENSHOT_DIR ?? "test-results"

/** Open the card of the figure standing under the middle of the screen with a real canvas click, scanning up its silhouette. */
async function pickCentered(page: Page, canvas: Locator, title: string) {
  const rect = (await canvas.boundingBox())!
  const x = rect.x + rect.width / 2
  const middle = rect.y + rect.height / 2
  const card = page.getByRole("complementary", { name: `Card for ${title}`, exact: true })
  for (let y = middle + 12; y > Math.max(rect.y + 4, middle - 180); y -= 4) {
    await page.mouse.move(x, y)
    if (await canvas.evaluate((element) => element.style.cursor) !== "pointer") continue
    await page.mouse.click(x, y)
    if (await card.isVisible()) return card
  }
  await expect(card, `the centered ${title} can be picked on the 3D canvas`).toBeVisible()
  return card
}

test("Jarvis roams the floor, pauses by rooms, works and asks for help where it stands, and is picked like any agent", async ({ page }) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  const requested: string[] = []
  page.on("request", (request) => { if (request.url().includes("/assets/pets/")) requested.push(new URL(request.url()).pathname) })
  await page.setViewportSize({ width: 1536, height: 1000 })
  await page.goto("/")
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory).toHaveAttribute("data-drawn", "1")
  const canvas = factory.locator("canvas")
  const counts = page.getByLabel("Counts")
  await expect(counts).toContainText("4 agents")
  await expect(page.getByRole("button", { name: "Inspect Jarvis", exact: true })).toBeDisabled()
  await expect(page.getByRole("combobox", { name: "Jarvis is", exact: true })).toBeDisabled()

  // Added by the host, Jarvis is counted, wears the bundled puppy sheet, and sets out at once.
  await page.getByRole("button", { name: "Add Jarvis", exact: true }).click()
  await expect(counts).toContainText("5 agents")
  await expect.poll(() => requested).toContain("/assets/pets/jarvis-sheet.png")
  await page.getByRole("button", { name: "Inspect Jarvis", exact: true }).click()
  const card = page.getByRole("complementary", { name: "Card for Jarvis", exact: true })
  await expect(card).toContainText("Roaming the floor")
  await expect(card).toContainText("main agent")
  await expect(card).toContainText("Walking to the", { timeout: 20000 })
  await page.waitForTimeout(700)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.screenshot({ path: `${screenshots}/jarvis-walking.png` })
  const destination = (await card.locator("dd").filter({ hasText: "Walking to" }).textContent())!.replace("Walking to ", "")
  await expect(card).toContainText(`Pausing at ${destination}`, { timeout: 60000 })
  await page.screenshot({ path: `${screenshots}/jarvis-paused.png` })
  // And on to another room once the pause is over.
  await expect(card).toContainText("Walking to the", { timeout: 20000 })
  await expect(card).not.toContainText(`Walking to ${destination}`)

  // Told to work, it stops where it is and works there; its card says so.
  await page.getByRole("combobox", { name: "Jarvis is", exact: true }).selectOption("working")
  await expect(card).toContainText("working")
  await page.waitForTimeout(1500)
  const whereabouts = (await card.locator("dd").nth(1).textContent())!
  await page.waitForTimeout(1500)
  expect(await card.locator("dd").nth(1).textContent()).toBe(whereabouts)
  await page.screenshot({ path: `${screenshots}/jarvis-working.png` })

  // A click on the canvas opens its card like any agent's.
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole("button", { name: "Inspect Jarvis", exact: true }).click()
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await pickCentered(page, canvas, "Jarvis")
  await expect(card).toContainText("Roaming the floor")

  // Asking for help, it waves where it stands until the human answers; then it roams again.
  await page.getByRole("combobox", { name: "Jarvis is", exact: true }).selectOption("asking")
  await expect(card).toContainText("waiting")
  await expect(card).toContainText("Which repository should the next feature go in?")
  await expect(counts).toContainText("1 human request")
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${screenshots}/jarvis-asking.png` })
  const form = page.getByRole("form", { name: "Which repository should the next feature go in?", exact: true })
  await form.getByRole("textbox", { name: "Your response", exact: true }).fill("The factory-overseer repository.")
  await form.getByRole("button", { name: "Submit response", exact: true }).click()
  await expect(counts).toContainText("0 human requests")
  await expect(page.getByRole("combobox", { name: "Jarvis is", exact: true })).toHaveValue("roaming")
  await expect(card).toContainText("idle")
  await expect(card).toContainText("Walking to the", { timeout: 20000 })

  // Removed by the host, it is gone from the counts and its card closes.
  await page.getByRole("button", { name: "Remove Jarvis", exact: true }).click()
  await expect(counts).toContainText("4 agents")
  await expect(card).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add Jarvis", exact: true })).toBeVisible()
  expect(errors, "errors on the page").toEqual([])
})
