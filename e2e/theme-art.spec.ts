import { expect, test, type Page } from "@playwright/test"
import { writeFile } from "node:fs/promises"

const props = [
  { theme: "research-lab", label: "Research lab", asset: "lab-specimen-cabinet", bounds: [1.1, 1.24, .74], color: "blue" },
  { theme: "foundry", label: "Foundry", asset: "foundry-press", bounds: [1.1, 1.24, .76], color: "ochre" },
  { theme: "factory", label: "Factory", asset: "factory-parts-organizer", bounds: [1.1, 1.18, .76], color: "sage" },
  { theme: "fabrication-plant", label: "Fabrication plant", asset: "fabrication-paper-cutter", bounds: [1.1, 1.12, .76], color: "terracotta" },
] as const
type Metrics = NonNullable<Window["themes"]["metrics"]>
async function structure(page: Page) {
  return page.evaluate(() => {
    const layout = window.themes.layout!
    return { rooms: layout.rooms!.map(({ id, rect, ports }) => ({ id, rect, ports })),
      stations: layout.bays.flatMap((bay) => bay.stations.map(({ id, bench, agentTile }) => ({ id, bench, agentTile }))),
      belts: layout.belts, boxes: layout.boxes }
  })
}
async function settledMetrics(page: Page, differentFrom?: number) {
  return page.evaluate((different) => new Promise<NonNullable<Window["themes"]["metrics"]>>((resolve, reject) => {
    let previous = window.themes.metrics, stableTriangles: number | undefined
    const deadline = performance.now() + 20_000
    const sample = () => {
      const current = window.themes.metrics
      if (current && current !== previous) {
        previous = current
        if (current.triangles === stableTriangles && current.triangles !== different) { resolve(current); return }
        stableTriangles = current.triangles
      }
      if (performance.now() > deadline) { reject(new Error("Room render metrics did not settle")); return }
      requestAnimationFrame(sample)
    }
    sample()
  }), differentFrom)
}

for (const prop of props) test(`the ${prop.theme} furnishing loads with paper colors inside the production budgets`, async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const file = await request.get(`/assets/models/room-themes/${prop.asset}.glb`)
  expect(file.ok()).toBe(true)
  const bytes = await file.body()
  expect(bytes.length).toBeLessThan(1_000_000)
  expect(bytes.toString("ascii", 0, 4)).toBe("glTF")
  const jsonLength = bytes.readUInt32LE(12)
  const glb = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength))
  for (const mesh of glb.meshes) for (const primitive of mesh.primitives) {
    // A valid image alone is insufficient: without UVs the atlas samples
    // its black corner, even though the production loader accepts the mesh.
    const material = glb.materials?.[primitive.material]
    if (material?.pbrMetallicRoughness?.baseColorTexture) {
      expect(typeof primitive.attributes.TEXCOORD_0).toBe("number")
    } else {
      expect(primitive.attributes.COLOR_0 !== undefined || material?.pbrMetallicRoughness?.baseColorFactor !== undefined).toBe(true)
    }
  }
  for (const image of glb.images ?? []) {
    expect(image.mimeType).toBe("image/png")
    const view = glb.bufferViews[image.bufferView]
    const start = 20 + jsonLength + 8 + (view.byteOffset ?? 0)
    expect(bytes.readUInt32BE(start + 16)).toBeLessThanOrEqual(512)
    expect(bytes.readUInt32BE(start + 20)).toBeLessThanOrEqual(512)
  }
  await page.goto(`/e2e/fixtures/theme-art.html?theme=${prop.theme}`)
  const canvas = page.getByRole("img", { name: `${prop.label} furnishing at the factory camera angle` })
  await expect(canvas).toHaveAttribute("data-loaded", "true")
  const measurements = await page.evaluate(() => window.themeArt.measurements!)
  expect(measurements.triangles).toBeGreaterThan(0)
  expect(measurements.triangles).toBeLessThanOrEqual(2000)
  expect(measurements.materials).toBeLessThanOrEqual(2)
  expect(measurements.textureDimensions.length).toBeLessThanOrEqual(1)
  for (const dimensions of measurements.textureDimensions) for (const dimension of dimensions) expect(dimension).toBeLessThanOrEqual(512)
  if (!measurements.textureDimensions.length) expect(measurements.vertexColoredMeshes).toBeGreaterThan(0)
  for (const [index, limit] of prop.bounds.entries()) {
    expect(measurements.bounds.size[index]).toBeGreaterThan(0)
    expect(measurements.bounds.size[index]).toBeLessThanOrEqual(limit + .000001)
  }
  expect(measurements.bounds.min[1]).toBeCloseTo(0, 5)
  expect(measurements.renderedTriangles).toBe(measurements.triangles)
  const screenshot = await canvas.screenshot()
  const surfacePixels = await page.evaluate(async (encoded) => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const sample = document.createElement("canvas")
    sample.width = image.width; sample.height = image.height
    const context = sample.getContext("2d")!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data
    let blue = 0, ochre = 0, sage = 0, terracotta = 0, nearBlack = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!
      if (b > r * 1.08 && g > r * 1.06 && b > 80) blue++
      if (r > g * 1.1 && g > b * 1.2 && g > 70) ochre++
      if (g > r * 1.03 && g > b * 1.03 && g > 70) sage++
      if (r > g * 1.2 && r > b * 1.3 && r > 80) terracotta++
      if (Math.max(r, g, b) < 45) nearBlack++
    }
    return { blue, ochre, sage, terracotta, nearBlack, total: sample.width * sample.height }
  }, screenshot.toString("base64"))
  expect(surfacePixels[prop.color]).toBeGreaterThan(300)
  // This palette has no black regions. Allow isolated antialiasing pixels,
  // but reject the broad black wedges produced by damaged UV sampling.
  expect(surfacePixels.nearBlack / surfacePixels.total).toBeLessThan(.0002)
  await page.screenshot({ path: testInfo.outputPath(`${prop.asset}-gallery.png`) })
  await writeFile(testInfo.outputPath(`${prop.asset}-measurements.json`), JSON.stringify({ ...measurements, surfacePixels }, null, 2))
  expect(errors).toEqual([])
})

test("the gallery shows the complete four-prop pack", async ({ page, request }, testInfo) => {
  await page.goto("/e2e/fixtures/theme-art.html")
  await expect.poll(() => page.evaluate(() => window.themeArt?.loaded)).toBe(true)
  expect(await page.evaluate(() => Object.keys(window.themeArt.assets).sort())).toEqual(props.map((prop) => prop.theme).sort())
  await expect(page.locator("canvas[data-loaded=true]")).toHaveCount(4)
  let packBytes = 0
  for (const prop of props) packBytes += (await (await request.get(`/assets/models/room-themes/${prop.asset}.glb`)).body()).length
  expect(packBytes).toBeLessThan(8_000_000)
  await page.screenshot({ path: testInfo.outputPath("four-prop-gallery.png") })
})

test("all four furnishings replace fallbacks once per room through seven-agent growth", async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1536, height: 1600 })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/e2e/fixtures/themes.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await settledMetrics(page)
  const original = await structure(page)
  const comparisons: Record<string, { normal?: { fallback: Metrics; generated: Metrics }; expanded?: { fallback: Metrics; generated: Metrics }; replacementDelta?: number }> = {}
  async function compare(phase: "normal" | "expanded") {
    const geometry = await structure(page)
    for (const prop of props) {
      await page.evaluate((theme) => window.themes.setTheme("implementation", theme, { assets: { decoration: undefined } }), prop.theme)
      const fallback = await settledMetrics(page)
      await page.evaluate((theme) => window.themes.setTheme("implementation", theme), prop.theme)
      const generated = await settledMetrics(page, fallback.triangles)
      const delta = generated.triangles - fallback.triangles
      expect(delta).toBeGreaterThan(100)
      expect(await structure(page)).toEqual(geometry)
      const comparison = comparisons[prop.theme] ??= {}
      if (phase === "expanded") expect(delta).toBe(comparison.replacementDelta)
      else comparison.replacementDelta = delta
      comparison[phase] = { fallback, generated }
    }
    await page.evaluate(() => window.themes.setTheme("implementation", "foundry"))
    return settledMetrics(page)
  }
  async function mixedFallback() {
    await page.evaluate(() => {
      const state = structuredClone(window.themes.state)
      state.configuration.rooms = state.configuration.rooms.map((room) => ({ ...room, themeOverrides: { assets: { decoration: undefined } } }))
      window.themes.update(state)
    })
    const fallback = await settledMetrics(page)
    await page.evaluate(() => {
      const state = structuredClone(window.themes.state)
      state.configuration.rooms = state.configuration.rooms.map((room) => ({ ...room, themeOverrides: undefined }))
      window.themes.update(state)
    })
    const generated = await settledMetrics(page, fallback.triangles)
    return { fallback, generated }
  }
  await compare("normal")
  expect(await structure(page)).toEqual(original)
  const opening = await mixedFallback()
  await page.screenshot({ path: testInfo.outputPath("four-theme-in-room.png") })
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    for (let index = 2; index <= 7; index++) state.snapshot.agents.push({ id: `implementation-${index}`, name: `Implementer ${index}`, role: "implementer", roomId: "implementation", status: "working" })
    window.themes.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.themes.layout?.bays.find((bay) => bay.id === "room:implementation")?.stations.length)).toBe(7)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await settledMetrics(page)
  await compare("expanded")
  const expanded = await mixedFallback()
  expect(expanded.generated.triangles - expanded.fallback.triangles).toBe(opening.generated.triangles - opening.fallback.triangles)
  await page.screenshot({ path: testInfo.outputPath("four-theme-expanded-seven.png") })
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["implementation-7"], completedAgentIds: [] } }
    window.themes.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.themes.landed), { timeout: 30_000 }).toEqual(["task"])
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  expect(await page.evaluate(() => window.themes.unrouted)).toEqual([])
  await expect(page.getByRole("alert")).toHaveCount(0)
  await writeFile(testInfo.outputPath("four-theme-room-metrics.json"), JSON.stringify({ viewport: page.viewportSize(), opening, expanded, comparisons }, null, 2))
  expect(errors).toEqual([])
})
