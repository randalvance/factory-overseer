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

it("resolves the lab pilot furnishing while retaining its paper floor and station", () => {
  const theme = resolveRoomTheme({ theme: "research-lab" })
  expect(theme).toMatchObject({ floor: "blue-grid", station: "lab", decoration: "shelves" })
  expect(theme.assets.decoration).toEqual({
    url: "/assets/models/room-themes/lab-specimen-cabinet.glb",
    footprint: { width: 1.1, depth: .74, height: 1.24 },
  })
})

it("inherits a preset furnishing alongside a host accessory without sharing mutable footprints", () => {
  const registry: RoomThemeRegistry = { studio: { extends: "research-lab", assets: {
    station: { url: "/host/instrument.glb", footprint: { width: .4, depth: .2, height: .3 } },
  } } }
  const original = JSON.stringify(registry)
  const theme = resolveRoomTheme({ theme: "studio", themeOverrides: { accent: "#123456" } }, registry)
  expect(theme.assets.decoration?.url).toBe("/assets/models/room-themes/lab-specimen-cabinet.glb")
  expect(theme.assets.station?.url).toBe("/host/instrument.glb")
  theme.assets.decoration!.footprint.width = .5
  theme.assets.station!.footprint.height = .1
  expect(JSON.stringify(registry)).toBe(original)
  expect(resolveRoomTheme({ theme: "research-lab" }).assets.decoration?.footprint.width).toBe(1.1)
})

it("lets registry and room asset overrides replace the bundled furnishing without mutating their inputs", () => {
  const registry: RoomThemeRegistry = { "research-lab": { assets: {
    decoration: { url: "/host/cabinet.glb", footprint: { width: 1, depth: .7, height: 1.2 } },
  } } }
  const room = { theme: "research-lab", themeOverrides: { assets: {
    decoration: { url: " /room/shelf.glb ", footprint: { width: .9, depth: .6, height: 1 } },
  } } }
  const originals = JSON.stringify({ registry, room })
  expect(resolveRoomTheme({ theme: "research-lab" }, registry).assets.decoration?.url).toBe("/host/cabinet.glb")
  expect(resolveRoomTheme(room, registry).assets.decoration).toEqual({
    url: "/room/shelf.glb", footprint: { width: .9, depth: .6, height: 1 },
  })
  expect(JSON.stringify({ registry, room })).toBe(originals)
  expect(resolveRoomTheme({ theme: "research-lab" }).assets.decoration?.url).toBe("/assets/models/room-themes/lab-specimen-cabinet.glb")
})

it.each([
  undefined,
  { url: "", footprint: { width: 1, depth: .7, height: 1.2 } },
  { url: "/too-wide.glb", footprint: { width: 2, depth: .7, height: 1.2 } },
])("uses procedural furniture when a host explicitly clears or supplies an invalid furnishing: %j", (decoration) => {
  const theme = resolveRoomTheme({ theme: "research-lab", themeOverrides: { assets: { decoration } } })
  expect(theme.assets.decoration).toBeUndefined()
  expect(theme.decoration).toBe("shelves")
  expect(theme.floor).toBe("blue-grid")
  expect(resolveRoomTheme({ theme: "research-lab" }).assets.decoration).toBeDefined()
})
