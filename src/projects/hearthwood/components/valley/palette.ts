import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { MOMENTS, type Moment } from "../../world/day";

/*
 * The valley's colours, read once from its tokens in globals.css.
 */

const MOMENT_PARTS = ["sky", "haze", "sun", "sky-light", "ground-light", "shadow"] as const;
export type MomentPart = (typeof MOMENT_PARTS)[number];

const THINGS = [
  "ground-meadow",
  "ground-meadow-lush",
  "ground-forest",
  "ground-alpine",
  "ground-rock",
  "ground-snow",
  "ground-shore",
  "ground-path",
  "water-shallow",
  "water-deep",
  "water-foam",
  "far-ridge",
  "conifer",
  "broadleaf",
  "birch-leaf",
  "birch-bark",
  "bark",
  "bush",
  "rock",
  "stone",
  "moss",
  "flower-white",
  "flower-yellow",
  "flower-violet",
  "fire-core",
  "fire-flame",
  "fire-tip",
  "firelight",
  "ember",
  "log",
  "firefly",
  "star",
  "moon",
  "sun-disc",
  "witch-cloak",
  "witch-hat",
  "witch-scarf",
  "witch-skin",
  "witch-pack",
  "witch-bedroll",
] as const;
export type Thing = (typeof THINGS)[number];

export interface Palette {
  moments: Record<Moment, Record<MomentPart, Color>>;
  things: Record<Thing, Color>;
}

const token = (name: string) => themeColor(`--color-hearthwood-valley-${name}`);

export function readPalette(): Palette {
  const moments = Object.fromEntries(
    MOMENTS.map((moment) => [moment, Object.fromEntries(MOMENT_PARTS.map((part) => [part, token(`${moment}-${part}`)]))]),
  ) as Palette["moments"];
  const things = Object.fromEntries(THINGS.map((thing) => [thing, token(thing)])) as Palette["things"];
  return { moments, things };
}
