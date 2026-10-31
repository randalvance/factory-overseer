import { defineConfig, devices } from "@playwright/test"

// The smoke tests boot the demo on their own port so a dev server on :3000
// can keep running. Chromium renders WebGL in software here, which is slow,
// so the timeouts are generous.
const port = 3100
const url = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 60_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: url,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `bun run dev -- --port ${port}`,
    url,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
