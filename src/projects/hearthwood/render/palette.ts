import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { MOMENTS, type Moment } from "../engine/day";
import { REGIONS, type Region } from "../engine/regions";
import { SEASON_GROUPS, type SeasonGroup } from "../engine/seasons";

/*
 * The world's colours, read once from its tokens in globals.css: each
 * moment's light, each region's own grounds, the seasons' colours, and
 * everything else the world is made of.
 */

const MOMENT_PARTS = ["sky", "haze", "sun", "sky-light", "ground-light"] as const;
export type MomentPart = (typeof MOMENT_PARTS)[number];

/** The grounds whose colour is each region's own; the rest are shared. */
const REGION_GROUNDS = ["meadow", "meadow-lush", "forest", "alpine"] as const;
export type RegionGround = (typeof REGION_GROUNDS)[number];

const THINGS = [
  "ground-rock",
  "ground-snow",
  "ground-shore",
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
  "star",
  "moon",
  "sun-disc",
] as const;

const SKY = ["aurora-green", "aurora-violet", "earthshine", "star-warm", "star-cool"] as const;
export type SkyColour = (typeof SKY)[number];
export type Thing = (typeof THINGS)[number];

/** The seasons' colours for each group of plants: rock has none, and only the groups whose shapes are painted in their autumn colours have a summer one. */
const SEASON_ROLES = ["fresh", "summer", "autumn", "autumn-alt", "bare"] as const;
export type SeasonRole = (typeof SEASON_ROLES)[number];
/** Groups whose shapes carry their autumn colour (the maple wood's maples, the gold aspens, the bracken), so their summer green is the season's own. */
export const AUTUMN_IN_SHAPE: readonly SeasonGroup[] = ["aspen", "maple", "bracken"];

const GROUND_SEASONS = ["ground-dormant", "ground-fresh", "ground-gold", "ground-russet"] as const;
export type GroundSeasonColour = (typeof GROUND_SEASONS)[number];

export interface Palette {
  moments: Record<Moment, Record<MomentPart, Color>>;
  regions: Record<Region, Record<RegionGround, Color>>;
  things: Record<Thing, Color>;
  /** Per season group, in SEASON_GROUPS order: each role's colour, or null where the group has none. */
  seasons: Record<SeasonRole, (Color | null)[]>;
  ground: Record<GroundSeasonColour, Color>;
  sky: Record<SkyColour, Color>;
}

const token = (name: string) => themeColor(`--color-hearthwood-valley-${name}`);

function hasSeasonColour(group: SeasonGroup, role: SeasonRole): boolean {
  if (group === "rock") return false;
  if (role === "summer") return AUTUMN_IN_SHAPE.includes(group);
  if (role === "autumn") return !AUTUMN_IN_SHAPE.includes(group);
  return true;
}

export function readPalette(): Palette {
  const moments = Object.fromEntries(
    MOMENTS.map((moment) => [moment, Object.fromEntries(MOMENT_PARTS.map((part) => [part, token(`${moment}-${part}`)]))]),
  ) as Palette["moments"];
  const regions = Object.fromEntries(
    REGIONS.map((region) => [region, Object.fromEntries(REGION_GROUNDS.map((ground) => [ground, token(`${region}-${ground}`)]))]),
  ) as Palette["regions"];
  const things = Object.fromEntries(THINGS.map((thing) => [thing, token(thing)])) as Palette["things"];
  const seasons = Object.fromEntries(
    SEASON_ROLES.map((role) => [role, SEASON_GROUPS.map((group) => (hasSeasonColour(group, role) ? token(`season-${group}-${role}`) : null))]),
  ) as Palette["seasons"];
  const ground = Object.fromEntries(GROUND_SEASONS.map((name) => [name, token(`season-${name}`)])) as Palette["ground"];
  const sky = Object.fromEntries(SKY.map((name) => [name, themeColor(`--color-hearthwood-sky-${name}`)])) as Palette["sky"];
  return { moments, regions, things, seasons, ground, sky };
}
