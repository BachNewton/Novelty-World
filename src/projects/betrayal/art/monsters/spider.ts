import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { BASE_TOP, burst, joins, reach, STANDING, walks, type Gait, type Joint } from "../explorers/figure";
import {
  ball,
  drum,
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
  shaped,
  skin,
  solidOf,
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
/** Each leg: its knob on the thorax's rim (across and along, on the left), the way its foot lies (degrees from
 *  straight ahead) and how far off. The knobs ring the thorax, each leg facing its own foot, so neighbouring legs
 *  fan apart from the root and their knees never meet. */
const LEGS = [
  { hip: [0.18, 0.43], angle: 38, reach: 1.02 },
  { hip: [0.245, 0.32], angle: 70, reach: 0.98 },
  { hip: [0.25, 0.2], angle: 108, reach: 0.96 },
  { hip: [0.19, 0.085], angle: 142, reach: 1.04 },
] as const;
/** The middle of the thorax, which the feet lie round. */
const MIDDLE = 0.27;
const FOOT_TRAVEL = 0.2;
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
  [0.05, 0.054, "ash"],
  [-0.04, 0.058, "soot"],
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
    .add(rod([0, 0.0, 0.05], [0, 0.04, -0.16], 0.08, 0.06), "sootLight", 0.04)
    .carve(ball([0, 0.22, 0.24], 0.04), { blend: 0.04, colour: "sootLight" })
    .paint((_, y) => (y < -0.05 ? -1 : 1), "sootLight");
  for (const side of [-1, 1]) for (const { hip } of LEGS) shape.add(ball([side * hip[0], 0, hip[1]], 0.085), "sootLight", 0.05);
  return shape.geometry(0.014);
}

/** The right-hand eyes, as the original's, a little larger: [x, y, z, radius]; the left mirror them. */
const EYES: readonly [number, number, number, number][] = [
  [0.055, 0.12, 0.62, 0.054],
  [0.15, 0.12, 0.56, 0.038],
  [0.08, 0.19, 0.55, 0.034],
  [0.12, 0.18, 0.47, 0.03],
];

function eyes(): THREE.BufferGeometry {
  return mergeAll(
    EYES.flatMap(([x, y, z, radius]) =>
      [-1, 1].map((side) => {
        const geometry = new THREE.SphereGeometry(radius, 14, 10);
        geometry.translate(side * x, y, z);
        geometry.deleteAttribute("uv");
        return shaped(geometry, ball([side * x, y, z], radius));
      }),
    ),
  );
}

function abdomenSolid(): Solid {
  return union(
    ellipsoid(ABDOMEN.centre, ABDOMEN.radii),
    ellipsoid([0, 0.2, -0.3], [0.26, 0.28, 0.3]),
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

/** A leg segment with its bristles merged on. Bristles are hair-fine, so the
 *  segment's solid stands for the whole: two legs' bristles may brush. */
function bristled(segmentGeometry: THREE.BufferGeometry, hairs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const solid = solidOf(segmentGeometry);
  const merged = mergeAll([segmentGeometry, ...hairs]);
  return solid ? shaped(merged, solid) : merged;
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
    femurs: [0, 1, 2, 3].map((i) => bristled(segment(FEMUR_PROFILE, "round"), bristles(-0.12, -0.7, profileRadius(FEMUR_PROFILE), 10, i * 1.3, "stoneDark"))),
    band: (() => {
      const tube = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
      tube.deleteAttribute("uv");
      return shaped(tube, drum([0, 0, 0], 1, 0.5));
    })(),
    tibias: [0, 1, 2, 3].map((i) => bristled(segment(TIBIA_PROFILE, "point"), bristles(-0.2, -0.62, profileRadius(TIBIA_PROFILE), 10, i * 0.7, "stoneDark"))),
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
  /** Where in the stride this leg steps: a wave runs back along each side, each leg a quarter stride behind the one in front, so neighbours never swing together. */
  wave: number;
}

/** A part of the spider, named for the clipping check's findings. */
function named(mesh: THREE.Mesh, name: string): THREE.Mesh {
  mesh.name = name;
  return mesh;
}

function leg(side: -1 | 1, index: number, material: THREE.Material, parts: Parts): Leg {
  const { hip: knob, angle, reach: distance } = LEGS[index];
  const name = `${side < 0 ? "right" : "left"} leg ${index + 1}`;
  const knee = group(named(form(material, parts.tibias[index]), `${name} tibia`));
  knee.position.y = -FEMUR;
  const hip = group(named(form(material, parts.femurs[index]), `${name} femur`), knee);
  const at = new THREE.Vector3(side * knob[0], 0, knob[1]);
  hip.position.copy(at);
  const radians = (angle * Math.PI) / 180;
  // The claw's point rests on the base, not in it.
  const foot = new THREE.Vector3(side * Math.sin(radians) * distance, BASE_TOP + 0.035, MIDDLE + Math.cos(radians) * distance);
  const wave = (index * 0.5 + (side === 1 ? 0 : 1)) * Math.PI;
  return { hip, knee, at, foot, side, wave };
}

/** The Spider. */
export function spider(seed = "spider", gait: Gait = STANDING, { stunned = false }: MonsterOptions = {}): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const material = chitin(figureMaterial());
  // The legs smoulder brighter than the body, so their lines show on the darkest floor.
  const legMaterial = chitin(figureMaterial(), "blood", stunned ? 0.3 : 0.5);
  const red = ghostly(stunned ? "blood" : "scarlet");

  const belly = named(form(material, parts.abdomen), "abdomen");
  const chevrons = named(form(red, parts.markings), "markings");
  const abdomenPivot = group(belly, chevrons);
  abdomenPivot.position.set(0, 0.04, -0.12);
  abdomenPivot.rotation.x = -0.12;

  const legs: Leg[] = [];
  for (const side of [1, -1] as const) for (let i = 0; i < LEGS.length; i++) legs.push(leg(side, i, legMaterial, parts));
  const jaws = ([1, -1] as const).map((side, i) => {
    const piece = group(named(form(material, parts.jaws[i]), side < 0 ? "right jaw" : "left jaw"));
    piece.position.set(side * 0.06, 0.02, 0.6);
    piece.rotation.x = 0.35;
    return piece;
  });
  const palps = ([1, -1] as const).map((side) => {
    const tip = group(named(form(material, parts.palps.tip), side < 0 ? "right palp tip" : "left palp tip"));
    tip.position.y = -0.2;
    const root = group(named(form(material, parts.palps.root), side < 0 ? "right palp" : "left palp"), tip);
    root.position.set(side * 0.15, 0.02, 0.57);
    return { root, tip };
  });
  const thorax = named(form(material, parts.thorax), "thorax");
  const eyes = named(form(red, parts.eyes), "eyes");
  const turret = group();
  turret.position.set(0, 0.15, 0.55);
  const body = group(thorax, abdomenPivot, eyes, turret, ...jaws, ...palps.map((p) => p.root), ...legs.map((l) => l.hip));

  // Every leg's glowing bands, drawn in one call, follow the legs each frame.
  const bands = new THREE.InstancedMesh(parts.band, red, legs.length * BANDS.length);
  bands.name = "bands";
  bands.frustumCulled = false;
  body.add(bands);
  const tibiaRadius = profileRadius(TIBIA_PROFILE);
  const bandShapes = BANDS.map(([y, half]) => {
    const radius = tibiaRadius(y) + 0.008;
    return new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(radius, half * 2, radius));
  });
  const placed = new THREE.Matrix4();

  const figure = group(named(form(figureMaterial(), parts.base), "base"), body);
  const partOf = (pivot: THREE.Object3D) => pivot.children[0];
  joins(figure, [
    // The eyes are set into the turret, the chevrons into the abdomen's skin.
    { parts: [eyes, thorax], at: turret, radius: 0.2 },
    { parts: [chevrons, belly], at: abdomenPivot, radius: 1.2 },
    { parts: [belly, thorax], at: abdomenPivot, radius: 0.32 },
    ...jaws.map((piece): Joint => ({ parts: [partOf(piece), thorax], at: piece, radius: 0.16 })),
    ...palps.flatMap(({ root, tip }): Joint[] => [
      { parts: [partOf(root), thorax], at: root, radius: 0.09 },
      { parts: [partOf(tip), partOf(root)], at: tip, radius: 0.07 },
    ]),
    // A leg turns in its knob on the thorax, folds at the knee, and wears its bands round the shank below it.
    // Each side's legs fan out from knobs set close together along the thorax.
    ...legs.flatMap(({ hip }, i): Joint[] => (i % LEGS.length === LEGS.length - 1 ? [] : [{ parts: [partOf(hip), partOf(legs[i + 1].hip)], at: hip, radius: 0.25 }])),
    ...legs.flatMap(({ hip, knee }): Joint[] => [
      { parts: [partOf(hip), thorax], at: hip, radius: 0.22 },
      { parts: [partOf(hip), partOf(knee)], at: knee, radius: 0.17 },
      { parts: [partOf(hip), bands], at: knee, radius: 0.2 },
    ]),
  ]);

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
    // Rearing, it lowers its abdomen behind it, braced.
    abdomenPivot.rotation.x = -0.12 - rear * 0.12 + (stunned ? 0.18 : 0);
    body.updateMatrix();
    toBody.copy(body.matrix).invert();

    legs.forEach((limb, i) => {
      if (stunned) {
        target.set(limb.foot.x - limb.at.x, 0, limb.foot.z - limb.at.z).setLength(0.8).add(limb.at);
        target.y = -0.17;
        bend.set(0, 1, 0);
      } else {
        target.copy(limb.foot);
        if (rear > 0 && i % LEGS.length === 0) {
          target.lerp(new THREE.Vector3(limb.side * 0.7, 1.45, 1.0), rear);
        }
        if (stride.amount > 0) {
          const cycle = stride.phase + limb.wave;
          target.z += Math.sin(cycle) * FOOT_TRAVEL * stride.amount;
          target.y += Math.max(0, Math.cos(cycle)) * 0.16 * stride.amount;
        } else {
          const shift = burst(seconds, `${seed}:leg${i}`, { every: 4.5, lasts: 1, chance: 0.3 });
          target.y += Math.sin(shift.amount * Math.PI) * 0.12;
          target.x += (shift.pick - 0.5) * 0.12 * shift.amount * limb.side;
          target.z += (shift.pick - 0.5) * 0.14 * shift.amount;
        }
        target.applyMatrix4(toBody);
        // Each knee rises over the line to its own foot, so neighbouring legs, fanning apart, keep their knees apart;
        // a front leg raised to threaten bends its knee out and forward, clear of the carapace.
        bend.set(0, 1, 0);
        if (rear > 0 && i % LEGS.length === 0) bend.lerp(new THREE.Vector3(limb.side * 0.6, 0.4, 1), rear);
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
      // The palps reach down and forward from under the eyes, folding at their joint; stunned, they fold back under.
      root.rotation.x = stunned ? 0.1 : -0.45 - twitch * 0.3 - rear * 0.25;
      root.rotation.z = (i ? -1 : 1) * 0.15;
      tip.rotation.x = stunned ? 1.0 : 0.7 - twitch * 0.3;
    });
    jaws.forEach((piece, i) => {
      // The jaws work apart, each swinging out to its own side.
      piece.rotation.z = (i ? -1 : 1) * (0.05 + rear * 0.15 + (stunned ? 0 : Math.max(0, Math.sin(seconds * 3.7)) * 0.05));
    });
  }), { step: FOOT_TRAVEL * 2, hop: 0 });
}
