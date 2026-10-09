import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { BASE_TOP, burst, reach, STANDING, walks, type Gait } from "../explorers/figure";
import {
  ball,
  ellipsoid,
  figureMaterial,
  form,
  intersect,
  loft,
  mergeAll,
  onSurface,
  plinth,
  rod,
  roughened,
  sculpt,
  skin,
  union,
  type Section,
  type Solid,
  type Vec3,
} from "../forms";
import { paletteHex, type PaletteKey } from "../palette";
import { group } from "../shapes";
import { ghostly, type MonsterOptions } from "./base";

/*
 * The Spider of haunt 04: a giant red-kneed tarantula, a threat to any
 * explorer. Read at a glance, from the house's whole-floor distance: eight
 * long, thin legs arched high above a low body, smouldering red so their
 * lines show on the darkest floor, each knee a pale knob at the top of its
 * arch with a glowing red band below it and each ankle banded red again, so
 * every leg reads as jointed, not as a tube; a bloated black abdomen with the
 * traitor's red chevrons glowing along its curve, the body smouldering more
 * faintly so it never sinks into a dark floor; big jaws with pale fangs, and
 * eight red eyes on a turret at the front. It faces +z.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const BASE_RADIUS = 1.15;
const BODY_HEIGHT = 0.52;
const FEMUR = 0.8;
const TIBIA = 1.0;
const LEGS = [
  { hip: 0.42, angle: 28, reach: 1.02 },
  { hip: 0.3, angle: 62, reach: 0.98 },
  { hip: 0.18, angle: 112, reach: 0.96 },
  { hip: 0.06, angle: 148, reach: 1.04 },
] as const;
const HIP_X = 0.2;
const FOOT_TRAVEL = 0.27;
const ABDOMEN = { centre: [0, 0.2, -0.52] as Vec3, radii: [0.42, 0.38, 0.6] as Vec3 };

/** The traitor's red smouldering in its chitin, so a dark body never sinks into a dark floor. */
function chitin(material: THREE.MeshLambertMaterial, glow: PaletteKey = "bloodDark", intensity = 0.45): THREE.MeshLambertMaterial {
  material.emissive.set(paletteHex(glow));
  material.emissiveIntensity = intensity;
  return material;
}

/** Short stiff bristles standing out of a limb segment, as a tarantula's: thin
 *  points round the segment from `top` down to `bottom` (both ≤ 0), at
 *  radii given along it, each leaning down the limb. */
function bristles(top: number, bottom: number, radiusAt: (y: number) => number, count: number, seed: number, colour: PaletteKey): THREE.BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => {
    const y = top + ((bottom - top) * (i + 0.5)) / count;
    const angle = i * 2.39996 + seed;
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const root = out.clone().multiplyScalar(radiusAt(y) * 0.8).setY(y);
    const tip = out.clone().multiplyScalar(radiusAt(y) + 0.045).setY(y - 0.035);
    return loft(
      [
        { at: root.toArray(), radius: 0.009, colour },
        { at: tip.toArray(), radius: 0.004, colour },
      ],
      { sides: 4, ends: ["flat", "point"] },
    );
  });
}

/** A leg segment hanging from its pivot: a tube through its profile of
 *  [height, radius, colour] sections, top down, banded in their colours. */
function segment(profile: readonly [number, number, PaletteKey][], end: "round" | "point"): THREE.BufferGeometry {
  const sections: Section[] = profile.map(([y, radius, colour]) => ({ at: [0, y, 0], radius, colour }));
  return loft(sections, { sides: 12, ends: ["round", end] });
}

function profileRadius(profile: readonly [number, number, PaletteKey][]): (y: number) => number {
  return (y) => {
    for (let i = 1; i < profile.length; i++) {
      const [y0, r0] = profile[i - 1];
      const [y1, r1] = profile[i];
      if (y <= y0 && y >= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return profile[profile.length - 1][1];
  };
}

/** The upper leg, from the hip's knob to the knee: thin and dark. */
const FEMUR_PROFILE: readonly [number, number, PaletteKey][] = [
  [0.05, 0.064, "ash"],
  [-0.04, 0.068, "soot"],
  [-0.12, 0.06, "soot"],
  [-0.42, 0.058, "soot"],
  [-0.74, 0.05, "soot"],
  [-FEMUR + 0.01, 0.056, "soot"],
];
/** The long lower leg: the knee's pale knob, a dark shank, the ankle and a
 *  dark foot tapering to a claw. The red bands that glow at the knee and
 *  ankle are drawn over it (`BANDS`). */
const TIBIA_PROFILE: readonly [number, number, PaletteKey][] = [
  [0.075, 0.07, "boneDark"],
  [0, 0.082, "boneDark"],
  [-0.05, 0.062, "boneDark"],
  [-0.08, 0.056, "soot"],
  [-0.42, 0.048, "soot"],
  [-0.64, 0.04, "soot"],
  [-0.72, 0.042, "ash"],
  [-0.78, 0.036, "soot"],
  [-0.9, 0.028, "soot"],
  [-TIBIA + 0.04, 0.018, "soot"],
];
/** The glowing red bands round each lower leg, from its knee: [middle, half height]. */
const BANDS: readonly [number, number][] = [
  [-0.115, 0.04],
  [-0.69, 0.028],
];

/** The head-and-chest: a domed carapace with a groove, the eye turret, the
 *  knobs the legs turn in, and the waist to the abdomen. */
function thorax(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.03, 0.27], [0.27, 0.16, 0.34]), "ash")
    .add(ellipsoid([0, 0.12, 0.46], [0.17, 0.09, 0.12]), "ash", 0.07)
    .add(rod([0, 0.0, 0.05], [0, 0.04, -0.06], 0.08, 0.07), "sootLight", 0.04)
    .carve(ball([0, 0.22, 0.24], 0.04), { blend: 0.04, colour: "sootLight" })
    .paint((_, y) => (y < -0.05 ? -1 : 1), "sootLight");
  for (const side of [-1, 1]) for (const { hip } of LEGS) shape.add(ball([side * HIP_X, 0, hip], 0.085), "sootLight", 0.05);
  return shape.geometry(0.014);
}

/** The right-hand eyes, as the original's, a little larger: [x, y, z, radius]; the left mirror them. */
const EYES: readonly [number, number, number, number][] = [
  [0.055, 0.12, 0.62, 0.054],
  [0.15, 0.12, 0.56, 0.038],
  [0.08, 0.19, 0.55, 0.034],
  [0.17, 0.17, 0.48, 0.03],
];

function eyes(): THREE.BufferGeometry {
  return mergeAll(
    EYES.flatMap(([x, y, z, radius]) =>
      [-1, 1].map((side) => {
        const geometry = new THREE.SphereGeometry(radius, 14, 10);
        geometry.translate(side * x, y, z);
        geometry.deleteAttribute("uv");
        return geometry;
      }),
    ),
  );
}

function abdomenSolid(): Solid {
  return union(
    ellipsoid(ABDOMEN.centre, ABDOMEN.radii),
    ellipsoid([0, 0.2, -0.3], [0.31, 0.28, 0.3]),
  );
}

/** The bloated abdomen, with its spinnerets. */
function abdomen(solid: Solid): THREE.BufferGeometry {
  const shape = sculpt().add(roughened(solid, 0.01, 0.07), "sootLight");
  for (const side of [-1, 1]) shape.add(rod([side * 0.045, 0.12, -1.06], [side * 0.06, 0.15, -1.16], 0.035, 0.018), "ash", 0.03);
  return shape.geometry(0.02);
}

/** The traitor's red chevrons down its back, pointing forward and smaller
 *  towards the tail: lying in a thin skin over the abdomen, so they follow its curve. */
function markings(solid: Solid): THREE.BufferGeometry {
  const [cx, cy, cz] = ABDOMEN.centre;
  const [, ry, rz] = ABDOMEN.radii;
  const on = (point: Vec3) => onSurface(solid.distance, point);
  const chevrons = [-0.35, 0.05, 0.45, 0.8].map((along, i) => {
    const size = 1 - i * 0.2;
    const [w, h, t] = [0.2 * size, 0.13 * size, 0.07 * size];
    const apex = new THREE.Vector3(...on([cx, cy + ry * Math.cos(along), cz - rz * Math.sin(along)]));
    // Forward along the surface, towards the head.
    const forward = new THREE.Vector3(0, Math.sin(along), Math.cos(along));
    const arm = (sideways: number) => on(apex.clone().addScaledVector(forward, -h).add(new THREE.Vector3(sideways * w, 0, 0)).toArray());
    const middle = (sideways: number) => on(apex.clone().addScaledVector(forward, -h / 2).add(new THREE.Vector3((sideways * w) / 2, 0, 0)).toArray());
    const tip = apex.toArray();
    return union(rod(tip, middle(-1), t / 2), rod(middle(-1), arm(-1), t / 2), rod(tip, middle(1), t / 2), rod(middle(1), arm(1), t / 2));
  });
  return sculpt().add(intersect(skin(solid, -0.01, 0.012), union(...chevrons)), "scarlet").geometry(0.008);
}

/** One of the pair of jaws under the eyes, hanging from its root: a heavy
 *  chelicera and its curved pale fang, curling in towards the middle. */
function jaw(side: -1 | 1): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.08, 0], [0.058, 0.115, 0.064]), "ash")
    .add(ellipsoid([0, -0.15, 0.01], [0.045, 0.05, 0.05]), "sootLight", 0.03);
  const fang = loft(
    [
      { at: [side * 0.01, -0.17, 0.02], radius: 0.026, colour: "boneDark" },
      { at: [-side * 0.01, -0.23, 0.04], radius: 0.019, colour: "boneDark" },
      { at: [-side * 0.03, -0.28, 0.02], radius: 0.01, colour: "boneDark" },
    ],
    { sides: 8, ends: ["round", "point"] },
  );
  return mergeAll([shape.geometry(0.01), fang]);
}

function palpSegment(length: number, from: number, to: number, end: PaletteKey): THREE.BufferGeometry {
  return segment(
    [
      [0.01, from, "ash"],
      [-length * 0.5, (from + to) / 2 + 0.004, "ash"],
      [-length + 0.02, to, end],
      [-length, to * 0.9, end],
    ],
    "round",
  );
}

function meshParts() {
  const belly = abdomenSolid();
  return {
    base: plinth(BASE_RADIUS, BASE_RADIUS - 0.02, BASE_TOP, "soot", 96),
    thorax: thorax(),
    eyes: eyes(),
    abdomen: abdomen(belly),
    markings: markings(belly),
    jaws: [jaw(1), jaw(-1)],
    palps: { root: palpSegment(0.22, 0.034, 0.03, "ash"), tip: palpSegment(0.2, 0.03, 0.026, "sootLight") },
    femurs: [0, 1, 2, 3].map((i) =>
      mergeAll([segment(FEMUR_PROFILE, "round"), ...bristles(-0.12, -0.7, profileRadius(FEMUR_PROFILE), 10, i * 1.3, "stoneDark")]),
    ),
    band: (() => {
      const tube = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
      tube.deleteAttribute("uv");
      return tube;
    })(),
    tibias: [0, 1, 2, 3].map((i) =>
      mergeAll([segment(TIBIA_PROFILE, "point"), ...bristles(-0.2, -0.62, profileRadius(TIBIA_PROFILE), 10, i * 0.7, "stoneDark")]),
    ),
  };
}
type Parts = ReturnType<typeof meshParts>;
/** Meshed once on first use and shared by every spider: none of it depends on the seed. */
let meshed: Parts | undefined;

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  at: THREE.Vector3;
  foot: THREE.Vector3;
  side: -1 | 1;
  set: 0 | 1;
}

function leg(side: -1 | 1, index: number, material: THREE.Material, parts: Parts): Leg {
  const { hip: hipZ, angle, reach: distance } = LEGS[index];
  const knee = group(form(material, parts.tibias[index]));
  knee.position.y = -FEMUR;
  const hip = group(form(material, parts.femurs[index]), knee);
  const at = new THREE.Vector3(side * HIP_X, 0, hipZ);
  hip.position.copy(at);
  const radians = (angle * Math.PI) / 180;
  const foot = new THREE.Vector3(side * Math.sin(radians) * distance, BASE_TOP, 0.12 + Math.cos(radians) * distance);
  const set = ((index + (side === 1 ? 0 : 1)) % 2) as 0 | 1;
  return { hip, knee, at, foot, side, set };
}

/** The Spider. */
export function spider(seed = "spider", gait: Gait = STANDING, { stunned = false }: MonsterOptions = {}): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const material = chitin(figureMaterial());
  // The legs smoulder brighter than the body, so their lines show on the darkest floor.
  const legMaterial = chitin(figureMaterial(), "blood", stunned ? 0.3 : 0.5);
  const red = ghostly(stunned ? "blood" : "scarlet");

  const abdomenPivot = group(form(material, parts.abdomen), form(red, parts.markings));
  abdomenPivot.position.set(0, 0.04, 0.0);
  abdomenPivot.rotation.x = -0.12;

  const legs: Leg[] = [];
  for (const side of [1, -1] as const) for (let i = 0; i < LEGS.length; i++) legs.push(leg(side, i, legMaterial, parts));
  const jaws = ([1, -1] as const).map((side, i) => {
    const piece = group(form(material, parts.jaws[i]));
    piece.position.set(side * 0.06, 0.02, 0.6);
    piece.rotation.x = 0.35;
    return piece;
  });
  const palps = ([1, -1] as const).map((side) => {
    const tip = group(form(material, parts.palps.tip));
    tip.position.y = -0.2;
    const root = group(form(material, parts.palps.root), tip);
    root.position.set(side * 0.13, 0.02, 0.56);
    return { root, tip };
  });
  const body = group(form(material, parts.thorax), abdomenPivot, form(red, parts.eyes), ...jaws, ...palps.map((p) => p.root), ...legs.map((l) => l.hip));

  // Every leg's glowing bands, drawn in one call, follow the legs each frame.
  const bands = new THREE.InstancedMesh(parts.band, red, legs.length * BANDS.length);
  bands.frustumCulled = false;
  body.add(bands);
  const tibiaRadius = profileRadius(TIBIA_PROFILE);
  const bandShapes = BANDS.map(([y, half]) => {
    const radius = tibiaRadius(y) + 0.008;
    return new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(radius, half * 2, radius));
  });
  const placed = new THREE.Matrix4();

  const figure = group(form(figureMaterial(), parts.base), body);

  const rng = createRng(seed);
  const offset = rng.next() * 100;
  const breathPhase = rng.next() * Math.PI * 2;
  const toBody = new THREE.Matrix4();
  const target = new THREE.Vector3();
  const bend = new THREE.Vector3();

  return walks(animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.1) * Math.PI * 2 + breathPhase);
    const stride = gait(clock);
    const rear = stunned ? 0 : burst(seconds, `${seed}:rear`, { every: 10, lasts: 3.2, chance: 0.65 }).amount * (1 - stride.amount);

    body.position.set(0, stunned ? 0.3 : BODY_HEIGHT + breath * 0.012 + rear * 0.12 - stride.amount * 0.08, stunned ? 0.05 : -rear * 0.12);
    body.rotation.x = stunned ? 0.08 : -rear * 0.32 + stride.amount * 0.04;
    body.rotation.z = stunned ? 0.06 : 0;
    abdomenPivot.scale.setScalar(1 + breath * 0.02);
    abdomenPivot.rotation.x = -0.12 + rear * 0.25 + (stunned ? 0.18 : 0);
    body.updateMatrix();
    toBody.copy(body.matrix).invert();

    legs.forEach((limb, i) => {
      if (stunned) {
        target.set(limb.foot.x - limb.at.x, 0, limb.foot.z - limb.at.z).setLength(0.47).add(limb.at);
        target.y = -0.18;
        bend.set(limb.side, 1.2, 0);
      } else {
        target.copy(limb.foot);
        if (rear > 0 && i % LEGS.length === 0) {
          target.lerp(new THREE.Vector3(limb.side * 0.45, 1.55, 1.05), rear);
        }
        if (stride.amount > 0) {
          const cycle = stride.phase + limb.set * Math.PI;
          target.z += Math.sin(cycle) * FOOT_TRAVEL * stride.amount;
          target.y += Math.max(0, Math.cos(cycle)) * 0.16 * stride.amount;
        } else {
          const shift = burst(seconds, `${seed}:leg${i}`, { every: 4.5, lasts: 1, chance: 0.3 });
          target.y += Math.sin(shift.amount * Math.PI) * 0.12;
          target.x += (shift.pick - 0.5) * 0.12 * shift.amount * limb.side;
          target.z += (shift.pick - 0.5) * 0.14 * shift.amount;
        }
        target.applyMatrix4(toBody);
        bend.set(limb.side * 0.5, 1, limb.at.z * 0.5);
      }
      const posed = reach(limb.at, target, FEMUR, TIBIA, bend);
      limb.hip.quaternion.copy(posed.shoulder);
      limb.knee.quaternion.copy(posed.elbow);
      limb.hip.updateMatrix();
      limb.knee.updateMatrix();
      bandShapes.forEach((shape, j) => bands.setMatrixAt(i * BANDS.length + j, placed.multiplyMatrices(limb.hip.matrix, limb.knee.matrix).multiply(shape)));
    });

    bands.instanceMatrix.needsUpdate = true;

    palps.forEach(({ root, tip }, i) => {
      const twitch = burst(seconds, `${seed}:palp${i}`, { every: 2.2, lasts: 0.6, chance: 0.6 }).amount;
      root.rotation.x = stunned ? 1.2 : 0.55 + twitch * 0.35 - rear * 0.3;
      root.rotation.z = (i ? -1 : 1) * 0.15;
      tip.rotation.x = stunned ? -1.4 : -0.9 + twitch * 0.3;
    });
    jaws.forEach((piece, i) => {
      piece.rotation.z = (i ? 1 : -1) * (0.05 + rear * 0.3 + (stunned ? 0 : Math.max(0, Math.sin(seconds * 3.7)) * 0.05));
    });
  }), { step: FOOT_TRAVEL * 2, hop: 0 });
}
