import { expect, test } from "@playwright/test"
test("paper environment draws, grows and reorganizes without losing tasks", async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/e2e/fixtures/paper.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await expect(page.getByLabel("Counts")).toContainText("30 in flight")
  await page.screenshot({ path: "test-results/paper-normal.png" })
  await page.getByRole("button", { name: "Grow to 100 agents" }).click()
  await expect(page.getByLabel("Counts")).toContainText("150 in flight")
  const floor = page.getByRole("img", { name: "Factory floor" })
  await expect(floor).toHaveAttribute("data-drawn", "2")
  async function settledResources() {
    await page.evaluate(() => { window.samples.length = 0 })
    // Three callbacks span at least a second at 60 Hz, beyond the speed-2 slide.
    await expect.poll(() => page.evaluate(() => window.samples.length), { timeout: 30000 }).toBeGreaterThanOrEqual(3)
    return page.evaluate(() => window.samples.at(-1)!)
  }
  const grown = await settledResources()
  for (let pass = 0; pass < 3; pass++) {
    await page.getByRole("button", { name: "Reorganize" }).click()
    await expect(floor).toHaveAttribute("data-drawn", String(3 + pass))
    const settled = await settledResources()
    expect(settled.geometries).toBeLessThanOrEqual(grown.geometries)
    expect(settled.textures).toBeLessThanOrEqual(grown.textures)
    expect(settled.estimatedTextureBytes).toBe(grown.estimatedTextureBytes)
    await expect(page.getByLabel("Counts")).toContainText("150 in flight")
  }
  await page.screenshot({ path: "test-results/paper-reorganized.png" })
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})
