import { BONE_NAMES, bindOffset, skeletonOf, uniformScale, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { HareBuild } from "./hare";

/*
 * The mountain hare's anatomy on the shared skeleton, at about life size:
 * short forelegs, long hind legs ending in long flat feet, folded under
 * big haunches, a blunt head with big side-set eyes, tall ears, and a scut.
 */

export const HIP: Vec3 = [0.034, 0.11, -0.1];
export const SHOULDER: Vec3 = [0.03, 0.098, 0.1];
export const FRONT_LEG = [0.042, 0.046, 0.01] as const;
export const HIND_LEG = [0.07, 0.074, 0.068] as const;
export const TAIL_ROOT: Vec3 = [0, 0.122, -0.168];
export const TAIL_STEP = 0.007;
export const HEAD: Vec3 = [0, 0.15, 0.14];
export const SKULL: Vec3 = [0, 0.166, 0.166];
export const EAR: Vec3 = [0.016, 0.194, 0.152];
export const NOSE: Vec3 = [0, 0.156, 0.214];
export const EAR_SHAPE: EarShape = { width: 0.034, height: 0.086, depth: 0.42, splay: -0.12, turn: 0.32, cupInset: 0.0042, cupLift: 0.005, tip: 0.009 };

export const HARE_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.112, 0.06],
  neck: [0, 0.13, 0.11],
  head: HEAD,
  ear: EAR,
  muzzle: [0, 0.16, 0.19],
  jaw: [0, 0.148, 0.185],
  tongue: [0, 0.148, 0.185],
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

export function rigOf(build: HareBuild): Rig {
  const offsets = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) offsets.set(name, bindOffset(HARE_SKELETON, name));
  const scales = new Map<BoneName, Vec3>([
    ["earL", uniformScale(build.ears)],
    ["earR", uniformScale(build.ears)],
  ]);
  return { skeleton: HARE_SKELETON, offsets, scales, front: FRONT_LEG, hind: HIND_LEG };
}
