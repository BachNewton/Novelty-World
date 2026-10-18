import type { Pose } from "./motion";
import type { BoneName } from "./rig";

/*
 * Measures the species' motion tests share: how far a pose moved from one
 * moment to the next. A pop is a jump that doesn't shrink with the step:
 * sampled five times finer, a continuous movement turns each bone a fifth as
 * far between samples, while a pop stays the size it was.
 */

export const turnOf = (pose: Pose, bone: BoneName) => pose.rotations.get(bone) as readonly number[];

/** How far apart two turns are, the short way round: a turn of a whole circle more is the same turn. */
const between = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The biggest jump of any bone's turn, or the pelvis, between two poses. */
export function poseJump(a: Pose, b: Pose): number {
  let most = Math.max(...a.pelvis.map((v, i) => Math.abs(v - b.pelvis[i])));
  for (const [bone, value] of a.rotations) most = Math.max(most, ...value.map((v, i) => between(v, turnOf(b, bone)[i])));
  return most;
}

/** The worst jump between samples `step` apart from `from` to `to`. */
export function worstStep(pose: (t: number) => Pose, from: number, to: number, step: number): number {
  let worst = 0;
  let last = pose(from);
  for (let t = from + step; t < to; t += step) {
    const next = pose(t);
    worst = Math.max(worst, poseJump(last, next));
    last = next;
  }
  return worst;
}

/** The worst jump sampled coarsely and finely: smooth motion's fine one is a fraction of its coarse one. */
export function smoothness(pose: (t: number) => Pose, from: number, to: number): { coarse: number; fine: number } {
  return { coarse: worstStep(pose, from, to, 0.001), fine: worstStep(pose, from, to, 0.0002) };
}
