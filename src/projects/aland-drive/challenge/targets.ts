import type { BucketChallenge, ChallengeKind } from "./types";

type TargetKind = Exclude<ChallengeKind, "race">;

/*
 * One rule for every challenge's target, from its par: the fastest the AI gets
 * in the challenge's car on its road, in its conditions, through every line in
 * order (`tools/challenge-par.ts`: the AI racer, or the old scripted driver
 * where it is faster, as flat out at a camera). There are no difficulties: the
 * target is par itself, so passing one takes a drive at the car's limit.
 */

/** Seconds rounded up to a tenth and speeds down to a whole km/h, so rounding only ever eases a target. */
export function targetFromPar(kind: TargetKind, par: number): number {
  return kind === "route" ? Math.ceil(par * 10) / 10 : Math.floor(par);
}

/** Whether the AI's own run makes the target, as the rule promises. */
export function reachableByPar(challenge: BucketChallenge): boolean {
  return challenge.kind === "route" ? challenge.parS <= challenge.targetS : challenge.parKmh >= challenge.targetKmh;
}
