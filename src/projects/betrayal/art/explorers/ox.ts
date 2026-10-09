import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, drum, ellipsoid, figureMaterial, form, painted, plinth, ring, rod, roundBox, sculpt, shaped, stretched, surfaceAt, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, burst, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, blendPose, buildArm, closedRound, fist, handParts, hasHands, holding, holdIn, poseArm, poseHand, reachWrist, RELAXED, type Arm, type Prop } from "./hands";

/*
 * Ox Bellows: a huge young linebacker, all Might, who is afraid of the dark
 * and can't pass anything that glitters. Read at a glance: the widest figure
 * in the house, a wedge of red letterman jacket with cream sleeves and a big
 * cream "O" on his chest, a small buzz-cut head on a thick neck, and blue
 * jeans on planted legs. He faces +z; his right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

/** 6'4" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(6, 4);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.8;
const LEG = WAIST - BASE_TOP;
/** Long, heavy steps: a slower cadence than anyone's, and a low hop. */
const OX_WALK: Walking = { step: 0.7, hop: 0.014 };
const ARM_SWING = 0.32;
/** How far he rolls from one planted foot to the other as he walks. */
const ROLL = 0.05;
/** The neck's pivot, where his small head turns on that bull neck. */
const NECK = TOP - 0.35;
const SHOULDER: [number, number] = [0.31, 1.26];
const UPPER_ARM = 0.3;
/** From the elbow to the wrist. */
const FOREARM = 0.24;
/** His hands, this many times an ordinary adult's: big fists. */
const HAND = 1.3;
const LEG_X = 0.11;
/** The ankle, in the sneaker, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.07;
const THIGH = 0.326;
const SHIN = 0.326;
/** The head on its neck, in the neck's frame: a bull neck nearly as wide as
 *  the head, a small skull with a square jaw, a heavy brow over small eyes,
 *  a broad nose, a day's stubble, and a buzz cut painted close to the skull. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.12, -0.01], [0, 0.1, -0.005], 0.088, 0.088), "skin")
    .add(ellipsoid([0, 0.2, -0.005], [0.112, 0.135, 0.122]), "skin", 0.04)
    .add(roundBox([0, 0.1, 0.035], [0.095, 0.06, 0.08], 0.045), "skin", 0.05)
    .add(rod([-0.07, 0.215, 0.1], [0.07, 0.215, 0.1], 0.024), "skin", 0.025)
    .add(rod([0, 0.2, 0.125], [0, 0.155, 0.142], 0.017, 0.026), "skin", 0.015);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.112, 0.17, -0.005], [0.02, 0.036, 0.026]), "skin", 0.01);
    shape.carve(ball([side * 0.042, 0.188, 0.122], 0.018), { blend: 0.008 });
    shape.add(ball([side * 0.042, 0.188, 0.104], 0.018), "boneLight");
    shape.paint(ball([side * 0.042, 0.188, 0.121], 0.009), "woodDark");
  }
  return shape
    .paint(ellipsoid([0, 0.218, 0.122], [0.075, 0.009, 0.02]), "woodDark")
    // Stubble round the jaw and chin, below the cheekbones.
    .paint((x, y, z) => (y < 0.135 && y > 0.04 && z > -0.02 && Math.hypot(x, z - 0.04) > 0.03 ? -1 : 1), "skinShade")
    .paint(ellipsoid([0, 0.112, 0.125], [0.032, 0.007, 0.03]), "bloodDark")
    // The buzz cut: hair to the brow at the front, down to the nape behind.
    .paint((x, y, z) => (y > 0.235 + 0.03 * Math.max(0, z / 0.12) - 0.1 * Math.max(0, -z / 0.12) && Math.abs(x) < 0.122 ? -1 : 1), "woodDark")
    .geometry(0.007);
}

/** The letterman jacket from the hem up, built from the waist: a wedge of red
 *  tapering from the shoulders to a ribbed hem at the hips, so his arms hang
 *  clear of it, with a ribbed collar, snaps down the front, and the big felt
 *  "O" on his left breast; and below the hem, the seat of his jeans, which
 *  his thighs swing from. */
function jacket(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.04, 0], [0.2, 0.11, 0.135]), "moon")
    .add(roundBox([0, 0.07, 0], [0.215, 0.12, 0.15], 0.08), "bloodLight", 0.02)
    .add(roundBox([0, 0.29, 0], [0.25, 0.15, 0.175], 0.1), "bloodLight", 0.08);
  // The shoulders reach out over the tops of the sleeves, set in at the seam, so a sleeve's round top never shows as a ball.
  for (const side of [-1, 1]) shape.add(rod([side * 0.08, 0.42, -0.01], [side * 0.26, 0.44, 0], 0.085, 0.1), "bloodLight", 0.08);
  shape
    .add(stretched(ring([0, -0.04, 0], 0.19, 0.035), [0, -0.04, 0], [1.1, 1, 0.76]), "bloodDark", 0.01)
    .paint((_, y) => (Math.abs(y + 0.015) < 0.011 && y > -0.03 ? -1 : 1), "boneLight")
    .add(stretched(ring([0, 0.5, -0.01], 0.125, 0.038), [0, 0.5, -0.01], [1, 1, 0.85]), "bloodDark", 0.015);
  for (const y of [0.05, 0.15, 0.25, 0.36]) shape.add(ball([0, y, surfaceAt(shape.distance, 0, y) + 0.003], 0.012), "boneLight");
  const letter: Vec3 = [0.135, 0.29, 0];
  const front = surfaceAt(shape.distance, letter[0], letter[1]);
  shape.add(ring([letter[0], letter[1], front + 0.004], 0.052, 0.016, [Math.PI / 2, 0, 0]), "boneLight", 0.004);
  return shape.geometry(0.013);
}

/** A cream leather sleeve on a thick upper arm, set in under the jacket's
 *  shoulder, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.03, 0], [0, -UPPER_ARM, 0], 0.08, 0.06), "boneLight")
    .geometry(0.012);
}

/** The forearm from the elbow to the wrist: a cream sleeve, a red ribbed cuff, and a thick wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.068, 0.06), "boneLight")
    .add(ring([0, -FOREARM + 0.03, 0], 0.05, 0.022), "bloodDark", 0.006)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.02, 0.002], 0.03, 0.027), "skin")
    .geometry(0.009);
}

/** A jeans leg from the hip to the knee, hanging from the hip, tapering to
 *  the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.006], 0.092, 0.07), "moon")
    .geometry(0.013);
}

/** A jeans leg from the knee to the sneaker, with a turned-up hem, its end inside the shoe. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.006], [0, -SHIN + 0.02, -0.01], 0.078, 0.066), "moon")
    .add(ring([0, -SHIN + 0.035, -0.008], 0.068, 0.016), "moonDark", 0.01)
    .geometry(0.012);
}

/** A big white sneaker on the base, with a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.035, 0.08], [0.075, 0.045, 0.11]), "boneLight")
    .add(ellipsoid([x, BASE_TOP + 0.04, -0.03], [0.07, 0.05, 0.075]), "boneLight", 0.05)
    .add(rod([x, BASE_TOP + 0.05, -0.02], [x, BASE_TOP + 0.075, -0.015], 0.06), "boneLight", 0.03)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.016 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.011), ...soleEnds(shape.distance, x) };
}

/** His lucky find: a big gold coin, face up, its middle on its origin. */
function coin(): THREE.BufferGeometry {
  return shaped(painted(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), "goldLight"), drum([0, 0, 0], 0.035, 0.006));
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jacket: jacket(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND), handParts(1, HAND)],
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    coin: coin(),
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

const UP = new THREE.Vector3(0, 1, 0);
/** How far into bringing the coin out his fist has closed and the coin is in it. */
const COIN_OUT = 0.15;

/** Ox Bellows as a miniature on a round base, 6'4" at the house's scale.
 *  He breathes deep and slow and shifts his great weight; now and then he
 *  fishes out a shiny coin, flips it off his thumb and admires it, and now
 *  and then he glances over his shoulder into the dark. He walks with long,
 *  heavy steps, rolling from foot to foot, both arms swinging. Either hand
 *  can hold a thing; the coin comes out only while his right hand is free. */
export function ox(seed = "ox", gait: Gait = STANDING): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
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
  const bend = new THREE.Vector3(0, 0, -1);
  const hangs = (of: Arm, side: number) => reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.14, -0.5, 0.05)), bend);
  const carries = (of: Arm, side: number) => reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.02, -0.33, 0.24)), new THREE.Vector3(side * 0.2, 0, -1));
  const poses = { right: { hangs: hangs(right, -1), carries: carries(right, -1) }, left: { hangs: hangs(left, 1), carries: carries(left, 1) } };
  const admires = reachWrist(right, new THREE.Vector3(-0.12, NECK - WAIST - 0.22, 0.36), new THREE.Vector3(-1, -0.3, 0.2));

  // The coin rests on his thumb, the top of his fist.
  const flipped = mesh(parts.coin, "coin");
  const lucky: Prop = { object: group(flipped), handle: 0.01, carry: "hang" };

  const trunk = mesh(parts.jacket, "jacket");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.015),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), OX_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    // His bull neck sinks into his collar as he bows his head.
    { parts: [face, trunk], at: neck, radius: 0.19 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.18 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.18 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.2, 0.19, 0.12)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING },
    left: { limb: left, side: 1 as const, swing: ARM_SWING },
  };
  const rig: StrideRig = { walking: OX_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.06 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 5.5) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 8) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    // The coin comes out walking, but not running, and only into an empty hand.
    const free = right.hand.held === null || right.hand.held === lucky;
    const shiny = burst(seconds, `${seed}:coin`, { every: 10, lasts: 3.6, chance: 0.75 });
    const admiring = free ? shiny.amount * (1 - running) : 0;
    const glance = burst(seconds, `${seed}:dark`, { every: 7, lasts: 2.2, chance: 0.55 });
    const look = glance.amount * (1 - admiring);
    // His fist closes as he brings the coin out, and only then is it in it.
    const closing = THREE.MathUtils.smoothstep(admiring, 0, COIN_OUT);
    if (free) holdIn(right.hand, admiring >= COIN_OUT ? lucky : null);

    body.rotation.z = sway * 0.025;
    chest.rotation.z = sway * -0.015;
    chest.rotation.x = breath * -0.02;
    trunk.scale.set(1 + breath * 0.02, 1, 1 + breath * 0.025);
    // He hunches his shoulders as he peers into the dark.
    const hunch = look * 0.035;
    left.shoulder.position.y = left.at.y + breath * 0.006 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.006 + hunch;

    neck.rotation.y = look * (glance.pick < 0.5 ? -1 : 1) * 0.85;
    neck.rotation.x = 0.05 + admiring * 0.4 - look * 0.05;
    neck.rotation.z = sway * 0.015;

    for (const [arm, side, own] of [
      [right, "right", poses.right],
      [left, "left", poses.left],
    ] as const) {
      const upright = arm.hand.held?.carry === "upright";
      poseArm(arm, upright ? own.carries : own.hangs, side === "right" ? admires : own.hangs, side === "right" ? admiring : 0);
      const empty = blendPose(RELAXED, fist(arm.hand), Math.max(running, 0.25));
      poseHand(arm.hand, side === "right" && free ? blendPose(empty, closedRound(arm.hand, lucky.handle), closing) : holding(arm.hand, empty));
      swings[side].swing = upright ? ARM_SWING * 0.3 : ARM_SWING;
    }

    const step = stride(rig, moving);
    body.rotation.z += step * ROLL;
    chest.rotation.y = step * 0.12;
    for (const arm of [right, left]) if (arm.hand.held?.carry === "upright") aimGrip(arm.hand, figure, UP, 1);

    // The coin rests on his thumb, flips once while he holds it up, and turns to catch the light.
    const flip = THREE.MathUtils.clamp((shiny.progress - 0.36) / 0.22, 0, 1);
    flipped.position.set(0, 0.052 + 4 * flip * (1 - flip) * 0.2, 0);
    flipped.rotation.set(flip * Math.PI * 4, 0, 0.3);
  });
}
