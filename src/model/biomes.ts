/** The outdoor paper around the rooms. Plain host data, like room themes: a
 * biome never takes part in routing, layout or assignment. */
export const BIOMES = ["grass", "desert", "snow"] as const
export type Biome = typeof BIOMES[number]
export const DEFAULT_BIOME: Biome = "grass"

/** Labels for a host's picker. */
export const BIOME_LABELS: Readonly<Record<Biome, string>> = {
  grass: "Grass",
  desert: "Desert",
  snow: "Snowy plains",
}

export function isBiome(name: unknown): name is Biome {
  return typeof name === "string" && (BIOMES as readonly string[]).includes(name)
}

/** A known biome as given, and grass for none or for a name the factory does not know. */
export function resolveBiome(name: string | undefined): Biome {
  return isBiome(name) ? name : DEFAULT_BIOME
}
