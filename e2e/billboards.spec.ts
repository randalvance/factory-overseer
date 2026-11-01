import { expect, test, type Page } from "@playwright/test"

const marker = (left: string, right: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><path fill="${left}" d="M0 0h32v32H0z"/><path fill="${right}" d="M32 0h32v32H32z"/></svg>`

async function pixels(page: Page) {
  const image = await page.locator("canvas").screenshot()
  return page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext("2d")!
    context.drawImage(image, 0, 0)
    const values = context.getImageData(0, 0, canvas.width, canvas.height).data
    let magenta = 0, cyan = 0, blue = 0
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    for (let index = 0; index < values.length; index += 4) {
      const r = values[index]!, g = values[index + 1]!, b = values[index + 2]!
      const isMagenta = r > 140 && b > 140 && g < Math.min(r, b) * .45
      const isCyan = g > 140 && b > 140 && r < Math.min(g, b) * .45
      if (isMagenta) magenta++
      if (isCyan) cyan++
      if (isMagenta || isCyan) {
        const x = index / 4 % canvas.width, y = Math.floor(index / 4 / canvas.width)
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      if (b > 140 && b > r * 1.7 && b > g * 1.7) blue++
    }
    return { magenta, cyan, blue, bounds: { left, top, right, bottom } }
  }, image.toString("base64"))
}

async function ready(page: Page) {
  await page.setViewportSize({ width: 1536, height: 1024 })
  await page.goto("/e2e/fixtures/themes.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const layout = window.themes.layout!
    return { rooms: layout.rooms!.map(({ id, rect, ports }) => ({ id, rect, ports })),
      stations: layout.bays.flatMap((bay) => bay.stations.map(({ id, bench, agentTile }) => ({ id, bench, agentTile }))),
      belts: layout.belts, boxes: layout.boxes,
    }
  })
}

async function setImage(page: Page, image: string | undefined, filter: "linear" | "nearest" = "linear") {
  const before = await page.evaluate(() => window.themes.draws)
  await page.evaluate(({ image, filter }) => {
    const state = structuredClone(window.themes.state)
    state.configuration.rooms.find((room) => room.id === "implementation")!.billboard = { image, filter, alt: "Host test graphic" }
    window.themes.update(state)
  }, { image, filter })
  await expect.poll(() => page.evaluate(() => window.themes.draws)).toBeGreaterThan(before)
}

test("host billboard artwork and filtering survive room growth and reorganization", async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/billboard-custom.svg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: marker("#ff00ff", "#00ffff") }))
  await ready(page)
  const snapshot = await page.evaluate(() => window.themes.state.snapshot)
  await page.evaluate(() => window.themes.handle!.inspect({ agent: "implementation" }))
  await setImage(page, "/billboard-custom.svg")
  await expect.poll(async () => (await pixels(page)).magenta, { timeout: 10000 }).toBeGreaterThan(60)
  expect((await pixels(page)).cyan).toBeGreaterThan(60)
  const layout = await geometry(page)
  await setImage(page, "/billboard-custom.svg", "nearest")
  await expect.poll(async () => (await pixels(page)).magenta).toBeGreaterThan(60)
  expect((await pixels(page)).cyan).toBeGreaterThan(60)
  expect(await geometry(page)).toEqual(layout)
  await expect(page.getByRole("complementary", { name: "Card for Implementation" })).toBeVisible()
  expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(snapshot)
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    for (let index = 2; index <= 7; index++) state.snapshot.agents.push({ id: `implementation-${index}`, name: `Implementer ${index}`, role: "implementer", roomId: "implementation", status: "idle" })
    window.themes.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.themes.layout?.bays.find((bay) => bay.id === "room:implementation")?.stations.length)).toBe(7)
  const grown = await page.evaluate(() => window.themes.state.snapshot)
  await page.getByRole("button", { name: "Reorganize", exact: true }).click()
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await expect.poll(async () => (await pixels(page)).magenta).toBeGreaterThan(20)
  expect((await pixels(page)).cyan).toBeGreaterThan(20)
  await expect(page.getByRole("complementary", { name: "Card for Implementation" })).toBeVisible()
  expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(grown)
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  expect(await page.evaluate(() => window.themes.unrouted)).toEqual([])
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.screenshot({ path: "/tmp/billboard-expanded-seven.png" })
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})


async function sameArtworkRegion(page: Page, baseline: Buffer, bounds: { left: number; top: number; right: number; bottom: number }) {
  const current = await page.locator("canvas").screenshot()
  return page.evaluate(async ({ before, after, bounds }) => {
    const images = await Promise.all([before, after].map(async (base64) => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0)
      return context.getImageData(bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1).data
    }))
    let matching = 0
    for (let index = 0; index < images[0]!.length; index += 4) {
      if ([0, 1, 2].every((channel) => Math.abs(images[0]![index + channel]! - images[1]![index + channel]!) < 24)) matching++
    }
    return matching / (images[0]!.length / 4)
  }, { before: baseline.toString("base64"), after: current.toString("base64"), bounds })
}

test("a failed billboard image restores the same visible artwork as a missing image", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/billboard-custom.svg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: marker("#ff00ff", "#00ffff") }))
  await page.route("**/billboard-unavailable.svg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: "not an image" }))
  await ready(page)
  await setImage(page, undefined)
  await page.waitForTimeout(700)
  const baseline = await page.locator("canvas").screenshot()
  const snapshot = await page.evaluate(() => window.themes.state.snapshot)
  await setImage(page, "/billboard-custom.svg")
  await expect.poll(async () => (await pixels(page)).magenta).toBeGreaterThan(60)
  const { bounds } = await pixels(page)
  const failedResponse = page.waitForResponse("**/billboard-unavailable.svg")
  await setImage(page, "/billboard-unavailable.svg")
  await failedResponse
  await expect.poll(async () => (await pixels(page)).magenta).toBe(0)
  expect((await pixels(page)).cyan).toBe(0)
  await expect.poll(() => sameArtworkRegion(page, baseline, bounds)).toBeGreaterThan(.97)
  expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(snapshot)
  await page.screenshot({ path: "/tmp/billboard-fallback.png" })
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})


test("a late billboard image cannot replace the latest host image", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  let oldRequested = false, releaseOld = () => {}
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve })
  await page.route("**/billboard-old.svg", async (route) => {
    oldRequested = true
    await oldGate
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: marker("#ff00ff", "#00ffff") })
  })
  await page.route("**/billboard-current.svg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: marker("#0011ff", "#0011ff") }))
  try {
    await ready(page)
    const snapshot = await page.evaluate(() => window.themes.state.snapshot)
    await page.evaluate(() => window.themes.handle!.inspect({ agent: "implementation" }))
    const baselineBlue = (await pixels(page)).blue
    await setImage(page, "/billboard-old.svg")
    await expect.poll(() => oldRequested).toBe(true)
    await setImage(page, "/billboard-current.svg", "nearest")
    await expect.poll(async () => (await pixels(page)).blue).toBeGreaterThan(baselineBlue + 120)
    const oldResponse = page.waitForResponse("**/billboard-old.svg")
    releaseOld()
    await oldResponse
    await page.waitForTimeout(700)
    const painted = await pixels(page)
    expect(painted.blue).toBeGreaterThan(baselineBlue + 120)
    expect(painted.magenta).toBe(0)
    expect(painted.cyan).toBe(0)
    await expect(page.getByRole("complementary", { name: "Card for Implementation" })).toBeVisible()
    expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(snapshot)
    expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
    await page.screenshot({ path: "/tmp/billboard-latest-image.png" })
    await expect(page.getByRole("alert")).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { releaseOld() }
})
