import { BONE_NAMES, bindOffset, skeletonOf, uniformScale, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { HedgehogBuild } from "./hedgehog";

/*
 * The hedgehog's anatomy on the shared four-legged skeleton (see
 * `animals/rig.ts`): a round body on tiny legs, sculpted at about life size
 * (its size scales it), a pointed snout and a stub of a tail. Its mantle of
 * spines rides on the pelvis and the chest, so bending them together rolls
 * it into a ball.
 */

export const HIP: Vec3 = [0.03, 0.052, -0.055];
export const SHOULDER: Vec3 = [0.03, 0.05, 0.045];
export const FRONT_LEG = [0.02, 0.02, 0.01] as const;
export const HIND_LEG = [0.022, 0.018, 0.012] as const;
export const TAIL_ROOT: Vec3 = [0, 0.055, -0.105];
export const TAIL_STEP = 0.005;
export const HEAD: Vec3 = [0, 0.058, 0.07];
export const SKULL: Vec3 = [0, 0.058, 0.088];
export const EAR: Vec3 = [0.019, 0.078, 0.08];
export const NOSE: Vec3 = [0, 0.046, 0.148];
export const NOSE_RADII: Vec3 = [0.0075, 0.0065, 0.006];

export const HEDGEHOG_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.06, 0.02],
  neck: [0, 0.06, 0.058],
  head: HEAD,
  ear: EAR,
  muzzle: [0, 0.054, 0.1],
  jaw: [0, 0.048, 0.1],
  tongue: [0, 0.048, 0.1],
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

/** A hedgehog's own rig, from its build. */
export function rigOf(build: HedgehogBuild): Rig {
  const offsets = new Map<BoneName, Vec3>();
  const scales = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) offsets.set(name, bindOffset(HEDGEHOG_SKELETON, name));
  scales.set("pelvis", [build.plump, build.plump, 1]);
  scales.set("muzzle", [1, 1, build.snout]);
  scales.set("head", uniformScale(1 / build.plump));
  // The legs stay the size they are under a plumper body.
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, uniformScale(1 / build.plump));
    scales.set(`thigh${side}`, uniformScale(1 / build.plump));
  }
  return { skeleton: HEDGEHOG_SKELETON, offsets, scales, front: FRONT_LEG, hind: HIND_LEG };
}
