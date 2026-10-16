import { roundHalfEven } from "./odds";

// GD's `AIHelper.GetChoice` at Expert: every candidate scored in order; those scoring above 0 (or
// NaN, which GD's test lets through) sorted best first, stably, NaN last; and the first taken.
// Expert's k = 1 and t = 0.5 always land on the top score, so the lower tiers' picks are left out.

/** The best-scoring candidate, the earliest on a tie, or null when none scores above 0. Every
 *  candidate is scored, in order, even when the first is unbeatable: a score may draw from the
 *  bot's random stream. */
export function getChoice<T>(candidates: readonly T[], score: (candidate: T) => number): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let firstNaN: T | null = null;
  for (const candidate of candidates) {
    const s = score(candidate);
    if (Number.isNaN(s)) {
      firstNaN ??= candidate;
    } else if (s > bestScore) {
      best = candidate;
      bestScore = s;
    }
  }
  return best ?? firstNaN;
}

/** `AIHelper.GetIterativeArray(start, end)`: every amount when there are at most 100, otherwise
 *  100 spread evenly, with the step's half as the variance the caller jitters its pick by. */
export function iterativeArray(start: number, end: number): { amounts: number[]; variance: number } {
  const diff = end - start;
  if (diff + 1 <= 100) return { amounts: Array.from({ length: diff + 1 }, (_, i) => start + i), variance: 0 };
  const step = diff / 99;
  const amounts = Array.from({ length: 100 }, (_, i) => roundHalfEven(i * step) + start);
  amounts[0] = start;
  amounts[99] = end;
  return { amounts, variance: Math.trunc(Math.floor(step * 0.5)) };
}

/** `UnityEngine.Random.Range(min, max)` on ints: `max` excluded. */
export function randomRange(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min));
}

/** `AIHelper.ApplyStepVariance`, as the deploy, move-in and fortify loops inline it. */
export function applyStepVariance(value: number, min: number, max: number, variance: number, random: () => number): number {
  if (variance <= 0) return value === 0 ? min : value;
  let r: number;
  if (value <= min) r = value + randomRange(random, 0, variance);
  else if (value >= max) r = value - randomRange(random, 0, variance);
  else r = value + randomRange(random, -variance, variance);
  return r < min ? min : r > max ? max : r;
}
