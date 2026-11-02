import { expect, test, type Page } from "@playwright/test"
import { writeFile } from "node:fs/promises"

const pilotUrl = "/assets/models/room-themes/lab-specimen-cabinet.glb"
async function structure(page: Page) {
  return page.evaluate(() => {
    const layout = window.themes.layout!
    return { rooms: layout.rooms, stations: layout.bays.flatMap((bay) => bay.stations), belts: layout.belts, boxes: layout.boxes }
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

test("the generated lab cabinet loads with its paper colors inside the production budgets", async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const file = await request.get(pilotUrl)
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
  await page.goto("/e2e/fixtures/theme-art.html")
  const canvas = page.getByRole("img", { name: "Paper specimen cabinet at the factory camera angle" })
  await expect(canvas).toHaveAttribute("data-loaded", "true")
  const measurements = await page.evaluate(() => window.themeArt.measurements!)
  expect(measurements.triangles).toBeGreaterThan(0)
  expect(measurements.triangles).toBeLessThanOrEqual(2000)
  expect(measurements.materials).toBeLessThanOrEqual(2)
  expect(measurements.textureDimensions.length).toBeLessThanOrEqual(1)
  for (const dimensions of measurements.textureDimensions) for (const dimension of dimensions) expect(dimension).toBeLessThanOrEqual(512)
  if (!measurements.textureDimensions.length) expect(measurements.vertexColoredMeshes).toBeGreaterThan(0)
  for (const [index, limit] of [1.1, 1.24, .74].entries()) {
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
    let blue = 0, nearBlack = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!
      if (b > r * 1.08 && g > r * 1.06 && b > 80) blue++
      if (Math.max(r, g, b) < 45) nearBlack++
    }
    return { blue, nearBlack, total: sample.width * sample.height }
  }, screenshot.toString("base64"))
  expect(surfacePixels.blue).toBeGreaterThan(300)
  // This palette has no black regions. Allow isolated antialiasing pixels,
  // but reject the broad black wedges produced by damaged UV sampling.
  expect(surfacePixels.nearBlack / surfacePixels.total).toBeLessThan(.0002)
  await page.screenshot({ path: testInfo.outputPath("lab-cabinet-gallery.png") })
  await writeFile(testInfo.outputPath("lab-cabinet-measurements.json"), JSON.stringify({ ...measurements, surfacePixels }, null, 2))
  expect(errors).toEqual([])
})

test("the cabinet visibly replaces the room fallback and remains present after seven-agent growth", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1536, height: 1600 })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/e2e/fixtures/themes.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
  await settledMetrics(page)
  // Force a procedural baseline through the public theme override, then
  // prove the actual accepted GLB changes the rendered room geometry.
  await page.evaluate(() => window.themes.setTheme("planning", "research-lab", { assets: { decoration: undefined } }))
  const fallback = await settledMetrics(page)
  const original = await structure(page)
  await page.evaluate(() => window.themes.setTheme("planning", "research-lab"))
  const opening = await settledMetrics(page, fallback.triangles)
  const replacementDelta = opening.triangles - fallback.triangles
  expect(Math.abs(replacementDelta)).toBeGreaterThan(100)
  expect(await structure(page)).toEqual(original)
  await page.screenshot({ path: testInfo.outputPath("lab-cabinet-in-room.png") })
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    state.configuration.rooms = state.configuration.rooms.map((room) => room.id === "implementation" ? { ...room, theme: "research-lab" } : room)
    for (let index = 2; index <= 7; index++) state.snapshot.agents.push({ id: `implementation-${index}`, name: `Implementer ${index}`, role: "implementer", roomId: "implementation", status: "working" })
    window.themes.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.themes.layout?.bays.find((bay) => bay.id === "room:implementation")?.stations.length)).toBe(7)
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  const generatedMetrics = await settledMetrics(page)
  const expanded = await structure(page)
  await page.screenshot({ path: testInfo.outputPath("lab-cabinet-expanded-seven.png") })
  await page.evaluate(() => window.themes.setTheme("implementation", "research-lab", { assets: { decoration: undefined } }))
  const expandedFallback = await settledMetrics(page, generatedMetrics.triangles)
  expect(generatedMetrics.triangles - expandedFallback.triangles).toBe(replacementDelta)
  expect(await structure(page)).toEqual(expanded)
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  expect(await page.evaluate(() => window.themes.unrouted)).toEqual([])
  await expect(page.getByRole("alert")).toHaveCount(0)
  await writeFile(testInfo.outputPath("lab-cabinet-room-metrics.json"), JSON.stringify({ fallback, opening, expandedFallback, expanded: generatedMetrics, replacementDelta }, null, 2))
  expect(errors).toEqual([])
})
