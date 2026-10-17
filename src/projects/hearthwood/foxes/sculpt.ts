import { ball, ellipsoid, rod, stretched, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { cuppedEar, onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, NOSE, NOSE_RADII, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The fox's body as smooth signed-distance forms round its rig's pivots, in
 * the bind pose, meshed by the shared sculpting (`animals/sculpt.ts`): a slim
 * deep chest and a light loin on fine legs, a ruffed neck, a head with broad
 * cheeks narrowing to a long pointed muzzle, tall cupped ears, and a brush of
 * a tail thickest past its middle. One sculpture serves every fox; the rest
 * of a fox's build is in its bones.
 */

const BODY_CELL = 0.0105;
const HEAD_CELL = 0.006;
/** The winter coat's fullness over the body, and its soft lumps. */
const FLUFF = 0.006;
const ROUGHNESS = 0.0006;

function bodyForms(): Form[] {
  const f = FLUFF;
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.1], end: [0, 0, 0.06] };

  add(ellipsoid([0, 0.236, 0.05], [0.052 + f, 0.074 + f, 0.1]), "chest", 0);
  add(ellipsoid([0, 0.226, 0.12], [0.044 + f, 0.064 + f, 0.05]), "chest", 0.03);
  add(ellipsoid([0, 0.244, -0.055], [0.046 + f, 0.05 + f * 0.6, 0.1]), back, 0.045);
  add(ball([0, 0.25, -0.14], 0.047 + f), "pelvis", 0.04);
  for (const side of sides) {
    add(ball(onSide(side, [0.03, 0.255, 0.1]), 0.04), "chest", 0.03);
    add(ellipsoid(onSide(side, [0.031, 0.222, -0.13]), [0.038 + f, 0.064 + f, 0.058 + f]), "pelvis", 0.03);
  }
  // A long neck under a soft ruff, fuller at the throat.
  add(rod([0, 0.262, 0.12], [0, 0.33, 0.2], 0.04 + f, 0.032 + f), "neck", 0.03);
  add(ellipsoid([0, 0.268, 0.16], [0.043, 0.054, 0.046]), "neck", 0.03);
  add(ellipsoid([0, 0.205, 0.14], [0.04, 0.05, 0.045]), "chest", 0.03);

  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.012, shoulder[2]], elbow, 0.03, 0.019), `upper${side}`, 0.03);
    add(rod(elbow, wrist, 0.0165, 0.0128), `fore${side}`, 0.012);
    add(ellipsoid([wrist[0], wrist[1] - 0.019, wrist[2] + 0.011], [0.0175, 0.0135, 0.025]), `paw${side}`, 0.014);

    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.042 + f * 0.5, 0.022), `thigh${side}`, 0.03);
    add(rod(knee, hock, 0.0175, 0.0125), `shin${side}`, 0.014);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.018, hock[2]], 0.0125, 0.013), `foot${side}`, 0.01);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.012, hock[2] + 0.011], [0.0175, 0.0135, 0.026]), `toe${side}`, 0.014);
  }

  // The brush: slim at its root, thickest past its middle, drawn to a soft point.
  const tailRadius = (i: number) => {
    const t = i / TAIL_SEGMENTS;
    if (t >= 0.999) return 0.012;
    return 0.022 + 0.026 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08)) ** 0.8;
  };
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP + (i === 0 ? 0.03 : 0)];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP + (i === TAIL_SEGMENTS - 1 ? 0.016 : 0)];
    add(rod(a, b, tailRadius(i), tailRadius(i + 1)), `tail${i}` as BoneName, i === 0 ? 0.03 : 0.014);
  }
  return forms;
}

function headForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number, part?: number) => forms.push({ solid, follows, blend, part });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.043, 0.037, 0.045]), "head", 0);
  add(ellipsoid([sx, sy + 0.003, sz + 0.03], [0.026, 0.022, 0.02]), "head", 0.014);
  for (const side of sides) {
    // The cheeks' ruff, flaring out below and behind the eyes.
    add(ellipsoid(onSide(side, [sx + 0.03, sy - 0.02, sz + 0.002]), [0.03, 0.028, 0.03]), "head", 0.02);
    add(ellipsoid(onSide(side, [sx + 0.017, sy + 0.01, sz + 0.03]), [0.01, 0.007, 0.009]), "head", 0.01);
    add(cuppedEar(EAR_SHAPE, EAR, side), `ear${side}`, 0.008);
  }
  // The long, narrow muzzle, tapering to the nose.
  add(rod([sx, sy - 0.012, sz + 0.032], [sx, NOSE[1] - 0.002, NOSE[2] - 0.006], 0.019, 0.0085), "muzzle", 0.014);
  add(ellipsoid(NOSE, NOSE_RADII), "muzzle", 0.005);
  add(rod([sx, sy - 0.03, sz + 0.03], [sx, sy - 0.024, sz + 0.092], 0.012, 0.0055), "jaw", 0.006);
  const tongueFrom: Vec3 = [sx, sy - 0.028, sz + 0.05];
  const tongueTo: Vec3 = [sx, sy - 0.031, sz + 0.098];
  const middle: Vec3 = [sx, (tongueFrom[1] + tongueTo[1]) / 2, (tongueFrom[2] + tongueTo[2]) / 2];
  add(stretched(rod(tongueFrom, tongueTo, 0.0055, 0.007), middle, [1, 0.45, 1]), "tongue", 0.003, PART.tongue);
  return forms;
}

/** The fox's whole mesh. */
export function sculptFox(): AnimalMesh {
  return sculpt([
    { forms: bodyForms(), cell: BODY_CELL, part: PART.body, roughness: ROUGHNESS },
    { forms: headForms(), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
