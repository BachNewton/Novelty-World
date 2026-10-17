import { BONE_NAMES, bindOffset, skeletonOf, uniformScale, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { Build } from "./dog";

/*
 * The dog's anatomy: where its pivots sit on the shared four-legged skeleton
 * (see `animals/rig.ts`). The dog is sculpted at a cat's scale, about 30 cm at
 * the shoulder, so its sculpture has the cat's detail, and its build's size
 * scales it up into the world. Its build moves and scales the bones: legs,
 * back and tail longer or shorter, the muzzle drawn out or pushed in, the
 * skull broader.
 */

export const HIP: Vec3 = [0.045, 0.232, -0.125];
export const SHOULDER: Vec3 = [0.045, 0.232, 0.115];
/** The hind leg is longer than it stands, so it stands angulated, the hock behind the hip. */
export const FRONT_LEG = [0.088, 0.108, 0.036] as const;
export const HIND_LEG = [0.1, 0.1, 0.066] as const;
export const TAIL_ROOT: Vec3 = [0, 0.262, -0.175];
export const TAIL_STEP = 0.042;
export const HEAD: Vec3 = [0, 0.345, 0.205];
/** The middle of the skull, which the face is laid out from. */
export const SKULL: Vec3 = [0, 0.37, 0.228];
/** Where the ears meet the skull, for every kind of ear. */
export const EAR: Vec3 = [0.032, 0.404, 0.222];
export const MUZZLE: Vec3 = [0, 0.362, 0.262];
export const JAW: Vec3 = [0, 0.345, 0.24];
export const TONGUE: Vec3 = [0, 0.337, 0.29];
/** The nose leather's middle and radii, before the muzzle is drawn out. */
export const NOSE: Vec3 = [0, 0.364, 0.33];
export const NOSE_RADII: Vec3 = [0.0135, 0.0105, 0.0095];
/** Where the lips meet. */
export const MOUTH_Y = 0.3395;
export const PRICK_EAR: EarShape = { width: 0.054, height: 0.064, depth: 0.64, splay: -0.2, turn: 0.18, cupInset: 0.005, cupLift: 0.006, tip: 0.003 };

export const DOG_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.248, SHOULDER[2] - 0.01],
  neck: [0, 0.282, 0.165],
  head: HEAD,
  ear: EAR,
  muzzle: MUZZLE,
  jaw: JAW,
  tongue: TONGUE,
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

/** A dog's own rig, from its build. */
export function rigOf(build: Build): Rig {
  const offsets = new Map<BoneName, Vec3>();
  const scales = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) {
    const [x, y, z] = bindOffset(DOG_SKELETON, name);
    if (name === "chest") offsets.set(name, [x, y, z * build.body]);
    else if (name.startsWith("tail") && name !== "tail0") offsets.set(name, [x, y, z * build.tail]);
    else offsets.set(name, [x, y, z]);
  }
  // A leg grows longer, not thicker. Its scale is the same down and forward, so it still bends without shearing.
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, [1, build.legs, build.legs]);
    scales.set(`thigh${side}`, [1, build.legs, build.legs]);
    scales.set(`ear${side}`, uniformScale(build.ears));
  }
  // A small dog's head is big for its body, a big dog's small.
  const head = 1.15 * (1 + (1.5 - build.size) * 0.12);
  scales.set("head", [head * build.skull, head, head]);
  scales.set("muzzle", [1, 1, build.muzzle]);
  scales.set("jaw", [1, 1, build.muzzle]);
  const scaled = (lengths: readonly number[]) => lengths.map((l) => l * build.legs) as unknown as readonly [number, number, number];
  return { skeleton: DOG_SKELETON, offsets, scales, front: scaled(FRONT_LEG), hind: scaled(HIND_LEG) };
}
