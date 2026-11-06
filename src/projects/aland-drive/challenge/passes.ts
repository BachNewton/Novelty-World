import type { Outcome } from "./run";
import type { Challenge } from "./types";

/*
 * Which challenges have been passed in this browser, each with its best: the
 * fastest time on a Route, the highest speed at a Speed trap. Solo and co-op are
 * kept apart, each its own pass and best, because a team's average isn't a solo
 * time. In co-op the best is the team's average, and the pass counts for both
 * players. It is a plain object, as `getProjectStorage` keeps it, and a challenge
 * the list no longer has is dropped on reading.
 */

export const PASSES_KEY = "challenge-passes";

export type PlayMode = "solo" | "coop";

export const PLAY_MODES: readonly PlayMode[] = ["solo", "coop"];

export interface ChallengePass {
  best: number;
}

export type ChallengePasses = Readonly<Record<PlayMode, Readonly<Record<string, ChallengePass>>>>;

export const NO_PASSES: ChallengePasses = { solo: {}, coop: {} };

function readMode(saved: unknown, challenges: readonly Challenge[]): Record<string, ChallengePass> {
  const kept: Record<string, ChallengePass> = {};
  if (typeof saved !== "object" || saved === null) return kept;
  for (const { id } of challenges) {
    const pass: unknown = (saved as Record<string, unknown>)[id];
    if (typeof pass === "object" && pass !== null && Number.isFinite((pass as { best?: unknown }).best)) kept[id] = { best: (pass as ChallengePass).best };
  }
  return kept;
}

/** What was kept, with anything that isn't a pass of a challenge on the list left out. */
export function readPasses(saved: unknown, challenges: readonly Challenge[]): ChallengePasses {
  if (typeof saved !== "object" || saved === null) return NO_PASSES;
  const modes = saved as Partial<Record<PlayMode, unknown>>;
  return { solo: readMode(modes.solo, challenges), coop: readMode(modes.coop, challenges) };
}

const better = (challenge: Challenge, a: number, b: number) => (challenge.kind === "route" ? a < b : a > b);

/** The passes after an attempt played in a mode: unchanged unless it passed, and that mode's best only where this beats it. */
export function withOutcome(passes: ChallengePasses, challenge: Challenge, mode: PlayMode, outcome: Outcome): ChallengePasses {
  if (!outcome.passed || outcome.average === null) return passes;
  const kept = passes[mode][challenge.id] as ChallengePass | undefined;
  if (kept && !better(challenge, outcome.average, kept.best)) return passes;
  return { ...passes, [mode]: { ...passes[mode], [challenge.id]: { best: outcome.average } } };
}
