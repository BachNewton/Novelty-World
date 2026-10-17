import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { MOMENTS, type Moment } from "../engine/day";
import { REGIONS, type Region } from "../engine/regions";

/*
 * The world's colours, read once from its tokens in globals.css: each
 * moment's light, each region's own grounds, and everything else the world
 * is made of.
 */

const MOMENT_PARTS = ["sky", "haze", "sun", "sky-light", "ground-light", "shadow"] as const;
export type MomentPart = (typeof MOMENT_PARTS)[number];

/** The grounds whose colour is each region's own; the rest are shared. */
const REGION_GROUNDS = ["meadow", "meadow-lush", "forest", "alpine"] as const;
export type RegionGround = (typeof REGION_GROUNDS)[number];

const THINGS = [
  "ground-rock",
  "ground-snow",
  "ground-shore",
  "ground-path",
  "water-shallow",
  "water-deep",
  "water-foam",
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
  "pine-leaf",
  "pine-bark",
  "maple-red",
  "maple-orange",
  "maple-gold",
  "aspen-gold",
  "aspen-bark",
  "heather-purple",
  "heather-pink",
  "gorse",
  "heather-stem",
  "fern",
  "bracken",
  "mushroom-red",
  "mushroom-brown",
  "mushroom-gold",
  "mushroom-spot",
  "mushroom-stem",
  "shrine-roof",
  "candle",
  "ribbon",
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
  "broom-handle",
  "broom-bristle",
] as const;
export type Thing = (typeof THINGS)[number];

export interface Palette {
  moments: Record<Moment, Record<MomentPart, Color>>;
  regions: Record<Region, Record<RegionGround, Color>>;
  things: Record<Thing, Color>;
}

const token = (name: string) => themeColor(`--color-hearthwood-valley-${name}`);

export function readPalette(): Palette {
  const moments = Object.fromEntries(
    MOMENTS.map((moment) => [moment, Object.fromEntries(MOMENT_PARTS.map((part) => [part, token(`${moment}-${part}`)]))]),
  ) as Palette["moments"];
  const regions = Object.fromEntries(
    REGIONS.map((region) => [region, Object.fromEntries(REGION_GROUNDS.map((ground) => [ground, token(`${region}-${ground}`)]))]),
  ) as Palette["regions"];
  const things = Object.fromEntries(THINGS.map((thing) => [thing, token(thing)])) as Palette["things"];
  return { moments, regions, things };
}

/** How thick each region's air is, against the world's usual haze: mist in the pine highlands, a clear sky over the heath. */
export const REGION_AIR: Record<Region, number> = {
  greenwood: 1,
  birchvale: 1.05,
  highlands: 1.55,
  heath: 0.8,
  maplewood: 1.1,
};
