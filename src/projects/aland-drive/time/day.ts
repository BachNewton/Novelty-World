import { moonPlace, sunPlace, type MoonPlace, type SkyPlace } from "./sky-places";

/*
 * The game's time of day, worked out from the world's clock (`sea/clock.ts`) with nothing sent over the network, so
 * every player has the same hour. The date is Åland's real date; the hour runs fast, a game day replaying that date's
 * real sun path in `GAME_DAY_S` real seconds. The sky is the real one at that date and hour: the sun and moon stand
 * where they would over Åland at that local clock time.
 *
 * What hangs off it later (the weather, the seasons) reads `GameTime`: the date is the season's, the hour the day's.
 */

/** How long a game day lasts, in real seconds: a starting value, tuned by the owner in the game. */
export const GAME_DAY_S = 3600;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

export interface GameTime {
  date: CalendarDate;
  /** Åland's local clock time, 0 to 24. */
  hour: number;
  /** The real instant whose sky is shown: that date at that local hour. */
  skyMs: number;
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

/** The fast hour at a moment of the world's clock: every player's game day starts at the same moment. */
export const fastHour = (seconds: number) => (((seconds % GAME_DAY_S) + GAME_DAY_S) % GAME_DAY_S) / GAME_DAY_S * 24;

export function gameTimeAt(date: CalendarDate, hour: number): GameTime {
  const skyMs = alandInstant(date, hour);
  return { date, hour, skyMs, sun: sunPlace(skyMs), moon: moonPlace(skyMs) };
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

/** What a link asks of the day: `?date=2026-06-21` for another date, `?hour=22.5` to start the day there. Either runs on at the game's pace. */
export function dayAsked(search: string): { date: CalendarDate | null; hour: number | null } {
  const params = new URLSearchParams(search);
  const date = params.get("date");
  const hour = params.get("hour");
  const hourValue = hour === null ? null : Number(hour);
  if (hourValue !== null && !(hourValue >= 0 && hourValue < 24)) throw new Error(`?hour= takes an hour from 0 up to 24, such as 21.5, not ${hour}`);
  return { date: date === null ? null : parseDate(date), hour: hourValue };
}

/**
 * The page's day: the shared one, unless a link or the dev menu has moved it. A date set here stays that date; an
 * hour set here shifts this page's day, which then runs on at the game's pace, or stands still while held.
 */
export class DayClock {
  private date: CalendarDate | null = null;
  private shiftHours = 0;
  private heldAt: number | null = null;

  /** The hour shown at a moment of the world's clock. */
  hourAt(seconds: number) {
    if (this.heldAt !== null) return this.heldAt;
    return (((fastHour(seconds) + this.shiftHours) % 24) + 24) % 24;
  }

  at(seconds: number): GameTime {
    return gameTimeAt(this.date ?? alandDate(seconds * 1000), this.hourAt(seconds));
  }

  setDate(date: CalendarDate | null) {
    this.date = date;
  }

  /** Shows this hour now, and runs on from it. */
  setHour(hour: number, seconds: number) {
    this.shiftHours = hour - fastHour(seconds);
    if (this.heldAt !== null) this.heldAt = hour;
  }

  /** Stops the hour where it is, or lets it run on from there. */
  hold(held: boolean, seconds: number) {
    if (held === (this.heldAt !== null)) return;
    if (held) {
      this.heldAt = this.hourAt(seconds);
      return;
    }
    const hour = this.heldAt ?? 0;
    this.heldAt = null;
    this.setHour(hour, seconds);
  }

  get held() {
    return this.heldAt !== null;
  }

  get shared() {
    return this.date === null && this.shiftHours === 0 && this.heldAt === null;
  }
}
