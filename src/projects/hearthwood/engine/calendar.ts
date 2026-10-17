/*
 * The game's own calendar, faster than real time: a day in minutes of play,
 * a season in a handful of days, and the year round in an evening or two.
 * Each game day stands for a span of the real year, so the sun, the moon and
 * anything keyed on a real date ("chanterelles from late August") read the
 * real day of the year it stands for. The seasons are the Nordic ones, by
 * the month: spring from March, summer from June, autumn from September,
 * winter from December. The Wheel of the Year's eight festivals fall on the
 * game days that hold their real dates.
 */

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export interface CalendarTuning {
  /** How long a whole day lasts, in minutes of play. */
  minutesPerDay: number;
  daysPerSeason: number;
  /** The moon's cycle from new to new, in game days: not a divisor of the year, so its phases drift across the seasons. */
  daysPerLunarCycle: number;
  /** Degrees north of the equator. */
  latitude: number;
  /** Where a new game begins: the day of a season (from 1), and the hour. */
  start: { season: Season; day: number; hour: number };
  /** How far through its cycle the moon is when a new game begins: 0 new, 0.5 full. */
  startMoonAge: number;
}

export const CALENDAR: CalendarTuning = {
  minutesPerDay: 12,
  daysPerSeason: 7,
  daysPerLunarCycle: 8.4,
  // Helsinki.
  latitude: 60.17,
  // A late-May morning, with midsummer two days off.
  start: { season: "spring", day: 7, hour: 9 },
  // A waxing gibbous, up in the first evening.
  startMoonAge: 0.35,
};

const REAL_YEAR = 365;
/** The real day of the year (0 is 1 January) the game's year begins on: 1 March, the first of spring. */
const YEAR_BEGINS = 59;
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** The real day of the year, 0 for 1 January, of a date in a year that is not a leap year. */
export function realDayOf(month: number, day: number): number {
  return MONTH_STARTS[month - 1] + day - 1;
}

export interface CalendarDate {
  /** Game days since the calendar began (spring 1 of year 1, at midnight), with the hour as a fraction. */
  days: number;
  /** Whole game days since the calendar began. */
  day: number;
  /** From 1. */
  year: number;
  /** The game day within its year, from 0. */
  dayOfYear: number;
  season: Season;
  /** The day within its season, from 1. */
  dayOfSeason: number;
  /** How far through its season, 0 to 1, the hour counted. */
  seasonProgress: number;
  /** How far through its year, 0 to 1, from the first of spring. */
  yearProgress: number;
  /** 0 to 24. */
  hour: number;
  /** The real day of the year it stands for, 0 (1 January) up to 365, with a fraction. */
  realDayOfYear: number;
  /** How far through its cycle the moon is: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  moonAge: number;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function secondsPerDay(tuning: CalendarTuning = CALENDAR): number {
  return tuning.minutesPerDay * 60;
}

export function daysPerYear(tuning: CalendarTuning = CALENDAR): number {
  return tuning.daysPerSeason * SEASONS.length;
}

/** The whole game day a day of a season falls on, in the calendar's first year. */
export function dayOfSeasonToDay(season: Season, day: number, tuning: CalendarTuning = CALENDAR): number {
  if (!Number.isInteger(day) || day < 1 || day > tuning.daysPerSeason) throw new Error(`A season has days 1 to ${String(tuning.daysPerSeason)}, not ${String(day)}`);
  return SEASONS.indexOf(season) * tuning.daysPerSeason + day - 1;
}

/** Seconds since the calendar began at an hour of a whole game day. */
export function timeOf(day: number, hour: number, tuning: CalendarTuning = CALENDAR): number {
  return (day + hour / 24) * secondsPerDay(tuning);
}

/** When a new game begins, in seconds since the calendar began. */
export function startTime(tuning: CalendarTuning = CALENDAR): number {
  return timeOf(dayOfSeasonToDay(tuning.start.season, tuning.start.day, tuning), tuning.start.hour, tuning);
}

/** The date and hour `seconds` since the calendar began. */
export function dateAt(seconds: number, tuning: CalendarTuning = CALENDAR): CalendarDate {
  const days = seconds / secondsPerDay(tuning);
  const day = Math.floor(days);
  const hour = (days - day) * 24;
  const yearLength = daysPerYear(tuning);
  const dayOfYear = wrap(day, yearLength);
  const seasonIndex = Math.floor(dayOfYear / tuning.daysPerSeason);
  const yearProgress = wrap(days, yearLength) / yearLength;
  const startDays = startTime(tuning) / secondsPerDay(tuning);
  return {
    days,
    day,
    year: Math.floor(day / yearLength) + 1,
    dayOfYear,
    season: SEASONS[seasonIndex],
    dayOfSeason: dayOfYear - seasonIndex * tuning.daysPerSeason + 1,
    seasonProgress: (wrap(days, yearLength) - seasonIndex * tuning.daysPerSeason) / tuning.daysPerSeason,
    yearProgress,
    hour,
    realDayOfYear: wrap(YEAR_BEGINS + yearProgress * REAL_YEAR, REAL_YEAR),
    moonAge: wrap(tuning.startMoonAge + (days - startDays) / tuning.daysPerLunarCycle, 1),
  };
}

/** The game day of the year (from 0) whose span of the real year holds a real day of the year. */
export function gameDayOfReal(realDayOfYear: number, tuning: CalendarTuning = CALENDAR): number {
  const yearLength = daysPerYear(tuning);
  return Math.floor((wrap(realDayOfYear - YEAR_BEGINS, REAL_YEAR) / REAL_YEAR) * yearLength);
}

export type FestivalKind = "solstice" | "equinox" | "cross-quarter";

export interface Festival {
  id: string;
  name: string;
  kind: FestivalKind;
  /** The real day of the year it falls on, 0 for 1 January. */
  realDayOfYear: number;
}

/** The Wheel of the Year, in the order the game's year meets them from the first of spring. */
export const FESTIVALS: readonly Festival[] = [
  { id: "ostara", name: "Ostara", kind: "equinox", realDayOfYear: realDayOf(3, 20) },
  { id: "beltane", name: "Beltane", kind: "cross-quarter", realDayOfYear: realDayOf(5, 1) },
  { id: "litha", name: "Litha", kind: "solstice", realDayOfYear: realDayOf(6, 21) },
  { id: "lughnasadh", name: "Lughnasadh", kind: "cross-quarter", realDayOfYear: realDayOf(8, 1) },
  { id: "mabon", name: "Mabon", kind: "equinox", realDayOfYear: realDayOf(9, 22) },
  { id: "samhain", name: "Samhain", kind: "cross-quarter", realDayOfYear: realDayOf(10, 31) },
  { id: "yule", name: "Yule", kind: "solstice", realDayOfYear: realDayOf(12, 21) },
  { id: "imbolc", name: "Imbolc", kind: "cross-quarter", realDayOfYear: realDayOf(2, 1) },
];

/** The game day of the year (from 0) a festival falls on. */
export function festivalDay(festival: Festival, tuning: CalendarTuning = CALENDAR): number {
  return gameDayOfReal(festival.realDayOfYear, tuning);
}

/** The festival on a whole game day, or null; with very short seasons two can share a day, and the first in the year's order is the one. */
export function festivalOn(day: number, tuning: CalendarTuning = CALENDAR): Festival | null {
  const dayOfYear = wrap(day, daysPerYear(tuning));
  return FESTIVALS.find((festival) => festivalDay(festival, tuning) === dayOfYear) ?? null;
}

export interface ComingFestival {
  festival: Festival;
  /** The whole game day it falls on. */
  day: number;
  /** Whole days from `day` until it, from 1. */
  inDays: number;
}

/** The next festival after a whole game day. */
export function nextFestival(day: number, tuning: CalendarTuning = CALENDAR): ComingFestival {
  const yearLength = daysPerYear(tuning);
  const dayOfYear = wrap(day, yearLength);
  let best: ComingFestival | null = null;
  for (const festival of FESTIVALS) {
    const inDays = wrap(festivalDay(festival, tuning) - dayOfYear - 1, yearLength) + 1;
    if (best === null || inDays < best.inDays) best = { festival, day: day + inDays, inDays };
  }
  if (best === null) throw new Error("The Wheel of the Year has no festivals");
  return best;
}

/**
 * A whole game day from text: a season and its day (`summer-2`), a
 * festival (`litha`), or a number of days since the calendar began (`37`).
 */
export function parseDate(text: string, tuning: CalendarTuning = CALENDAR): number {
  const lower = text.trim().toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  const festival = FESTIVALS.find((f) => f.id === lower);
  if (festival) return festivalDay(festival, tuning);
  const match = /^(spring|summer|autumn|winter)-(\d+)$/.exec(lower);
  if (match) return dayOfSeasonToDay(match[1] as Season, Number(match[2]), tuning);
  throw new Error(`A date is a season and its day (summer-2), a festival (${FESTIVALS.map((f) => f.id).join(", ")}) or a day number, not ${text}`);
}
