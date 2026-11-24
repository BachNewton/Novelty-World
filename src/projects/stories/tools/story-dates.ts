/**
 * Calendar and clock arithmetic for a story's world (`story-world.ts`), so that no date, weekday,
 * age, interval or time of day in the prose is worked out by hand.
 */

export interface DayDate {
  year: number;
  month: number;
  day: number;
}

export interface Interval {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function parseDay(text: string, label = text): DayDate {
  const match = FULL_DATE.exec(text);
  if (!match) throw new Error(`${label} is "${text}", not a full date (YYYY-MM-DD): arithmetic needs the day`);
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const real = new Date(toUtc(date));
  if (real.getUTCMonth() !== date.month - 1 || real.getUTCDate() !== date.day) throw new Error(`${text} is not a real date`);
  return date;
}

function toUtc(date: DayDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(date: DayDate, months: number): DayDate {
  const index = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function compareDays(a: DayDate, b: DayDate): number {
  return toUtc(a) - toUtc(b);
}

/** The calendar time from `from` to `to`, which must not be earlier. */
export function interval(from: DayDate, to: DayDate): Interval {
  if (compareDays(to, from) < 0) throw new Error(`${formatDay(to)} is before ${formatDay(from)}`);
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (to.day < from.day) months -= 1;
  const anchor = addMonths(from, months);
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: Math.round((toUtc(to) - toUtc(anchor)) / DAY_MS),
    totalDays: Math.round((toUtc(to) - toUtc(from)) / DAY_MS),
  };
}

export function ageOn(born: DayDate, on: DayDate): number {
  return interval(born, on).years;
}

export function weekday(date: DayDate): string {
  return WEEKDAYS[new Date(toUtc(date)).getUTCDay()];
}

export function formatDay(date: DayDate): string {
  return `${weekday(date)}, ${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function formatInterval(span: Interval): string {
  const parts = [
    span.years > 0 ? plural(span.years, "year") : "",
    span.months > 0 ? plural(span.months, "month") : "",
    span.days > 0 ? plural(span.days, "day") : "",
  ].filter(Boolean);
  if (parts.length === 0) return "the same day";
  const words = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
  return span.totalDays === span.days ? words : `${words} (${plural(span.totalDays, "day")})`;
}

export interface WallClock {
  date: DayDate;
  hour: number;
  minute: number;
  /** Minutes ahead of UTC. */
  offset: number;
}

export function wallClock(instant: number, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`no ${type} in the clock for ${zone}`);
    return Number(found.value);
  };
  const date = { year: part("year"), month: part("month"), day: part("day") };
  const hour = part("hour");
  const minute = part("minute");
  const offset = Math.round((Date.UTC(date.year, date.month - 1, date.day, hour, minute) - instant) / MINUTE_MS);
  return { date, hour, minute, offset };
}

/** The instant when the clocks in `zone` show this date and time. */
export function instantAt(date: DayDate, hour: number, minute: number, zone: string): number {
  const asIfUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const guess = asIfUtc - wallClock(asIfUtc, zone).offset * MINUTE_MS;
  // A second pass settles a guess that landed on the other side of a daylight-saving change.
  return asIfUtc - wallClock(guess, zone).offset * MINUTE_MS;
}

export function formatClock(clock: WallClock): string {
  const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const sign = clock.offset < 0 ? "-" : "+";
  const hours = Math.abs(clock.offset) / 60;
  return `${time} on ${formatDay(clock.date)} (UTC${sign}${hours})`;
}
