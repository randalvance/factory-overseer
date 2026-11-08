// What each biome's outdoor paper is cut from: the cardstock under the rooms
// and beyond the floor, its flat patches and folded tufts, and the grove's
// kind. Everything is procedural colour; no biome brings an art file.

import { DEFAULT_BIOME, type Biome } from "~/model/biomes"

export interface PaperBiome {
  /** The ground cardstock's base colour; also the clear colour past the ground's edge. */
  ground: number
  /** Flat cut-paper patches laid on the ground. */
  patches: readonly number[]
  /** The lit and the shaded face of each folded tuft. */
  tuft: { light: number; dark: number }
  /** Of every tile near the floor, about how many carry a patch and a tuft. */
  tuftDensity: number
  /** Leafy folded card, ribbed cacti, or folded card under caps of snow. */
  grove: "leafy" | "cactus" | "snowy"
  /** Mesh names, so tests and tools can tell the biomes apart. */
  names: { ground: string; patches: string; tufts: string; crowns: string; trunks: string }
}

export const PAPER_BIOMES: Readonly<Record<Biome, PaperBiome>> = {
  grass: {
    ground: 0xa7bc7c,
    patches: [0xadc286, 0xa0b775, 0xb4c78d, 0x9db476],
    tuft: { light: 0xc0d191, dark: 0x789957 },
    tuftDensity: .23,
    grove: "leafy",
    names: { ground: "grass-cardstock", patches: "grass-paper-patches", tufts: "grass-folded-tufts", crowns: "folded-paper-crowns", trunks: "kraft-paper-trunks" },
  },
  desert: {
    ground: 0xe2c992,
    patches: [0xd9bd82, 0xe9d4a2, 0xcfb276, 0xdcc38c],
    // Sparse dry scrub, straw on the lit fold and olive in shade.
    tuft: { light: 0xcdb97c, dark: 0x8f8a52 },
    tuftDensity: .11,
    grove: "cactus",
    names: { ground: "desert-cardstock", patches: "desert-paper-patches", tufts: "desert-folded-scrub", crowns: "folded-paper-cacti", trunks: "sand-paper-mounds" },
  },
  snow: {
    ground: 0xe9eff3,
    // Drifts read by their cool shadowed paper, not by outlines.
    patches: [0xdde6ee, 0xf5f8fa, 0xd4dfe9, 0xebf1f5],
    // Frosted blades poking through the snow.
    tuft: { light: 0xd3dfd6, dark: 0x8ea596 },
    tuftDensity: .12,
    grove: "snowy",
    names: { ground: "snow-cardstock", patches: "snow-paper-drifts", tufts: "snow-frosted-tufts", crowns: "snowy-paper-crowns", trunks: "kraft-paper-trunks" },
  },
}

export function paperBiome(biome: Biome = DEFAULT_BIOME): PaperBiome {
  return PAPER_BIOMES[biome]
}
