/** The one palette every Betrayal texture, material and light is drawn from.
 *  Keeping every room to these colours is what makes them look like one game:
 *  never write a hex value anywhere else in the art. */
export const PALETTE = {
  void: "#09080b",
  soot: "#141117",
  sootLight: "#211c26",
  ash: "#36303d",

  stoneDark: "#4a4550",
  stone: "#69646e",
  stoneLight: "#8f8a92",

  boneDark: "#9b8e72",
  bone: "#cbbf9f",
  boneLight: "#e8dfc6",

  woodDark: "#2b1b13",
  wood: "#46291b",
  woodMid: "#643b24",
  woodLight: "#86552f",

  brass: "#9c7536",
  ember: "#b85620",
  amber: "#e89a35",
  flame: "#ffd780",

  bloodDark: "#3d0d13",
  blood: "#6e1620",
  bloodLight: "#9c2a33",
  scarlet: "#d9443a",

  verdigrisDark: "#1b3532",
  verdigris: "#3a6b5d",
  verdigrisLight: "#6c9c86",

  bruiseDark: "#24172e",
  bruise: "#432a55",
  bruiseLight: "#6d4f86",
  violet: "#a97ad8",

  wraithDark: "#1e2a12",
  wraith: "#4e6d22",
  wraithLight: "#a3c552",

  gold: "#e6bd2c",
  goldLight: "#ffe873",

  tideDark: "#10303a",
  tide: "#2a7480",
  tideLight: "#7cc9c4",

  moonDark: "#18243a",
  moon: "#3f5d88",
  moonLight: "#93afd2",
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function paletteHex(key: PaletteKey): string {
  return PALETTE[key];
}

/** Dark-to-light runs of one hue, for generators that shade with palette steps.
 *  The runs that end bright enough to glow carry the lighting language (see
 *  the room-art skill): moon, fire, scarlet, violet, wraith, gold and tide. */
export const RAMPS = {
  soot: ["void", "soot", "sootLight", "ash"],
  stone: ["ash", "stoneDark", "stone", "stoneLight"],
  bone: ["boneDark", "bone", "boneLight"],
  wood: ["woodDark", "wood", "woodMid", "woodLight"],
  fire: ["ember", "amber", "flame"],
  blood: ["bloodDark", "blood", "bloodLight"],
  verdigris: ["verdigrisDark", "verdigris", "verdigrisLight"],
  bruise: ["bruiseDark", "bruise", "bruiseLight"],
  moon: ["moonDark", "moon", "moonLight"],
  scarlet: ["bloodDark", "blood", "bloodLight", "scarlet"],
  violet: ["bruiseDark", "bruise", "bruiseLight", "violet"],
  wraith: ["wraithDark", "wraith", "wraithLight"],
  gold: ["brass", "gold", "goldLight"],
  tide: ["tideDark", "tide", "tideLight"],
} as const satisfies Record<string, readonly PaletteKey[]>;

export type Ramp = readonly PaletteKey[];
