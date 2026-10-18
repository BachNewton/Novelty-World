import { ALTITUDE } from "./land";
import { realDayOf, SEASONS, type Season } from "./calendar";
import { REGION_CHARACTER, TREE_KINDS, type PlantKind, type Region, type TreeKind } from "./regions";

/*
 * What the seasons do to the land, as plain numbers on the real day of the
 * year (the calendar's `realDayOfYear`, which moves on smoothly through the
 * hours, so nothing ever jumps at midnight). Each kind of plant keeps a
 * phenology, the dates of a Nordic year at about Helsinki's latitude, a
 * little early in spring so the game's spring reads as one: when its leaves
 * come out, how fresh they are, when they turn and when they fall, and when
 * it blooms. Each tree keeps its own timing a few days either side of its
 * kind's, from a hash of where it stands. The ground keeps its own: where
 * the snow line lies, when the grass is dormant, fresh, or autumn gold, the
 * leaves fallen under the broadleaves, and how far the water freezes at its
 * edges. The art only reads these; it decides nothing.
 */

/** The plants as the seasons treat them: each broadleaf kind on its own, and the rest by how they live. */
export const SEASON_GROUPS = ["birch", "aspen", "oak", "maple", "conifer", "pine", "heather", "flowers", "fern", "bracken", "bush", "rock"] as const;
export type SeasonGroup = (typeof SEASON_GROUPS)[number];

/**
 * A plant group's state on a day, each 0 to 1:
 * - `leaf`: how much of its leaf is out (a broadleaf's crown, a fern's fronds, a flower's leaves).
 * - `fresh`: how young and light its green is.
 * - `turn`: how far it has turned: autumn colour for broadleaves, bracken and the undergrowth, winter's darker needles for conifers, heather's rust.
 * - `bloom`: how much it is in flower.
 */
export interface PlantSeason {
  leaf: number;
  fresh: number;
  turn: number;
  bloom: number;
}

export type Channel = keyof PlantSeason;
export const CHANNELS: readonly Channel[] = ["leaf", "fresh", "turn", "bloom"];

/** A value through the year: stops of (real day of the year, value), eased between and wrapping round from the last to the first. */
export type Curve = readonly (readonly [number, number])[];

const d = realDayOf;

/** All year at one value. */
const always = (value: number): Curve => [[0, value]];

/** A broadleaf's year: bare, leafing out from `budburst` to `full`, fresh until midsummer, turning from `turning` to `peak`, bare again by `bare`, keeping `winterLeaf` of it (an oak's dead brown leaves). */
function broadleafYear(budburst: number, full: number, turning: number, peak: number, falling: number, bare: number, winterLeaf = 0): Record<Channel, Curve> {
  return {
    leaf: [
      [budburst, winterLeaf],
      [full, 1],
      [falling, 1],
      [bare, winterLeaf],
    ],
    fresh: [
      [budburst, 1],
      [full + 8, 0.85],
      [d(6, 25), 0],
      [d(12, 31), 0],
    ],
    turn: [
      [d(1, 1), 1],
      [budburst - 6, 1],
      [budburst, 0],
      [turning, 0],
      [peak, 1],
    ],
    bloom: always(0),
  };
}

/** Each group's year. */
export const PHENOLOGY: Record<SeasonGroup, Record<Channel, Curve>> = {
  birch: broadleafYear(d(4, 22), d(5, 16), d(9, 8), d(9, 30), d(10, 6), d(10, 22)),
  aspen: broadleafYear(d(4, 28), d(5, 22), d(9, 10), d(10, 2), d(10, 9), d(10, 25)),
  oak: broadleafYear(d(5, 8), d(6, 1), d(9, 25), d(10, 18), d(10, 22), d(11, 12), 0.15),
  maple: broadleafYear(d(4, 26), d(5, 18), d(9, 14), d(10, 4), d(10, 12), d(10, 28)),
  conifer: {
    leaf: always(1),
    fresh: [
      [d(5, 10), 0],
      [d(6, 1), 0.45],
      [d(7, 10), 0],
    ],
    // Winter's darker, bluer needles.
    turn: [
      [d(3, 20), 1],
      [d(5, 1), 0],
      [d(10, 15), 0],
      [d(12, 1), 1],
    ],
    bloom: always(0),
  },
  pine: {
    leaf: always(1),
    fresh: [
      [d(5, 15), 0],
      [d(6, 5), 0.4],
      [d(7, 10), 0],
    ],
    turn: [
      [d(3, 20), 1],
      [d(5, 1), 0],
      [d(10, 15), 0],
      [d(12, 1), 1],
    ],
    bloom: always(0),
  },
  heather: {
    leaf: always(1),
    fresh: [
      [d(4, 20), 0],
      [d(5, 20), 0.6],
      [d(6, 30), 0],
    ],
    // Rust through the winter.
    turn: [
      [d(4, 1), 1],
      [d(5, 10), 0],
      [d(9, 10), 0],
      [d(10, 25), 1],
    ],
    bloom: [
      [d(7, 15), 0],
      [d(8, 8), 1],
      [d(9, 2), 1],
      [d(9, 26), 0],
    ],
  },
  flowers: {
    leaf: [
      [d(3, 28), 0],
      [d(4, 22), 1],
      [d(9, 25), 1],
      [d(10, 25), 0],
    ],
    fresh: [
      [d(4, 1), 1],
      [d(5, 20), 1],
      [d(6, 25), 0],
      [d(12, 31), 0],
    ],
    turn: [
      [d(1, 1), 1],
      [d(3, 25), 1],
      [d(4, 5), 0],
      [d(9, 1), 0],
      [d(10, 10), 1],
    ],
    bloom: [
      [d(4, 10), 0],
      [d(4, 30), 1],
      [d(8, 31), 1],
      [d(9, 22), 0],
    ],
  },
  fern: {
    leaf: [
      [d(4, 25), 0.15],
      [d(5, 28), 1],
      [d(10, 1), 1],
      [d(11, 15), 0.25],
      [d(12, 31), 0.15],
    ],
    fresh: [
      [d(5, 1), 1],
      [d(6, 10), 0.6],
      [d(7, 5), 0],
      [d(12, 31), 0],
    ],
    turn: [
      [d(1, 1), 1],
      [d(5, 1), 1],
      [d(5, 10), 0],
      [d(9, 12), 0],
      [d(10, 15), 1],
    ],
    bloom: always(0),
  },
  bracken: {
    leaf: [
      [d(5, 1), 0.15],
      [d(6, 5), 1],
      [d(10, 10), 1],
      [d(11, 20), 0.3],
      [d(12, 31), 0.2],
    ],
    fresh: [
      [d(5, 5), 1],
      [d(6, 15), 0.6],
      [d(7, 10), 0],
      [d(12, 31), 0],
    ],
    turn: [
      [d(1, 1), 1],
      [d(5, 5), 1],
      [d(5, 15), 0],
      [d(8, 28), 0],
      [d(9, 28), 1],
    ],
    bloom: always(0),
  },
  bush: {
    // Bare twigs keep most of a bush's mass.
    leaf: [
      [d(4, 20), 0.72],
      [d(5, 20), 1],
      [d(10, 10), 1],
      [d(11, 1), 0.72],
    ],
    fresh: [
      [d(4, 25), 1],
      [d(6, 1), 0.7],
      [d(6, 30), 0],
      [d(12, 31), 0],
    ],
    turn: [
      [d(1, 1), 1],
      [d(4, 22), 1],
      [d(5, 5), 0],
      [d(9, 5), 0],
      [d(10, 5), 1],
    ],
    bloom: always(0),
  },
  rock: { leaf: always(1), fresh: always(0), turn: always(0), bloom: always(0) },
};

/** How many days either side of its group's dates a single plant keeps its own: no two trees in a wood turn on the same day. */
export const TIMING_SPREAD: Record<SeasonGroup, number> = {
  birch: 6,
  aspen: 6,
  oak: 8,
  maple: 7,
  conifer: 3,
  pine: 3,
  heather: 6,
  flowers: 6,
  fern: 5,
  bracken: 5,
  bush: 7,
  rock: 0,
};

const YEAR = 365;

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A curve's value on a real day of the year, eased between its stops. */
export function curveAt(curve: Curve, day: number): number {
  if (curve.length === 1) return curve[0][1];
  const at = wrap(day, YEAR);
  for (let i = 0; i < curve.length; i++) {
    const [from, a] = curve[i];
    const [to, b] = curve[(i + 1) % curve.length];
    const span = wrap(to - from, YEAR);
    const into = wrap(at - from, YEAR);
    if (into <= span) return a + (b - a) * ease(span === 0 ? 1 : into / span);
  }
  throw new Error("A curve's stops must run in order through the year");
}

/** A plant group's state on a real day of the year. */
export function plantSeason(group: SeasonGroup, day: number): PlantSeason {
  const year = PHENOLOGY[group];
  return { leaf: curveAt(year.leaf, day), fresh: curveAt(year.fresh, day), turn: curveAt(year.turn, day), bloom: curveAt(year.bloom, day) };
}

/**
 * A hash of where a plant stands, 0 to 1: the shader works out the same one
 * from the plant's root, so each tree keeps its own timing and colour.
 */
export function standHash(x: number, z: number): number {
  const fract = (v: number) => v - Math.floor(v);
  let a = fract(x * 0.1031);
  let b = fract(z * 0.1031);
  let c = fract(x * 0.1031);
  const dot = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += dot;
  b += dot;
  c += dot;
  return fract((a + b) * c);
}

/** One plant's own variation from where it stands: how many days early (negative) or late it keeps its group's dates, and which of its kind's autumn colours it turns, 0 to 1. */
export function plantVariation(group: SeasonGroup, x: number, z: number): { offset: number; hue: number } {
  return { offset: (standHash(x, z) * 2 - 1) * TIMING_SPREAD[group], hue: standHash(z + 17, x + 17) };
}

/** A single plant's state on a day: its group's, on its own timing. */
export function plantSeasonAt(group: SeasonGroup, day: number, x: number, z: number): PlantSeason {
  return plantSeason(group, day - plantVariation(group, x, z).offset);
}

/** Which season group a kind of plant (and, for heather and ferns, which of its designs) is in. */
export function seasonGroupOf(kind: PlantKind, variant: number): SeasonGroup {
  switch (kind) {
    case "broadleaf":
      return "oak";
    case "fern":
      return variant === 2 ? "bracken" : "fern";
    default:
      return kind;
  }
}

/** The ground's season. */
export interface GroundSeason {
  /**
   * Where seasonal snow lies from, in metres against the bands (ALTITUDE's altitudes, which the land shifts by place, so a
   * spot's own line is this plus `LandSample.bands`): below the whole land in deep winter, wherever its bands sit, and
   * above the high snowfields in summer (which stay all year regardless).
   */
  snowLine: number;
  /** Last year's flattened, straw-coloured grass, after the snow and before the new green, and again in late autumn. */
  dormant: number;
  /** The new green of spring. */
  fresh: number;
  /** The meadows' autumn gold and russet. */
  gold: number;
  /** Fallen leaves under the broadleaves. */
  litter: number;
  /** How far the water freezes in from its edges, 0 to 1. */
  ice: number;
}

/**
 * How far the snow line moves through the year, against the bands: down the mountains in autumn, below everything all
 * winter, and up again in spring's melt. Winter's line lies deep enough that even the lowlands under the highest bands
 * (folded country in a warm climate) are under snow, with its soft edge and wander.
 */
export const SNOW_LINE: Curve = [
  [d(3, 1), -520],
  [d(3, 24), 90],
  [d(4, 12), ALTITUDE.treeline * 0.55],
  [d(4, 28), ALTITUDE.treeline + 40],
  [d(5, 25), ALTITUDE.rock + 80],
  [d(6, 25), ALTITUDE.snow + 120],
  [d(9, 20), ALTITUDE.snow + 120],
  [d(10, 8), ALTITUDE.rock + 330],
  [d(10, 28), ALTITUDE.rock - 30],
  [d(11, 12), ALTITUDE.treeline - 50],
  [d(11, 25), 120],
  [d(12, 5), -520],
];

const GROUND: Record<Exclude<keyof GroundSeason, "snowLine">, Curve> = {
  dormant: [
    [d(4, 12), 1],
    [d(5, 6), 0],
    [d(10, 20), 0],
    [d(11, 12), 1],
  ],
  fresh: [
    [d(4, 20), 0],
    [d(5, 10), 1],
    [d(6, 10), 1],
    [d(7, 5), 0],
    [d(12, 31), 0],
  ],
  gold: [
    [d(8, 18), 0],
    [d(9, 25), 1],
    [d(10, 22), 1],
    [d(11, 12), 0],
    [d(12, 31), 0],
  ],
  litter: [
    [d(9, 22), 0],
    [d(10, 18), 1],
    [d(11, 15), 0.75],
    [d(4, 15), 0.4],
    [d(5, 25), 0],
  ],
  ice: [
    [d(11, 5), 0],
    [d(12, 12), 1],
    [d(3, 10), 1],
    [d(4, 12), 0],
  ],
};

export function groundSeason(day: number): GroundSeason {
  return {
    snowLine: curveAt(SNOW_LINE, day),
    dormant: curveAt(GROUND.dormant, day),
    fresh: curveAt(GROUND.fresh, day),
    gold: curveAt(GROUND.gold, day),
    litter: curveAt(GROUND.litter, day),
    ice: curveAt(GROUND.ice, day),
  };
}

export type SeasonWeights = Record<Season, number>;

/** How much of each season a day is, summing to 1, handing over from one season to the next over a fortnight either side of the first of its month: for anything that leans its look by season (a colour grade). */
export function seasonWeights(day: number): SeasonWeights {
  const starts = [d(3, 1), d(6, 1), d(9, 1), d(12, 1)];
  const blend = 14;
  const weights: SeasonWeights = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (let s = 0; s < SEASONS.length; s++) {
    // Days past this season's first, from -half a year to +half a year.
    const past = wrap(day - starts[s] + YEAR / 2, YEAR) - YEAR / 2;
    if (Math.abs(past) < blend) {
      const t = ease(0.5 + past / (2 * blend));
      weights[SEASONS[s]] = t;
      weights[SEASONS[(s + 3) % 4]] = 1 - t;
      return weights;
    }
  }
  const at = wrap(day, YEAR);
  let index = SEASONS.length - 1;
  for (let s = 0; s < SEASONS.length; s++) if (at >= starts[s]) index = s;
  const season = SEASONS[index];
  weights[season] = 1;
  return weights;
}

const BROADLEAVES: readonly TreeKind[] = ["broadleaf", "birch", "aspen", "maple"];

/** How much of a region's woods are broadleaves (the rest are needles): what turns and falls, and what lets snow through. */
export function broadleafShare(region: Region): number {
  const trees = REGION_CHARACTER[region].trees;
  let broad = 0;
  let all = 0;
  for (const kind of TREE_KINDS) {
    const weight = trees[kind] ?? 0;
    all += weight;
    if (BROADLEAVES.includes(kind)) broad += weight;
  }
  return all === 0 ? 0 : broad / all;
}

/** A region's broadleaves, each kind's share of them, for the colour its woods turn. */
export function broadleafMix(region: Region): Partial<Record<SeasonGroup, number>> {
  const trees = REGION_CHARACTER[region].trees;
  const total = BROADLEAVES.reduce((sum, kind) => sum + (trees[kind] ?? 0), 0);
  if (total === 0) return {};
  return Object.fromEntries(BROADLEAVES.filter((kind) => (trees[kind] ?? 0) > 0).map((kind) => [seasonGroupOf(kind, 0), (trees[kind] ?? 0) / total]));
}
