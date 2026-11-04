import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, expect } from "@playwright/test"
import { preview } from "vite"

const root = process.cwd()
const scratch = await mkdtemp(join(tmpdir(), "factory-package-"))
let server, browser
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" })
try {
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { encoding: "utf8" }))
  const files = new Set(pack.files.map((file) => file.path))
  for (const file of ["lib/index.js", "lib/styles.css", "lib/types/index.d.ts", "LICENSE", "ASSETS.md", "public/assets/NOTICE.md", "public/assets/characters/ATTRIBUTION.md", "public/assets/models/room-themes/NOTICE.md", "public/assets/models/room-themes/provenance.json"]) assert(files.has(file), `Package is missing ${file}`)
  assert(![...files].some((file) => /^(?:src|e2e|tools|dist)\//.test(file)), "Package contains development or raw generation files")
  const consumer = join(scratch, "consumer")
  await cp("tests/package-consumer", consumer, { recursive: true })
  const source = JSON.parse(await readFile("package.json", "utf8"))
  const pinned = async (name) => JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8")).version
  const dependencies = { "factory-overseer": `file:${join(scratch, pack.filename)}` }
  for (const name of ["react", "react-dom", "@types/react", "@types/react-dom", "typescript", "vite"]) dependencies[name] = await pinned(name)
  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "factory-package-consumer", private: true, type: "module", dependencies }, null, 2))
  run("bun", ["install", "--prefer-offline", "--ignore-scripts"], consumer)
  // This is outside the repository: no src/ imports, tsconfig aliases or Vite types.
  run("bunx", ["tsc", "--project", "tsconfig.json"], consumer)
  run(process.execPath, ["--input-type=module", "-e", "import { Factory, RoomFactory } from 'factory-overseer'; if (typeof Factory !== 'function' || typeof RoomFactory !== 'function') throw new Error('Missing public components')"], consumer)
  await mkdir(join(consumer, "public/static/factory"), { recursive: true })
  await cp(join(consumer, "node_modules/factory-overseer/public/assets"), join(consumer, "public/static/factory/assets"), { recursive: true })
  run("bunx", ["vite", "build", "--base=/host/"], consumer)
  server = await preview({ configFile: false, root: consumer, base: "/host/", preview: { host: "127.0.0.1", port: 0, open: false } })
  const address = server.httpServer.address()
  assert(address && typeof address !== "string")
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = [], loaded = new Set()
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()) })
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname
    if (response.status() >= 400) errors.push(`${response.status()} ${path}`)
    if (response.ok()) loaded.add(path)
  })
  await page.goto(`http://127.0.0.1:${address.port}/host/`)
  const factory = page.getByRole("img", { name: "Factory floor" })
  await expect(factory).toHaveAttribute("data-drawn", "1", { timeout: 45000 })
  await expect(page.getByLabel("Host question")).toHaveText("Confirm the packaged factory")
  await expect(page.getByLabel("Counts")).toContainText("1 human request")
  await page.getByRole("button", { name: "Inspect", exact: true }).click()
  await expect(page.getByRole("complementary", { name: "Card for Package task" })).toContainText("Confirm the packaged factory")
  await page.getByRole("button", { name: "Answer", exact: true }).click()
  await expect(page.getByLabel("Counts")).toContainText("0 human requests")
  await expect(page.getByLabel("Host question")).toHaveText("Answered")
  await page.getByRole("button", { name: "Fit", exact: true }).click()
  await page.getByRole("button", { name: "Compact", exact: true }).click()
  const base = "/host/static/factory/assets/"
  for (const asset of ["models/pieces.glb", "billboards/planning.svg", "pets/rabbit-sheet.svg", "models/room-themes/lab-specimen-cabinet.glb", "models/room-themes/foundry-press.glb", "models/room-themes/factory-parts-organizer.glb", "models/room-themes/fabrication-paper-cutter.glb"]) {
    await expect.poll(() => loaded.has(base + asset), { timeout: 30000, message: `Asset loads from package: ${asset}` }).toBe(true)
  }
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).marginTop), "8px", "Package CSS changed the host page")
  const evidence = resolve("docs/screenshots/library-package")
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, "rooms.png"), fullPage: true })
  await page.getByRole("button", { name: "Switch appearance", exact: true }).click()
  await expect(factory).toHaveAttribute("data-drawn", "1", { timeout: 45000 })
  await expect(page.getByLabel("Counts")).toContainText("1 in flight")
  await page.getByRole("button", { name: "Inspect", exact: true }).click()
  await expect(page.getByRole("complementary", { name: "Card for Legacy package task" })).toContainText("Legacy worker")
  await expect.poll(() => loaded.has(base + "characters/char_1.png")).toBe(true)
  await page.screenshot({ path: join(evidence, "legacy.png"), fullPage: true })
  assert.deepEqual(errors, [], "Consumer browser reported errors")
  const report = { package: `${source.name}@${source.version}`, bytes: pack.size, unpackedBytes: pack.unpackedSize, files: files.size, checks: ["tarball installed outside repository", "strict NodeNext declarations without aliases or Vite types", "Node import without DOM", "consumer production build at /host/", "nested assets including all four furnishings", "RoomFactory attention and handle", "legacy Factory and sprite", "host CSS preserved", "no browser errors"] }
  await writeFile(join(evidence, "verification.json"), JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  await rm(scratch, { recursive: true, force: true })
}
