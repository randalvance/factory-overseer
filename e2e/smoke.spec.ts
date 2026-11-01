import { expect, type Locator, type Page, test as base } from "@playwright/test"

// The demo page is the one seam the 3D view is tested at: boot the demo in
// headless Chromium, wait for the factory to draw, fail on console errors and
// save screenshots. They go under test-results, which every run wipes, or
// under SCREENSHOT_DIR to keep them. The demo's runtime beats by itself, so
// every test but the first two pauses it and drives the control panel by
// hand, one beat or one forced change at a time; the runtime plays the same
// way every run, so the tests know where each box goes.
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

/** Drag the floor by dx, dy pixels, from the middle of the window. */
async function drag(page: Page, dx: number, dy: number) {
  const x0 = 640 - dx / 2
  const y0 = 420 - dy / 2
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + dx / 2, y0 + dy / 2, { steps: 4 })
  await page.mouse.move(x0 + dx, y0 + dy, { steps: 4 })
  await page.mouse.up()
}

/** Open the demo and wait for the factory to draw its first snapshot; the runtime's clock is running. */
async function openFactory(page: Page): Promise<Locator> {
  await page.goto("/?layout=legacy")
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory.locator("canvas")).toBeVisible({ timeout: 10_000 })
  await expect(factory).toHaveAttribute("data-drawn", "1", { timeout: 45_000 })
  return factory
}

/** Open the demo and pause its clock before the first beat, three seconds after the opening is drawn, so the test beats it by hand. */
async function openPaused(page: Page): Promise<Locator> {
  const factory = await openFactory(page)
  await page.getByRole("button", { name: "Pause" }).click()
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible()
  await expect(factory).toHaveAttribute("data-drawn", "1")
  return factory
}

/** Set the speed slider by its keys: Home is the slowest, and each step right is half a speed faster. */
async function setSpeed(page: Page, speed: number) {
  const slider = page.getByRole("slider", { name: "Speed" })
  await slider.focus()
  await slider.press("Home")
  for (let s = 0.5; s < speed; s += 0.5) await slider.press("ArrowRight")
  await expect(slider).toHaveValue(String(speed))
}

/** One beat of the runtime, drawn. */
async function beat(page: Page, factory: Locator, drawn: number) {
  await page.getByRole("button", { name: "Next beat" }).click()
  await expect(factory).toHaveAttribute("data-drawn", String(drawn))
}

/** Send a task back as rework by hand, and wait for the floor to draw it. */
async function forceRework(page: Page, factory: Locator, taskId: string, drawn: number) {
  await page.getByRole("combobox", { name: "Task" }).selectOption(taskId)
  await page.getByRole("button", { name: "Force rework" }).click()
  await expect(factory).toHaveAttribute("data-drawn", String(drawn))
}

/** Take an agent off the floor by hand, and wait for the floor to draw it offline. */
async function removeAgent(page: Page, factory: Locator, label: string, drawn: number) {
  await page.getByRole("combobox", { name: "Agent" }).selectOption({ label })
  await page.getByRole("button", { name: "Remove agent" }).click()
  await expect(factory).toHaveAttribute("data-drawn", String(drawn))
}

test("the demo opens on the factory in 3D and draws it without errors", async ({ page }) => {
  await openFactory(page)
  await page.screenshot({ path: `${screenshots}/demo.png` })
})

test("left alone, the demo keeps tasks going through the line without errors", async ({ page }) => {
  const factory = await openFactory(page)
  await setSpeed(page, 4)

  // At four times the speed a beat comes every three quarters of a second: several snapshots are drawn in a few seconds.
  await expect.poll(async () => Number(await factory.getAttribute("data-drawn")), { timeout: 15_000 }).toBeGreaterThan(5)
  await page.screenshot({ path: `${screenshots}/left-alone.png` })
})

test("the speed slider scales the beats, and the clock can be paused and played again, without errors", async ({ page }) => {
  const factory = await openFactory(page)
  await page.getByRole("button", { name: "Pause" }).click()
  await setSpeed(page, 2)
  await page.getByRole("button", { name: "Play" }).click()

  // At twice the speed the first beat comes within a second and a half.
  await expect(factory).toHaveAttribute("data-drawn", "2", { timeout: 5_000 })
  await page.getByRole("button", { name: "Pause" }).click()
  await page.waitForTimeout(2000)
  await expect(factory).toHaveAttribute("data-drawn", "2")
})

test("a role joining mid-run gets a bay at the end of the line, a task rides to it, and a task joining is drawn, without errors", async ({ page }) => {
  const factory = await openPaused(page)
  const addAgent = page.getByRole("button", { name: "Add agent" })
  await setSpeed(page, 4)

  // Barbara joins in a role declared before qa, so its bay goes after the qa bay in the second band, and the ends wrap into a third.
  await page.getByRole("combobox", { name: "Role" }).selectOption("new")
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  // Three beats on, Grace is done with t-37 and it rides to the new bay.
  for (let i = 3; i <= 5; i++) await beat(page, factory, i)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/late-role.png` })
  // Dennis joins in a second new role, and a task joins at the intake.
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "6")
  await page.getByRole("button", { name: "Add task" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "7")
  // The new box is on its way down out of the hopper.
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${screenshots}/hopper.png` })
})

test("handoffs ride the belts and forced rework rides the return belt without errors", async ({ page }) => {
  const factory = await openPaused(page)

  // The first beat hands t-37 from Ada to Grace; t-38 takes Ada's bench, and the intake keeps its boxes until her bench is clear.
  await beat(page, factory, 2)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${screenshots}/handoff.png` })
  // Sent back to Ada by hand while it is still riding: the return belt is laid, and the box rides it back along the back wall to wait behind t-38.
  await forceRework(page, factory, "t-37", 3)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/rework.png` })
  await beat(page, factory, 4)
  await page.waitForTimeout(500)
})

test("rework forced from the staging area rides back, and the rest ships into the container, without errors", async ({ page }) => {
  const factory = await openPaused(page)

  // t-31 waits at the staging area; sent back by hand it rides to the qa bay, to wait behind t-35 in Linus's queue.
  await forceRework(page, factory, "t-31", 2)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/staging-rework.png` })
  // Beat by beat, with rework along the way, until the inspector has passed a third box into the container.
  const counts = page.getByLabel("Counts")
  for (let i = 3; i <= 20 && !/3 shipped/.test((await counts.textContent()) ?? ""); i++) await beat(page, factory, i)
  await expect(counts).toHaveText(/3 shipped/)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${screenshots}/shipped.png` })
})

test("the line wraps into bands within the window, and a task rides around the turn and back up it, without errors", async ({ page }) => {
  const factory = await openPaused(page)
  // At 1280 pixels the floor is twenty tiles wide: the qa bay, the staging area and the container are in a second band.
  await setSpeed(page, 4)

  // The third beat sends t-37 from Grace around the turn to Linus.
  for (let i = 2; i <= 4; i++) await beat(page, factory, i)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${screenshots}/turn.png` })
  // Sent back to Grace by hand: up the turn beside the trunk and along the first band's return belt.
  await forceRework(page, factory, "t-37", 5)
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${screenshots}/turn-back.png` })
})

test("the staging area can be switched off and on without errors", async ({ page }) => {
  const factory = await openPaused(page)

  await page.getByRole("button", { name: "Staging off" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await page.screenshot({ path: `${screenshots}/no-staging.png` })
  await page.getByRole("button", { name: "Staging on" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
})

test("an agent is shown in every status, forced or come to by itself, without errors", async ({ page }) => {
  const factory = await openPaused(page)
  // Let the pose, the jump and the sparks play for a moment before each shot.
  const shot = async (status: string) => {
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${screenshots}/status-${status}.png` })
  }

  // Grace opens idle at the second bench; Ada, chosen first, is forced to wait, and waits a second beat.
  await shot("idle")
  await page.getByRole("button", { name: "Force waiting" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await shot("waiting")
  await beat(page, factory, 3)
  // The spell over, she finishes t-37 and hands it on, done; then she is back at work on t-38.
  await beat(page, factory, 4)
  await shot("done")
  await beat(page, factory, 5)
  await shot("working")
  // Forced into error; then taken off the floor, offline for a beat and departed the next, t-38 handed on to Grace.
  await page.getByRole("button", { name: "Force error" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "6")
  await shot("error")
  await page.getByRole("button", { name: "Remove agent" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "7")
  await shot("offline")
  await beat(page, factory, 8)
  await expect(page.getByLabel("Counts")).toHaveText(/2 agents/)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${screenshots}/departed.png` })
})

test("implementers come and go without errors", async ({ page }) => {
  const factory = await openPaused(page)
  const addAgent = page.getByRole("button", { name: "Add agent" })

  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  // Barbara is on her way in from the door.
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${screenshots}/walk-in.png` })
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
  // Dennis is taken off the floor: offline this beat, departed the next, and Edsger takes his lane.
  await removeAgent(page, factory, "Dennis, implementer", 4)
  await beat(page, factory, 5)
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "6")
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${screenshots}/lanes.png` })
  // The bay's three lanes are taken: Frances takes a lane in an annex at the end of the line, in the band below.
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "7")
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${screenshots}/annex.png` })
})

test("the overseer reorganizes a messy floor and everything slides to its new place without errors", async ({ page }) => {
  const factory = await openPaused(page)
  const addAgent = page.getByRole("button", { name: "Add agent" })
  await setSpeed(page, 4)

  // Barbara and Dennis fill the bay; Dennis leaves and Edsger takes his lane; Frances and Hedy take lanes in an annex at the end of the line.
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "2")
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "3")
  await removeAgent(page, factory, "Dennis, implementer", 4)
  await beat(page, factory, 5)
  for (let i = 6; i <= 8; i++) {
    await addAgent.click()
    await expect(factory).toHaveAttribute("data-drawn", String(i))
  }
  // Ken joins in a role declared before qa: its bay goes after the annex, out of order.
  await page.getByRole("combobox", { name: "Role" }).selectOption("new")
  await addAgent.click()
  await expect(factory).toHaveAttribute("data-drawn", "9")
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${screenshots}/messy.png` })

  // Laid afresh: the annex beside its bay, the late role before qa, the vacant lane closed, and everything slides there in one pass.
  await setSpeed(page, 1)
  await page.getByRole("button", { name: "Reorganize" }).click()
  await expect(factory).toHaveAttribute("data-drawn", "10")
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${screenshots}/reorganizing.png` })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${screenshots}/reorganized.png` })
})

test("the overseer pans, zooms and fits all, and clicks an agent and a box for their cards, without errors", async ({ page }) => {
  const factory = await openPaused(page)
  await expect(page.getByLabel("Counts")).toHaveText(/3 agents.*5 in flight.*1 awaiting review.*2 shipped/)

  // A drag, a held key and a tapped one pan; the wheel and a key zoom in; F frames the floor again.
  await drag(page, 120, 80)
  await page.keyboard.down("d")
  await page.waitForTimeout(300)
  await page.keyboard.up("d")
  await page.keyboard.press("ArrowUp")
  await page.mouse.move(640, 430)
  await page.mouse.wheel(0, -500)
  await page.keyboard.press("+")
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${screenshots}/zoomed-in.png` })
  await page.keyboard.press("f")
  await page.waitForTimeout(200)

  // Ada stands behind the first bench, under the control panel's two rows; the pointer over her rings her, and a click opens her card.
  await page.mouse.move(378, 310)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${screenshots}/hover.png` })
  await page.mouse.click(378, 310)
  const adaCard = page.getByRole("complementary", { name: "Card for Ada" })
  await expect(adaCard).toContainText("implementer")
  await expect(adaCard).toContainText("working")
  await expect(adaCard).toContainText("Writing the parser")
  await expect(adaCard).toContainText("t-37")
  await page.screenshot({ path: `${screenshots}/agent-card.png` })

  // t-37 on her bench: its card, and the camera follows it as it rides to Grace at the first beat.
  await page.mouse.click(378, 380)
  const boxCard = page.getByRole("complementary", { name: "Card for t-37" })
  await expect(boxCard).toContainText("on Ada's bench")
  await expect(adaCard).toBeHidden()
  await beat(page, factory, 2)
  await expect(boxCard).toContainText("riding to Grace's bench")
  await expect(boxCard).toContainText("Ada, implementer → Grace, reviewer")
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${screenshots}/following.png` })
  // The card says so until the box lands.
  await expect(boxCard).toContainText("on Grace's bench", { timeout: 15_000 })

  // A drag ends the following; the HUD button frames the floor again; the card closes.
  await drag(page, -100, 0)
  await page.getByRole("button", { name: "Fit all" }).click()
  await page.getByRole("button", { name: "Close" }).click()
  await expect(boxCard).toBeHidden()
})

test("the handle focuses on an agent and follows a task without errors", async ({ page }) => {
  const factory = await openPaused(page)
  await setSpeed(page, 0.5)

  // t-37, the first task at a bench, is chosen already; the camera follows it to Grace at the first beat, then focuses on Ada.
  await page.getByRole("button", { name: "Follow task" }).click()
  await beat(page, factory, 2)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${screenshots}/handle-follow.png` })
  await page.getByRole("button", { name: "Focus on agent" }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${screenshots}/handle-focus.png` })
})

test("the flat debug view is still there behind a toggle", async ({ page }) => {
  await openPaused(page)
  const debugView = page.getByRole("img", { name: "Floor layout" })
  await expect(debugView).toBeHidden()

  await page.getByRole("button", { name: "Debug view" }).click()

  await expect(debugView).toBeVisible()
})
