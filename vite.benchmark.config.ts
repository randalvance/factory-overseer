import { fileURLToPath } from "node:url"
import { mergeConfig } from "vite"
import base from "./vite.config.ts"

// Build the existing paper fixture with production React and bundled assets.
// Keep this output separate from the demo and historical measurements.
export default mergeConfig(base, {
  build: {
    outDir: "/tmp/factory-overseer-paper-benchmark",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./e2e/fixtures/paper.html", import.meta.url)),
    },
  },
})
