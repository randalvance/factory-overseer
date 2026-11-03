import { chromium } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
const browser = await chromium.launch({ headless: true })
const results = []
const outputDir = process.env.PAPER_MEASURE_DIR ?? "docs/screenshots/paper"
await mkdir(outputDir, { recursive: true })
for (const large of [false, true]) for (const art of ["legacy", "paper"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await page.goto("http://127.0.0.1:3000/e2e/fixtures/paper.html?art=" + art + (large ? "&large" : ""))
  await page.waitForFunction(() => window.samples?.length >= 10, undefined, { timeout: 120000 })
  const result = await page.evaluate(() => {
    const samples = window.samples.slice(-8)
    const canvas = document.querySelector("canvas")
    const gl = canvas.getContext("webgl2")
    const debug = gl.getExtension("WEBGL_debug_renderer_info")
    return { samples, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      userAgent: navigator.userAgent, dpr: devicePixelRatio }
  })
  results.push({ art, agents: large ? 100 : 20, tasks: large ? 150 : 30, viewport: "1280x800", ...result })
  console.log(JSON.stringify({ art, agents: large ? 100 : 20, ...result.samples.at(-1), renderer: result.renderer }))
  await page.close()
}
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 })
await page.goto("http://127.0.0.1:3000")
await page.waitForSelector('[data-drawn="1"]')
await page.waitForTimeout(1500)
await page.screenshot({ path: join(outputDir, "overview.png") })
await page.getByRole("combobox", { name: "Task", exact: true }).selectOption("task-2")
await page.getByRole("button", { name: "Send to Implementation", exact: true }).click()
await page.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes("in Implementation"), undefined, { timeout: 60000 })
await page.mouse.move(800, 650)
await page.mouse.wheel(0, -300)
await page.waitForTimeout(1500)
await page.screenshot({ path: join(outputDir, "closeup.png") })
await writeFile(join(outputDir, "measurements.json"), JSON.stringify(results, null, 2) + "\n")
await browser.close()
