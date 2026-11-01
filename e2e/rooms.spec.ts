import { expect, test } from "@playwright/test"

test("rooms expand around a growing team while tasks and controls remain usable", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  await page.goto("/")
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory).toHaveAttribute("data-drawn", "1")
  await expect(factory).toHaveAttribute("data-rooms", "6")
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  await page.screenshot({ path: "test-results/rooms-before.png" })
  let drawn = 1
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Add agent", exact: true }).click()
    await expect(factory).toHaveAttribute("data-drawn", String(++drawn), { timeout: 15000 })
  }
  await expect(factory).toHaveAttribute("data-rooms", "6")
  // Allow the last geometric pass to settle before the comparison image.
  await page.waitForTimeout(1500)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.screenshot({ path: "test-results/rooms-expanded.png" })
  await page.getByRole("button", { name: "Next beat", exact: true }).click()
  await expect(factory).toHaveAttribute("data-drawn", String(++drawn))
  await page.getByRole("button", { name: "Follow task", exact: true }).click()
  await page.getByRole("button", { name: "Reorganize", exact: true }).click()
  await expect(factory).toHaveAttribute("data-drawn", String(++drawn), { timeout: 15000 })
  await page.waitForTimeout(1500)
  await expect(page.locator(".demo-note")).toHaveCount(0)
  expect(errors).toEqual([])
})

test("a new role gets a room and rapid updates during growth keep working", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  await page.goto("/")
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory).toHaveAttribute("data-drawn", "1")
  await page.getByRole("button", { name: "Pause", exact: true }).click()
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("new")
  await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await expect(factory).toHaveAttribute("data-rooms", "7")
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("implementer")
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await page.getByRole("button", { name: "Next beat", exact: true }).click()
  await page.waitForTimeout(3500)
  await expect(factory).toHaveAttribute("data-rooms", "7")
  await page.getByRole("button", { name: "Focus on agent", exact: true }).click()
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await expect(page.locator(".demo-note")).toHaveCount(0)
  expect(errors).toEqual([])
})
