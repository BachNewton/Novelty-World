/*
 * Smooth random wanderings along a line of time, the same on every machine: an integer hash (PCG) rolls a value at
 * each whole step, and the line eases from one to the next. Only exact arithmetic, so two players' weather never
 * drifts apart by a rounding.
 */

const pcg = (value: number) => {
  const state = (Math.imul(value >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
};

/** A number from 0 up to 1 for a whole number and a salt naming what it's for. */
export const roll = (whole: number, salt: number) => pcg((pcg(salt) ^ Math.floor(whole)) >>> 0) / 4294967296;

/** A smooth ease from 0 at 0 to 1 at 1, flat at both ends. */
export const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 0 below `from`, 1 above `to`, easing between; `from` may be above `to` to fall instead. */
export const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** Each whole step's value: the sum of two rolls, so values near 0 are commoner than the ends. From −1 to 1. */
const knot = (whole: number, salt: number) => roll(whole, salt) + roll(whole, salt + 7919) - 1;

/** A value from −1 to 1 wandering smoothly along `t`, through a new random value at each whole number. */
export function wander(t: number, salt: number) {
  const whole = Math.floor(t);
  const a = knot(whole, salt);
  return a + (knot(whole + 1, salt) - a) * ease(t - whole);
}
