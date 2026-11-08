import { expect, type Locator, type Page, test } from "@playwright/test"

// onPick through the demo's public UI: a real click on a box tells the host,
// which selects that task in its Task list; the factory still opens its card.

async function openControls(page: Page, label: string) {
  const summary = page.locator("summary").filter({ hasText: label })
  if (await summary.locator("..").getAttribute("open") === null) await summary.click()
}

/** Click the box followed under the middle of the canvas, scanning up from the center for the pointer affordance. */
async function clickCentered(page: Page, canvas: Locator, card: Locator) {
  const rect = (await canvas.boundingBox())!
  const x = rect.x + rect.width / 2
  const middle = rect.y + rect.height / 2
  for (let y = middle + 12; y > Math.max(rect.y + 4, middle - 180); y -= 4) {
    await page.mouse.move(x, y)
    if (await canvas.evaluate((element) => element.style.cursor) !== "pointer") continue
    await page.mouse.click(x, y)
    if (await card.isVisible()) return
  }
  await expect(card, "the followed box can be picked on the 3D canvas").toBeVisible()
}

test("clicking a box on the floor tells the host, which selects that task", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  const floor = page.getByRole("img", { name: "Factory floor" })
  await expect(floor).toHaveAttribute("data-drawn", "1")
  const canvas = floor.locator("canvas")
  const taskList = page.getByRole("combobox", { name: "Task" })
  await expect(taskList).toHaveValue("task-1")

  // Bring task-2's box under the middle of the screen, then select task-1 again in the host's list.
  await openControls(page, "View and assistance")
  await taskList.selectOption("task-2")
  await page.getByRole("button", { name: "Follow task", exact: true }).click()
  await page.waitForTimeout(500)
  await taskList.selectOption("task-1")
  await expect(taskList).toHaveValue("task-1")

  const card = page.getByRole("complementary", { name: "Card for Fix a typo directly", exact: true })
  await clickCentered(page, canvas, card)
  await expect(card).toBeVisible()
  await expect(taskList).toHaveValue("task-2")
  await expect(page.getByRole("status")).toContainText("Fix a typo directly: ")
  await page.screenshot({ path: "test-results/pick-selects-task.png" })
  expect(errors).toEqual([])
})
