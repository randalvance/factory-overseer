import { expect, test } from "@playwright/test"
test("paper environment draws, grows and reorganizes without losing tasks", async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/e2e/fixtures/paper.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await expect(page.getByLabel("Counts")).toContainText("30 in flight")
  await page.screenshot({ path: "test-results/paper-normal.png" })
  await page.getByRole("button", { name: "Grow to 100 agents" }).click()
  await expect(page.getByLabel("Counts")).toContainText("150 in flight")
  await page.getByRole("button", { name: "Reorganize" }).click()
  await expect.poll(() => page.getByRole("img", { name: "Factory floor" }).getAttribute("data-drawn")).not.toBe("1")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})
