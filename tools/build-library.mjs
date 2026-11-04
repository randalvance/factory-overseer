import { execFileSync } from "node:child_process"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"

execFileSync("bunx", ["vite", "build", "--config", "vite.lib.config.ts"], { stdio: "inherit" })
execFileSync("bunx", ["tsc", "--project", "tsconfig.lib.json"], { stdio: "inherit" })

// TypeScript preserves path aliases and extensionless imports in declarations.
// Publish local ESM specifiers so hosts need neither our alias nor Vite types.
const types = resolve("lib/types")
for (const name of await readdir(types, { recursive: true })) {
  if (!name.endsWith(".d.ts")) continue
  const path = resolve(types, name)
  const declaration = (await readFile(path, "utf8")).replace(/^import ["'][^"']+\.css["'];?\n/gm, "")
  await writeFile(path, declaration.replace(/(["'])(~\/|\.\.?\/)([^"']+)\1/g, (_match, quote, prefix, rest) => {
    let specifier = prefix === "~/" ? relative(dirname(path), resolve(types, rest)) : prefix + rest
    if (!specifier.startsWith(".")) specifier = "./" + specifier
    if (!/\.(?:js|json|css)$/.test(specifier)) specifier += ".js"
    return quote + specifier + quote
  }))
}
// The stylesheet is an explicit package export, safe to import in TS consumers.
await writeFile("lib/styles.d.ts", "export {}\n")
