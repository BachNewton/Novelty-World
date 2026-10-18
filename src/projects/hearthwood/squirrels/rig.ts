import { BONE_NAMES, bindOffset, skeletonOf, type BoneName, type Rig, type Vec3 } from "../animals/rig";
import type { EarShape } from "../animals/sculpt";
import type { SquirrelBuild } from "./squirrel";

/*
 * The red squirrel's anatomy on the shared skeleton, sculpted at about
 * life size: short forelegs, long-footed hind legs folded under big haunches,
 * a round head with tufted ears, and a great bushy tail as long as its body.
 */

export const HIP: Vec3 = [0.022, 0.058, -0.045];
export const SHOULDER: Vec3 = [0.019, 0.052, 0.05];
export const FRONT_LEG = [0.021, 0.024, 0.01] as const;
export const HIND_LEG = [0.03, 0.03, 0.032] as const;
export const TAIL_ROOT: Vec3 = [0, 0.064, -0.085];
export const TAIL_STEP = 0.029;
export const HEAD: Vec3 = [0, 0.08, 0.075];
export const SKULL: Vec3 = [0, 0.088, 0.088];
export const EAR: Vec3 = [0.014, 0.108, 0.078];
export const NOSE: Vec3 = [0, 0.081, 0.122];
export const EAR_SHAPE: EarShape = { width: 0.017, height: 0.022, depth: 0.55, splay: -0.2, turn: 0.25, cupInset: 0.0022, cupLift: 0.002, tip: 0.004 };

export const SQUIRREL_SKELETON = skeletonOf({
  hip: HIP,
  shoulder: SHOULDER,
  frontLeg: FRONT_LEG,
  hindLeg: HIND_LEG,
  chest: [0, 0.062, 0.03],
  neck: [0, 0.07, 0.062],
  head: HEAD,
  ear: EAR,
  muzzle: [0, 0.084, 0.108],
  jaw: [0, 0.078, 0.104],
  tongue: [0, 0.078, 0.104],
  tailRoot: TAIL_ROOT,
  tailStep: TAIL_STEP,
});

export function rigOf(build: SquirrelBuild): Rig {
  const offsets = new Map<BoneName, Vec3>();
  for (const name of BONE_NAMES) {
    const [x, y, z] = bindOffset(SQUIRREL_SKELETON, name);
    offsets.set(name, name.startsWith("tail") && name !== "tail0" ? [x, y, z * build.tail] : [x, y, z]);
  }
  return { skeleton: SQUIRREL_SKELETON, offsets, scales: new Map(), front: FRONT_LEG, hind: HIND_LEG };
}
