import { ball, ellipsoid, rod, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { cuppedEar, onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The cat's body as smooth signed-distance forms round its rig's pivots, in
 * the bind pose, meshed by the shared sculpting (`animals/sculpt.ts`) into one
 * skinned surface: the body on a coarser grid, and the head with its ears on
 * a finer one, so the ears keep their edge. One sculpture per hair length
 * serves every cat; builds move the bones.
 */

const BODY_CELL = 0.011;
const HEAD_CELL = 0.0065;

export interface Look {
  longHair: boolean;
}

function bodyForms({ longHair }: Look): Form[] {
  const fluff = longHair ? 0.012 : 0;
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.07], end: [0, 0, 0.07] };

  add(ellipsoid([0, 0.218, 0.055], [0.074 + fluff, 0.08 + fluff, 0.1]), "chest", 0);
  add(ellipsoid([0, 0.218, -0.04], [0.068 + fluff, 0.072 + fluff, 0.1]), back, 0.04);
  add(ball([0, 0.226, -0.125], 0.058 + fluff), "pelvis", 0.04);
  add(ellipsoid([0, 0.2, 0.13], [0.058 + fluff, 0.07 + fluff, 0.055]), "chest", 0.03);
  for (const side of sides) {
    add(ball(onSide(side, [0.036, 0.243, 0.105]), 0.042), "chest", 0.03);
    add(ellipsoid(onSide(side, [0.036, 0.203, -0.095]), [0.046 + fluff, 0.07 + fluff, 0.068 + fluff]), "pelvis", 0.03);
  }
  add(rod([0, 0.24, 0.13], [0, 0.3, 0.208], 0.052 + fluff * 1.5, 0.042 + fluff), "neck", 0.03);
  if (longHair) {
    // The ruff round the neck and down the chest, and the britches behind the thighs.
    add(ellipsoid([0, 0.235, 0.155], [0.078, 0.085, 0.07]), "neck", 0.03);
    add(ellipsoid([0, 0.17, 0.135], [0.05, 0.06, 0.05]), "chest", 0.03);
    for (const side of sides) add(ellipsoid(onSide(side, [0.052, 0.15, -0.12]), [0.034, 0.055, 0.042]), `thigh${side}`, 0.025);
  }

  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.01, shoulder[2]], elbow, 0.034, 0.024), `upper${side}`, 0.03);
    add(rod(elbow, wrist, 0.022, 0.0175), `fore${side}`, 0.012);
    add(ellipsoid([wrist[0], wrist[1] - 0.022, wrist[2] + 0.012], [0.021, 0.014, 0.027]), `paw${side}`, 0.016);

    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.044 + fluff * 0.5, 0.026), `thigh${side}`, 0.03);
    add(rod(knee, hock, 0.022, 0.0155), `shin${side}`, 0.014);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.02, hock[2]], 0.0155, 0.016), `foot${side}`, 0.01);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.012, hock[2] + 0.012], [0.021, 0.014, 0.028]), `toe${side}`, 0.016);
  }

  const tailRadius = (i: number) => {
    const t = i / TAIL_SEGMENTS;
    return longHair ? 0.036 - 0.006 * t : 0.021 - 0.006 * t;
  };
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP + (i === 0 ? 0.03 : 0)];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP + (i === TAIL_SEGMENTS - 1 ? 0.01 : 0)];
    add(rod(a, b, tailRadius(i), tailRadius(i + 1)), `tail${i}` as BoneName, i === 0 ? 0.03 : 0.01);
  }
  return forms;
}

function headForms({ longHair }: Look): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.068, 0.06, 0.06]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.033, sy - 0.019, sz + 0.02]), [0.04 + (longHair ? 0.01 : 0), 0.034, 0.036]), "head", 0.025);
    add(ball(onSide(side, [sx + 0.0135, sy - 0.026, sz + 0.064]), 0.0175), "head", 0.016);
    add(cuppedEar(EAR_SHAPE, EAR, side), `ear${side}`, 0.01);
  }
  add(ellipsoid([sx, sy - 0.042, sz + 0.054], [0.016, 0.011, 0.014]), "head", 0.012);
  add(ellipsoid([sx, sy - 0.008, sz + 0.062], [0.013, 0.011, 0.012]), "head", 0.022);
  return forms;
}

/** The cat's whole mesh for a hair length: body and head together. */
export function sculptCat(look: Look): AnimalMesh {
  return sculpt([
    { forms: bodyForms(look), cell: BODY_CELL, part: PART.body, roughness: look.longHair ? 0.0028 : 0 },
    { forms: headForms(look), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
