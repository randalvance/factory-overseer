import { expect, type Locator, type Page, test as base } from "@playwright/test"

// The demo page is the one seam the 3D view is tested at: boot the demo in
// headless Chromium, wait for the factory to draw, fail on console errors and
// save a screenshot. Pass SCREENSHOT=path to keep a milestone screenshot
// somewhere else.
const screenshot = process.env.SCREENSHOT ?? "test-results/demo.png"

/** Console errors and uncaught exceptions on the page. Any of them fails the test, checked as it ends. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
      })
      page.on("pageerror", (error) => errors.push(error.message))
      await use(errors)
      expect(errors, "errors on the page").toEqual([])
    },
    { auto: true },
  ],
})

/** Open the demo and wait for the factory to draw its first snapshot. */
async function openFactory(page: Page): Promise<Locator> {
  await page.goto("/")
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory.locator("canvas")).toBeVisible({ timeout: 10_000 })
  await expect(factory).toHaveAttribute("data-drawn", "1", { timeout: 45_000 })
  return factory
}

test("the demo opens on the factory in 3D and draws it without errors", async ({ page }) => {
  await openFactory(page)
  await page.screenshot({ path: screenshot })
})

test("a role and a task joining are drawn without errors", async ({ page }) => {
  const factory = await openFactory(page)

  await page.getByRole("button", { name: "Add a role" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await page.getByRole("button", { name: "Add a task" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
})

test("the flat debug view is still there behind a toggle", async ({ page }) => {
  await openFactory(page)
  const debugView = page.getByRole("img", { name: "Floor layout" })
  await expect(debugView).toBeHidden()

  await page.getByRole("button", { name: "Debug view" }).click()

  await expect(debugView).toBeVisible()
})
