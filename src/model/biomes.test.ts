import { expect, it } from "vitest"
import { BIOMES, BIOME_LABELS, DEFAULT_BIOME, isBiome, resolveBiome } from "./biomes"

it("names grass, desert and snowy plains, and draws grass for none or an unknown name", () => {
  expect(BIOMES).toEqual(["grass", "desert", "snow"])
  expect(BIOMES.map((biome) => BIOME_LABELS[biome])).toEqual(["Grass", "Desert", "Snowy plains"])
  expect(DEFAULT_BIOME).toBe("grass")
  expect(resolveBiome(undefined)).toBe("grass")
  expect(resolveBiome("desert")).toBe("desert")
  expect(resolveBiome("snow")).toBe("snow")
  expect(resolveBiome("tundra")).toBe("grass")
  expect(isBiome("Desert")).toBe(false)
})
