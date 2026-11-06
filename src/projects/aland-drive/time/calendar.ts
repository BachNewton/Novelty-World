import type { CalendarDate } from "./day";

/*
 * The game's own calendar: Åland's year in 48 game days, four to a month, so a year passes in 24 hours of play. The
 * world's time is one number, game days since the first of 2000's, and the rest is read from it: the year, the month,
 * which of its four days, and the hour. Each game day stands for about a week of its month, and the real date it
 * shows runs on through it, a month's days spread evenly over its four, so the sun's path and the season move a
 * little each hour and nothing jumps from one game day to the next.
 */

export const DAYS_A_MONTH = 4;
export const GAME_DAYS_A_YEAR = 12 * DAYS_A_MONTH;
const FIRST_YEAR = 2000;

/** A moment of the game's calendar. */
export interface GameCalendar {
  year: number;
  /** 1 to 12. */
  month: number;
  /** Which of the month's four game days, 1 to 4. */
  day: number;
  /** 0 to 24. */
  hour: number;
}

export function calendarAt(gameDays: number): GameCalendar {
  const whole = Math.floor(gameDays);
  const years = Math.floor(whole / GAME_DAYS_A_YEAR);
  const inYear = whole - years * GAME_DAYS_A_YEAR;
  return { year: FIRST_YEAR + years, month: Math.floor(inYear / DAYS_A_MONTH) + 1, day: (inYear % DAYS_A_MONTH) + 1, hour: (gameDays - whole) * 24 };
}

export const gameDaysOf = ({ year, month, day, hour }: GameCalendar) => (year - FIRST_YEAR) * GAME_DAYS_A_YEAR + (month - 1) * DAYS_A_MONTH + (day - 1) + hour / 24;

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The real date a moment of the calendar shows, and how far it is through to the next. */
export function dateAt(gameDays: number): { date: CalendarDate; through: number } {
  const { year, month } = calendarAt(gameDays);
  const intoMonth = ((gameDays - gameDaysOf({ year, month, day: 1, hour: 0 })) / DAYS_A_MONTH) * daysIn(year, month);
  const whole = Math.floor(intoMonth);
  return { date: { year, month, day: whole + 1 }, through: intoMonth - whole };
}

/** Which of its month's game days a real date falls on, 1 to 4. */
export const gameDayOfDate = ({ year, month, day }: CalendarDate) => Math.floor(((day - 0.5) / daysIn(year, month)) * DAYS_A_MONTH) + 1;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
