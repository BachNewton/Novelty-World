import { TICK_RATE, tickTiming, toTicks } from "./ticks";
import type { Tuning } from "./tuning";

// A course's medals: the time to beat for each, gold the fastest. A run earns
// the best medal whose time it is at or under. The times are course data,
// in seconds for reading; a run's time is in ticks, the rules' clock (see
// `runTime` in `run.ts`), and the two meet in ticks.

export type Medal = "gold" | "silver" | "bronze";

// Best first.
export const MEDALS: readonly Medal[] = ["gold", "silver", "bronze"];

export type MedalTimes = Readonly<Record<Medal, number>>;

// Fails loudly on medal times out of order: each must be a positive time,
// and gold faster than silver, faster than bronze, in whole ticks.
export function checkMedalTimes(times: MedalTimes): MedalTimes {
  for (const medal of MEDALS) {
    if (!(Number.isFinite(times[medal]) && toTicks(times[medal]) > 0)) throw new Error(`A ${medal} time of ${String(times[medal])} s isn't a time to beat`);
  }
  if (!(toTicks(times.gold) < toTicks(times.silver) && toTicks(times.silver) < toTicks(times.bronze))) {
    throw new Error(`Medal times must run gold < silver < bronze: got ${String(times.gold)}, ${String(times.silver)} and ${String(times.bronze)} s`);
  }
  return times;
}

// The best medal a run of `ticks` earns, or null for none.
export function medalFor(ticks: number, times: MedalTimes): Medal | null {
  return MEDALS.find((medal) => ticks <= toTicks(times[medal])) ?? null;
}

// The time a held jump takes from the drop to the finish line with nothing in
// its way, in ticks: the drop, its leap, then a jump every repeat interval.
// Every row in the way slows a run down from it, and only tapping faster than
// the key repeats beats it, so it is the floor medal times are set against,
// beside the solver's proofs.
export function heldJumpTicks(tuning: Tuning): number {
  const timing = tickTiming(tuning);
  const jumps = Math.ceil((tuning.courseLength - tuning.dropDistance) / tuning.depthStep);
  return timing.dropDuration + (jumps - 1) * timing.holdRepeat;
}

// A time as a stopwatch shows it: minutes, seconds and hundredths, or tenths
// when `tenths` is set.
export function formatTime(ticks: number, tenths = false): string {
  const hundredths = Math.floor((ticks * 100) / TICK_RATE);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor((hundredths % 6000) / 100);
  const fraction = hundredths % 100;
  const shown = tenths ? String(Math.floor(fraction / 10)) : String(fraction).padStart(2, "0");
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}.${shown}`;
}
