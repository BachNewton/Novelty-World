import type { Tuning } from "./tuning";

// The rules' clock. The rules count time in whole ticks, so the rule state
// after a number of ticks, given the same inputs, is the same however the
// frames that drove it were chunked: the ground co-op's timed inputs stand on.
// The frame loop runs as many ticks as real time has passed, and the drawing
// runs on into the tick under way, so nothing drawn steps at the tick rate.
//
// A tick is 10 ms: every timing knob in `tuning.ts` is then a whole number of
// ticks, so the clock changes none of them, and it is finer than a frame at
// any refresh rate, so an input's stamp is never coarser than the frame it
// came in.
export const TICK_RATE = 100;

export function toSeconds(ticks: number): number {
  return ticks / TICK_RATE;
}

// The tuning's times, in whole ticks: the one place the rules' seconds become
// ticks. A knob between ticks rounds to the nearest.
export interface TickTiming {
  hopAirtime: number;
  holdRepeat: number;
  dropDuration: number;
  finishLeap: number;
}

export function toTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

export function tickTiming(tuning: Tuning): TickTiming {
  return {
    hopAirtime: toTicks(tuning.hopAirtime),
    holdRepeat: toTicks(tuning.holdRepeatInterval),
    dropDuration: toTicks(tuning.dropDuration),
    finishLeap: toTicks(tuning.finishLeapDuration),
  };
}

// How many ticks a frame of `elapsed` seconds runs, carrying on from `carry`,
// how far real time had already got into the next tick. A frame is clamped to
// `maxFrame` seconds, so returning to a backgrounded tab doesn't lurch the
// course forward. What is left over carries into the next frame.
export function frameTicks(carry: number, elapsed: number, maxFrame: number): { ticks: number; carry: number } {
  const due = carry + Math.min(elapsed, maxFrame) * TICK_RATE;
  const ticks = Math.floor(due);
  return { ticks, carry: due - ticks };
}
