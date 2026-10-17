import { BONE_NAMES, bindOffset, skeletonOf, uniformScale, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { FoxBuild } from "./fox";

/*
 * The fox's anatomy: where its pivots sit on the shared four-legged skeleton
 * (see `animals/rig.ts`). Sculpted at a small dog's scale, like the dogs, so
 * it has their detail; its size scales it into the world. A fox is a long,
 * slim dog on fine legs, with big pointed ears, a narrow muzzle and a brush
 * of a tail as long as its back.
 */

export const HIP: Vec3 = [0.04, 0.228, -0.14];
export const SHOULDER: Vec3 = [0.04, 0.228, 0.12];
export const FRONT_LEG = [0.086, 0.108, 0.034] as const;
export const HIND_LEG = [0.098, 0.098, 0.066] as const;
export const TAIL_ROOT: Vec3 = [0, 0.252, -0.19];
export const TAIL_STEP = 0.05;
export const HEAD: Vec3 = [0, 0.33, 0.212];
/** The middle of the skull, which the face is laid out from. */
export const SKULL: Vec3 = [0, 0.352, 0.236];
export const EAR: Vec3 = [0.028, 0.383, 0.228];
export const MUZZLE: Vec3 = [0, 0.344, 0.266];
export const JAW: Vec3 = [0, 0.33, 0.248];
export const TONGUE: Vec3 = [0, 0.325, 0.29];
/** The nose's tip and radii, before the muzzle is drawn out. */
export const NOSE: Vec3 = [0, 0.342, 0.338];
export const NOSE_RADII: Vec3 = [0.0085, 0.0072, 0.0068];
/** Where the lips meet. */
export const MOUTH_Y = 0.3305;
export const EAR_SHAPE: EarShape = { width: 0.064, height: 0.08, depth: 0.5, splay: -0.24, turn: 0.16, cupInset: 0.0048, cupLift: 0.006, tip: 0.0025 };

export const FOX_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.244, SHOULDER[2] - 0.01],
  neck: [0, 0.272, 0.165],
  head: HEAD,
  ear: EAR,
  muzzle: MUZZLE,
  jaw: JAW,
  tongue: TONGUE,
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

/** A fox's own rig, from its build. */
export function rigOf(build: FoxBuild): Rig {
  const offsets = new Map<BoneName, Vec3>();
  const scales = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) {
    const [x, y, z] = bindOffset(FOX_SKELETON, name);
    if (name === "chest") offsets.set(name, [x, y, z * build.body]);
    else if (name.startsWith("tail") && name !== "tail0") offsets.set(name, [x, y, z * build.tail]);
    else offsets.set(name, [x, y, z]);
  }
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, [1, build.legs, build.legs]);
    scales.set(`thigh${side}`, [1, build.legs, build.legs]);
    scales.set(`ear${side}`, uniformScale(build.ears));
  }
  scales.set("head", uniformScale(1.22));
  scales.set("muzzle", [1, 1, build.muzzle]);
  scales.set("jaw", [1, 1, build.muzzle]);
  const scaled = (lengths: readonly number[]) => lengths.map((l) => l * build.legs) as unknown as readonly [number, number, number];
  return { skeleton: FOX_SKELETON, offsets, scales, front: scaled(FRONT_LEG), hind: scaled(HIND_LEG) };
}
