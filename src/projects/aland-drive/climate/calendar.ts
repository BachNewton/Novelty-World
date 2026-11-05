/*
 * Dates as the climate reads them. A date is Åland's calendar date, the shape the game's day (`time/day.ts`) hands
 * over; the climate counts in season days, a continuous count of real days since 1970-01-01 whose fraction is how far
 * through that date real time is, so nothing seasonal jumps at midnight.
 *
 * Only whole-number and IEEE-exact arithmetic here and in everything built on it (no Math.sin, exp or pow, which
 * engines may round each their own way): every player's machine must reach the same weather to the last bit.
 */

export interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 at the start of a date. */
export const dayNumberOf = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day) / DAY_MS;

/** A date and how far through it real time is (0 to 1), as one continuous count of days. */
export const seasonDayOf = (date: CalendarDate, through: number) => dayNumberOf(date) + through;

export function dateOfDayNumber(dayNumber: number): CalendarDate {
  const date = new Date(Math.floor(dayNumber) * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Where a season day falls in its year: days since the 1st of January, and that as a share of the year's length. */
export function placeInYear(seasonDay: number) {
  const { year } = dateOfDayNumber(seasonDay);
  const start = dayNumberOf({ year, month: 1, day: 1 });
  const length = dayNumberOf({ year: year + 1, month: 1, day: 1 }) - start;
  const days = seasonDay - start;
  return { year, days, share: days / length };
}

/** Days since the 1st of January of a month and day, as in a year that isn't a leap year: for dates the climate is tuned to. */
export const yearDay = (month: number, day: number) => dayNumberOf({ year: 2001, month, day }) - dayNumberOf({ year: 2001, month: 1, day: 1 });

/** 0 for a Sunday, 1 for a Monday, and so on. 1970-01-01 was a Thursday. */
export const weekdayOf = (dayNumber: number) => (((Math.floor(dayNumber) + 4) % 7) + 7) % 7;

/** The first Sunday of Advent in a year, as a day number: the fourth Sunday before Christmas, between 27 November and 3 December. */
export function firstAdvent(year: number) {
  const third = dayNumberOf({ year, month: 12, day: 3 });
  return third - weekdayOf(third);
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(text: string): CalendarDate {
  const match = DATE_PATTERN.exec(text);
  if (match === null) throw new Error(`a date is written like 2026-06-21, not ${text}`);
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = dateOfDayNumber(dayNumberOf(date));
  if (check.month !== date.month || check.day !== date.day) throw new Error(`${text} is not a date`);
  return date;
}

export const dateText = ({ year, month, day }: CalendarDate) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
