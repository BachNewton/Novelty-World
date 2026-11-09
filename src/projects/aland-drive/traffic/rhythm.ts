import type { VehicleKind } from "./lane-driver";

/*
 * How busy the island is at an hour of a day of the year: the share of a road's day of cars that are out in an hour,
 * and how many cyclists and walkers are out against an ordinary daytime hour, read from the game's own clock and
 * calendar (`time/`). A road's cars follow a Nordic road's day, low through the night, a morning peak as people drive
 * to work, a flat middle and a longer evening peak; its year follows Åland's, quietest in midwinter and busiest in July,
 * when the ferries bring the summer visitors. Cyclists keep the same commuting hours with more of an afternoon, and
 * mostly put their bikes away for the winter; walkers are out through the day, and fewer in winter, but not as few.
 * Real counts are a year's average day (`Lane.daily`), so the year's factors average one.
 */

/** The hour and the day of the year, 0 to 365 as `climate/calendar.ts`'s `yearDay` counts it, that traffic follows: the sound's `SeasonHeard` is one. */
export interface TrafficClock {
  hour: number;
  yearDay: number;
}

/** A road's cars in each hour from midnight, as shares of its day: a weekday's, softened by the weekend's later, flatter one. */
const CAR_HOURS = [0.006, 0.004, 0.003, 0.003, 0.005, 0.012, 0.03, 0.066, 0.068, 0.054, 0.054, 0.057, 0.064, 0.063, 0.067, 0.078, 0.084, 0.074, 0.06, 0.048, 0.038, 0.03, 0.02, 0.012];

/** Cyclists and walkers out in each hour from midnight, against an ordinary daytime hour. */
const PATH_HOURS: Record<Exclude<VehicleKind, "car">, readonly number[]> = {
  bike: [0.05, 0.03, 0.02, 0.02, 0.04, 0.1, 0.35, 1.2, 1.35, 0.8, 0.85, 0.95, 1.05, 1.05, 1.1, 1.35, 1.5, 1.4, 1.2, 1, 0.7, 0.45, 0.25, 0.1],
  walker: [0.06, 0.03, 0.02, 0.02, 0.03, 0.08, 0.25, 0.6, 0.8, 0.95, 1.1, 1.2, 1.3, 1.25, 1.2, 1.2, 1.25, 1.3, 1.25, 1.1, 0.85, 0.55, 0.3, 0.12],
};

/** Each month against the year's average, January first. */
const MONTHS: Record<VehicleKind, readonly number[]> = {
  car: [0.8, 0.82, 0.87, 0.94, 1.03, 1.22, 1.4, 1.22, 1.0, 0.93, 0.87, 0.9],
  bike: [0.15, 0.15, 0.35, 0.8, 1.4, 1.9, 2.2, 2.05, 1.5, 0.9, 0.4, 0.2],
  walker: [0.7, 0.7, 0.8, 0.92, 1.12, 1.3, 1.45, 1.35, 1.12, 0.92, 0.8, 0.82],
};

const DAYS_IN_YEAR = 365;

/** A value through a cycle of `values`, each holding at the middle of its own stretch, eased linearly between them. */
function through(values: readonly number[], share: number): number {
  const at = (((share * values.length - 0.5) % values.length) + values.length) % values.length;
  const from = Math.floor(at);
  const blend = at - from;
  return values[from] * (1 - blend) + values[(from + 1) % values.length] * blend;
}

/** A road's day of cars as a share of an hour's cars, at this moment. */
export const carHourShare = ({ hour, yearDay }: TrafficClock) => through(CAR_HOURS, hour / 24) * through(MONTHS.car, yearDay / DAYS_IN_YEAR);

/** Cyclists or walkers out at this moment, against an ordinary daytime hour of an average month. */
export const pathShare = (kind: Exclude<VehicleKind, "car">, { hour, yearDay }: TrafficClock) => through(PATH_HOURS[kind], hour / 24) * through(MONTHS[kind], yearDay / DAYS_IN_YEAR);

