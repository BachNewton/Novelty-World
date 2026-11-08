import { calendarAt, dateAt, gameDayOfDate, gameDaysOf, type GameCalendar } from "./calendar";
import { moonPlace, sunPlace, type MoonPlace, type SkyPlace } from "./sky-places";

/*
 * The game's time: a moment of its own calendar (`time/calendar.ts`), which runs on from wherever the world's time
 * was last saved or shared at a game day every `GAME_DAY_S` real seconds, read off the world's clock (`sea/clock.ts`).
 * The sky is the real one at the date and hour shown: the sun and moon stand where they would over Åland at that local
 * clock time, blended from one date to the next as the date runs on through a game day.
 *
 * What hangs off it (the weather, the seasons) reads `GameTime`: the date is the season's, the hour the day's.
 */

/** How long a game day lasts, in real seconds: a starting value, tuned by the owner in the game. */
export const GAME_DAY_S = 1500;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

export interface GameTime {
  /** The world's time, game days since the first of 2000's (`time/calendar.ts`). */
  gameDays: number;
  calendar: GameCalendar;
  /** The real date shown, and how far it is through to the next as it runs on through a game day: a held date stays at its noon. */
  date: CalendarDate;
  through: number;
  /** Åland's local clock time, 0 to 24. */
  hour: number;
  sun: SkyPlace;
  moon: MoonPlace;
}

/** The last Sunday of a month, as a UTC day's start. */
function lastSunday(year: number, month: number) {
  const last = Date.UTC(year, month, 0);
  return last - new Date(last).getUTCDay() * DAY_MS;
}

/** Åland keeps Eastern European Time: UTC+2, and UTC+3 in summer, from 01:00 UTC on March's last Sunday to October's. */
export function alandOffsetHours(utcMs: number) {
  const year = new Date(utcMs).getUTCFullYear();
  const summerFrom = lastSunday(year, 3) + HOUR_MS;
  const summerTo = lastSunday(year, 10) + HOUR_MS;
  return utcMs >= summerFrom && utcMs < summerTo ? 3 : 2;
}

/** Åland's date at a real instant. */
export function alandDate(utcMs: number): CalendarDate {
  const local = new Date(utcMs + alandOffsetHours(utcMs) * HOUR_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() };
}

/** The real instant at which Åland's clocks show this hour of this date. */
export function alandInstant(date: CalendarDate, hour: number) {
  const asIfUtc = Date.UTC(date.year, date.month - 1, date.day) + hour * HOUR_MS;
  return asIfUtc - alandOffsetHours(asIfUtc - 2 * HOUR_MS) * HOUR_MS;
}

/** The calendar at a real instant: Åland's date and clock time then. */
export function gameDaysAtInstant(utcMs: number) {
  const date = alandDate(utcMs);
  const hour = (((utcMs / HOUR_MS + alandOffsetHours(utcMs)) % 24) + 24) % 24;
  return gameDaysOf({ year: date.year, month: date.month, day: gameDayOfDate(date), hour });
}

const turned = (from: number, to: number, share: number) => from + ((((to - from + 540) % 360) - 180) * share);

function between<T extends SkyPlace>(from: T, to: T, share: number): SkyPlace {
  return { azimuthDeg: turned(from.azimuthDeg, to.azimuthDeg, share), elevationDeg: from.elevationDeg + (to.elevationDeg - from.elevationDeg) * share };
}

const dayNumberOf = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day) / DAY_MS;

function dateOfDayNumber(dayNumber: number): CalendarDate {
  const at = new Date(dayNumber * DAY_MS);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() };
}

/**
 * The time at a moment of the calendar, or on a date held still at that moment's hour. The sky is the real one at the
 * game's hour on the date its day started on, blended to the next, so the hour turning back to 0 at a game day's end
 * doesn't take the sky back a day.
 */
export function gameTimeAt(gameDays: number, heldDate: CalendarDate | null = null): GameTime {
  const shown = calendarAt(gameDays);
  const { date, through } = heldDate ? { date: heldDate, through: 0.5 } : dateAt(gameDays);
  const calendar = heldDate ? { ...shown, year: heldDate.year, month: heldDate.month, day: gameDayOfDate(heldDate) } : shown;
  const started = heldDate ? dayNumberOf(heldDate) : dayNumberOf(date) + through - shown.hour / 24;
  const share = started - Math.floor(started);
  const [from, to] = [alandInstant(dateOfDayNumber(Math.floor(started)), shown.hour), alandInstant(dateOfDayNumber(Math.floor(started) + 1), shown.hour)];
  const [moonFrom, moonTo] = [moonPlace(from), moonPlace(to)];
  return {
    gameDays,
    calendar,
    date,
    through,
    hour: shown.hour,
    sun: between(sunPlace(from), sunPlace(to), share),
    moon: { ...between(moonFrom, moonTo, share), lit: moonFrom.lit + (moonTo.lit - moonFrom.lit) * share, waxing: share < 0.5 ? moonFrom.waxing : moonTo.waxing },
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(text: string): CalendarDate {
  const match = DATE_PATTERN.exec(text);
  if (match === null) throw new Error(`a date is written like 2026-06-21, not ${text}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error(`${text} is not a date`);
  return { year, month, day };
}

export const dateText = ({ year, month, day }: CalendarDate) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** What a link asks of the day: `?date=2026-06-21` to hold that date, `?hour=22.5` to start the day there. The hour runs on at the game's pace. */
export function dayAsked(search: string): { date: CalendarDate | null; hour: number | null } {
  const params = new URLSearchParams(search);
  const date = params.get("date");
  const hour = params.get("hour");
  const hourValue = hour === null ? null : Number(hour);
  if (hourValue !== null && !(hourValue >= 0 && hourValue < 24)) throw new Error(`?hour= takes an hour from 0 up to 24, such as 21.5, not ${hour}`);
  return { date: date === null ? null : parseDate(date), hour: hourValue };
}

/** Where a page's time starts: the world's time as this browser saved it, or the real date and time with no save, moved by a link. */
export function startOfDay(search: string, saved: number | null, nowMs: number): { gameDays: number; date: CalendarDate | null; linked: boolean } {
  const asked = dayAsked(search);
  let gameDays = saved ?? gameDaysAtInstant(nowMs);
  if (asked.date) gameDays = gameDaysOf({ ...asked.date, day: gameDayOfDate(asked.date), hour: calendarAt(gameDays).hour });
  if (asked.hour !== null) gameDays = Math.floor(gameDays) + asked.hour / 24;
  return { gameDays, date: asked.date, linked: asked.date !== null || asked.hour !== null };
}

/**
 * The page's time, running on from where it started at the game's pace, or standing still while held. A date held
 * (a link's, a tool's) stays that date while the hour runs.
 */
export class DayClock {
  /** The world's clock when game day 0 began, set at the first reading, so a clock `?sea=` moves on its first frame doesn't move the day. */
  private zeroSeconds: number | null = null;
  private heldAt: number | null = null;
  private date: CalendarDate | null;

  constructor(
    private startGameDays: number,
    date: CalendarDate | null = null,
  ) {
    this.date = date;
  }

  gameDaysAt(seconds: number) {
    if (this.heldAt !== null) return this.heldAt;
    this.zeroSeconds ??= seconds - this.startGameDays * GAME_DAY_S;
    return (seconds - this.zeroSeconds) / GAME_DAY_S;
  }

  at(seconds: number): GameTime {
    return gameTimeAt(this.gameDaysAt(seconds), this.date);
  }

  /** Shows this moment of the calendar now, and runs on from it. */
  setGameDays(gameDays: number, seconds: number) {
    this.startGameDays = gameDays;
    this.zeroSeconds = seconds - gameDays * GAME_DAY_S;
    if (this.heldAt !== null) this.heldAt = gameDays;
  }

  /** Holds a real date, or lets the calendar's own run on with null. */
  setDate(date: CalendarDate | null, seconds: number) {
    this.date = date;
    if (date) this.setCalendar(date.month, gameDayOfDate(date), seconds, date.year);
  }

  /** Moves to a month and one of its game days, keeping the hour. */
  setCalendar(month: number, day: number, seconds: number, year = calendarAt(this.gameDaysAt(seconds)).year) {
    this.setGameDays(gameDaysOf({ year, month, day, hour: calendarAt(this.gameDaysAt(seconds)).hour }), seconds);
  }

  /** Shows this hour now, keeping the day, and runs on from it. */
  setHour(hour: number, seconds: number) {
    this.setGameDays(Math.floor(this.gameDaysAt(seconds)) + hour / 24, seconds);
  }

  /** Stops the time where it is, or lets it run on from there. */
  hold(held: boolean, seconds: number) {
    if (held === (this.heldAt !== null)) return;
    if (held) {
      this.heldAt = this.gameDaysAt(seconds);
      return;
    }
    const gameDays = this.heldAt ?? 0;
    this.heldAt = null;
    this.setGameDays(gameDays, seconds);
  }

  get held() {
    return this.heldAt !== null;
  }

  /** Whether a real date is held here, by a link or a tool, rather than the calendar's own. */
  get dateHeld() {
    return this.date !== null;
  }
}
