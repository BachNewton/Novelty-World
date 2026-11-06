import type { Outcome } from "./run";
import type { Challenge } from "./types";

/*
 * Which challenges have been passed in this browser, each with its best: the
 * fastest time on a Route, the highest speed at a Speed trap. The best is what
 * the pass was judged on, so in co-op it is the team's average, and a pass in
 * co-op counts for both players. It is a plain object, as `getProjectStorage`
 * keeps it, and a challenge the list no longer has is dropped on reading.
 */

export const PASSES_KEY = "challenge-passes";

export interface ChallengePass {
  best: number;
}

export type ChallengePasses = Readonly<Record<string, ChallengePass>>;

/** What was kept, with anything that isn't a pass of a challenge on the list left out. */
export function readPasses(saved: unknown, challenges: readonly Challenge[]): ChallengePasses {
  if (typeof saved !== "object" || saved === null) return {};
  const kept: Record<string, ChallengePass> = {};
  for (const { id } of challenges) {
    const pass: unknown = (saved as Record<string, unknown>)[id];
    if (typeof pass === "object" && pass !== null && Number.isFinite((pass as { best?: unknown }).best)) kept[id] = { best: (pass as ChallengePass).best };
  }
  return kept;
}

const better = (challenge: Challenge, a: number, b: number) => (challenge.kind === "route" ? a < b : a > b);

/** The passes after an attempt: unchanged unless it passed, and its best only where this beats it. */
export function withOutcome(passes: ChallengePasses, challenge: Challenge, outcome: Outcome): ChallengePasses {
  if (!outcome.passed || outcome.average === null) return passes;
  const kept = passes[challenge.id] as ChallengePass | undefined;
  if (kept && !better(challenge, outcome.average, kept.best)) return passes;
  return { ...passes, [challenge.id]: { best: outcome.average } };
}
