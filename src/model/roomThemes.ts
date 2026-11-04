/** Plain host data; theme choices never participate in routing or assignment. */
export const PAPER_FLOOR_PROFILES = ["kraft-pavers", "blue-grid", "honey-planks", "sage-checker", "terracotta-bays"] as const
export type PaperFloorProfile = typeof PAPER_FLOOR_PROFILES[number]
export type BuiltinRoomTheme = "research-lab" | "foundry" | "factory" | "fabrication-plant"
export type StationStyle = "lab" | "foundry" | "assembly" | "precision"
export type DecorationStyle = "shelves" | "press" | "parts" | "cutter"

/** Static GLB, fitted uniformly into this footprint with its bottom at y=0. */
export interface RoomModelAsset {
  url: string
  footprint: { width: number; depth: number; height: number }
}
export interface RoomThemeAssets {
  /** Repeats every two world tiles. */
  floor?: string
  /** Small accessory on the left side of the fixed functional workbench. */
  station?: RoomModelAsset
  /** Sparse furnishing at a checked rear-wall slot. */
  decoration?: RoomModelAsset
}
export interface RoomThemeDefinition {
  /** Inheritance is limited to a built-in preset, so registries cannot cycle. */
  extends?: BuiltinRoomTheme
  label?: string
  /** Six-digit sRGB hex colors. */
  wall?: string
  accent?: string
  floor?: PaperFloorProfile
  station?: StationStyle
  decoration?: DecorationStyle
  assets?: RoomThemeAssets
}
export type RoomThemeRegistry = Readonly<Record<string, RoomThemeDefinition>>
export interface ResolvedRoomTheme {
  id: string
  label: string
  wall: number
  accent: number
  floor: PaperFloorProfile
  station: StationStyle
  decoration: DecorationStyle
  assets: RoomThemeAssets
}

/** Width, height, depth; anchors are bottom centers in station/local prop coordinates. */
export const ROOM_THEME_SLOTS = {
  station: { size: [.5, .45, .26], anchor: [-.8, .85, -.48], clearance: .04 },
  decoration: { size: [1.15, 1.3, .82], anchor: [0, 0, 0], clearance: .10 },
} as const

export const ROOM_THEMES: Readonly<Record<BuiltinRoomTheme, ResolvedRoomTheme>> = {
  "research-lab": { id: "research-lab", label: "Research lab", wall: 0x82a8bd, accent: 0x618fae, floor: "blue-grid", station: "lab", decoration: "shelves", assets: {
    decoration: { url: "assets/models/room-themes/lab-specimen-cabinet.glb", footprint: { width: 1.1, depth: .74, height: 1.24 } },
  } },
  foundry: { id: "foundry", label: "Foundry", wall: 0xe2b45d, accent: 0xd5a145, floor: "honey-planks", station: "foundry", decoration: "press", assets: {
    decoration: { url: "assets/models/room-themes/foundry-press.glb", footprint: { width: 1.1, depth: .76, height: 1.24 } },
  } },
  factory: { id: "factory", label: "Factory", wall: 0x9db79b, accent: 0x719881, floor: "sage-checker", station: "assembly", decoration: "parts", assets: {
    decoration: { url: "assets/models/room-themes/factory-parts-organizer.glb", footprint: { width: 1.1, depth: .76, height: 1.18 } },
  } },
  "fabrication-plant": { id: "fabrication-plant", label: "Fabrication plant", wall: 0xc98366, accent: 0xb97055, floor: "terracotta-bays", station: "precision", decoration: "cutter", assets: {
    decoration: { url: "assets/models/room-themes/fabrication-paper-cutter.glb", footprint: { width: 1.1, depth: .76, height: 1.12 } },
  } },
}

export function resolveRoomTheme(room: { theme?: string; themeOverrides?: RoomThemeDefinition }, registry: RoomThemeRegistry = {}): ResolvedRoomTheme {
  const key = room.theme ?? "factory"
  const definition = Object.hasOwn(registry, key) ? registry[key] : undefined
  const baseKey = definition?.extends ?? key
  const preset = Object.hasOwn(ROOM_THEMES, baseKey) ? ROOM_THEMES[baseKey as BuiltinRoomTheme] : ROOM_THEMES.factory
  let result: ResolvedRoomTheme = { ...preset, id: definition ? key : preset.id, assets: { ...preset.assets } }
  for (const layer of [definition, room.themeOverrides]) {
    if (!layer) continue
    result = {
      ...result,
      label: typeof layer.label === "string" && layer.label.trim() ? layer.label : result.label,
      wall: color(layer.wall, result.wall), accent: color(layer.accent, result.accent),
      floor: choice(layer.floor, PAPER_FLOOR_PROFILES, result.floor),
      station: choice(layer.station, ["lab", "foundry", "assembly", "precision"], result.station),
      decoration: choice(layer.decoration, ["shelves", "press", "parts", "cutter"], result.decoration),
      assets: { ...result.assets, ...layer.assets },
    }
  }
  result.assets = {
    floor: assetUrl(result.assets.floor),
    station: modelAsset(result.assets.station, "station"),
    decoration: modelAsset(result.assets.decoration, "decoration"),
  }
  return result
}

function color(value: string | undefined, fallback: number): number {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : fallback
}
function choice<T extends string>(value: T | undefined, allowed: readonly T[], fallback: T): T {
  return value !== undefined && allowed.includes(value) ? value : fallback
}
function assetUrl(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
function modelAsset(asset: RoomModelAsset | undefined, slot: keyof typeof ROOM_THEME_SLOTS): RoomModelAsset | undefined {
  const url = assetUrl(asset?.url)
  const footprint = asset?.footprint
  if (!url || !footprint) return undefined
  const sizes = [footprint.width, footprint.height, footprint.depth]
  if (sizes.some((value, i) => !Number.isFinite(value) || value <= 0 || value > ROOM_THEME_SLOTS[slot].size[i]!)) return undefined
  return { url, footprint: { ...footprint } }
}
