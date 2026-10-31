/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // host: true binds every interface so the devcontainer's forwarded port works.
  server: { host: true, port: 3000, strictPort: true },
  preview: { host: true, port: 3000 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
