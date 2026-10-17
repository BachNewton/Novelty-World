import { hourAt, lightAt, FIRST_HOUR, DAY_SECONDS, type MomentLight } from "../../world/day";

/*
 * The valley's clocks, shared by everything that moves: the hour of the day,
 * which turns a whole day in DAY_SECONDS, and the seconds that drive motion
 * (flames, water, the breeze). Either can be held still, for a screenshot or
 * to look at one hour for as long as you like.
 */

export interface ValleyClock {
  /** Seconds of motion so far. */
  motion: number;
  /** Seconds of the day's turn so far. */
  day: number;
  /** Held at this hour, or turning when null. */
  heldHour: number | null;
  /** Motion held at this many seconds, or running when null. */
  heldMotion: number | null;
  /** The hour now, and the light that goes with it. */
  hours: number;
  light: MomentLight;
  /** How much the fire flickers its light right now, about 1. */
  flicker: number;
}

export function makeClock(heldHour: number | null): ValleyClock {
  const hours = heldHour ?? FIRST_HOUR;
  return { motion: 0, day: 0, heldHour, heldMotion: null, hours, light: lightAt(hours), flicker: 1 };
}

/** The fire's flicker at a moment: a few unrelated waves, so it never repeats visibly. */
export function flickerAt(seconds: number): number {
  return 0.86 + 0.08 * Math.sin(seconds * 11.3) + 0.05 * Math.sin(seconds * 6.7 + 1.3) + 0.04 * Math.sin(seconds * 23.1 + 0.4);
}

export function advanceClock(clock: ValleyClock, seconds: number): void {
  clock.motion = clock.heldMotion ?? clock.motion + seconds;
  if (clock.heldHour === null) clock.day += seconds;
  clock.hours = clock.heldHour ?? hourAt(clock.day);
  clock.light = lightAt(clock.hours);
  clock.flicker = flickerAt(clock.motion);
}

/** Sets the day's turn so that it is now `hours`, still turning from there. */
export function setHour(clock: ValleyClock, hours: number): void {
  clock.day = (((hours - FIRST_HOUR + 24) % 24) / 24) * DAY_SECONDS;
}

/** Holds the day at `hours`, or lets it turn on from where it is when null. */
export function holdHour(clock: ValleyClock, hours: number | null): void {
  if (hours === null) setHour(clock, clock.hours);
  clock.heldHour = hours;
}
