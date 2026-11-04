import type { Challenge, ChallengeKind } from "./types";

/*
 * One rule for every challenge's target, from its par: the scripted driver's
 * run in the challenge's car (`tools/challenge-par.ts`), cornering at that car's
 * own grip, flat out wherever the bends allow. It doesn't brake late, carry speed
 * into a bend or pick a line, so a player can beat it on a Route, by a little:
 * par is a floor, and the hardest target asks for no more than `FLOOR_SHARE` of
 * it. At a Speed trap it is already flat out from the start line, so the
 * hardest target is par itself. How far the target sits past par is what makes
 * it easy, medium or hard.
 */

export type Difficulty = "easy" | "medium" | "hard";

/** A Route's target time, as a share of par. */
const ROUTE_SHARE: Record<Difficulty, number> = { easy: 1.1, medium: 1, hard: 0.95 };
/** A Speed trap's target speed, as a share of par. */
const TRAP_SHARE: Record<Difficulty, number> = { easy: 0.9, medium: 0.95, hard: 0.98 };
/** The most a player can be asked to beat par by: a Route's time, a Speed trap's speed. */
const FLOOR_SHARE: Record<ChallengeKind, number> = { route: ROUTE_SHARE.hard, "speed-trap": 1 };

/** Seconds rounded up to a tenth and speeds down to a whole km/h, so rounding only ever eases a target. */
export function targetFromPar(kind: ChallengeKind, par: number, difficulty: Difficulty): number {
  return kind === "route" ? Math.ceil(par * ROUTE_SHARE[difficulty] * 10) / 10 : Math.floor(par * TRAP_SHARE[difficulty]);
}

const shareOf = (challenge: Challenge) => (challenge.kind === "route" ? challenge.targetS / challenge.parS : challenge.targetKmh / challenge.parKmh);

/** By how far the target sits past par, halfway between the rule's steps, so a target set by hand is labelled too. */
export function difficultyOf(challenge: Challenge): Difficulty {
  const share = shareOf(challenge);
  if (challenge.kind === "route") return share >= (ROUTE_SHARE.easy + ROUTE_SHARE.medium) / 2 ? "easy" : share >= (ROUTE_SHARE.medium + ROUTE_SHARE.hard) / 2 ? "medium" : "hard";
  return share <= (TRAP_SHARE.easy + TRAP_SHARE.medium) / 2 ? "easy" : share <= (TRAP_SHARE.medium + TRAP_SHARE.hard) / 2 ? "medium" : "hard";
}

/** Whether par, scaled by the most a player can beat the scripted driver by, still makes the target. */
export function reachableByPar(challenge: Challenge): boolean {
  const floor = FLOOR_SHARE[challenge.kind];
  return challenge.kind === "route" ? challenge.parS * floor <= challenge.targetS : challenge.parKmh * floor >= challenge.targetKmh;
}
