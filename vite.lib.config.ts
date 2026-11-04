import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  publicDir: false,
  build: {
    outDir: "lib",
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "styles" },
    rolldownOptions: {
      external: (id) => /^(react|react-dom|three)(\/|$)/.test(id),
    },
  },
})
