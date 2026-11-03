import { expect, test, type Page, type TestInfo } from "@playwright/test"

const questions = [
  "Who is this feature for, and what should it do?",
  "What should count as success, and which constraints matter?",
]

async function openControls(page: Page, label: string) {
  const summary = page.locator("summary").filter({ hasText: label })
  if (await summary.locator("..").getAttribute("open") === null) await summary.click()
}

async function ready(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  await page.goto("/")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await openControls(page, "View and assistance")
  await page.getByRole("slider", { name: "Speed" }).fill("8")
  await page.getByRole("checkbox", { name: "Follow handoffs", exact: true }).uncheck()
  return errors
}

async function send(page: Page, button: string, room: string) {
  await page.getByRole("button", { name: button, exact: true }).click()
  await expect(page.getByRole("status")).toContainText(`in ${room}`, { timeout: 45_000 })
  await expect(page.getByRole("alert")).toHaveCount(0)
}

async function answerPlanning(page: Page) {
  for (const question of questions) {
    const form = page.getByRole("form", { name: question, exact: true })
    await expect(form).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "Send to Implementation", exact: true })).toBeDisabled()
    await form.getByRole("textbox", { name: "Your response", exact: true }).fill("Show the agreed task flow with every participant visible.")
    await form.getByRole("button", { name: "Submit response", exact: true }).click()
  }
  await expect(page.getByRole("form")).toHaveCount(0)
  await expect(page.getByRole("status")).toContainText("in Planning")
  await expect(page.getByRole("button", { name: "Send to Implementation", exact: true })).toBeEnabled()
}

async function photograph(page: Page, testInfo: TestInfo, name: string) {
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  // Allow the public Fit all camera transition to finish before capturing it.
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true })
}

test("the complete planned task journey keeps answers and shared completion under host control", async ({ page }, testInfo) => {
  test.setTimeout(210_000)
  await page.setViewportSize({ width: 1536, height: 1000 })
  const errors = await ready(page)
  const status = page.getByRole("status")
  await expect(page.getByLabel("Counts")).toContainText("2 in flight")
  await send(page, "Send to Planning", "Planning")
  await expect(page.getByRole("form", { name: questions[0], exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Inspect task", exact: true }).click()
  const card = page.getByRole("complementary", { name: "Card for Plan a new feature", exact: true })
  await expect(card).toContainText("Planning")
  await expect(card).toContainText(questions[0]!)
  await expect(page.getByLabel("Counts")).toContainText("1 human request")
  await photograph(page, testInfo, "demo-planning-attention.png")
  await answerPlanning(page)
  await expect(card.getByRole("list", { name: "Active human requests", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Counts")).toContainText("0 human requests")
  await page.getByRole("button", { name: "Close", exact: true }).click()
  // Resolving a request enables the host handoff; it does not move the task.
  await expect(status).not.toContainText("riding")
  await send(page, "Send to Implementation", "Implementation")
  await page.getByRole("button", { name: "Assign two implementers", exact: true }).click()
  const shared = page.getByRole("region", { name: "Shared implementation", exact: true })
  const review = page.getByRole("button", { name: "Send to Code review", exact: true })
  await expect(shared).toContainText("0/2 complete")
  await shared.getByRole("button", { name: "Complete Implementation agent", exact: true }).click()
  await expect(shared).toContainText("1/2 complete")
  await expect(review).toBeDisabled()
  await page.getByRole("button", { name: "Inspect task", exact: true }).click()
  await expect(card).toContainText("Implementation agent: complete")
  await expect(card).toContainText("Implementer 2")
  await expect(page.getByLabel("Counts")).toContainText("2 in flight")
  await photograph(page, testInfo, "demo-shared-work.png")
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await send(page, "Return to planning", "Planning")
  await answerPlanning(page)
  await send(page, "Send to Implementation", "Implementation")
  await expect(shared).toContainText("0/2 complete")
  await shared.getByRole("button", { name: "Complete Implementation agent", exact: true }).click()
  await shared.getByRole("button", { name: "Complete Implementer 2", exact: true }).click()
  await expect(shared).toContainText("2/2 complete")
  await expect(review).toBeEnabled()
  await expect(status).toContainText("in Implementation")
  await send(page, "Send to Code review", "Code review")
  await send(page, "Send to Deployment", "Deployment")
  await page.getByRole("button", { name: "Ship task", exact: true }).click()
  await expect(status).toContainText("shipped from Deployment", { timeout: 45_000 })
  await expect(page.getByLabel("Counts")).toContainText("1 in flight")
  await expect(page.getByLabel("Counts")).toContainText("1 shipped")
  await expect(page.getByRole("button", { name: "Shipped", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "Inspect task", exact: true }).click()
  await expect(card).toContainText("Task intake → Planning → Implementation → Planning → Implementation → Code review → Deployment → Shipped from Deployment")
  await photograph(page, testInfo, "demo-full-flow.png")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})

test("the direct branch stays usable on a small screen through growth and a configured QA room", async ({ page }, testInfo) => {
  test.setTimeout(210_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await ready(page)
  await page.getByRole("combobox", { name: "Task", exact: true }).selectOption("task-2")
  await send(page, "Send to Implementation", "Implementation")
  await expect(page.getByRole("form")).toHaveCount(0)
  await openControls(page, "Rooms and appearance")
  await page.getByRole("combobox", { name: "Room", exact: true }).selectOption("implementation")
  for (let index = 0; index < 6; index++) await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await expect(page.getByLabel("Counts")).toContainText("10 agents")
  await page.getByRole("combobox", { name: "Room theme", exact: true }).selectOption("fabrication-plant")
  await page.getByRole("combobox", { name: "Room graphic", exact: true }).selectOption("custom")
  await expect(page.getByRole("combobox", { name: "Room theme", exact: true })).toHaveValue("fabrication-plant")
  await expect(page.getByRole("combobox", { name: "Room graphic", exact: true })).toHaveValue("custom")
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await photograph(page, testInfo, "demo-small-screen.png")
  await page.setViewportSize({ width: 1536, height: 1000 })
  await photograph(page, testInfo, "demo-expanded-room.png")
  await page.getByRole("button", { name: "Include QA room", exact: true }).click()
  await page.getByRole("combobox", { name: "Room", exact: true }).selectOption("qa")
  await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await expect(page.getByLabel("Counts")).toContainText("11 agents")
  await send(page, "Send to Code review", "Code review")
  await send(page, "Send to QA", "QA")
  await expect(page.getByRole("status")).not.toContainText("waiting for assignment")
  await send(page, "Send to Deployment", "Deployment")
  await page.getByRole("button", { name: "Ship task", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("shipped from Deployment", { timeout: 45_000 })
  await expect(page.getByLabel("Counts")).toContainText("1 shipped")
  await expect(page.getByLabel("Counts")).toContainText("1 in flight")
  await photograph(page, testInfo, "demo-configured-qa.png")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})
