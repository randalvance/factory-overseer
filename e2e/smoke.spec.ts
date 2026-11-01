import { expect, type Locator, type Page, test as base } from "@playwright/test"

// The demo page is the one seam the 3D view is tested at: boot the demo in
// headless Chromium, wait for the factory to draw, fail on console errors and
// save screenshots. They go under test-results, which every run wipes, or
// under SCREENSHOT_DIR to keep them.
const screenshots = process.env.SCREENSHOT_DIR ?? "test-results"

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
  await page.screenshot({ path: `${screenshots}/demo.png` })
})

test("a role joining mid-run gets a bay at the end of the line, a task rides to it and on, and a task joining is drawn, without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const addRole = page.getByRole("button", { name: "Add a role" })
  await page.getByRole("combobox", { name: "Speed" }).selectOption("4")

  // The new role's bay goes after the qa bay in the second band, and the ends wrap into a third; t-42 rides there from the intake.
  await addRole.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/late-role.png` })
  // A second new role takes t-42 on from the first.
  await addRole.click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
  await page.getByRole("button", { name: "Add a task" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "4")
  // The new box is on its way down out of the hopper.
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${screenshots}/hopper.png` })
})

test("handoffs ride the belts and rework rides the return belt without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const next = page.getByRole("button", { name: "Next handoff" })

  await next.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  // Let the boxes ride for a moment, then hand one back as rework while it is still riding.
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${screenshots}/handoff.png` })
  await next.click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
  // The return belt is laid, and the box rides it back along the back wall.
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/rework.png` })
  await next.click()
  await expect(factory).toHaveAttribute("data-drawn", "4")
  await page.waitForTimeout(500)
})

test("rework from the staging area rides back, and the rest ships into the container, without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const next = page.getByRole("button", { name: "Next handoff" })

  // The fourth handoff has the inspector reject t-31 back to qa.
  for (let i = 1; i <= 4; i++) {
    await next.click()
    await expect(factory).toHaveAttribute("data-drawn", String(i + 1))
  }
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/staging-rework.png` })
  for (let i = 5; !(await next.isDisabled()); i++) {
    await next.click()
    await expect(factory).toHaveAttribute("data-drawn", String(i + 1))
  }
  // The last boxes ride into the container, whose count already shows the total.
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${screenshots}/shipped.png` })
})

test("the line wraps into bands within the window, and a task rides around the turn and back up it, without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const next = page.getByRole("button", { name: "Next handoff" })
  // At 1280 pixels the floor is twenty tiles wide: the qa bay, the staging area and the container are in a second band.
  await page.getByRole("combobox", { name: "Speed" }).selectOption("4")

  // The fifth handoff sends t-38 from the reviewer around the turn to qa.
  for (let i = 1; i <= 5; i++) {
    await next.click()
    await expect(factory).toHaveAttribute("data-drawn", String(i + 1))
  }
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${screenshots}/turn.png` })
  // The sixth hands it back to the reviewer: up the turn beside the trunk and along the first band's return belt.
  await next.click()
  await expect(factory).toHaveAttribute("data-drawn", "7")
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${screenshots}/turn-back.png` })
})

test("the staging area can be switched off and on without errors", async ({ page }) => {
  const factory = await openFactory(page)

  await page.getByRole("button", { name: "Staging off" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await page.screenshot({ path: `${screenshots}/no-staging.png` })
  await page.getByRole("button", { name: "Staging on" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
})

test("an agent is shown in every status without errors", async ({ page }) => {
  const factory = await openFactory(page)
  // Ada opens working; each click takes her to the next status in the table and, at the end, back to working.
  const reached = ["waiting", "done", "error", "offline", "idle", "working"]
  for (const [i, status] of reached.entries()) {
    await page.getByRole("button", { name: "Next status" }).click()
    await expect(factory).toHaveAttribute("data-drawn", String(i + 2))
    // Let the pose, the jump and the sparks play for a moment.
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${screenshots}/status-${status}.png` })
  }
})

test("implementers come and go without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const add = page.getByRole("button", { name: "Add an implementer" })

  await add.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  // Barbara is on her way in from the door.
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${screenshots}/walk-in.png` })
  await add.click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
  await page.getByRole("button", { name: "Remove an implementer" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "4")
  // Dennis fades; Edsger takes his lane.
  await add.click()
  await expect(factory).toHaveAttribute("data-drawn", "5")
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${screenshots}/lanes.png` })
  // The bay's three lanes are taken: Frances takes a lane in an annex at the end of the line, in the band below.
  await add.click()
  await expect(factory).toHaveAttribute("data-drawn", "6")
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${screenshots}/annex.png` })
})

test("the overseer reorganizes a messy floor and everything slides to its new place without errors", async ({ page }) => {
  const factory = await openFactory(page)
  const add = page.getByRole("button", { name: "Add an implementer" })
  const speed = page.getByRole("combobox", { name: "Speed" })
  await speed.selectOption("4")

  // Barbara and Dennis fill the bay; Dennis leaves and Edsger takes his lane; Frances and Hedy take lanes in an annex at the end of the line.
  const grow = [add, add, page.getByRole("button", { name: "Remove an implementer" }), add, add, add]
  for (const [i, button] of grow.entries()) {
    await button.click()
    await expect(factory).toHaveAttribute("data-drawn", String(i + 2))
  }
  // A role declared before qa joins late: its bay goes after the annex, out of order, and t-42 rides there.
  await page.getByRole("button", { name: "Add a role" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "8")
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${screenshots}/messy.png` })

  // Laid afresh: the annex beside its bay, the late role before qa, the vacant lane closed, and everything slides there in one pass.
  await speed.selectOption("1")
  await page.getByRole("button", { name: "Reorganize" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "9")
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${screenshots}/reorganizing.png` })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${screenshots}/reorganized.png` })
})

test("the flat debug view is still there behind a toggle", async ({ page }) => {
  await openFactory(page)
  const debugView = page.getByRole("img", { name: "Floor layout" })
  await expect(debugView).toBeHidden()

  await page.getByRole("button", { name: "Debug view" }).click()

  await expect(debugView).toBeVisible()
})
