import { dateOfDayNumber, dayNumberOf, firstAdvent, placeInYear, seasonDayOf, yearDay, type CalendarDate } from "./calendar";
import { dayMeanAt, normalsAt, snowShareAt, wetnessAt, winterOf } from "./climate";
import { clamp01, smoothstep } from "./noise";

/*
 * The season's dials, each a continuous function of the date (and, for the snow and the sea ice, of the real days of
 * weather before it, from `climate.ts`), the same for every player.
 *
 * A dial is a share of things: the share of trees turned, of the sea frozen, of homes with their lights up. Each thing
 * then changes on its own threshold (`oneByOne`), a number from 0 to 1 rolled from its place, so a wood turns tree by
 * tree and a village lights up house by house, never all at once. The roll is the art's, from `art/hash.ts`, so the
 * GPU and the CPU roll the same.
 */

/** One thing's state, 0 to 1, as the share of its kind reaches its own threshold: it changes over a sliver of the share around it. */
export function oneByOne(share: number, threshold: number, softness = 0.04) {
  return clamp01((share * (1 + softness) - threshold) / softness);
}

/** A ramp from 0 to 1 between two days of the year, eased. */
const between = (days: number, from: number, to: number) => smoothstep(from, to, days);

/** The leaves, from Åland's estimated timeline (Reference, Leaves): turning from mid-September, down by early November. */
const LEAVES = {
  /** Every broadleaf tree bare before the first leafs out, so a new leaf is never the autumn's colour. */
  colourGoes: [yearDay(4, 20), yearDay(5, 2)],
  leafOut: [yearDay(5, 3), yearDay(5, 28)],
  turn: [yearDay(9, 14), yearDay(10, 18)],
  fall: [yearDay(9, 28), yearDay(11, 6)],
  /** Fallen leaves on the verges, rotting and blown away through November. */
  litterGoes: [yearDay(11, 8), yearDay(12, 10)],
} as const;

export interface Leaves {
  /** The share of broadleaf trees in leaf, 0 to 1: a tree is in leaf while `oneByOne(leafed, its threshold)`. */
  leafed: number;
  /** The share whose leaves have turned. A tree's threshold is the same for both, so it turns before it falls. */
  turned: number;
  /** How thick the fallen leaves lie on the ground and the verges, 0 to 1, under any snow. */
  fallen: number;
}

export function leavesAt(seasonDay: number, snowCover = 0): Leaves {
  const { days } = placeInYear(seasonDay);
  const autumn = days >= yearDay(7, 1);
  const leafed = autumn ? 1 - between(days, LEAVES.fall[0], LEAVES.fall[1]) : between(days, LEAVES.leafOut[0], LEAVES.leafOut[1]);
  const turned = autumn ? between(days, LEAVES.turn[0], LEAVES.turn[1]) : 1 - between(days, LEAVES.colourGoes[0], LEAVES.colourGoes[1]);
  const fallen = autumn ? (1 - leafed) * (1 - between(days, LEAVES.litterGoes[0], LEAVES.litterGoes[1])) * (1 - snowCover) : 0;
  return { leafed, turned, fallen };
}

/** Fresh snow per wet day, cm: more than Åland gets, so the winter is white more often. */
const SNOW_PER_WET_DAY_CM = 2;
/** Snow lost per degree of a day's mean above freezing, cm: slower than real, so it lies longer. */
const MELT_PER_DEGREE_CM = 1.5;
/** Lying snow settles, a share of its depth a day. */
const SETTLING = 0.02;
/** The spring sun's own melt, cm a day, by month from January: none in the dark months. */
const SUN_MELT_CM = [0, 0, 0.3, 1.2, 3, 3, 3, 3, 3, 1, 0, 0] as const;
/** The depth at which the snow covers the ground whole. */
const FULL_COVER_CM = 6;

/** The sea's stored warmth an autumn pays off before it freezes, in degree-days of frost: a sheltered bay's, and the open Sea of Åland's. */
const SEA_WARMTH = { bay: 80, open: 600 } as const;
/** Ice grows as the square root of its frost: centimetres per root degree-day (Stefan's law, about real). */
const ICE_GROWTH = 3;
/** Ice a car can drive on, for play: real's rule of thumb is 20–25 cm for a car. */
const DRIVABLE_CM = 20;
/** The spring sun rots the ice ahead of the thaw, degree-days a day, by month from January. */
const SUN_ROT = [0, 0, 1, 4, 10, 10, 10, 10, 10, 2, 0, 0] as const;

/** A real day's snow and frost, worked from the start of its winter. Every player works the same days. */
interface WinterDay {
  snowCm: number;
  /** Frost banked against the sea's warmth, degree-days. */
  frost: number;
}

const winters = new Map<number, WinterDay[]>();

/** Each real day's snow depth and frost from 1 September of a winter to the next 1 September, at the day's start. */
function winterDays(winter: number): WinterDay[] {
  const kept = winters.get(winter);
  if (kept) return kept;
  const start = dayNumberOf({ year: winter, month: 9, day: 1 });
  const end = dayNumberOf({ year: winter + 1, month: 9, day: 1 });
  const days: WinterDay[] = [{ snowCm: 0, frost: 0 }];
  let { snowCm, frost } = days[0];
  for (let day = start; day < end; day++) {
    const noon = day + 0.5;
    const meanC = dayMeanAt(noon);
    const month = dateOfDayNumber(day).month - 1;
    const snowfall = SNOW_PER_WET_DAY_CM * Math.min(0.9, normalsAt(noon).wetDay * wetnessAt(noon)) * snowShareAt(meanC);
    snowCm = Math.max(0, snowCm * (1 - SETTLING) + snowfall - MELT_PER_DEGREE_CM * Math.max(0, meanC) - SUN_MELT_CM[month]);
    frost = Math.max(0, frost - meanC - SUN_ROT[month]);
    days.push({ snowCm, frost });
  }
  winters.set(winter, days);
  return days;
}

/** The winter's state at a season day, eased from one real day's start to the next so nothing jumps at midnight. */
function winterAt(seasonDay: number): WinterDay {
  const winter = winterOf(seasonDay);
  const days = winterDays(winter);
  const since = seasonDay - dayNumberOf({ year: winter, month: 9, day: 1 });
  if (since < 0) return days[0];
  const whole = Math.min(days.length - 2, Math.floor(since));
  const t = Math.min(1, since - whole);
  const [a, b] = [days[whole], days[whole + 1]];
  return { snowCm: a.snowCm + (b.snowCm - a.snowCm) * t, frost: a.frost + (b.frost - a.frost) * t };
}

export interface Snow {
  depthCm: number;
  /** How much of the open ground is white, 0 to 1: a patch is snow while `oneByOne(cover, its threshold)`. */
  cover: number;
}

export function snowAt(seasonDay: number): Snow {
  const { snowCm } = winterAt(seasonDay);
  return { depthCm: snowCm, cover: smoothstep(0, FULL_COVER_CM, snowCm) };
}

/** Ice thickness, cm, at a place's exposure: 0 the most sheltered bay, 1 the open Sea of Åland. */
export function iceAt(seasonDay: number, exposure: number) {
  const warmth = SEA_WARMTH.bay + (SEA_WARMTH.open - SEA_WARMTH.bay) * exposure;
  return ICE_GROWTH * Math.sqrt(Math.max(0, winterAt(seasonDay).frost - warmth));
}

export interface SeaIce {
  /** How far out the ice reaches, as an exposure from 0 to 1: water more sheltered than this is frozen. */
  reach: number;
  /** How far out the ice will bear a car, the same way: the frozen sea is a road out to here. */
  drivable: number;
  /** The ice in the most sheltered bays, cm. */
  bayCm: number;
}

export function seaIceAt(seasonDay: number): SeaIce {
  const { frost } = winterAt(seasonDay);
  const exposureAt = (needed: number) => clamp01((frost - needed - SEA_WARMTH.bay) / (SEA_WARMTH.open - SEA_WARMTH.bay));
  return { reach: exposureAt(0), drivable: exposureAt((DRIVABLE_CM / ICE_GROWTH) * (DRIVABLE_CM / ICE_GROWTH)), bayCm: iceAt(seasonDay, 0) };
}

export interface WinterLights {
  /** Mariehamn's lit streets and Torget's tree: from "Jul i city", a week before the first Advent, to Tjugondag Knut. */
  town: number;
  /** The share of homes with Christmas lights outside, on houses and garden trees. */
  homes: number;
  /** The share of windows with an Advent candlestick or a star. */
  windows: number;
  /** Advent candles lit in a four-candle holder: one more each Advent Sunday, all four through Christmas. */
  adventCandles: number;
}

/** A share of things up over a span of days and down over another, eased, between two day numbers. */
const upThenDown = (day: number, up: readonly [number, number], down: readonly [number, number]) => smoothstep(up[0], up[1], day) * (1 - smoothstep(down[0], down[1], day));

export function winterLightsAt(seasonDay: number): WinterLights {
  const winter = winterOf(seasonDay);
  const advent = firstAdvent(winter);
  const knut = dayNumberOf({ year: winter + 1, month: 1, day: 13 });
  const candlemas = dayNumberOf({ year: winter + 1, month: 2, day: 2 });
  const sundaysIn = Math.floor((seasonDay - advent) / 7) + 1;
  return {
    town: upThenDown(seasonDay, [advent - 8, advent - 7], [knut + 1, knut + 4]),
    homes: upThenDown(seasonDay, [advent - 10, advent + 12], [knut - 6, candlemas]),
    windows: upThenDown(seasonDay, [advent - 2, advent + 2], [knut, candlemas]),
    adventCandles: seasonDay < advent || seasonDay >= knut + 1 ? 0 : Math.min(4, sundaysIn),
  };
}

/** The chance a game night has an aurora, by the season: none in the light nights. The weather draws them. */
export const auroraNightChanceAt = (seasonDay: number) => normalsAt(seasonDay).auroraNight;

/** When a kind of placed thing is about: from and to a month and day of one year, coming and going over some days each end. */
export interface SeasonWindow {
  from: readonly [month: number, day: number];
  to: readonly [month: number, day: number];
  overDays: number;
}

export const IN_SEASON = {
  /** Café terraces' tables, chairs and parasols. */
  terraces: { from: [5, 15], to: [9, 15], overDays: 14 },
  /** Cows and sheep at grass. */
  grazing: { from: [5, 15], to: [10, 1], overDays: 14 },
  /** Boats at their berths and buoys, rather than laid up ashore. */
  boatsAfloat: { from: [5, 1], to: [10, 15], overDays: 21 },
  /** Bales out in the fields after the hay is in. */
  bales: { from: [6, 20], to: [11, 15], overDays: 21 },
} as const satisfies Record<string, SeasonWindow>;

/** The share of a kind of placed thing about at a season day: each one is out while `oneByOne(share, its threshold)`. */
export function inSeasonShare(seasonDay: number, { from, to, overDays }: SeasonWindow) {
  const { days } = placeInYear(seasonDay);
  const [start, end] = [yearDay(...from), yearDay(...to)];
  const half = overDays / 2;
  return smoothstep(start - half, start + half, days) * (1 - smoothstep(end - half, end + half, days));
}

export interface Season {
  leaves: Leaves;
  snow: Snow;
  seaIce: SeaIce;
  lights: WinterLights;
  auroraNightChance: number;
  inSeason: Record<keyof typeof IN_SEASON, number>;
}

/** Every dial of the season at a date, a share of the way through it. */
export function seasonAt(date: CalendarDate, through: number): Season {
  const seasonDay = seasonDayOf(date, through);
  const snow = snowAt(seasonDay);
  return {
    leaves: leavesAt(seasonDay, snow.cover),
    snow,
    seaIce: seaIceAt(seasonDay),
    lights: winterLightsAt(seasonDay),
    auroraNightChance: auroraNightChanceAt(seasonDay),
    inSeason: {
      terraces: inSeasonShare(seasonDay, IN_SEASON.terraces),
      grazing: inSeasonShare(seasonDay, IN_SEASON.grazing),
      boatsAfloat: inSeasonShare(seasonDay, IN_SEASON.boatsAfloat),
      bales: inSeasonShare(seasonDay, IN_SEASON.bales),
    },
  };
}
