import { expect, test, type Page } from "@playwright/test"

const TASK_DRAG = "application/x-factory-overseer-task"

async function openControls(page: Page, label: string) {
  const summary = page.locator("summary").filter({ hasText: label })
  if (await summary.locator("..").getAttribute("open") === null) await summary.click()
}

/** Where on the canvas an accepted drag is over the hopper: its middle and bounds, in page pixels. A
 * script-made DataTransfer keeps no drop effect, so the mount's drag state tells. */
async function hopperOnPage(page: Page) {
  return page.evaluate((type) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".factory-canvas canvas")!
    const rect = canvas.getBoundingClientRect()
    const hits: { x: number; y: number }[] = []
    for (let y = rect.top + 4; y < rect.bottom; y += 8) for (let x = rect.left + 4; x < rect.right; x += 8) {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData(type, "{}")
      canvas.dispatchEvent(new DragEvent("dragover", { clientX: x, clientY: y, dataTransfer, cancelable: true, bubbles: true }))
      if (canvas.parentElement!.dataset.hopperDrag === "over") hits.push({ x, y })
    }
    canvas.dispatchEvent(new DragEvent("dragleave", { bubbles: true }))
    const xs = hits.map((hit) => hit.x), ys = hits.map((hit) => hit.y)
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    return {
      count: hits.length,
      x: mean(xs),
      y: mean(ys),
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      canvas: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    }
  }, TASK_DRAG)
}

async function groundPixel(page: Page): Promise<[number, number, number]> {
  const png = await page.locator(".factory-canvas canvas").screenshot()
  return page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext("2d")!
    context.drawImage(image, 0, 0)
    const [r, g, b] = context.getImageData(24, Math.floor(canvas.height / 2), 1, 1).data
    return [r!, g!, b!] as [number, number, number]
  }, png.toString("base64"))
}

test("a task chip dragged from the host's UI onto the hopper queues a task at intake", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  await page.goto("/")
  const floor = page.getByRole("img", { name: "Factory floor" })
  await expect(floor).toHaveAttribute("data-drawn", "1")
  await expect(floor).toHaveAttribute("data-hopper-drag", "none")
  await expect(page.getByLabel("Counts")).toContainText("2 in flight")

  const hopper = await hopperOnPage(page)
  expect(hopper.count).toBeGreaterThan(4)

  // A real HTML5 drag from the chip: armed over the floor, over at the hopper.
  await page.getByText("Drag planning task", { exact: true }).hover()
  await page.mouse.down()
  await page.mouse.move(hopper.canvas.right - 40, hopper.canvas.bottom - 40, { steps: 8 })
  await expect(floor).toHaveAttribute("data-hopper-drag", "armed")
  await page.mouse.move(hopper.x, hopper.y, { steps: 8 })
  await expect(floor).toHaveAttribute("data-hopper-drag", "over")
  await page.screenshot({ path: "test-results/hopper-drop-over.png" })
  await page.mouse.up()
  await expect(floor).toHaveAttribute("data-hopper-drag", "none")
  await expect(page.getByLabel("Counts")).toContainText("3 in flight")
  await expect(page.getByRole("combobox", { name: "Task" })).toHaveValue("task-3")
  await expect(page.getByRole("status")).toContainText("Feature task-3: ")

  // Let go on open ground just outside the drawn hopper, and on the intake
  // pallet/pile under the funnel's overhang: neither counts as a hopper drop.
  for (const point of [
    { x: hopper.minX - 10, y: hopper.y },
    { x: hopper.x, y: hopper.maxY + 10 },
  ]) {
    await page.getByText("Drag direct task", { exact: true }).hover()
    await page.mouse.down()
    await page.mouse.move(point.x, point.y, { steps: 8 })
    await expect(floor).toHaveAttribute("data-hopper-drag", "armed")
    await page.mouse.up()
    await expect(floor).toHaveAttribute("data-hopper-drag", "none")
    await expect(page.getByLabel("Counts")).toContainText("3 in flight")
  }

  // Malformed non-JSON data with the host's drag type is ignored without throwing.
  await page.evaluate(({ x, y, type }) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData(type, "not-json")
    const canvas = document.querySelector(".factory-canvas canvas")!
    canvas.dispatchEvent(new DragEvent("drop", { clientX: x, clientY: y, dataTransfer, cancelable: true, bubbles: true }))
  }, { x: hopper.x, y: hopper.y, type: TASK_DRAG })
  await expect(page.getByLabel("Counts")).toContainText("3 in flight")

  // A drag the host does not accept is left to the page.
  const foreign = await page.evaluate(({ x, y }) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData("text/uri-list", "https://example.com")
    const event = new DragEvent("dragover", { clientX: x, clientY: y, dataTransfer, cancelable: true, bubbles: true })
    document.querySelector(".factory-canvas canvas")!.dispatchEvent(event)
    return event.defaultPrevented
  }, hopper)
  expect(foreign).toBe(false)
  expect(errors).toEqual([])
})

test("the outdoor paper turns to desert with cacti and to snowy plains", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  const floor = page.getByRole("img", { name: "Factory floor" })
  await expect(floor).toHaveAttribute("data-drawn", "1")
  await expect(floor).toHaveAttribute("data-biome", "grass")
  const [grassR, grassG, grassB] = await groundPixel(page)
  expect(grassG).toBeGreaterThan(grassR)
  expect(grassG).toBeGreaterThan(grassB)

  await openControls(page, "Rooms and appearance")
  for (const [label, biome] of [["Desert", "desert"], ["Snowy plains", "snow"], ["Grass", "grass"]] as const) {
    await page.getByRole("combobox", { name: "Biome" }).selectOption({ label })
    await expect(floor).toHaveAttribute("data-biome", biome)
    await expect.poll(async () => {
      const [r, g, b] = await groundPixel(page)
      return biome === "desert" ? r > g && g - b > 20 : biome === "snow" ? b > 220 && r - b < 15 : g > r && g > b
    }).toBe(true)
    // Switching biomes repaints only scenery and never re-runs layout/show.
    await expect(floor).toHaveAttribute("data-drawn", "1")
    await page.screenshot({ path: `test-results/biome-${biome}.png` })
  }
  await expect(page.getByLabel("Counts")).toContainText("2 in flight")
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})
