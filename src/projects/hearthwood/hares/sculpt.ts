import { ball, ellipsoid, rod, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { cuppedEar, onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, NOSE, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The mountain hare as smooth signed-distance forms, meshed by the shared
 * sculpting: a rounded back rising to big haunches, a deep chest on slim
 * forelegs, long hind feet, a blunt head with a soft muzzle and cheeks, tall
 * cupped ears, and a round scut.
 */

const BODY_CELL = 0.0055;
const HEAD_CELL = 0.0036;

function bodyForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.08], end: [0, 0, 0.05] };
  add(ball([0, 0.128, -0.1], 0.062), "pelvis", 0);
  add(ellipsoid([0, 0.13, -0.01], [0.048, 0.058, 0.11]), back, 0.03);
  add(ellipsoid([0, 0.112, 0.075], [0.042, 0.05, 0.05]), "chest", 0.025);
  add(rod([0, 0.122, 0.1], [0, 0.148, 0.135], 0.036, 0.03), "neck", 0.02);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [0.03, 0.112, -0.1]), [0.032, 0.05, 0.055]), "pelvis", 0.02);
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.008, shoulder[2]], elbow, 0.016, 0.011), `upper${side}`, 0.012);
    add(rod(elbow, wrist, 0.009, 0.0075), `fore${side}`, 0.005);
    add(ellipsoid([wrist[0], wrist[1] - 0.005, wrist[2] + 0.008], [0.009, 0.0055, 0.014]), `paw${side}`, 0.005);
    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.026, 0.014), `thigh${side}`, 0.014);
    add(rod(knee, hock, 0.011, 0.008), `shin${side}`, 0.005);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.008, hock[2]], 0.0085, 0.0085), `foot${side}`, 0.004);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.006, hock[2] + 0.012], [0.01, 0.0065, 0.02]), `toe${side}`, 0.005);
  }
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP];
    add(rod(a, b, 0.018 - i * 0.0016, 0.018 - (i + 1) * 0.0016), `tail${i}` as BoneName, 0.008);
  }
  return forms;
}

function headForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.032, 0.032, 0.042]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.018, sy - 0.012, sz + 0.01]), [0.02, 0.02, 0.025]), "head", 0.012);
    add(cuppedEar(EAR_SHAPE, EAR, side), `ear${side}`, 0.004);
  }
  add(rod([sx, sy - 0.006, sz + 0.02], [sx, NOSE[1], NOSE[2] - 0.008], 0.022, 0.012), "muzzle", 0.01);
  add(ellipsoid(NOSE, [0.007, 0.006, 0.005]), "muzzle", 0.004);
  add(ball([sx, sy - 0.022, sz + 0.03], 0.012), "jaw", 0.008);
  return forms;
}

export function sculptHare(): AnimalMesh {
  return sculpt([
    { forms: bodyForms(), cell: BODY_CELL, part: PART.body, roughness: 0 },
    { forms: headForms(), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
