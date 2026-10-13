import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, ellipsoid, figureMaterial, form, mergeAll, painted, plinth, ring, rod, roundBox, sculpt, shaped, solidOf, stretched, type Solid } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type Joint, type StrideRig, type Walking } from "./figure";
import { hangsCloth } from "./cloth";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, holdIn, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm, type ArmPose, type Prop } from "./hands";
import { skinOf } from "./skin";
import { declareParts, figureParts } from "../figure-parts";
import { windOf } from "../wind";
import { clothMoment, clothMode, clothNet, clothOnClock, clothSheet, FABRICS, type ClothMode, legCapsules, simulatesCloth, type ClothMoment, type LegsAsCloth, type SheetLook } from "./cloth-sim";

/*
 * Madame Zostra: a fortune teller of 37 (born Belladina), short and round,
 * who reads tarot for Zoe's mother, studies the stars, loves to cook and
 * follows baseball, and whose greatest fear is death, above all her own,
 * seen in the cards. Read at a glance: the shortest grown-up in the house,
 * as wide as she is short, a burnt-orange headscarf wrapped high with a band
 * of gold coins, black curls and big brass hoops, a pale blue shawl round her
 * shoulders over a long, full, tiered skirt in her card's blue, its hem
 * starred in gold, and a pale crystal ball on a brass stand held up in her
 * left hand. She faces +z; her right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("madame-zostra");

/** 5'0" at the miniature's scale, to the top of her headscarf. */
const TOP = BASE_TOP + miniatureHeight(5, 0);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.57;
const LEG = WAIST - BASE_TOP;
/** Short legs under a long skirt: a short step, about her leg from hip to
 *  ankle, so a quick, rolling gait, and little bounce in it. */
const ZOSTRA_WALK: Walking = { step: 0.44, hop: 0.016 };
const ARM_SWING = 0.24;
/** The head is drawn this much bigger than it is sculpted: a miniature's big head, so her face reads from the house. */
const HEAD = 1.08;
const NECK = TOP - 0.4 * HEAD;
const SHOULDER: [number, number] = [0.21, 0.87];
const UPPER_ARM = 0.23;
/** From the elbow to the wrist. */
const FOREARM = 0.18;
const HAND = 0.95;
const LEG_X = 0.075;
/** The ankle, in the boot, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.062;
const THIGH = (LEG - 0.062) / 2;
const SHIN = THIGH;

/** Where the headscarf's lower edge runs round her head, in the neck's frame: across the brow in front, above the
 *  ears, and down to the nape behind. */
function scarfEdge(z: number): number {
  return 0.19 + 0.05 * THREE.MathUtils.clamp(z / 0.12, -1.2, 1);
}

/** The head on its neck: a round, smooth face, dark eyes lined in kohl, red lips, black curls behind her
 *  ears, big brass hoops, and a burnt-orange headscarf wrapped high over her head, a band of gold coins across her
 *  brow and its knot at the back. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, -0.005], [0, 0.1, 0], 0.047, 0.045), SKIN)
    .add(ellipsoid([0, 0.215, -0.01], [0.113, 0.123, 0.123]), SKIN, 0.04)
    .add(ellipsoid([0, 0.14, 0.03], [0.098, 0.092, 0.097]), SKIN, 0.05)
    .add(ellipsoid([0, 0.2, 0.095], [0.08, 0.018, 0.03]), SKIN, 0.02)
    .add(rod([0, 0.186, 0.116], [0, 0.148, 0.137], 0.012, 0.018), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.042;
    // The ears.
    shape.add(ellipsoid([side * 0.112, 0.16, -0.005], [0.017, 0.035, 0.025]), SKIN, 0.01);
    // Eyes sunk under the brow: white, a small dark iris, the lid lined in kohl.
    shape.carve(ball([x, 0.176, 0.12], 0.018), { blend: 0.01 });
    shape.add(ball([x, 0.176, 0.103], 0.017), "boneLight");
    shape.paint(ball([x, 0.177, 0.118], 0.009), "void");
    shape.paint(ellipsoid([x, 0.19, 0.116], [0.024, 0.006, 0.014]), "soot");
    // Fine dark brows, arched.
    shape.add(rod([side * 0.02, 0.213, 0.12], [side * 0.07, 0.208, 0.103], 0.007, 0.006), "soot", 0.005);
    // Black curls behind the ear, from under the scarf down to her jaw.
    for (const [cx, cy, cz, r] of [
      [0.098, 0.15, -0.055, 0.042],
      [0.094, 0.11, -0.06, 0.036],
      [0.04, 0.1, -0.095, 0.04],
    ] as const) {
      shape.add(ball([side * cx, cy, cz], r), "sootLight", 0.02);
    }
  }
  shape.paint(ellipsoid([0, 0.105, 0.117], [0.024, 0.009, 0.02]), "bloodLight");

  // The headscarf: wrapped round her skull a cloth's thickness out, from its edge up, piled high on top, its knot at
  // the back with two short ends.
  const wrap = ellipsoid([0, 0.235, -0.02], [0.138, 0.135, 0.146]);
  const scarf: Solid = {
    distance: (x, y, z) => Math.max(wrap.distance(x, y, z), (scarfEdge(z) - y) / 1.3),
    min: [-0.14, 0.1, -0.16],
    max: [0.14, 0.38, 0.13],
  };
  shape
    .add(scarf, "ember", 0.006)
    // Wound high and full, wider on top than at her brow, with a twist where its folds cross over her forehead.
    .add(ellipsoid([0, 0.31, -0.03], [0.15, 0.062, 0.152]), "ember", 0.03)
    .add(ellipsoid([0, 0.29, 0.13], [0.034, 0.03, 0.022]), "ember", 0.012)
    .add(ellipsoid([0, 0.235, -0.155], [0.045, 0.04, 0.035]), "ember", 0.015)
    // The folds crossing over her forehead, and the band of coins along its edge.
    .paint((x, y, z) => (z > 0 && Math.min(Math.abs(y - 0.29 - 0.45 * x), Math.abs(y - 0.29 + 0.45 * x)) < 0.007 ? -1 : 1), "brickLight")
    .paint((_x, y, z) => (y - scarfEdge(z) < 0.024 && y > scarfEdge(z) - 0.01 ? -1 : 1), "brass")
    .paint((x, y, z) => (y - scarfEdge(z) < 0.022 && y > scarfEdge(z) && z > -0.06 && Math.cos(16 * Math.atan2(x, z)) > 0.55 ? -1 : 1), "gold");
  return grown(mergeAll([shape.geometry(0.0075), ...[-1, 1].map(hoop)]), HEAD);
}

/** A part drawn `by` times bigger about its pivot, its solid with it. */
function grown(geometry: THREE.BufferGeometry, by: number): THREE.BufferGeometry {
  const solid = solidOf(geometry);
  if (!solid) throw new Error("A grown part keeps its solid");
  geometry.scale(by, by, by);
  return shaped(geometry, {
    distance: (x, y, z) => solid.distance(x / by, y / by, z / by) * by,
    min: [solid.min[0] * by, solid.min[1] * by, solid.min[2] * by],
    max: [solid.max[0] * by, solid.max[1] * by, solid.max[2] * by],
  });
}

/** A big brass hoop through an earlobe, hanging in the plane along her head, a little turned out to show. */
function hoop(side: number): THREE.BufferGeometry {
  const [major, minor] = [0.03, 0.0045];
  const at: [number, number, number] = [side * 0.118, 0.11, 0.0];
  const turn: [number, number, number] = [0, Math.PI / 2 - side * 0.5, 0];
  const geometry = painted(new THREE.TorusGeometry(major, minor, 6, 24), "brass");
  geometry.rotateY(turn[1]);
  geometry.translate(...at);
  return shaped(geometry, ring(at, major, minor, [Math.PI / 2, turn[1], 0]));
}

/** Her body from the waist up: a round, full blouse in her card's blue, a pale blue shawl over her shoulders, its
 *  ends knotted at her bust and its point down her back, fringed in brass, and a burnt-orange sash at her waist. */
function torso(): THREE.BufferGeometry {
  const body = sculpt()
    .add(ellipsoid([0, 0.225, 0], [0.16, 0.155, 0.125]), "moon")
    .add(ellipsoid([0, 0.12, 0.0], [0.182, 0.13, 0.142]), "moon", 0.07);
  for (const side of [-1, 1]) {
    body.add(ellipsoid([side * 0.062, 0.215, 0.085], [0.07, 0.062, 0.06]), "moon", 0.04);
    // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one.
    body.add(rod([side * 0.05, 0.31, -0.01], [side * 0.215, 0.295, -0.004], 0.052, 0.064), "moon", 0.06);
  }
  const shawl: Solid = {
    distance: (x, y, z) => Math.max(body.distance(x, y, z) - 0.016, shawlEdge(x, z) - y, vee(x, y, z)),
    min: [-0.3, -0.05, -0.2],
    max: [0.3, 0.45, 0.22],
  };
  const shape = sculpt()
    .add({ distance: body.distance, ...body.bounds() }, "moon")
    .add(shawl, "moonLight", 0.003)
    // The shawl's ends knotted at her bust, hanging a little below.
    .add(ellipsoid([0, 0.19, 0.168], [0.03, 0.024, 0.02]), "moonLight", 0.01)
    .add(rod([-0.012, 0.175, 0.172], [-0.03, 0.11, 0.176], 0.016, 0.011), "moonLight", 0.008)
    .add(rod([0.012, 0.175, 0.172], [0.026, 0.12, 0.174], 0.015, 0.01), "moonLight", 0.008)
    .add(stretched(ring([0, 0.055, 0], 0.172, 0.026), [0, 0.055, 0], [1, 1, 0.8]), "ember", 0.006)
    // It ends under the sash: the skirt hangs from there.
    .carve(roundBox([0, -0.08, 0], [0.3, 0.1, 0.3], 0))
    .paint((x, y, z) => (y < shawlEdge(x, z) + 0.018 && y > shawlEdge(x, z) - 0.02 && body.distance(x, y, z) > 0.004 ? -1 : 1), "brass");
  return shape.geometry(0.008);
}

/** How high the shawl's lower edge comes, round her body: up to its knot at her bust in front, higher at her sides
 *  under the arms, and down to its point behind. */
function shawlEdge(x: number, z: number): number {
  const a = Math.atan2(Math.abs(x), z);
  if (a < Math.PI / 2) return 0.185 + 0.095 * Math.sin(a) ** 2;
  const back = (a - Math.PI / 2) / (Math.PI / 2);
  return 0.28 - 0.23 * back ** 2.4;
}

/** The blouse showing in a vee between the shawl's edges, from her throat down to the knot. */
function vee(x: number, y: number, z: number): number {
  if (z < 0) return -1;
  const half = 0.075 * THREE.MathUtils.clamp((y - 0.185) / 0.19, 0, 1);
  return half - Math.abs(x);
}

/** The skirt's shape, in the hips' frame: its top under the sash, and its hem just above her ankles. */
const SKIRT = { top: 0.05, hem: -0.42 };

/** The skirt's radii at a height, before it is folded into tiers: gathered at her waist, flaring full over her hips. */
function skirtRadii(y: number): { rx: number; rz: number } {
  const t = THREE.MathUtils.clamp((SKIRT.top - y) / (SKIRT.top - SKIRT.hem), 0, 1);
  const flare = 1 - (1 - t) ** 2;
  return { rx: 0.17 + 0.1 * flare, rz: 0.15 + 0.095 * flare };
}

/** A blouse sleeve on the upper arm, set in under the shawl's shoulder, tapering to the elbow. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.046, 0.04), "moon")
    .geometry(0.009);
}

/** The forearm from the elbow: a full blouse sleeve gathered at a brass cuff of bangles, and the wrist inside it.
 *  Its rounded top covers the upper arm's narrower end. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.04, 0.003], 0.044, 0.047), "moon")
    .add(ring([0, -FOREARM + 0.036, 0.003], 0.03, 0.011), "brass", 0.003)
    .add(ring([0, -FOREARM + 0.016, 0.002], 0.025, 0.009), "brass", 0.002)
    .add(rod([0, -FOREARM + 0.05, 0.002], [0, -FOREARM + 0.008, 0.002], 0.021, 0.019), SKIN)
    .geometry(0.0065);
}

/** A dark stocking from the hip to the knee, tapering to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.052, 0.043), "sootLight")
    .geometry(0.012);
}

/** A dark stocking from the knee into the boot. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.047, 0.034), "sootLight")
    .geometry(0.01);
}

/** A brown ankle boot on the base, laced up the front, with a low heel and a dark sole. */
function boot(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.028, 0.072], [0.045, 0.032, 0.068]), "wood")
    .add(ellipsoid([x, BASE_TOP + 0.034, -0.025], [0.043, 0.04, 0.05]), "wood", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.012], [x, BASE_TOP + 0.085, -0.008], 0.04, 0.038), "wood", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((px, y, z) => (Math.abs(px - x) < 0.006 && z > 0.005 && y > BASE_TOP + 0.04 ? -1 : 1), "woodDark")
    .paint((_, y) => (y < BASE_TOP + 0.009 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.009), ...soleEnds(shape.distance, x) };
}

/** Her crystal ball on its brass stand, held up by the stem like a lamp: oversized, as a miniature's held things
 *  are, pale and misty. Built round the grip: the stem along +y, the ball above her hand. */
const CRYSTAL = { foot: -0.07, cup: 0.062, radius: 0.068, stem: 0.014 };
function crystal(): THREE.BufferGeometry {
  const { foot, cup, radius, stem } = CRYSTAL;
  const centre = cup + radius * 0.92;
  return sculpt()
    .add(rod([0, foot, 0], [0, cup, 0], stem, stem * 0.9), "brass")
    .add(ellipsoid([0, foot, 0], [0.024, 0.014, 0.024]), "brass", 0.006)
    .add(ellipsoid([0, cup, 0], [0.042, 0.016, 0.042]), "brass", 0.008)
    .add(ball([0, centre, 0], radius), "boneLight", 0.004)
    // Mist pooled in the bottom of the glass.
    .paint((x, y, z) => (y < centre - radius * 0.25 + 0.012 * Math.sin(3 * Math.atan2(x, z)) && Math.abs(Math.hypot(x, y - centre, z) - radius) < 0.01 ? -1 : 1), "moonLight")
    .geometry(0.005);
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    torso: torso(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    crystal: crystal(),
    thigh: thigh(),
    shin: shin(),
    boots: [boot(-LEG_X), boot(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const ZOSTRA_PARTS = figureParts("zostra", meshParts);
declareParts(zostra, [ZOSTRA_PARTS]);

/** The simulated skirt: one net round her from the waist to the hem, 16 round by 8 down. */
const SKIRT_NET = { around: 16, down: 8 };
/** A full cotton skirt, and the room it leaves her legs. */
const SKIRT_FEEL = { ...FABRICS.cottonDress, room: 0.025, roomAtTop: 0.016 };
/** Her legs as the skirt sees them; the thigh's top is inside her hips. */
const SKIRT_LEGS: LegsAsCloth = {
  radii: { thigh: 0.052, shin: 0.047, foot: 0.045 },
  hidden: 0.1,
  heel: new THREE.Vector3(0, BASE_TOP + 0.034, -0.025),
  toe: new THREE.Vector3(0, BASE_TOP + 0.028, 0.1),
};
/** How the skirt hangs while she walks: deeper front to back, narrower at the sides, so her stride has room in it. */
const WALKING_SKIRT = { deeper: 1.2, narrower: 0.82 };
/** Where the skirt's three tiers begin, as shares of the way down it. */
const TIERS = [0, 0.36, 0.68];

/** A point on the skirt, `round` it (a share of a turn from +x, a quarter turn at the front) and `along` it from the
 *  waist to the hem, in the hips' frame. */
function onSkirt(round: number, along: number): THREE.Vector3 {
  const y = SKIRT.top + (SKIRT.hem - SKIRT.top) * along;
  const { rx, rz } = skirtRadii(y);
  return new THREE.Vector3(rx * Math.cos(round * Math.PI * 2), y, rz * Math.sin(round * Math.PI * 2));
}

/** The net skirt's points as it hangs, a share `walking` of the way into its walking shape, into `out`. */
function skirtNetRest(walking: number, out: Float64Array): Float64Array {
  const { around, down } = SKIRT_NET;
  for (let j = 0; j < down; j++) {
    const along = j / (down - 1);
    const [deeper, narrower] = [1 + (WALKING_SKIRT.deeper - 1) * along * walking, 1 - (1 - WALKING_SKIRT.narrower) * along * walking];
    for (let i = 0; i < around; i++) {
      const point = onSkirt(i / around, along);
      out.set([point.x * narrower, point.y, point.z * deeper], (j * around + i) * 3);
    }
  }
  return out;
}

/** How far down its own tier a share of the skirt lies, 0 at the tier's seam to 1 at the next. */
function intoTier(v: number): number {
  const at = TIERS.findLastIndex((start) => v >= start);
  const end = TIERS[at + 1] ?? 1;
  return (v - TIERS[at]) / (end - TIERS[at]);
}

/** The net skirt's look: three tiers in her card's blue, each gathered in under the one above, darker at the seams,
 *  the last starred in gold, over a brass hem. */
const SKIRT_LOOK: SheetLook = {
  across: 96,
  down: 32,
  thickness: 0.01,
  inset: (_, v) => (v < TIERS[1] ? 0 : 0.008 * (1 - THREE.MathUtils.smoothstep(intoTier(v), 0, 0.5))),
  colour: (u, v, inside) => {
    if (inside) return "moonDark";
    if (v > 0.94) return "brass";
    const tier = intoTier(v);
    if (v > TIERS[1] && tier < 0.07) return "moonDark";
    // A row of gold stars round the last tier.
    if (v > TIERS[2] && Math.abs(tier - 0.6) < 0.13 && Math.abs((u * 18) % 1 - 0.5) < 0.2) return "gold";
    return "moon";
  },
};

/** The skirt as a simulated net: the net, its mesh, the moment it hangs in, and its walking shape. */
function skirtNet() {
  const { around, down } = SKIRT_NET;
  const shape = { rest: skirtNetRest(0, new Float64Array(around * down * 3)), around, down, closed: true, outward: 1 as const, round: true, waistband: true };
  const body = clothNet(shape, SKIRT_FEEL);
  const sheet = clothSheet(body, shape, SKIRT_LOOK);
  const moment = clothMoment(6);
  const rest = new Float64Array(shape.rest.length);
  let hung = 0;
  return {
    body,
    sheet,
    moment,
    swing: clothOnClock(body, moment.capsules.length, sheet.follow),
    /** Hangs the skirt as it rests from her hips, unsimulated (`?cloth=off`: she has no heavy cloth to compare). */
    hang: (now: ClothMoment) => {
      body.reset(now);
      sheet.follow(new THREE.Matrix4().copy(now.anchor).invert());
    },
    walking: (share: number) => {
      if (Math.abs(share - hung) < 1e-4) return;
      hung = share;
      body.reshape(skirtNetRest(share, rest));
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** Where her right wrist circles over the crystal ball, `s` of the way round, in the chest's frame. */
function scryingAt(s: number, over: THREE.Vector3): THREE.Vector3 {
  const turn = s * Math.PI * 2 * 2;
  return over.clone().add(new THREE.Vector3(Math.cos(turn) * 0.07, 0.02 * Math.sin(turn * 0.5), Math.sin(turn) * 0.04));
}

/** Madame Zostra as a miniature on a round base, 5'0" at the house's scale.
 *  She breathes slow and full, rocking a little from foot to foot, her
 *  crystal ball held up before her; now and then she lifts it to her face
 *  and circles her free hand over it, reading what it shows; now and then
 *  she tips her head back and points up to read the stars; and now and then,
 *  seeing death in the glass, she snatches it away from her, turns her face
 *  aside and throws up her free hand against it. She walks with short, quick, rolling steps,
 *  her skirt swinging round her ankles. Her left hand holds the crystal
 *  ball; her right hand is free to hold anything else. */
export function zostra(seed = "zostra", gait: Gait = STANDING, { cloth = clothMode() }: { cloth?: ClothMode } = {}): THREE.Group {
  const parts = ZOSTRA_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const face = mesh(parts.head, "head");
  const neck = group(face);
  neck.position.y = NECK - WAIST;

  const limb = (side: -1 | 1) =>
    buildArm(
      mesh,
      { upperArm: parts.upperArm, forearm: parts.forearm, hand: parts.hands[side < 0 ? 0 : 1] },
      side,
      new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0),
      UPPER_ARM,
      FOREARM,
      HAND,
    );
  const left = limb(1);
  const right = limb(-1);
  const ball: Prop = { object: group(mesh(parts.crystal, "crystal ball")), handle: CRYSTAL.stem, carry: "upright" };
  holdIn(left.hand, ball);

  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const bend = new THREE.Vector3(0, 0, -1);
  // The ball held up before her, lifted to her face to read it, and thrust away from her at arm's length.
  const presents = reachWrist(left, wristAt(left, [-0.05, -0.2, 0.24]), new THREE.Vector3(0.5, -0.3, -1));
  const reads = reachWrist(left, wristAt(left, [-0.11, -0.05, 0.37]), new THREE.Vector3(1, -0.2, -0.3));
  const recoils = reachWrist(left, wristAt(left, [0.14, -0.06, 0.37]), new THREE.Vector3(0.6, -1, -0.3));
  const hangs = reachWrist(right, wristAt(right, [-0.13, -0.36, 0.06]), bend);
  const holds = reachWrist(right, wristAt(right, [-0.14, -0.35, 0.07]), bend);
  const carries = reachWrist(right, wristAt(right, [-0.1, -0.26, 0.22]), new THREE.Vector3(-0.3, 0, -1));
  // Her free hand flat over the ball, palm down, circling it.
  const over = new THREE.Vector3(-0.04, 0.56, 0.42);
  const scrying = (s: number): ArmPose => pointHand(reachWrist(right, scryingAt(s, over), new THREE.Vector3(-1, -0.2, 0)), new THREE.Vector3(0.7, -0.25, 0.7), -Math.PI / 2);
  // On the way to and from the ball, her free hand comes out and up to her side first, clear of her belly.
  const aside = reachWrist(right, wristAt(right, [-0.16, -0.12, 0.2]), new THREE.Vector3(-1, -0.4, -0.3));
  // Pointing up at the stars, and her hand thrown up before her face against what she saw.
  const stars = pointHand(reachWrist(right, wristAt(right, [-0.06, 0.3, 0.16]), new THREE.Vector3(-1, 0, -0.3)), new THREE.Vector3(-0.15, 1, 0.2), 0);
  const heart = pointHand(reachWrist(right, new THREE.Vector3(-0.14, 0.42, 0.25), new THREE.Vector3(-1, -0.6, 0)), new THREE.Vector3(0.2, 1, 0.3), -Math.PI / 2);

  const trunk = mesh(parts.torso, "torso");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const net = skirtNet();
  const skirt = mesh(net.sheet.geometry, "full skirt");
  const hips = group(skirt, chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.boots[i];
    const name = side < 0 ? "right" : "left";
    const foot = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), foot, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.01),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), ZOSTRA_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  hangsCloth(figure, [skirt]);
  simulatesCloth(figure, net.body);
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    // The shawl lies a cloth's thickness out over each shoulder, so a sleeve folds into it a little further out.
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.12 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.12 },
    // The skirt hangs from her waist, inside the sash.
    { parts: [skirt, trunk], at: hips, radius: 0.26 } satisfies Joint,
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.14, 0.1, 0.085)),
  ]);

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  // Her left hand holds the crystal ball, so only her right arm swings.
  const swinging = { limb: right, side: -1 as const, swing: ARM_SWING };
  const rig: StrideRig = { walking: ZOSTRA_WALK, legs, body, rest: BASE_TOP, arms: [swinging], chest, lean: 0.03, lifts: 0.6 };
  const bursts = idleBursts(figure, seed, offset, {
    scry: { every: 10, lasts: 4, chance: 0.6 },
    stars: { every: 12, lasts: 2.8, chance: 0.5 },
    omen: { every: 14, lasts: 3.2, chance: 0.45 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 7) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const held = right.hand.held;
    const upright = held?.carry === "upright";
    // Her right hand's gestures wait while it holds something, and while she walks.
    const free = held ? 0 : 1 - moving.amount;
    const still = 1 - moving.amount;
    const { scry, stars: starry, omen } = bursts(clock);
    const fearing = omen.amount * (1 - running);
    const reading = scry.amount * still * (1 - fearing);
    const pointing = starry.amount * free * (1 - fearing) * (1 - reading);

    body.rotation.z = sway * 0.02;
    hips.rotation.z = sway * -0.01;
    chest.rotation.z = sway * -0.012;
    chest.rotation.x = breath * -0.012 + reading * 0.06 - fearing * 0.18 - pointing * 0.04;
    trunk.scale.set(1 + breath * 0.014, 1, 1 + breath * 0.016);
    const hunch = fearing * 0.02;
    left.shoulder.position.y = left.at.y + breath * 0.004 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.004 + hunch;

    // She looks down into the ball, up at the stars, or away from what she saw, with a shudder.
    const shudder = Math.sin(omen.progress * Math.PI * 14) * 0.03 * fearing;
    const away = omen.pick < 0.5 ? -1 : 1;
    neck.rotation.y = fearing * away * 0.9 + shudder + reading * 0.1;
    neck.rotation.x = 0.04 + reading * 0.12 - pointing * 0.32 - fearing * 0.1;
    neck.rotation.z = sway * 0.015 + reading * 0.06;

    // Afraid, she snatches the ball away first, then her free hand goes to her heart, so the two never cross.
    poseArm(left, between(presents, reads, reading), recoils, THREE.MathUtils.smoothstep(fearing, 0, 0.45));
    const rests = upright ? carries : held ? holds : hangs;
    const toBall = reading * (held ? 0 : 1);
    const circling = between(between(rests, aside, THREE.MathUtils.smoothstep(toBall, 0, 0.5)), scrying(THREE.MathUtils.clamp((scry.progress - 0.2) / 0.6, 0, 1)), THREE.MathUtils.smoothstep(toBall, 0.5, 1));
    const raised = between(circling, stars, pointing);
    // Her hand goes to her heart only standing: walking, she just snatches the ball away and looks aside.
    poseArm(right, raised, heart, THREE.MathUtils.smoothstep(fearing, 0.55, 1) * free);
    const gesture = Math.max(reading, pointing * 0.5, fearing * free);
    poseHand(right.hand, held ? holding(right.hand, RELAXED) : blendPose(blendPose(RELAXED, OPEN, gesture), fist(right.hand), running * 0.7));
    swinging.swing = (upright ? ARM_SWING * 0.3 : ARM_SWING) * (1 - Math.max(reading, pointing, fearing * free));

    stride(rig, moving);
    aimGrip(left.hand, figure, UP, 1);
    if (upright) aimGrip(right.hand, figure, UP, 1);

    // The skirt swings from her hips as she moves, round her legs, off the floor and in the room's air.
    figure.updateWorldMatrix(true, true);
    net.moment.anchor.copy(hips.matrixWorld);
    legCapsules(legs, SKIRT_LEGS, net.moment.capsules);
    windOf(figure)(clock, net.moment.wind);
    net.moment.floor = figure.matrixWorld.elements[13] + BASE_TOP;
    net.walking(moving.running ? 0 : moving.amount);
    if (cloth === "net") net.swing(clock, net.moment);
    else net.hang(net.moment);
  });
}
