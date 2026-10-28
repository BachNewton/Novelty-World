import { sunDay, type SunDay } from "../engine/astronomy";
import { CALENDAR, dateAt, startTime, timeOf, type CalendarDate } from "../engine/calendar";
import { skyAt, type DaySky } from "../engine/day";

/*
 * The world's clocks, shared by everything that moves: the calendar's time,
 * which gives the date, the hour and the sky, turning a whole day in the
 * calendar's minutes per day; and the seconds that drive motion (the
 * breeze in the grass, the northern lights). Either can be held still, for a screenshot or to look
 * at one hour for as long as you like: holding the hour holds the date too.
 * The date can also be held on its own, the hours still turning: past
 * midnight the same day comes round again.
 */

export interface Clock {
  /** Seconds of motion so far. */
  motion: number;
  /** Seconds since the calendar began: the date and the hour. */
  time: number;
  /** Held at this hour, or turning when null. */
  heldHour: number | null;
  /** Held on this whole game day while the hours turn, or moving on when null. */
  heldDay: number | null;
  /** Motion held at this many seconds, or running when null. */
  heldMotion: number | null;
  /** The date and hour now. */
  date: CalendarDate;
  /** The hour now, 0 to 24. */
  hours: number;
  /** The sun, the moon, the key light and the light's moments now. */
  sky: DaySky;
  /** Today's sun: sunrise, sunset and the twilights, for the day's noon. */
  today: SunDay;
}

function todayOf(day: number): SunDay {
  return sunDay(dateAt(timeOf(day, 12)).realDayOfYear, CALENDAR.latitude);
}

/** Works the date, the sky and the light out again from the clock's time. */
function refresh(clock: Clock): void {
  const date = dateAt(clock.time);
  if (date.day !== clock.date.day) clock.today = todayOf(date.day);
  clock.date = date;
  clock.hours = date.hour;
  clock.sky = skyAt(date);
}

/** A clock at the start of a new game, or on a whole game `day` (see `parseDate`), held at an hour when one is given. */
export function makeClock(heldHour: number | null, day: number | null = null): Clock {
  const start = startTime();
  const time = day === null && heldHour === null ? start : timeOf(day ?? dateAt(start).day, heldHour ?? CALENDAR.start.hour);
  const date = dateAt(time);
  const sky = skyAt(date);
  return { motion: 0, time, heldHour, heldDay: null, heldMotion: null, date, hours: date.hour, sky, today: todayOf(date.day) };
}

export function advanceClock(clock: Clock, seconds: number): void {
  clock.motion = clock.heldMotion ?? clock.motion + seconds;
  if (clock.heldHour === null) clock.time += seconds;
  if (clock.heldDay !== null) clock.time = timeOf(clock.heldDay, dateAt(clock.time).hour);
  refresh(clock);
}

/** Sets the hour of today, the day turning on from there unless it is held. */
export function setHour(clock: Clock, hours: number): void {
  clock.time = timeOf(clock.date.day, hours);
  refresh(clock);
}

/** Holds the day at `hours` of today, or lets it turn on from where it is when null. */
export function holdHour(clock: Clock, hours: number | null): void {
  clock.heldHour = hours;
  if (hours !== null) setHour(clock, hours);
}

/** Moves to a whole game day at the same hour, still held or turning. */
export function setDay(clock: Clock, day: number): void {
  clock.time = timeOf(day, clock.hours);
  if (clock.heldDay !== null) clock.heldDay = day;
  refresh(clock);
}

/** Holds the date on today while the hours turn, or lets the days move on again. */
export function holdDay(clock: Clock, hold: boolean): void {
  clock.heldDay = hold ? clock.date.day : null;
}
