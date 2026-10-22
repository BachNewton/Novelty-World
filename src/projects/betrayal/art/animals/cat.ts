import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { turned } from "@/shared/lib/three/sdf";
import { animated } from "../animate";
import { BASE_TOP, burst, idleBursts, joins, STANDING, walks, type Gait, type Walking } from "../explorers/figure";
import { declareParts, figureParts } from "../figure-parts";
import { ball, ellipsoid, figureMaterial, form, loft, plinth, rod, sculpt, stretched, type Section, type Vec3 } from "../forms";
import type { PaletteKey } from "../palette";
import { group } from "../shapes";
import { pawLeg, pawLegJoints, pawStride, restingPaw, type PawAdjust, type PawLeg, type PawRig } from "./quadruped";

/*
 * The Cat: Widow's Walk's companion omen, called on for luck before a roll.
 * Read at a glance, from the house's whole-floor distance: a small grey
 * tabby, low and long, with two pointed ears, a white bib and white socks,
 * and its tail held up in a question mark, the tip always moving. Round gold
 * eyes with slit pupils. Smaller than the Dog, slinkier, and cool grey where
 * the Dog is warm gold. It faces +z.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const COAT: PaletteKey = "stoneLight";
const STRIPE: PaletteKey = "stone";
const WHITE: PaletteKey = "boneLight";

const BASE_RADIUS = 0.2;
/** A cat's prowl: one paw at a time, a short step, barely a bounce. */
const CAT_WALK: Walking = { step: 0.15, hop: 0.006 };

/** The middle of the back, where the trunk's two halves turn as the spine flexes. */
const TRUNK = 0.255;
const PAW = { height: 0.013 };
const PAW_RADII: Vec3 = [0.017, PAW.height, 0.021];
/** A foreleg: shoulder to elbow (pointing back), to the wrist, and the short pastern down to a round paw. */
const FORE = { x: 0.032, top: 0.24, z: 0.105, paw: 0.12, upper: 0.078, lower: 0.074, foot: 0.032, stand: 0.12, fold: -0.35 };
/** A hind leg: the long crouched leg of a cat, hip to stifle (pointing forward), to the hock, and down to the paw. */
const HIND = { x: 0.046, top: 0.24, z: -0.1, paw: -0.1, upper: 0.062, lower: 0.062, foot: 0.07, stand: 0.3, fold: -0.45 };
/** Where the head sits on the neck, in the chest's frame. */
const NECK: Vec3 = [0, 0.075, 0.14];
/** Where the tail grows from the hips, in their frame. */
const TAIL: Vec3 = [0, 0.03, -0.155];

/** Tabby stripes: bands across the back and flanks, a little wavy, dark where they cross the upper surface. */
function stripes(spacing: number, width: number, below: number): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const band = Math.abs(Math.cos(((z + Math.sin(x * 40) * 0.006) / spacing) * Math.PI));
    return Math.max(band - width, below - y);
  };
}

/** The chest and shoulders, the neck, and the white bib. */
function chest(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.002, 0.05], [0.05, 0.058, 0.1]), COAT)
    .add(rod([0, 0.02, 0.1], [0, NECK[1] - 0.004, NECK[2]], 0.04, 0.034), COAT, 0.03);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * FORE.x, -0.008, FORE.z], [0.026, 0.042, 0.034]), COAT, 0.03);
  return shape
    .add(ellipsoid([0, -0.016, 0.1], [0.034, 0.04, 0.048]), WHITE, 0.025)
    .paint(ellipsoid([0, 0.035, 0.15], [0.026, 0.05, 0.03]), WHITE)
    .paint(stripes(0.04, 0.3, 0.015), STRIPE)
    .geometry(0.006);
}

/** The loins and haunches, striped. */
function hips(): THREE.BufferGeometry {
  const shape = sculpt().add(ellipsoid([0, 0.008, -0.055], [0.049, 0.05, 0.1]), COAT);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * HIND.x * 0.85, 0, HIND.z], [0.03, 0.042, 0.044]), COAT, 0.03);
  return shape.paint(stripes(0.04, 0.3, 0.0), STRIPE).geometry(0.006);
}

/** Where each eye sits on the face, looking out a little to the side. */
const EYE = { at: [0.023, 0.034, 0.048] as Vec3, radius: 0.014, out: 0.3 };

/** The head: round, with full cheeks, a short white muzzle and a small pink nose, two upright pointed ears, the
 *  tabby's stripes on the brow, and big round gold eyes with slit pupils. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.03, 0.012], [0.05, 0.045, 0.048]), COAT)
    .add(ellipsoid([0, 0.012, 0.052], [0.024, 0.017, 0.02]), WHITE, 0.018)
    .add(ellipsoid([0, 0.023, 0.069], [0.0065, 0.0045, 0.004]), "skinTan", 0.003);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.024, 0.014, 0.034], [0.028, 0.024, 0.026]), COAT, 0.018);
    // An upright ear: a flattened cone, its inside darker.
    const ear = stretched(rod([side * 0.03, 0.058, 0.004], [side * 0.042, 0.1, -0.004], 0.022, 0.003), [side * 0.036, 0.08, 0], [1, 1, 0.45]);
    shape.add(ear, COAT, 0.012);
    shape.paint(ellipsoid([side * 0.037, 0.08, 0.012], [0.01, 0.018, 0.006]), "stoneDark");
    const eye: Vec3 = [side * EYE.at[0], EYE.at[1], EYE.at[2]];
    const look = new THREE.Vector3(side * EYE.out, 0.04, 1).normalize();
    const on = (depth: number): Vec3 => [eye[0] + look.x * depth, eye[1] + look.y * depth, eye[2] + look.z * depth];
    shape.carve(ball(on(0.005), EYE.radius), { blend: 0.005 });
    shape.add(ball(eye, EYE.radius), "gold");
    shape.paint(stretched(ball(on(EYE.radius), 0.009), on(EYE.radius), [0.32, 1, 1]), "void");
    const glint = on(EYE.radius);
    shape.paint(ball([glint[0] - side * 0.004, glint[1] + 0.004, glint[2]], 0.0028), WHITE);
  }
  return shape.paint(stripes(0.016, 0.25, 0.055), STRIPE).geometry(0.0045);
}

/** A leg's three segments, each hanging from its pivot, the foot ending in a white paw built level. */
function legParts({ upper, lower, foot, stand }: typeof FORE, radii: readonly [number, number, number, number], sock: number) {
  const [top, middle, ankle, end] = radii;
  const paw = turned(ellipsoid([0, -foot, 0.004], PAW_RADII), [0, -foot, 0], [stand, 0, 0]);
  return [
    sculpt().add(rod([0, 0.01, 0], [0, -upper, 0], top, middle - 0.002), COAT).paint(stripes(0.03, 0.3, -1), STRIPE).geometry(0.005),
    sculpt()
      .add(rod([0, 0, 0], [0, -lower, 0], middle, ankle - 0.0015), COAT)
      .paint((_, y) => y + lower * (1 - sock), WHITE)
      .geometry(0.0045),
    sculpt().add(rod([0, 0, 0], [0, -foot, 0], ankle, end), WHITE).add(paw, WHITE, 0.008).geometry(0.004),
  ] as const;
}

/** The tail in three pieces, each from its joint, so it curls up into a question mark and its tip moves on its own;
 *  ringed in the tabby's stripes, the tip dark. */
const TAIL_PIECES: readonly { to: Vec3; radius: [number, number]; stripes: boolean }[] = [
  { to: [0, 0.035, -0.06], radius: [0.016, 0.014], stripes: true },
  { to: [0, 0.075, -0.01], radius: [0.014, 0.012], stripes: true },
  { to: [0, 0.05, 0.03], radius: [0.012, 0.008], stripes: false },
];
function tailPiece({ to, radius, stripes: ringed }: (typeof TAIL_PIECES)[number], last: boolean): THREE.BufferGeometry {
  const sections: Section[] = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const colour: PaletteKey = last ? (t > 0.4 ? "stoneDark" : COAT) : ringed && i % 2 === 1 ? STRIPE : COAT;
    return { at: [to[0] * t, to[1] * t, to[2] * t], radius: radius[0] + (radius[1] - radius[0]) * t, colour };
  });
  return loft(sections, { sides: 10 });
}

function meshParts() {
  return {
    base: plinth(BASE_RADIUS, BASE_RADIUS - 0.016, BASE_TOP, "boneDark"),
    chest: chest(),
    hips: hips(),
    head: head(),
    tail: TAIL_PIECES.map((piece, i) => tailPiece(piece, i === TAIL_PIECES.length - 1)),
    fore: legParts(FORE, [0.025, 0.019, 0.015, 0.013], 0.35),
    hind: legParts(HIND, [0.03, 0.02, 0.015, 0.013], 0.3),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const CAT_PARTS = figureParts("cat", meshParts);
declareParts(cat, [CAT_PARTS]);

function named<T extends THREE.Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

/** The Cat. */
export function cat(seed = "cat", gait: Gait = STANDING): THREE.Group {
  const parts = CAT_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => named(form(material, geometry), name);

  const chestPart = mesh(parts.chest, "chest");
  const hipsPart = mesh(parts.hips, "hips");
  const front = group(chestPart);
  const rear = group(hipsPart);
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
  const headPivot = group(headPart);
  headPivot.position.set(...NECK);
  front.add(headPivot);

  // The tail's pieces, each hanging from the end of the one before.
  const tail: THREE.Group[] = [];
  parts.tail.forEach((geometry, i) => {
    const pivot = group(mesh(geometry, i === 0 ? "tail" : `tail ${i + 1}`));
    if (i === 0) {
      pivot.position.set(...TAIL);
      rear.add(pivot);
    } else {
      pivot.position.set(...TAIL_PIECES[i - 1].to);
      tail[i - 1].add(pivot);
    }
    tail.push(pivot);
  });

  const figure = group(mesh(parts.base, "base"), trunk);
  joins(figure, [
    { parts: [chestPart, hipsPart], at: trunk, radius: 0.1 },
    { parts: [headPart, chestPart], at: headPivot, radius: 0.06 },
    { parts: [tail[0].children[0], hipsPart], at: tail[0], radius: 0.035 },
    ...tail.slice(1).map((pivot, i) => ({ parts: [pivot.children[0], tail[i].children[0]] as const, at: pivot, radius: 0.028 })),
    ...legs.flatMap((leg, i) => pawLegJoints(leg, [chestPart, hipsPart], { top: (i < 2 ? FORE : HIND).upper + 0.025, knee: 0.05, ankle: 0.036 })),
  ]);

  const rig: PawRig = {
    walking: CAT_WALK,
    legs,
    trunk,
    front,
    rear,
    // A cat's walk, one paw at a time: left hind, left fore, right hind, right fore, three paws always down.
    walk: { lands: [0.75, 0.25, 0.5, 0], stance: 0.55, lift: 0.025 },
    // A bound: the hind paws land almost together, then the forepaws, the spine arching and stretching.
    run: { lands: [0.55, 0.48, 0.04, 0], stance: 0.25, lift: 0.035, arch: 0.1, gathered: 0.93, rock: 0.04, spread: { across: [0, 0.018], along: [0.015, 0.02] } },
  };

  const rng = createRng(seed);
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    stretch: { every: 14, lasts: 4.2, chance: 0.45 },
    wash: { every: 10, lasts: 4, chance: 0.5 },
    look: { every: 7, lasts: 2.6, chance: 0.55 },
  });
  let stretching = 0;
  let washing = 0;
  // Stretching, the forepaws reach out in front; washing, the right forepaw is raised to the mouth.
  const adjust: PawAdjust = (leg, at) => {
    if (leg < 2) at.paw.z += 0.07 * stretching;
    if (leg === 0 && washing > 0) {
      at.paw.lerp(new THREE.Vector3(-0.04, 0.23, 0.195), washing);
      at.lean += (1.2 - at.lean) * washing;
      at.down = washing < 0.05;
    }
  };

  return walks(
    animated(figure, (clock) => {
      const seconds = clock + offset;
      const stride = gait(clock);
      const still = 1 - stride.amount;
      const run = stride.running ? stride.amount : 0;
      const played = bursts(clock);
      const stretch = played.stretch.amount * still;
      const wash = played.wash.amount * still;
      const look = played.look.amount * still;
      stretching = stretch;
      washing = wash;

      const breath = Math.sin((seconds / 2.6) * Math.PI * 2);
      trunk.position.set(0, TRUNK + breath * 0.0015 - stretch * 0.04 + wash * 0.004, 0);
      trunk.rotation.set(stretch * 0.32, 0, 0);
      front.rotation.x = 0;
      rear.rotation.x = -stretch * 0.08;
      chestPart.scale.setScalar(1 + breath * 0.008);

      const step = pawStride(rig, stride, adjust);

      // The head turns slowly, looks back over its shoulder, bends to wash the raised paw, and looks up out of a stretch.
      const glance = Math.sin((seconds / 5.1) * Math.PI * 2) * 0.18;
      const side = played.look.pick < 0.5 ? -1 : 1;
      const licks = Math.sin(played.wash.progress * Math.PI * 2 * 5) * 0.08 * wash;
      headPivot.rotation.set(
        wash * (0.5 + licks) - stretch * 0.4 - step.bounce * 1.2 - run * 0.15,
        (glance * (1 - look) + side * look * 1.0) * still - wash * 0.2,
        side * look * 0.12,
        "YXZ",
      );

      // The tail stands up in a question mark, swaying slowly, its tip flicking now and then; it lashes when the cat
      // looks round, and streams out behind at a run.
      const flick = burst(seconds, `${seed}:flick`, { every: 2.4, lasts: 0.7, chance: 0.6 });
      const sway = Math.sin((seconds / 3.3) * Math.PI * 2);
      const lash = Math.sin(seconds * Math.PI * 2 * 1.6) * look;
      tail.forEach((pivot, i) => {
        const swing = (sway * (0.12 + i * 0.1) + lash * 0.25) * (1 - run * 0.8) + (i === 2 ? Math.sin(flick.progress * Math.PI * 4) * flick.amount * 0.6 : 0);
        pivot.rotation.set((i === 0 ? -run * 0.9 + stretch * 0.25 : run * 0.35 * (1 - i * 0.4)), 0, swing, "XYZ");
      });
    }),
    CAT_WALK,
  );
}
