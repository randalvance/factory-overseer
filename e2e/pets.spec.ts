import { expect, test } from "@playwright/test"

test("host pet assets select by agent, role and default, swap live and recover from a missing image", async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  const images: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("response", (response) => {
    if (response.url().includes("/assets/pets/")) images.push(new URL(response.url()).pathname + new URL(response.url()).search)
  })
  await page.goto("/e2e/fixtures/pets.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await expect(page.getByLabel("Counts")).toContainText("5 agents")
  await expect(page.getByLabel("Counts")).toContainText("0 in flight")
  await expect(page.getByLabel("Human notifications")).toHaveText("1")
  expect(images).toEqual(expect.arrayContaining(["/assets/pets/cat.svg?default", "/assets/pets/rabbit.svg?role", "/assets/pets/fox.svg?agent"]))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: "test-results/pets-host-assets.png" })

  const before = Number(await page.getByLabel("Draws").textContent())
  await page.getByRole("button", { name: "Swap planner pet", exact: true }).click()
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(before)
  expect(images).toContain("/assets/pets/owl.svg?override")
  await expect(page.getByLabel("Counts")).toContainText("5 agents")
  await expect(page.getByLabel("Human notifications")).toHaveText("1")
  await page.screenshot({ path: "test-results/pets-live-override.png" })

  const swapped = Number(await page.getByLabel("Draws").textContent())
  await page.getByRole("button", { name: "Use missing default", exact: true }).click()
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(swapped)
  expect(images).toContain("/assets/pets/cat-sheet.svg")
  await expect(page.getByLabel("Counts")).toContainText("5 agents")
  await expect(page.getByLabel("Human notifications")).toHaveText("1")
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.getByRole("button", { name: "Reorganize", exact: true }).click()
  await expect.poll(async () => Number(await page.getByLabel("Draws").textContent())).toBeGreaterThan(swapped + 1)
  await page.screenshot({ path: "test-results/pets-fallback.png" })
  expect(errors).toEqual([])
})
