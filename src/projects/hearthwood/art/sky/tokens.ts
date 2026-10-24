import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";

/*
 * The sky's and the light's own colours, read once from their tokens in
 * globals.css (`--color-hearthwood-sky-…`): the tints of the
 * sun's and moon's light, everything drawn in the sky, and the night's
 * cooling in the grade.
 */

const SKY_TOKENS = [
  "sun-morning",
  "sun-evening",
  "moonlight",
  "moon-highland",
  "moon-mare",
  "earthshine",
  "moon-halo",
  "star-warm",
  "star-cool",
  "milky-way",
  "aurora-green",
  "aurora-violet",
  "night-vision",
] as const;

export type SkyToken = (typeof SKY_TOKENS)[number];

export type SkyColours = Readonly<Record<SkyToken, Color>>;

let colours: SkyColours | null = null;

/** The tokens, read from the page's stylesheet the first time they are asked for. */
export function skyColours(): SkyColours {
  colours ??= Object.fromEntries(SKY_TOKENS.map((name) => [name, themeColor(`--color-hearthwood-sky-${name}`)])) as SkyColours;
  return colours;
}
