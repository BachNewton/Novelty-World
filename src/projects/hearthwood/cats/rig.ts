import { BONE_NAMES, bindOffset, skeletonOf, uniformScale, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { Build } from "./cat";

/*
 * The cat's anatomy, in metres: where its pivots sit on the shared
 * four-legged skeleton (see `animals/rig.ts`). A cat's build moves and scales
 * them, so one sculpture serves every cat of its hair length.
 */

export const HIP: Vec3 = [0.05, 0.21, -0.1];
export const SHOULDER: Vec3 = [0.048, 0.205, 0.11];
/** The hind leg is longer than it stands, so it stands in the zigzag a cat's hind leg makes. */
export const FRONT_LEG = [0.08, 0.093, 0.032] as const;
export const HIND_LEG = [0.095, 0.085, 0.06] as const;
export const TAIL_ROOT: Vec3 = [0, 0.235, -0.17];
export const TAIL_STEP = 0.05;
export const HEAD: Vec3 = [0, 0.315, 0.215];
/** The middle of the skull, which the face is laid out from. */
export const SKULL: Vec3 = [0, 0.34, 0.245];
export const EAR: Vec3 = [0.04, 0.378, 0.232];
export const EAR_SHAPE: EarShape = { width: 0.064, height: 0.062, depth: 0.62, splay: -0.3, turn: 0.32, cupInset: 0.0065, cupLift: 0.008, tip: 0.005 };

export const CAT_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.225, SHOULDER[2] - 0.01],
  neck: [0, 0.265, 0.165],
  head: HEAD,
  ear: EAR,
  // A cat's face is painted, so nothing follows its muzzle, jaw or tongue.
  muzzle: SKULL,
  jaw: SKULL,
  tongue: SKULL,
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

/** A cat's own rig, from its build. */
export function rigOf(build: Build): Rig {
  const offsets = new Map<BoneName, Vec3>();
  const scales = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) {
    const [x, y, z] = bindOffset(CAT_SKELETON, name);
    if (name === "chest") offsets.set(name, [x, y, z * build.body]);
    else if (name.startsWith("tail") && name !== "tail0") offsets.set(name, [x, y, z * build.tail]);
    else offsets.set(name, [x, y, z]);
  }
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, uniformScale(build.legs));
    scales.set(`thigh${side}`, uniformScale(build.legs));
    scales.set(`ear${side}`, uniformScale(build.ears));
  }
  scales.set("head", uniformScale(build.head));
  const scaled = (lengths: readonly number[]) => lengths.map((l) => l * build.legs) as unknown as readonly [number, number, number];
  return { skeleton: CAT_SKELETON, offsets, scales, front: scaled(FRONT_LEG), hind: scaled(HIND_LEG) };
}
