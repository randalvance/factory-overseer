import { expect, test, type Page } from "@playwright/test"

async function sendDirectTask(page: Page) {
  await page.getByRole("button", { name: "Add direct task", exact: true }).click()
  const tasks = page.getByRole("combobox", { name: "Task", exact: true })
  const id = await tasks.inputValue()
  const label = await tasks.locator("option:checked").innerText()
  await page.getByRole("button", { name: "Send to Implementation", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("in Implementation", { timeout: 30000 })
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.getByRole("button", { name: "Inspect task", exact: true }).click()
  const card = page.getByRole("complementary", { name: `Card for ${label}` })
  await expect(card).toBeVisible()
  const participants = card.getByRole("listitem")
  await expect(participants).toHaveCount(1)
  const participant = await participants.innerText()
  expect(participant).toMatch(/: working$/)
  await page.getByRole("button", { name: "Close", exact: true }).click()
  return { id, label, agent: participant.replace(/: working$/, "") }
}

test("six direct tasks occupy six implementers before a seventh task queues", async ({ page }) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1536, height: 1024 })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  await page.goto("/")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await page.getByRole("slider", { name: "Speed", exact: true }).fill("8")
  await page.getByRole("checkbox", { name: "Follow handoffs", exact: true }).uncheck()
  await page.getByRole("combobox", { name: "Room", exact: true }).selectOption("implementation")
  for (let added = 0; added < 5; added++) await page.getByRole("button", { name: "Add agent", exact: true }).click()
  await expect(page.getByLabel("Counts")).toContainText("9 agents")

  const dispatched: Awaited<ReturnType<typeof sendDirectTask>>[] = []
  for (let sent = 0; sent < 6; sent++) {
    dispatched.push(await sendDirectTask(page))
    expect(new Set(dispatched.map((task) => task.agent)).size, "A free implementer must receive work before an occupied implementer gets another task").toBe(dispatched.length)
  }
  expect(new Set(dispatched.map((task) => task.agent)).size).toBe(6)
  await expect(page.getByLabel("Counts")).toContainText("8 in flight")
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.screenshot({ path: "/tmp/direct-dispatch-six-working.png" })

  const seventh = await sendDirectTask(page)
  expect(dispatched.map((task) => task.agent)).toContain(seventh.agent)
  const loads = new Map<string, number>()
  for (const task of [...dispatched, seventh]) loads.set(task.agent, (loads.get(task.agent) ?? 0) + 1)
  expect([...loads.values()].sort()).toEqual([1, 1, 1, 1, 1, 2])
  // All six original assignments remain visible and working after the queue
  // receives another task; no host state or React internals are inspected.
  for (const task of dispatched) {
    await page.getByRole("combobox", { name: "Task", exact: true }).selectOption(task.id)
    await page.getByRole("button", { name: "Inspect task", exact: true }).click()
    await expect(page.getByRole("complementary", { name: `Card for ${task.label}` }).getByRole("listitem")).toHaveText(`${task.agent}: working`)
    await page.getByRole("button", { name: "Close", exact: true }).click()
  }
  await expect(page.getByLabel("Counts")).toContainText("9 in flight")
  await expect(page.getByLabel("Counts")).toContainText("0 shipped")
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.screenshot({ path: "/tmp/direct-dispatch-seventh-queued.png" })
  expect(errors).toEqual([])
})
