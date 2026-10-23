import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { turned } from "@/shared/lib/three/sdf";
import { animated } from "../animate";
import { BASE_TOP, idleBursts, joins, STANDING, walks, type Gait, type Walking } from "../explorers/figure";
import { declareParts, figureParts } from "../figure-parts";
import { ball, ellipsoid, figureMaterial, form, loft, mergeAll, plinth, rod, sculpt, type Vec3 } from "../forms";
import type { PaletteKey } from "../palette";
import { group } from "../shapes";
import { pawLeg, pawLegJoints, pawStride, restingPaw, type PawAdjust, type PawLeg, type PawRig } from "./quadruped";

/*
 * The Dog: the base game's companion omen, a loyal friend who follows its
 * explorer round the house and runs errands for them between rooms. Read at a
 * glance, from the house's whole-floor distance: a golden dog on all fours,
 * head up and tail up, cream muzzle and chest, soft dark-gold ears flopping,
 * its mouth open in a happy pant and its tail always wagging. Warm, never
 * menacing: no glow, no teeth, no red, nothing a monster has. It faces +z.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const COAT: PaletteKey = "amber";
const EARS: PaletteKey = "ember";
const CREAM: PaletteKey = "boneLight";

const BASE_RADIUS = 0.27;
/** A small dog's quick trot: a short step, so at the house's pace its paws patter, with a bounce at each footfall. */
const DOG_WALK: Walking = { step: 0.2, hop: 0.014 };

/** The middle of the back, where the trunk's two halves turn as the spine flexes. */
const TRUNK = 0.36;
/** The paws' half-height: a planted paw rests on the base. */
const PAW = { height: 0.019 };
const PAW_RADII: Vec3 = [0.025, PAW.height, 0.032];
/** A foreleg: from the shoulder to the elbow, on to the wrist, and down the pastern to the paw. The elbow points
 *  back; mid-swing the pastern flicks back, the paw tucked. */
const FORE = { x: 0.058, top: 0.335, z: 0.15, paw: 0.157, upper: 0.11, lower: 0.105, foot: 0.05, stand: 0.15, fold: -0.6 };
/** A hind leg: from the hip to the stifle, on to the hock, and down to the paw. The stifle points forward and the
 *  hock back, the paw a little ahead of it. */
const HIND = { x: 0.066, top: 0.32, z: -0.15, paw: -0.125, upper: 0.095, lower: 0.095, foot: 0.08, stand: 0.25, fold: -0.5 };
/** Where the head sits on the neck, in the chest's frame. */
const NECK: Vec3 = [0, 0.125, 0.215];
/** Where the tail grows from the hips, in their frame, and the way it points: up and back. */
const TAIL: Vec3 = [0, 0.06, -0.195];
/** The axis the tail wags about: across its length, so it swings side to side. */
const WAG_AXIS = new THREE.Vector3(0, 0.5, 0.87).normalize();

/** The chest, with the shoulders over the forelegs' tops, the neck, and the cream of the chest and throat. */
function chest(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.002, 0.07], [0.076, 0.088, 0.125]), COAT)
    .add(rod([0, 0.03, 0.15], [0, NECK[1] - 0.005, NECK[2]], 0.056, 0.046), COAT, 0.035);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * FORE.x, -0.01, FORE.z - 0.005], [0.037, 0.055, 0.048]), COAT, 0.04);
  return shape
    .add(ellipsoid([0, -0.03, 0.14], [0.055, 0.06, 0.07]), CREAM, 0.03)
    .paint(ellipsoid([0, 0.05, 0.215], [0.04, 0.07, 0.04]), CREAM)
    .geometry(0.009);
}

/** The loins and hips, with the haunches over the hind legs' tops. */
function hips(): THREE.BufferGeometry {
  const shape = sculpt().add(ellipsoid([0, 0.012, -0.07], [0.068, 0.07, 0.135]), COAT);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * HIND.x * 0.85, -0.012, HIND.z], [0.042, 0.062, 0.058]), COAT, 0.04);
  return shape.geometry(0.009);
}

/** Where each eye's white sits, its look turned a little out to the side as a dog's are. */
const EYE = { at: [0.03, 0.056, 0.06] as Vec3, radius: 0.017, out: 0.28 };

/** The head: a round skull with soft brows, full cheeks, a cream muzzle and a black nose, and big friendly eyes
 *  (white, a warm brown iris, a glint). The lower jaw hangs from it, open in a pant. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.045, 0.01], [0.066, 0.062, 0.07]), COAT)
    .add(ellipsoid([0, 0.022, 0.1], [0.037, 0.031, 0.06]), CREAM, 0.028)
    .add(ellipsoid([0, 0.04, 0.158], [0.02, 0.015, 0.014]), "soot", 0.008)
    .paint(ellipsoid([0, 0.07, 0.07], [0.012, 0.03, 0.03]), CREAM)
    .paint(ellipsoid([0, -0.011, 0.1], [0.028, 0.011, 0.05]), "blood");
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.034, 0.018, 0.045], [0.034, 0.034, 0.04]), COAT, 0.02);
    shape.add(ellipsoid([side * 0.03, 0.074, 0.06], [0.024, 0.014, 0.02]), COAT, 0.015);
    const eye: Vec3 = [side * EYE.at[0], EYE.at[1], EYE.at[2]];
    const look = new THREE.Vector3(side * EYE.out, 0.05, 1).normalize();
    const on = (depth: number): Vec3 => [eye[0] + look.x * depth, eye[1] + look.y * depth, eye[2] + look.z * depth];
    shape.carve(ball(on(0.006), EYE.radius), { blend: 0.006 });
    shape.add(ball(eye, EYE.radius), CREAM);
    shape.paint(ball(on(EYE.radius), 0.012), "woodDark");
    shape.paint(ball(on(EYE.radius + 0.002), 0.006), "void");
    const glint = on(EYE.radius);
    shape.paint(ball([glint[0] - side * 0.004, glint[1] + 0.005, glint[2]], 0.0035), CREAM);
  }
  return shape.geometry(0.006);
}

/** The jaw's hinge, in the head's frame, at the back of the mouth. */
const JAW: Vec3 = [0, 0.004, 0.05];

/** The lower jaw, from its hinge, with the tongue lolling over its front. */
function jaw(): THREE.BufferGeometry {
  const bone = sculpt().add(ellipsoid([0, -0.012, 0.052], [0.029, 0.015, 0.046]), CREAM).geometry(0.006);
  const tongue = loft(
    [
      { at: [0, -0.002, 0.03], radius: [0.016, 0.005], colour: "bloodLight" },
      { at: [0, 0.0, 0.08], radius: [0.018, 0.005], colour: "bloodLight" },
      { at: [0, -0.016, 0.104], radius: [0.017, 0.005], colour: "bloodLight" },
      { at: [0, -0.04, 0.108], radius: [0.014, 0.004], colour: "bloodLight" },
    ],
    { sides: 10 },
  );
  return mergeAll([bone, tongue]);
}

/** A floppy ear hanging from its root on the top of the head. */
function ear(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([side * 0.012, -0.044, 0.004], [0.013, 0.056, 0.034]), EARS)
    .add(ellipsoid([side * 0.006, -0.006, 0.002], [0.012, 0.016, 0.026]), EARS, 0.012)
    .geometry(0.0055);
}

/** The tail from its root, up and back, and its white-tipped end, which wags a beat behind. */
const TAIL_ROOT_LENGTH: Vec3 = [0, 0.09, -0.05];
function tailRoot(): THREE.BufferGeometry {
  return loft(
    [
      { at: [0, 0, 0], radius: 0.024, colour: COAT },
      { at: [0, 0.05, -0.035], radius: 0.022, colour: COAT },
      { at: TAIL_ROOT_LENGTH, radius: 0.018, colour: COAT },
    ],
    { sides: 12 },
  );
}
function tailTip(): THREE.BufferGeometry {
  return loft(
    [
      { at: [0, 0, 0], radius: 0.019, colour: COAT },
      { at: [0, 0.04, -0.004], radius: 0.017, colour: COAT },
      { at: [0, 0.066, 0.006], radius: 0.013, colour: CREAM },
      { at: [0, 0.082, 0.016], radius: 0.008, colour: CREAM },
    ],
    { sides: 12 },
  );
}

/** A leg's three segments, each hanging from its pivot: the upper tapering into the lower's round top at the middle
 *  joint, and the foot ending in a cream paw, built turned so it lies level as the foot stands. */
function legParts({ upper, lower, foot, stand }: typeof FORE, radii: readonly [number, number, number, number], sock: number) {
  const [top, middle, ankle, end] = radii;
  const paw = turned(ellipsoid([0, -foot, 0.006], PAW_RADII), [0, -foot, 0], [stand, 0, 0]);
  return [
    sculpt().add(rod([0, 0.015, 0], [0, -upper, 0], top, middle - 0.003), COAT).geometry(0.007),
    sculpt()
      .add(rod([0, 0, 0], [0, -lower, 0], middle, ankle - 0.002), COAT)
      .paint((_, y) => y + lower * (1 - sock), CREAM)
      .geometry(0.006),
    sculpt().add(rod([0, 0, 0], [0, -foot, 0], ankle, end), CREAM).add(paw, CREAM, 0.012).geometry(0.0055),
  ] as const;
}

function meshParts() {
  return {
    base: plinth(BASE_RADIUS, BASE_RADIUS - 0.018, BASE_TOP, "boneDark"),
    chest: chest(),
    hips: hips(),
    head: head(),
    jaw: jaw(),
    ears: [ear(-1), ear(1)],
    tail: { root: tailRoot(), tip: tailTip() },
    fore: legParts(FORE, [0.034, 0.027, 0.02, 0.017], 0.5),
    hind: legParts(HIND, [0.034, 0.026, 0.019, 0.016], 0.25),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const DOG_PARTS = figureParts("dog", meshParts);
declareParts(dog, [DOG_PARTS]);

function named<T extends THREE.Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

/** The Dog. */
export function dog(seed = "dog", gait: Gait = STANDING): THREE.Group {
  const parts = DOG_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => named(form(material, geometry), name);

  const front = group(mesh(parts.chest, "chest"));
  const rear = group(mesh(parts.hips, "hips"));
  const trunk = group(front, rear);
  trunk.position.y = TRUNK;

  const legOf = (side: -1 | 1, spec: typeof FORE, built: typeof parts.fore, half: THREE.Object3D, bend: -1 | 1, label: string): PawLeg => {
    const name = `${side < 0 ? "right" : "left"} ${label}`;
    const leg = pawLeg(
      [mesh(built[0], `${name} upper`), mesh(built[1], `${name} lower`), mesh(built[2], `${name} paw`)],
      new THREE.Vector3(side * spec.x, spec.top - TRUNK, spec.z),
      spec,
      restingPaw(side * spec.x, spec.paw, PAW),
      { bend, stand: spec.stand, fold: spec.fold },
    );
    half.add(leg.hip);
    return leg;
  };
  const legs = [
    legOf(-1, FORE, parts.fore, front, -1, "foreleg"),
    legOf(1, FORE, parts.fore, front, -1, "foreleg"),
    legOf(-1, HIND, parts.hind, rear, 1, "hind leg"),
    legOf(1, HIND, parts.hind, rear, 1, "hind leg"),
  ] as const;

  const headPart = mesh(parts.head, "head");
  const jawPart = mesh(parts.jaw, "jaw");
  const hinge = group(jawPart);
  hinge.position.set(...JAW);
  const ears = ([-1, 1] as const).map((side, i) => {
    const pivot = group(mesh(parts.ears[i], side < 0 ? "right ear" : "left ear"));
    pivot.position.set(side * 0.058, 0.086, 0);
    return { pivot, side };
  });
  const headPivot = group(headPart, hinge, ...ears.map(({ pivot }) => pivot));
  headPivot.position.set(...NECK);
  front.add(headPivot);

  const tipPart = mesh(parts.tail.tip, "tail tip");
  const tip = group(tipPart);
  tip.position.set(...TAIL_ROOT_LENGTH);
  const rootPart = mesh(parts.tail.root, "tail");
  const tail = group(rootPart, tip);
  tail.position.set(...TAIL);
  rear.add(tail);

  const base = mesh(parts.base, "base");
  const figure = group(base, trunk);
  const chestPart = front.children[0];
  const hipsPart = rear.children[0];
  joins(figure, [
    // The spine flexes where the chest meets the hips.
    { parts: [chestPart, hipsPart], at: trunk, radius: 0.13 },
    { parts: [headPart, chestPart], at: headPivot, radius: 0.08 },
    { parts: [jawPart, headPart], at: hinge, radius: 0.12 },
    ...ears.map(({ pivot }) => ({ parts: [pivot.children[0], headPart] as const, at: pivot, radius: 0.04 })),
    { parts: [rootPart, hipsPart], at: tail, radius: 0.05 },
    { parts: [tipPart, rootPart], at: tip, radius: 0.035 },
    ...legs.flatMap((leg, i) => pawLegJoints(leg, [chestPart, hipsPart], { top: (i < 2 ? FORE : HIND).upper + 0.035, knee: 0.05, ankle: 0.045 })),
  ]);

  const rig: PawRig = {
    walking: DOG_WALK,
    legs,
    trunk,
    front,
    rear,
    // A trot: each diagonal pair of paws falls together.
    walk: { lands: [0, 0.5, 0.5, 0], stance: 0.5, lift: 0.04 },
    // A gallop: the hind paws fall one after the other, then the forepaws, and all four leave the base between.
    run: { lands: [0.55, 0.45, 0, 0.1], stance: 0.27, lift: 0.055, arch: 0.12, gathered: 0.95, rock: 0.06, spread: { across: [-0.01, 0.024], along: [0.02, 0.025] } },
  };

  const rng = createRng(seed);
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    tilt: { every: 7, lasts: 2.4, chance: 0.6 },
    sniff: { every: 9, lasts: 3.4, chance: 0.5 },
    bow: { every: 13, lasts: 3.2, chance: 0.45 },
  });
  let bowing = 0;
  const stretchForepaws: PawAdjust = (leg, at) => {
    if (leg < 2) at.paw.z += 0.06 * bowing;
  };

  return walks(
    animated(figure, (clock) => {
      const seconds = clock + offset;
      const stride = gait(clock);
      const still = 1 - stride.amount;
      const run = stride.running ? stride.amount : 0;
      const played = bursts(clock);
      const tilt = played.tilt.amount * still;
      const sniff = played.sniff.amount * still;
      const bow = played.bow.amount * still;
      bowing = bow;

      // A happy pant, quick and shallow, the mouth shutting to sniff or to wonder.
      const pant = Math.sin(seconds * Math.PI * 2 * 2.4);
      const sway = Math.sin((seconds / 2.9) * Math.PI * 2);
      trunk.position.set(sway * 0.006 * still, TRUNK + pant * 0.002 - sniff * 0.035 - bow * 0.05, 0);
      trunk.rotation.set(bow * 0.3, 0, sway * 0.02 * still);
      front.rotation.x = sniff * 0.28;
      rear.rotation.x = 0;
      chestPart.scale.setScalar(1 + pant * 0.006);

      const step = pawStride(rig, stride, stretchForepaws);

      // The head looks about, cocks to one side to wonder, goes down to sniff the floor, and looks up out of a bow.
      const look = Math.sin((seconds / 4.3) * Math.PI * 2) * 0.22 + Math.sin((seconds / 1.7) * Math.PI * 2) * 0.05;
      const side = played.tilt.pick < 0.5 ? -1 : 1;
      headPivot.rotation.set(
        sniff * (0.75 + Math.sin(seconds * Math.PI * 2 * 3.5) * 0.06) - bow * 0.34 - step.bounce * 1.5 - run * 0.1,
        look * still * (1 - sniff),
        side * tilt * 0.42,
        "YXZ",
      );
      hinge.rotation.x = (0.12 + pant * 0.05) * (1 - Math.max(tilt, sniff)) + bow * 0.06 + run * 0.04;
      for (const { pivot, side: earSide } of ears) {
        // Ears hang soft beside the face, flop with each bounce, perk up to wonder, and stream back running.
        pivot.rotation.set(-tilt * 0.35 + step.bounce * 9 + run * 0.9 + stride.amount * Math.sin(stride.phase * 2) * 0.12, 0, earSide * (0.24 + tilt * 0.25));
      }

      // The tail never stops wagging: faster out of a bow, a beat behind at its tip, streaming out behind at a run.
      const beat = Math.sin(seconds * Math.PI * 2 * (2.1 + bow * 1.4));
      const lag = Math.sin(seconds * Math.PI * 2 * (2.1 + bow * 1.4) - 1.1);
      const swing = 0.5 * (1 - run * 0.7) + bow * 0.2;
      tail.quaternion.setFromAxisAngle(WAG_AXIS, beat * swing);
      tail.rotateX(bow * 0.2 - run * 0.8);
      tip.quaternion.setFromAxisAngle(WAG_AXIS, lag * swing * 0.6);
    }),
    DOG_WALK,
  );
}
