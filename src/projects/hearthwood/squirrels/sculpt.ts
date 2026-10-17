import { ball, ellipsoid, rod, roughened, turned, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { cuppedEar, onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, NOSE, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The red squirrel as smooth signed-distance forms, meshed by the shared
 * sculpting: a pear of a body, big haunches over long hind feet, small
 * forepaws, a round head with a short blunt muzzle, cupped ears each topped
 * with a tuft, and a tail as long as the body, fluffed by fine lumps.
 */

const BODY_CELL = 0.0032;
const HEAD_CELL = 0.0022;

function bodyForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.04], end: [0, 0, 0.03] };
  add(ball([0, 0.066, -0.045], 0.036), "pelvis", 0);
  add(ellipsoid([0, 0.066, 0.0], [0.028, 0.03, 0.05]), back, 0.016);
  add(ellipsoid([0, 0.064, 0.038], [0.025, 0.028, 0.03]), "chest", 0.014);
  add(rod([0, 0.068, 0.05], [0, 0.08, 0.072], 0.02, 0.017), "neck", 0.01);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [0.018, 0.06, -0.045]), [0.02, 0.03, 0.032]), "pelvis", 0.012);
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.004, shoulder[2]], elbow, 0.009, 0.0065), `upper${side}`, 0.006);
    add(rod(elbow, wrist, 0.0055, 0.0045), `fore${side}`, 0.003);
    add(ellipsoid([wrist[0], wrist[1] - 0.004, wrist[2] + 0.005], [0.0055, 0.0035, 0.008]), `paw${side}`, 0.003);
    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.014, 0.008), `thigh${side}`, 0.008);
    add(rod(knee, hock, 0.0065, 0.005), `shin${side}`, 0.003);
    // The long hind foot.
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.004, hock[2]], 0.005, 0.0045), `foot${side}`, 0.002);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.003, hock[2] + 0.008], [0.0055, 0.0035, 0.012]), `toe${side}`, 0.003);
  }
  // The tail: slim at its root, bushy all along, its fur fluffed.
  const radius = (i: number) => (i === 0 ? 0.011 : 0.025 + 0.008 * Math.sin((Math.PI * i) / TAIL_SEGMENTS));
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP + (i === 0 ? 0.01 : 0)];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP + (i === TAIL_SEGMENTS - 1 ? 0.012 : 0)];
    add(roughened(rod(a, b, radius(i), i === TAIL_SEGMENTS - 1 ? 0.012 : radius(i + 1)), 0.0022, 0.011), `tail${i}` as BoneName, i === 0 ? 0.012 : 0.01);
  }
  return forms;
}

function headForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.022, 0.021, 0.025]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.012, sy - 0.008, sz + 0.012]), [0.012, 0.012, 0.014]), "head", 0.008);
    add(cuppedEar(EAR_SHAPE, EAR, side), `ear${side}`, 0.003);
    // The tuft on the ear's tip, swept up and back, turned with the ear.
    const at = onSide(side, EAR);
    const mirrored = side === "L" ? 1 : -1;
    const tuft = rod([at[0], at[1] + EAR_SHAPE.height - 0.004, at[2]], [at[0], at[1] + EAR_SHAPE.height + 0.011, at[2] - 0.004], 0.0036, 0.0012);
    add(turned(tuft, at, [0, EAR_SHAPE.turn * mirrored, EAR_SHAPE.splay * mirrored]), `ear${side}`, 0.002);
  }
  add(rod([sx, sy - 0.004, sz + 0.016], [sx, NOSE[1], NOSE[2] - 0.004], 0.013, 0.0068), "muzzle", 0.006);
  add(ellipsoid(NOSE, [0.0045, 0.0035, 0.0032]), "muzzle", 0.002);
  add(ball([sx, sy - 0.014, sz + 0.024], 0.007), "jaw", 0.004);
  return forms;
}

export function sculptSquirrel(): AnimalMesh {
  return sculpt([
    { forms: bodyForms(), cell: BODY_CELL, part: PART.body, roughness: 0 },
    { forms: headForms(), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
