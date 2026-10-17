import { ball, ellipsoid, rod, stretched, turned, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Side, type Vec3 } from "../animals/rig";
import { onSide, PART, placed, sculpt, SIDES as sides, uprightEar, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import type { EarType } from "./dog";
import type { CoatLength } from "./genetics";
import { EAR, FRONT_LEG, HIND_LEG, HIP, NOSE, NOSE_RADII, PRICK_EAR, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The dog's body as smooth signed-distance forms round its rig's pivots, in
 * the bind pose, meshed by the shared sculpting (`animals/sculpt.ts`): a deep
 * chest and a tucked-up loin, legs that stand tall, a muzzle with a nose
 * leather and a jaw that opens, and a tongue that comes out to pant. A
 * sculpture serves every dog with its kind of ears and length of coat; the
 * rest of a dog's build is in its bones. A plush or long coat is a fuller
 * silhouette: a spitz's ruff, britches, a brush of a tail, feathering behind
 * the legs; no fur cards.
 */

export interface DogSculpture {
  ears: EarType;
  coat: CoatLength;
}

const BODY_CELL = 0.011;
const HEAD_CELL = 0.0065;
const FLUFF: Record<CoatLength, number> = { short: 0, medium: 0.008, long: 0.011 };
const ROUGHNESS: Record<CoatLength, number> = { short: 0, medium: 0.0011, long: 0.0017 };

function bodyForms({ coat }: DogSculpture): Form[] {
  const f = FLUFF[coat];
  const plush = coat !== "short";
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.09], end: [0, 0, 0.06] };

  add(ellipsoid([0, 0.24, 0.05], [0.064 + f, 0.082 + f, 0.105]), "chest", 0);
  add(ellipsoid([0, 0.232, 0.12], [0.05 + f, 0.068 + f, 0.05]), "chest", 0.03);
  add(ellipsoid([0, 0.252, -0.05], [0.053 + f, 0.055 + f * 0.6, 0.095]), back, 0.045);
  add(ball([0, 0.258, -0.128], 0.052 + f), "pelvis", 0.04);
  for (const side of sides) {
    add(ball(onSide(side, [0.034, 0.262, 0.1]), 0.044), "chest", 0.03);
    add(ellipsoid(onSide(side, [0.034, 0.226, -0.116]), [0.042 + f, 0.068 + f, 0.062 + f]), "pelvis", 0.03);
  }
  add(rod([0, 0.268, 0.12], [0, 0.342, 0.2], 0.047 + f * 1.5, 0.038 + f), "neck", 0.03);
  if (plush) {
    // The ruff: a mane round the neck and down onto the chest, and britches behind the thighs.
    const ruff = coat === "long" ? 0.008 : 0.002;
    add(ellipsoid([0, 0.292, 0.152], [0.06 + ruff, 0.072 + ruff, 0.06 + ruff]), "neck", 0.03);
    add(ellipsoid([0, 0.205, 0.138], [0.046 + ruff, 0.058, 0.048]), "chest", 0.03);
    for (const side of sides) add(ellipsoid(onSide(side, [0.05, 0.175, -0.142]), [0.03, 0.056, 0.04 + ruff]), `thigh${side}`, 0.025);
  }
  if (coat === "long") {
    // A long coat's fringe along the belly.
    add(ellipsoid([0, 0.17, 0.01], [0.05, 0.03, 0.095]), back, 0.03);
  }

  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.012, shoulder[2]], elbow, 0.033, 0.022), `upper${side}`, 0.03);
    add(rod(elbow, wrist, 0.019, 0.016), `fore${side}`, 0.012);
    add(ellipsoid([wrist[0], wrist[1] - 0.02, wrist[2] + 0.012], [0.021, 0.0155, 0.028]), `paw${side}`, 0.016);
    if (coat === "long") add(ellipsoid([elbow[0], elbow[1] - 0.035, elbow[2] - 0.02], [0.014, 0.045, 0.02]), `fore${side}`, 0.016);

    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.046 + f * 0.5, 0.025), `thigh${side}`, 0.03);
    add(rod(knee, hock, 0.02, 0.015), `shin${side}`, 0.014);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.02, hock[2]], 0.015, 0.0155), `foot${side}`, 0.01);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.013, hock[2] + 0.012], [0.021, 0.0155, 0.029]), `toe${side}`, 0.016);
  }

  // A short coat's tail tapers to a point; a plush one is a brush, thickest along its middle.
  const tailRadius = (i: number) => {
    const t = i / TAIL_SEGMENTS;
    if (coat === "short") return 0.017 - 0.011 * t;
    const brush = coat === "long" ? 0.03 : 0.027;
    return brush * (0.8 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (t > 0.85 ? 1 - (t - 0.85) * 3 : 1);
  };
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP + (i === 0 ? 0.03 : 0)];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP + (i === TAIL_SEGMENTS - 1 ? 0.012 : 0)];
    add(rod(a, b, tailRadius(i), tailRadius(i + 1)), `tail${i}` as BoneName, i === 0 ? 0.03 : 0.012);
  }
  return forms;
}

/** How far up the folded ear bends forward. */
const FOLD = 0.5;

/** An ear in its own frame (its root at the origin), for its kind. */
function earSolid(kind: EarType): Solid {
  if (kind === "prick") return uprightEar(PRICK_EAR);
  if (kind === "fold") {
    // Pricked at its base, its tip falling forward over the fold.
    const shape = { ...PRICK_EAR, width: PRICK_EAR.width * 1.1, height: PRICK_EAR.height * 1.2 };
    const ear = uprightEar(shape);
    const fold = shape.height * FOLD;
    const base: Solid = { ...ear, distance: (x, y, z) => Math.max(ear.distance(x, y, z), y - fold) };
    const tip = turned({ ...ear, distance: (x, y, z) => Math.max(ear.distance(x, y, z), fold - 0.004 - y) }, [0, fold, 0], [2.35, 0, 0]);
    return { distance: (x, y, z) => Math.min(base.distance(x, y, z), tip.distance(x, y, z)), min: [-0.06, -0.06, -0.06], max: [0.06, 0.07, 0.06] };
  }
  // A dropped ear: a soft flap hanging from its root beside the skull, its lower edge tipped out.
  return turned(ellipsoid([0.026, -0.036, 0.004], [0.0055, 0.042, 0.024]), [0, 0, 0], [0.1, 0, 0.06]);
}

function ear(kind: EarType, side: Side): Solid {
  const left = placed(earSolid(kind), EAR);
  const solid = kind === "drop" ? left : turned(left, EAR, [0, PRICK_EAR.turn, PRICK_EAR.splay]);
  return side === "L" ? solid : mirroredSolid(solid);
}

/** A solid reflected across the body's middle. */
function mirroredSolid(solid: Solid): Solid {
  return { distance: (x, y, z) => solid.distance(-x, y, z), min: [-solid.max[0], solid.min[1], solid.min[2]], max: [-solid.min[0], solid.max[1], solid.max[2]] };
}

function headForms({ ears, coat }: DogSculpture): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number, part?: number) => forms.push({ solid, follows, blend, part });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.05, 0.045, 0.05]), "head", 0);
  add(ellipsoid([sx, sy + 0.004, sz + 0.036], [0.03, 0.026, 0.02]), "head", 0.015);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.024, sy - 0.016, sz + 0.014]), [0.03 + (coat === "short" ? 0 : 0.007), 0.028, 0.032]), "head", 0.02);
    // The brows, over the eyes.
    add(ellipsoid(onSide(side, [sx + 0.02, sy + 0.013, sz + 0.036]), [0.012, 0.008, 0.01]), "head", 0.01);
    // The upper lips, hanging a little either side of the jaw.
    add(ellipsoid(onSide(side, [sx + 0.011, sy - 0.025, sz + 0.07]), [0.012, 0.012, 0.034]), "muzzle", 0.01);
    add(ear(ears, side), `ear${side}`, 0.008);
  }
  add(ellipsoid([sx, sy - 0.013, sz + 0.066], [0.0215, 0.0175, 0.042]), "muzzle", 0.016);
  add(ellipsoid(NOSE, NOSE_RADII), "muzzle", 0.006);
  add(ellipsoid([sx, sy - 0.036, sz + 0.058], [0.0165, 0.0105, 0.038]), "jaw", 0.006);
  const tongueFrom: Vec3 = [sx, sy - 0.034, sz + 0.062];
  const tongueTo: Vec3 = [sx, sy - 0.05, sz + 0.098];
  const middle: Vec3 = [sx, (tongueFrom[1] + tongueTo[1]) / 2, (tongueFrom[2] + tongueTo[2]) / 2];
  add(stretched(rod(tongueFrom, tongueTo, 0.009, 0.011), middle, [1, 0.45, 1]), "tongue", 0.003, PART.tongue);
  return forms;
}

/** A dog's whole mesh for its kind of ears and length of coat. */
export function sculptDog(look: DogSculpture): AnimalMesh {
  return sculpt([
    { forms: bodyForms(look), cell: BODY_CELL, part: PART.body, roughness: ROUGHNESS[look.coat] },
    { forms: headForms(look), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
