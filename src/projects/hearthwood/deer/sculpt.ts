import { ball, chain, ellipsoid, rod, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { cuppedEar, onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, NOSE, PEDICLE, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The roe deer as smooth signed-distance forms, meshed by the shared
 * sculpting: a compact barrel, a deep chest and round haunches, long fine
 * legs ending in small hooves, a long neck, a short head with a blunt black
 * nose and big ears, and on a buck two short antlers, each a beam with a
 * tine forward and one back. A buck and a doe are two sculptures; the
 * antlers are a part of their own for the shader.
 */

export interface DeerSculpture {
  antlers: boolean;
}

/** The antlers' own part, past the shared ones, for the shader to colour. */
export const ANTLER_PART = 3;

const BODY_CELL = 0.0085;
const HEAD_CELL = 0.0055;

function bodyForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.1], end: [0, 0, 0.08] };
  add(ellipsoid([0, 0.312, -0.01], [0.05, 0.064, 0.145]), back, 0);
  add(ellipsoid([0, 0.302, 0.1], [0.046, 0.07, 0.06]), "chest", 0.03);
  add(ball([0, 0.322, -0.13], 0.054), "pelvis", 0.035);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [0.028, 0.3, -0.13]), [0.03, 0.06, 0.05]), "pelvis", 0.025);
    add(ball(onSide(side, [0.028, 0.31, 0.11]), 0.036), "chest", 0.025);
  }
  add(rod([0, 0.32, 0.12], [0, 0.432, 0.205], 0.04, 0.026), "neck", 0.03);
  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.014, shoulder[2]], elbow, 0.028, 0.016), `upper${side}`, 0.025);
    add(rod(elbow, wrist, 0.0105, 0.0085), `fore${side}`, 0.008);
    add(rod([wrist[0], wrist[1] + 0.004, wrist[2]], [wrist[0], wrist[1] - FRONT_LEG[2] + 0.006, wrist[2] + 0.006], 0.0085, 0.0095), `paw${side}`, 0.005);
    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.042, 0.02), `thigh${side}`, 0.025);
    add(rod(knee, hock, 0.012, 0.009), `shin${side}`, 0.008);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.014, hock[2]], 0.009, 0.008), `foot${side}`, 0.005);
    add(rod([hock[0], hock[1] - HIND_LEG[2] + 0.016, hock[2]], [hock[0], hock[1] - HIND_LEG[2] + 0.005, hock[2] + 0.006], 0.0085, 0.0095), `toe${side}`, 0.004);
  }
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP];
    add(rod(a, b, 0.012 - i * 0.0012, 0.012 - (i + 1) * 0.0012), `tail${i}` as BoneName, 0.01);
  }
  return forms;
}

/** A buck's antler: a beam rising and curving a little back, a tine forward from its middle and its tip forking back. */
function antler(side: "L" | "R"): Solid {
  const base = onSide(side, PEDICLE);
  const out = side === "L" ? 1 : -1;
  const p = (x: number, y: number, z: number): Vec3 => [base[0] + x * out, base[1] + y, base[2] + z];
  const beam = chain([p(0, 0, 0), p(0.004, 0.04, -0.004), p(0.008, 0.08, -0.012), p(0.008, 0.105, -0.004)], [0.0075, 0.0062, 0.005, 0.003]);
  const front = rod(p(0.004, 0.045, -0.004), p(0.006, 0.062, 0.016), 0.0045, 0.0025);
  const back = rod(p(0.008, 0.085, -0.012), p(0.008, 0.096, -0.03), 0.0042, 0.0022);
  const burr = ball(p(0, 0.006, 0), 0.0098);
  return {
    distance: (x, y, z) => Math.min(beam.distance(x, y, z), front.distance(x, y, z), back.distance(x, y, z), burr.distance(x, y, z)),
    min: [Math.min(beam.min[0], back.min[0]) - 0.01, base[1] - 0.01, base[2] - 0.045],
    max: [Math.max(beam.max[0], back.max[0]) + 0.01, base[1] + 0.12, base[2] + 0.03],
  };
}

function headForms({ antlers }: DeerSculpture): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number, part?: number) => forms.push({ solid, follows, blend, part });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.03, 0.03, 0.036]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.016, sy - 0.012, sz + 0.016]), [0.016, 0.017, 0.022]), "head", 0.012);
    add(cuppedEar(EAR_SHAPE, EAR, side), `ear${side}`, 0.006);
    if (antlers) add(antler(side), "head", 0.002, ANTLER_PART);
  }
  add(rod([sx, sy - 0.006, sz + 0.02], [sx, NOSE[1] + 0.002, NOSE[2] - 0.008], 0.021, 0.0125), "muzzle", 0.012);
  add(ellipsoid(NOSE, [0.0115, 0.009, 0.007]), "muzzle", 0.004);
  add(rod([sx, sy - 0.026, sz + 0.03], [sx, NOSE[1] - 0.016, NOSE[2] - 0.016], 0.011, 0.007), "jaw", 0.006);
  return forms;
}

export function sculptDeer(look: DeerSculpture): AnimalMesh {
  return sculpt([
    { forms: bodyForms(), cell: BODY_CELL, part: PART.body, roughness: 0 },
    { forms: headForms(look), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
