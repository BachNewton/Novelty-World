import type { Outcome } from "./run";
import { betterMedal, medalForPlace, MEDALS, type Medal } from "./standings";
import type { Challenge } from "./types";

/*
 * Which challenges have been passed in this browser, each with its best: the
 * fastest time on a Route, the highest speed at a Speed trap. Solo and co-op are
 * kept apart, each its own pass and best, because a team's average isn't a solo
 * time. In co-op the best is the team's average, and the pass counts for both
 * players. It is a plain object, as `getProjectStorage` keeps it, and a challenge
 * the list no longer has is dropped on reading.
 *
 * A race keeps every finish rather than only a pass, and no time, since in a
 * race only the place counts: its best medal, and the best finishing place
 * with it. Solo the medal is the place's; in co-op it is the team's, from its
 * points per player (`standings.ts`), and the place this player's own.
 */

export const PASSES_KEY = "challenge-passes";

export type PlayMode = "solo" | "coop";

export const PLAY_MODES: readonly PlayMode[] = ["solo", "coop"];

export interface ChallengePass {
  /** The fastest time or highest speed; a race's best place. */
  best: number;
  /** A race's best medal, which may be none yet. */
  medal?: Medal | null;
}

export type ChallengePasses = Readonly<Record<PlayMode, Readonly<Record<string, ChallengePass>>>>;

export const NO_PASSES: ChallengePasses = { solo: {}, coop: {} };

function readMode(saved: unknown, challenges: readonly Challenge[]): Record<string, ChallengePass> {
  const kept: Record<string, ChallengePass> = {};
  if (typeof saved !== "object" || saved === null) return kept;
  for (const { id, kind } of challenges) {
    const pass: unknown = (saved as Record<string, unknown>)[id];
    if (typeof pass !== "object" || pass === null || !Number.isFinite((pass as { best?: unknown }).best)) continue;
    const { best, medal } = pass as ChallengePass;
    kept[id] = kind === "race" ? { best, medal: MEDALS.includes(medal as Medal) ? (medal as Medal) : null } : { best };
  }
  return kept;
}

/** What was kept, with anything that isn't a pass of a challenge on the list left out. */
export function readPasses(saved: unknown, challenges: readonly Challenge[]): ChallengePasses {
  if (typeof saved !== "object" || saved === null) return NO_PASSES;
  const modes = saved as Partial<Record<PlayMode, unknown>>;
  return { solo: readMode(modes.solo, challenges), coop: readMode(modes.coop, challenges) };
}

const better = (challenge: Challenge, a: number, b: number) => (challenge.kind === "speed-trap" ? a > b : a < b);

/**
 * The passes after an attempt played in a mode: unchanged unless it passed, and that mode's best only where this beats
 * it. A race's finish is kept as its medal and place, where it betters the best, a better medal first and then a
 * better place with the same; with no racers in it, a finish is first.
 */
export function withOutcome(passes: ChallengePasses, challenge: Challenge, mode: PlayMode, outcome: Outcome, place = 1, medal = medalForPlace(place)): ChallengePasses {
  const kept = passes[mode][challenge.id] as ChallengePass | undefined;
  if (challenge.kind === "race") {
    if (outcome.average === null) return passes;
    const keptMedal = kept?.medal ?? null;
    if (kept && (betterMedal(keptMedal, medal) || (keptMedal === medal && kept.best <= place))) return passes;
    return { ...passes, [mode]: { ...passes[mode], [challenge.id]: { best: place, medal } } };
  }
  if (!outcome.passed || outcome.average === null) return passes;
  if (kept && !better(challenge, outcome.average, kept.best)) return passes;
  return { ...passes, [mode]: { ...passes[mode], [challenge.id]: { best: outcome.average } } };
}
