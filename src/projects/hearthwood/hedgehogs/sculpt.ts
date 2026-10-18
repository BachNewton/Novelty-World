import { ball, ellipsoid, rod, type Solid } from "@/shared/lib/three/sdf";
import { TAIL_SEGMENTS, type BoneName, type Vec3 } from "../animals/rig";
import { onSide, PART, sculpt, SIDES as sides, type AnimalMesh, type Follows, type Form } from "../animals/sculpt";
import { EAR, FRONT_LEG, HIND_LEG, HIP, NOSE, NOSE_RADII, SHOULDER, SKULL, TAIL_ROOT, TAIL_STEP } from "./rig";

/*
 * The hedgehog's body as smooth signed-distance forms round its rig's pivots,
 * meshed by the shared sculpting (`animals/sculpt.ts`): a soft round body on
 * tiny legs under a mantle of spines, the mantle's surface raised in a field
 * of small cones so its silhouette bristles (no spine is a card of its own),
 * a pointed snout with a round black nose, beady eyes and little round ears.
 */

const BODY_CELL = 0.0042;
const HEAD_CELL = 0.0028;

/** Spines: cones on a jittered grid this far apart, this tall and this wide at their foot. */
const SPINE = { spacing: 0.0095, height: 0.0095, foot: 0.0064 } as const;

function hash3(i: number, j: number, k: number, salt: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** How far the spines stand out of the mantle at a point: a cone on each jittered grid point near it. */
function spines(x: number, y: number, z: number): number {
  const s = SPINE.spacing;
  // Raked back, as a hedgehog's spines lie: the cones' field is stretched along the body.
  const zz = z * 0.75;
  const ci = Math.floor(x / s);
  const cj = Math.floor(y / s);
  const ck = Math.floor(zz / s);
  let nearest = Infinity;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let k = ck - 1; k <= ck + 1; k++) {
        const px = (i + hash3(i, j, k, 1)) * s;
        const py = (j + hash3(i, j, k, 2)) * s;
        const pz = (k + hash3(i, j, k, 3)) * s;
        nearest = Math.min(nearest, Math.hypot(x - px, y - py, zz - pz));
      }
    }
  }
  return SPINE.height * Math.max(0, 1 - nearest / SPINE.foot);
}

/** The mantle of spines: a dome over the back down to a skirt above the legs, bristling. */
function mantle(): Solid {
  const dome = ellipsoid([0, 0.066, -0.03], [0.07, 0.056, 0.097]);
  const rise = 0.008;
  return {
    distance: (x, y, z) => {
      const d = dome.distance(x, y, z);
      // The skirt stops above the belly, and the spines thin out towards the face.
      const skirt = 0.042 - y;
      const shell = Math.max(d, skirt);
      if (shell > SPINE.height + rise) return shell;
      const where = Math.min(1, Math.max(0, (y - 0.045) / 0.02)) * Math.min(1, Math.max(0, (0.075 - z) / 0.03));
      return shell - spines(x, y, z) * where;
    },
    min: [-0.08, 0.035, -0.13],
    max: [0.08, 0.135, 0.08],
  };
}

function bodyForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.05], end: [0, 0, 0.04] };
  add(ellipsoid([0, 0.054, -0.02], [0.05, 0.038, 0.085]), back, 0);
  add(mantle(), back, 0.004);
  add(ellipsoid([0, 0.054, 0.05], [0.034, 0.034, 0.03]), "neck", 0.012);
  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.006, shoulder[2]], elbow, 0.011, 0.008), `upper${side}`, 0.008);
    add(rod(elbow, wrist, 0.0075, 0.0065), `fore${side}`, 0.004);
    add(ellipsoid([wrist[0], wrist[1] - 0.006, wrist[2] + 0.005], [0.0075, 0.0045, 0.009]), `paw${side}`, 0.004);
    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.012, 0.0085), `thigh${side}`, 0.008);
    add(rod(knee, hock, 0.0075, 0.0065), `shin${side}`, 0.004);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.004, hock[2]], 0.0065, 0.006), `foot${side}`, 0.003);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.004, hock[2] + 0.006], [0.0075, 0.0045, 0.01]), `toe${side}`, 0.004);
  }
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP];
    add(rod(a, b, 0.006 - i * 0.0007, 0.006 - (i + 1) * 0.0007), `tail${i}` as BoneName, 0.003);
  }
  return forms;
}

function headForms(): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.029, 0.026, 0.03]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.016, sy - 0.008, sz + 0.004]), [0.016, 0.017, 0.02]), "head", 0.01);
    add(ellipsoid(onSide(side, EAR), [0.0065, 0.0075, 0.004]), `ear${side}`, 0.004);
  }
  add(rod([sx, sy - 0.006, sz + 0.014], [sx, NOSE[1] + 0.001, NOSE[2] - 0.005], 0.0165, 0.0062), "muzzle", 0.008);
  add(ellipsoid(NOSE, NOSE_RADII), "muzzle", 0.003);
  add(ball([sx, sy - 0.018, sz + 0.03], 0.009), "jaw", 0.006);
  return forms;
}

/** The hedgehog's whole mesh. */
export function sculptHedgehog(): AnimalMesh {
  return sculpt([
    { forms: bodyForms(), cell: BODY_CELL, part: PART.body, roughness: 0 },
    { forms: headForms(), cell: HEAD_CELL, part: PART.head, roughness: 0 },
  ]);
}
