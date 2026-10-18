import { BONE_NAMES, bindOffset, skeletonOf, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { DeerBuild } from "./deer";

/*
 * The roe deer's anatomy on the shared skeleton, sculpted at a small dog's
 * scale (its size scales it to some 70 cm at the shoulder): a compact
 * barrel of a body on long, fine legs, a long neck carrying a short-faced
 * head with big ears set out to the sides, a buck's antlers on his brow,
 * and hardly any tail.
 */

export const HIP: Vec3 = [0.034, 0.3, -0.13];
export const SHOULDER: Vec3 = [0.034, 0.288, 0.12];
export const FRONT_LEG = [0.11, 0.128, 0.05] as const;
export const HIND_LEG = [0.12, 0.13, 0.092] as const;
export const TAIL_ROOT: Vec3 = [0, 0.33, -0.19];
export const TAIL_STEP = 0.005;
export const HEAD: Vec3 = [0, 0.44, 0.215];
export const SKULL: Vec3 = [0, 0.456, 0.24];
export const EAR: Vec3 = [0.022, 0.478, 0.222];
export const NOSE: Vec3 = [0, 0.424, 0.318];
/** Where a buck's antlers rise from his brow (the left one's). */
export const PEDICLE: Vec3 = [0.012, 0.484, 0.236];
export const EAR_SHAPE: EarShape = { width: 0.042, height: 0.062, depth: 0.42, splay: -0.62, turn: 0.32, cupInset: 0.0045, cupLift: 0.005, tip: 0.007 };

export const DEER_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.31, 0.11],
  neck: [0, 0.34, 0.15],
  head: HEAD,
  ear: EAR,
  muzzle: [0, 0.44, 0.27],
  jaw: [0, 0.425, 0.262],
  tongue: [0, 0.425, 0.262],
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

export function rigOf(build: DeerBuild): Rig {
  const offsets = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) offsets.set(name, bindOffset(DEER_SKELETON, name));
  const scales = new Map<BoneName, Vec3>();
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, [1, build.legs, build.legs]);
    scales.set(`thigh${side}`, [1, build.legs, build.legs]);
  }
  const scaled = (lengths: readonly number[]) => lengths.map((l) => l * build.legs) as unknown as readonly [number, number, number];
  return { skeleton: DEER_SKELETON, offsets, scales, front: scaled(FRONT_LEG), hind: scaled(HIND_LEG) };
}
