import { dateOfDayNumber, placeInYear } from "./calendar";
import { wander } from "./noise";

/*
 * Åland's climate by time of year, from Mariehamn's normals (`docs/TIME-AND-WEATHER.md`, Reference), and the slow
 * half of the weather that runs on the real calendar: how hard this winter is, and each real day's warmth and
 * wetness. The fast weather (`weather.ts`) and the season's snow and ice (`season.ts`) both stand on it, so the snow
 * on the ground is laid by the same cold, wet days the sky shows.
 *
 * Every value here is softened for play as the Decided list says: the climate sets how often, not how hard.
 */

type Months = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

/** Mean daily temperature, °C. */
const MEAN_C: Months = [-1.3, -2.3, -0.2, 3.8, 8.9, 13.3, 16.8, 16.1, 11.8, 6.8, 3.2, 0.4];
/** Mean daily max less mean daily min, °C. */
const RANGE_C: Months = [5.3, 5.9, 6.8, 8.1, 9.4, 8.9, 8.6, 8.4, 7.7, 6.1, 4.6, 5.0];
/** Days with 1 mm or more of rain or snow, as a share of the month's days. */
const WET_DAY: Months = [7.2 / 31, 5.0 / 28, 5.2 / 31, 5.8 / 30, 5.7 / 31, 6.3 / 30, 6.6 / 31, 7.9 / 31, 7.6 / 30, 8.6 / 31, 9.0 / 30, 8.8 / 31];
/** The share of the time the sky is mostly cloudy or overcast (cover 60% or more). */
const CLOUDIER: Months = [0.69, 0.69, 0.63, 0.59, 0.49, 0.44, 0.42, 0.47, 0.5, 0.59, 0.67, 0.67];
/** Mean wind, m/s. */
const WIND_MS: Months = [29, 27, 25, 23, 20, 20, 20, 23, 24, 28, 27, 29].map((kmh) => kmh / 3.6) as unknown as Months;
/** Game days with a morning's light fog, as a share: a few a month in spring and autumn, for play rather than the real 15–30 a year. */
const FOG_DAY: Months = [1.5 / 31, 1.5 / 28, 2 / 31, 3 / 30, 4 / 31, 3 / 30, 1 / 31, 1.5 / 31, 2.5 / 30, 3 / 31, 2.5 / 30, 2 / 31];
/** How much of the winter is in this month, 0 to 1: what this winter's hardness and the game's extra cold are scaled by. */
const WINTER: Months = [1, 1, 0.8, 0.25, 0, 0, 0, 0, 0, 0.1, 0.4, 0.8];
/** Night chance of an aurora that the latitude allows, for play about three times real: none in the light nights. */
const AURORA_NIGHT: Months = [0.06, 0.08, 0.12, 0.06, 0, 0, 0, 0.03, 0.12, 0.12, 0.08, 0.06];

/** A month's value at a share of the year, through each month's middle, eased round the year with no corner. */
function through(months: Months, share: number) {
  const x = share * 12 - 0.5;
  const whole = Math.floor(x);
  const t = x - whole;
  const at = (index: number) => months[((index % 12) + 12) % 12];
  const [p0, p1, p2, p3] = [at(whole - 1), at(whole), at(whole + 1), at(whole + 2)];
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

/** The climate's normals at a season day. */
export function normalsAt(seasonDay: number) {
  const { share } = placeInYear(seasonDay);
  return {
    meanC: through(MEAN_C, share),
    rangeC: through(RANGE_C, share),
    wetDay: through(WET_DAY, share),
    cloudier: through(CLOUDIER, share),
    windMS: through(WIND_MS, share),
    fogDay: Math.max(0, through(FOG_DAY, share)),
    winter: Math.min(1, Math.max(0, through(WINTER, share))),
    auroraNight: Math.max(0, through(AURORA_NIGHT, share)),
  };
}

/** The months' targets, for the tests that hold the weather to them. */
export const MONTHLY = { MEAN_C, WET_DAY, CLOUDIER, FOG_DAY } as const;

const SALT = { winter: 101, warmth: 102, wetness: 103 } as const;

/** Colder than real at the depth of winter, so snow comes more often and lies longer: °C. */
const EXTRA_COLD_C = 2;
/** How far a hard or a mild winter moves the depth of winter from the usual, °C. */
const HARDNESS_C = 3.5;
/** How far a real day's warmth wanders from the usual, °C: more in winter. */
const WANDER_C = { summer: 1.5, winter: 3 } as const;

/** The winter a season day belongs to, named by the year its autumn is in: from July to June. */
export const winterOf = (seasonDay: number) => {
  const { year, month } = dateOfDayNumber(seasonDay);
  return month >= 7 ? year : year - 1;
};

/**
 * How hard a winter is, from −1 (mild) to 1 (hard), the same for every player. Hard comes about one winter in three
 * and mild one in six, rather than real's one in six and one in four, and the mildest is still a winter with snow in
 * it (the Decided list's "every winter has some white weeks").
 */
export function hardnessOf(winter: number) {
  const roll = wander(winter, SALT.winter) * 0.5 + 0.5;
  return Math.max(-0.6, Math.min(1, (roll - 0.45) * 2.6));
}

/** The day's mean temperature, °C, on the real calendar: the normal, this winter's hardness and the day's own wander. */
export function dayMeanAt(seasonDay: number) {
  const normals = normalsAt(seasonDay);
  const winterShift = -normals.winter * (EXTRA_COLD_C + HARDNESS_C * hardnessOf(winterOf(seasonDay)));
  const wanderC = WANDER_C.summer + (WANDER_C.winter - WANDER_C.summer) * normals.winter;
  return normals.meanC + winterShift + wanderC * wander(seasonDay / 4, SALT.warmth);
}

/** How wet the real day is against the usual, 0.4 to 1.6 and 1 on average: a wet day's game days rain more often. */
export const wetnessAt = (seasonDay: number) => 1 + 0.6 * wander(seasonDay / 3, SALT.wetness);

/** The share of a game day's precipitation that falls as snow at a temperature: all of it at −0.5 °C, none at +2 °C (real snow stops nearer +1). */
export const snowShareAt = (temperatureC: number) => Math.min(1, Math.max(0, (2 - temperatureC) / 2.5));
