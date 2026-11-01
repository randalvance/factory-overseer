import { expect, test, type Page } from "@playwright/test"
import { writeFile } from "node:fs/promises"

async function ready(page: Page) {
  await page.goto("/e2e/fixtures/themes.html")
  await expect(page.getByRole("img", { name: "Factory floor" })).toHaveAttribute("data-drawn", "1")
}
async function colors(page: Page) {
  const image = await page.locator("canvas").screenshot()
  return page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext("2d")!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0, blue = 0, magenta = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!
      if (r > 120 && r > g * 1.7 && r > b * 1.5) red++
      if (b > 120 && b > r * 1.7 && b > g * 1.3) blue++
      if (r > 120 && b > 120 && g < Math.min(r, b) * .5) magenta++
    }
    return { red, blue, magenta }
  }, image.toString("base64"))
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

test("host theme updates repaint a room during a task ride while retaining selection and human attention", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await ready(page)
  await expect.poll(() => page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    state.snapshot.tasks[0]!.at = { kind: "room", roomId: "implementation", assignment: { agentIds: ["implementation"], completedAgentIds: [] } }
    window.themes.update(state)
    window.themes.handle!.inspect({ task: "task" })
  })
  await expect.poll(() => page.evaluate(() => window.themes.rides)).toContain("task")
  expect(await page.evaluate(() => window.themes.landed)).toEqual([])
  const snapshot = await page.evaluate(() => window.themes.state.snapshot)
  const original = await geometry(page)
  await page.evaluate(() => {
    window.themes.setRegistry({ signal: { extends: "factory", wall: "#ed243b", accent: "#ed243b" } })
    window.themes.setTheme("implementation", "signal")
  })
  await expect.poll(async () => (await colors(page)).red, { timeout: 8000 }).toBeGreaterThan(2000)
  await expect(page.getByRole("complementary", { name: "Card for Theme task" })).toBeVisible()
  expect(await geometry(page)).toEqual(original)
  expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(snapshot)
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  await expect.poll(() => page.evaluate(() => window.themes.landed), { timeout: 30000 }).toEqual(["task"])
  expect(await page.evaluate(() => window.themes.unrouted)).toEqual([])
  expect(errors).toEqual([])
})


test("failed host floor and furniture assets leave a usable procedural room", async ({ page }) => {
  const errors: string[] = [], requested = new Set<string>()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/theme-bad-*", async (route) => {
    requested.add(new URL(route.request().url()).pathname)
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "not a usable image or model" })
  })
  await ready(page)
  const snapshot = await page.evaluate(() => window.themes.state.snapshot)
  const original = await geometry(page)
  await page.evaluate(() => {
    window.themes.handle!.inspect({ agent: "implementation" })
    window.themes.setRegistry({ broken: { extends: "foundry", wall: "#ed243b", assets: {
      floor: "/theme-bad-floor.png",
      station: { url: "/theme-bad-station.glb", footprint: { width: .4, depth: .2, height: .3 } },
      decoration: { url: "/theme-bad-decoration.glb", footprint: { width: 1, depth: .5, height: .8 } },
    } } })
    window.themes.setTheme("implementation", "broken")
  })
  await expect.poll(() => [...requested].sort()).toEqual(["/theme-bad-decoration.glb", "/theme-bad-floor.png", "/theme-bad-station.glb"])
  await expect.poll(async () => (await colors(page)).red).toBeGreaterThan(2000)
  await expect(page.getByRole("complementary", { name: "Card for Implementation" })).toBeVisible()
  expect(await geometry(page)).toEqual(original)
  expect(await page.evaluate(() => window.themes.state.snapshot)).toEqual(snapshot)
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.screenshot({ path: "/tmp/room-theme-fallback.png" })
  expect(errors).toEqual([])
})


test("late floor assets cannot replace a newer host theme registry", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  let oldRequested = false, releaseOld = () => {}
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve })
  const tile = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="${fill}" d="M0 0h32v32H0z"/></svg>`
  await page.route("**/theme-old.svg", async (route) => {
    oldRequested = true
    await oldGate
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: tile("#ee1530") })
  })
  await page.route("**/theme-current.svg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: tile("#1734ff") }))
  try {
    await ready(page)
    const original = await geometry(page)
    await page.evaluate(() => {
      window.themes.handle!.inspect({ agent: "implementation" })
      window.themes.setRegistry({ custom: { extends: "factory", wall: "#b3b3b3", accent: "#b3b3b3", assets: { floor: "/theme-old.svg" } } })
      window.themes.setTheme("implementation", "custom")
    })
    await expect.poll(() => oldRequested).toBe(true)
    await page.evaluate(() => window.themes.setRegistry({ custom: { extends: "factory", wall: "#b3b3b3", accent: "#b3b3b3", assets: { floor: "/theme-current.svg" } } }))
    await expect.poll(async () => (await colors(page)).blue).toBeGreaterThan(1000)
    // The hopper and other paper art may already be red. Only newly painted
    // red pixels would indicate that the obsolete floor replaced this one.
    const current = await colors(page)
    const oldResponse = page.waitForResponse("**/theme-old.svg")
    releaseOld()
    await oldResponse
    await page.waitForTimeout(600)
    const painted = await colors(page)
    expect(painted.blue).toBeGreaterThan(1000)
    expect(painted.red).toBeLessThan(current.red + 100)
    await page.evaluate(() => window.themes.setTheme("implementation", "custom", { wall: "#ed243b" }))
    await expect.poll(async () => (await colors(page)).red).toBeGreaterThan(2000)
    expect(await geometry(page)).toEqual(original)
    expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
    await expect(page.getByRole("alert")).toHaveCount(0)
    await page.screenshot({ path: "/tmp/room-theme-latest-registry.png" })
    expect(errors).toEqual([])
  } finally { releaseOld() }
})


test("mixed themes preserve an expanded seven-agent room through all preset changes", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await ready(page)
  await expect.poll(() => page.evaluate(() => window.themes.metrics)).toBeTruthy()
  await page.waitForTimeout(1500)
  const openingMetrics = await page.evaluate(() => window.themes.metrics)
  await page.screenshot({ path: "/tmp/room-themes-mixed.png" })
  await page.evaluate(() => {
    const state = structuredClone(window.themes.state)
    for (let index = 2; index <= 7; index++) state.snapshot.agents.push({ id: `implementation-${index}`, name: `Implementer ${index}`, role: "implementer", roomId: "implementation", status: "working" })
    window.themes.update(state)
  })
  await expect.poll(() => page.evaluate(() => window.themes.layout?.bays.find((bay) => bay.id === "room:implementation")?.stations.length)).toBe(7)
  const original = await geometry(page)
  expect(original.stations.filter(({ id }) => id.startsWith("room:implementation:"))).toHaveLength(7)
  expect(original.rooms.find(({ id }) => id === "room:implementation")?.rect).toMatchObject({ w: 15, h: 17 })
  await page.evaluate(() => window.themes.handle!.inspect({ agent: "implementation-7" }))
  for (const preset of ["research-lab", "factory", "fabrication-plant", "foundry"]) {
    const draws = await page.evaluate(() => window.themes.draws)
    await page.evaluate((theme) => window.themes.setTheme("implementation", theme), preset)
    await expect.poll(() => page.evaluate(() => window.themes.draws)).toBeGreaterThan(draws)
    expect(await geometry(page)).toEqual(original)
    await expect(page.getByRole("complementary", { name: "Card for Implementer 7" })).toBeVisible()
  }
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: "Fit all", exact: true }).click()
  await page.waitForTimeout(4000)
  const expandedMetrics = await page.evaluate(() => window.themes.metrics)
  await writeFile("/tmp/room-theme-metrics.json", JSON.stringify({ viewport: page.viewportSize(), opening: openingMetrics, expanded: expandedMetrics }, null, 2))
  await page.screenshot({ path: "/tmp/room-themes-expanded-seven.png" })
  expect(await page.evaluate(() => window.themes.notifications)).toEqual(["question"])
  expect(await page.evaluate(() => window.themes.unrouted)).toEqual([])
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(errors).toEqual([])
})


/** A real static glTF cube with embedded position/normal buffers, loaded by
 * the production GLTFLoader rather than a substituted renderer collaborator. */
function tinyModel() {
  const positions: number[] = [], normals: number[] = []
  const faces = [
    { n: [0, 0, 1], p: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
    { n: [0, 0, -1], p: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
    { n: [1, 0, 0], p: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
    { n: [-1, 0, 0], p: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
    { n: [0, 1, 0], p: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
    { n: [0, -1, 0], p: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] },
  ]
  for (const face of faces) for (const vertex of [0, 1, 2, 0, 2, 3]) { positions.push(...face.p[vertex]!); normals.push(...face.n) }
  const bytes = Buffer.from(new Float32Array([...positions, ...normals]).buffer)
  const length = positions.length * 4
  return JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [.4, 0, .4] }],
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: length }, { buffer: 0, byteOffset: length, byteLength: length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 36, type: "VEC3", min: [-.5, -.5, -.5], max: [.5, .5, .5] }, { bufferView: 1, componentType: 5126, count: 36, type: "VEC3" }],
  })
}

test("a real host glTF model replaces theme accessories without changing the station layout", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/theme-cube.gltf", (route) => route.fulfill({ status: 200, contentType: "model/gltf+json", body: tinyModel() }))
  await ready(page)
  const original = await geometry(page)
  await page.evaluate(() => {
    window.themes.handle!.inspect({ agent: "implementation" })
    window.themes.setRegistry({ modeled: { extends: "factory", assets: {
      station: { url: "/theme-cube.gltf", footprint: { width: .48, height: .4, depth: .24 } },
      decoration: { url: "/theme-cube.gltf", footprint: { width: 1, height: 1.2, depth: .7 } },
    } } })
    window.themes.setTheme("implementation", "modeled")
  })
  await expect.poll(async () => (await colors(page)).magenta).toBeGreaterThan(100)
  expect(await geometry(page)).toEqual(original)
  await expect(page.getByRole("complementary", { name: "Card for Implementation" })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await page.screenshot({ path: "/tmp/room-theme-real-model.png" })
  expect(errors).toEqual([])
})
