import { expect, it } from "vitest"
import { resolveRoomTheme, ROOM_THEMES, type RoomThemeRegistry } from "./roomThemes"

it("selects four independent paper themes, regardless of room role or identity", () => {
  const themes = Object.keys(ROOM_THEMES).map((theme) => resolveRoomTheme({ theme }))
  expect(themes.map((theme) => theme.floor)).toEqual(["blue-grid", "honey-planks", "sage-checker", "terracotta-bays"])
  expect(new Set(themes.map((theme) => theme.station)).size).toBe(4)
  expect(resolveRoomTheme({ theme: "unknown" })).toEqual(resolveRoomTheme({ theme: "factory" }))
})

it("layers a host theme and per-room overrides without mutating either", () => {
  const registry: RoomThemeRegistry = { studio: { extends: "research-lab", label: "Paper studio", wall: "#ffeedd", station: "precision" } }
  const original = JSON.stringify(registry)
  const theme = resolveRoomTheme({ theme: "studio", themeOverrides: { accent: "#123456", floor: "kraft-pavers" } }, registry)
  expect(theme).toMatchObject({ id: "studio", label: "Paper studio", wall: 0xffeedd, accent: 0x123456, floor: "kraft-pavers", station: "precision", decoration: "shelves" })
  expect(JSON.stringify(registry)).toBe(original)
  expect(resolveRoomTheme({ theme: "studio" }, registry).accent).toBe(ROOM_THEMES["research-lab"].accent)
})

it("falls back per invalid field and rejects assets outside the fixed furniture slots", () => {
  const unsafe = { extends: "foundry", wall: "bad", floor: "missing", station: "missing", decoration: "missing", assets: {
    floor: "", station: { url: "/large.glb", footprint: { width: 5, depth: .2, height: .3 } },
    decoration: { url: "/safe.glb", footprint: { width: 1, depth: .6, height: 1 } },
  } } as unknown as RoomThemeRegistry[string]
  const theme = resolveRoomTheme({ theme: "unsafe" }, { unsafe })
  expect(theme).toMatchObject({ wall: ROOM_THEMES.foundry.wall, floor: "honey-planks", station: "foundry", decoration: "press" })
  expect(theme.assets.floor).toBeUndefined()
  expect(theme.assets.station).toBeUndefined()
  expect(theme.assets.decoration?.url).toBe("/safe.glb")
  expect(resolveRoomTheme({ theme: "toString" }).id).toBe("factory")
})
