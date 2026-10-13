import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, intersect, plinth, ring, rod, roundBox, sculpt, stretched, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm } from "./hands";
import { skinOf, skinShade } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Heather Granville: eighteen, the popular girl who loves television and
 * shopping, knows everyone from school, and fears above all that she isn't
 * actually perfect after all. Read at a glance: a petite young woman, between
 * the grown men and the children, with a high golden-blonde ponytail swinging
 * behind her in a violet scrunchie, a fitted violet sweater (her card's
 * colour) with a white Peter Pan collar and cuffs, slim blue jeans and white
 * sneakers. She faces +z; her right hand is on −x.
 *
 * She takes Flash's adult build, scaled to 5'2" and slimmed to a young
 * woman's (a narrower chest, a waist, rounder hips), and the shared arms,
 * hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("heather-granville");
const HAIR = "gold";

/** 5'2" at the miniature's scale, to the crown of her hair. */
const TOP = BASE_TOP + miniatureHeight(5, 2);
/** Long legs for her height: the hips sit at half of it. */
const WAIST = 0.66;
const HIP = WAIST - BASE_TOP;
/** A light, quick step about her leg's length, with a little spring in it. */
const HEATHER_WALK: Walking = { step: 0.52, hop: 0.024 };
const ARM_SWING = 0.34;
/** The neck's pivot: the head and its hair stand 0.325 above it, a miniature's big head. */
const NECK = TOP - 0.325;
/** Narrow shoulders: a young woman's. */
const SHOULDER: [number, number] = [0.165, 1.05];
const UPPER_ARM = 0.235;
/** From the elbow to the wrist. */
const FOREARM = 0.19;
/** Her hands, this many times a grown man's. */
const HAND = 0.85;
const LEG_X = 0.054;
/** The ankle, in the sneaker, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.05;
const THIGH = 0.266;
const SHIN = 0.266;
/** Where the ponytail is tied, in the neck's frame: high on the back of her crown. */
const TIE: Vec3 = [0, 0.262, -0.108];

/** Everything on the side of `boundary` its sign says is above, within a box: for hair down to a hairline. */
function above(boundary: (x: number, z: number) => number, min: Vec3, max: Vec3): Solid {
  return { distance: (x, y, z) => boundary(x, z) - y, min, max };
}

/** The head on its neck, in the neck's frame: a young woman's oval face with
 *  a soft jaw and a small chin, a small nose and cheeks that catch the light,
 *  blue eyes (white, a blue iris and a glint) under fine fair brows, dark
 *  lashes, pink lips, and golden hair drawn smoothly back from a side-swept
 *  fringe to the ponytail's tie. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, -0.005], [0, 0.1, 0], 0.038, 0.035), SKIN)
    .add(ellipsoid([0, 0.2, -0.01], [0.094, 0.11, 0.104]), SKIN, 0.04)
    .add(ellipsoid([0, 0.137, 0.022], [0.072, 0.078, 0.086]), SKIN, 0.05)
    .add(ball([0, 0.088, 0.062], 0.026), SKIN, 0.04)
    .add(ellipsoid([0, 0.19, 0.083], [0.066, 0.014, 0.024]), SKIN, 0.02)
    .add(rod([0, 0.176, 0.102], [0, 0.144, 0.116], 0.008, 0.013), SKIN, 0.01);
  for (const side of [-1, 1]) {
    const x = side * 0.036;
    shape.add(ellipsoid([side * 0.048, 0.132, 0.074], [0.028, 0.022, 0.024]), SKIN, 0.03);
    shape.add(ellipsoid([side * 0.092, 0.162, -0.006], [0.013, 0.025, 0.019]), SKIN, 0.01);
    shape.carve(ball([x, 0.166, 0.104], 0.017), { blend: 0.007 });
    shape.add(ball([x, 0.166, 0.087], 0.017), "boneLight");
    shape.paint(ball([x, 0.166, 0.104], 0.0098), "moon");
    shape.paint(ball([x, 0.166, 0.106], 0.005), "void");
    shape.paint(ball([x - side * 0.004, 0.17, 0.105], 0.0035), "boneLight");
    // Dark lashes along the top of each eye, and a fine fair brow arching over it.
    shape.paint(ellipsoid([x, 0.181, 0.1], [0.019, 0.003, 0.02]), "soot");
    shape.paint(ellipsoid([side * 0.04, 0.197, 0.1], [0.023, 0.0038, 0.03]), "boneDark");
  }
  shape.paint(ellipsoid([0, 0.112, 0.104], [0.017, 0.006, 0.02]), "bloodLight").paint(ellipsoid([0, 0.112, 0.108], [0.013, 0.0016, 0.02]), skinShade(SKIN));
  // The hair drawn back: a smooth cap over the skull down to a hairline high at the brow, over the ears and low at the nape.
  const hairline = (x: number, z: number) => 0.236 - 0.13 * THREE.MathUtils.smoothstep(-z, -0.07, 0.08) - 0.03 * THREE.MathUtils.smoothstep(Math.abs(x), 0.05, 0.09);
  shape
    .add(intersect(ellipsoid([0, 0.207, -0.014], [0.104, 0.118, 0.114]), above(hairline, [-0.12, 0.08, -0.14], [0.12, 0.34, 0.13])), HAIR, 0.006)
    // Gathered up to the tie: fullness at the back of the crown.
    .add(ellipsoid([0, 0.24, -0.075], [0.075, 0.065, 0.05]), HAIR, 0.03)
    // The fringe, swept from a parting on her left across to her right temple.
    .add(rod([0.05, 0.262, 0.076], [-0.06, 0.224, 0.09], 0.016, 0.009), HAIR, 0.02)
    .add(rod([0.0, 0.266, 0.072], [-0.086, 0.204, 0.064], 0.015, 0.009), HAIR, 0.02);
  return shape.geometry(0.0065);
}

/** The ponytail from its tie, in the tie's frame: the violet scrunchie round it, and a thick
 *  golden tail rising back out of it and falling in a curve to between her shoulders, clear of her neck. */
function ponytail(): THREE.BufferGeometry {
  return sculpt()
    .add(stretched(ring([0, 0.004, -0.012], 0.024, 0.013, [Math.PI / 2 - 0.4, 0, 0]), [0, 0.004, -0.012], [1, 1, 1]), "violet")
    .add(
      chain(
        [
          [0, 0.002, -0.006],
          [0, 0.012, -0.05],
          [0, -0.045, -0.088],
          [0, -0.13, -0.09],
          [0, -0.215, -0.07],
          [0, -0.255, -0.05],
        ],
        [0.022, 0.034, 0.038, 0.032, 0.02, 0.008],
      ),
      HAIR,
      0.012,
    )
    .geometry(0.006);
}

/** Where the sweater's ribbed hem is painted: a little beyond the band itself, but never down onto the jeans. */
const BAND = stretched(ring([0, 0.035, 0], 0.1, 0.019), [0, 0.035, 0], [1, 1, 0.72]);

/** The sweater from the jeans' seat up, built from the waist (the hips' pivot):
 *  a fitted violet sweater, narrow at the waist and soft over the bust, a
 *  ribbed hem, its shoulders reaching out over the tops of the sleeves, and a
 *  white Peter Pan collar; below its hem, the seat of her jeans, which her
 *  thighs swing from. */
function sweater(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.025, -0.002], [0.125, 0.082, 0.086]), "moon")
    .add(roundBox([0, 0.085, 0], [0.098, 0.06, 0.068], 0.05), "violet", 0.03)
    .add(ellipsoid([0, 0.245, 0], [0.122, 0.15, 0.082]), "violet", 0.06);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.042, 0.25, 0.046], [0.04, 0.036, 0.032]), "violet", 0.035);
    // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one.
    shape.add(rod([side * 0.04, 0.375, -0.008], [side * (SHOULDER[0] - 0.008), 0.36, -0.004], 0.042, 0.042), "violet", 0.06);
  }
  shape
    .add(stretched(ring([0, 0.035, 0], 0.1, 0.012), [0, 0.035, 0], [1, 1, 0.72]), "bruiseLight", 0.012)
    .paint((x, y, z) => Math.max(BAND.distance(x, y, z), 0.022 - y), "bruiseLight")
    // Below the hem it is all jeans, with none of the sweater's colour blended into the seat.
    .paint((_, y) => y - 0.022, "moon")
    .add(ring([0, 0.402, 0.002], 0.04, 0.012), "violet", 0.01);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * 0.03, 0.4, 0.046], [0.034, 0.01, 0.026]), "boneLight", 0.004);
  return shape.geometry(0.009);
}

/** The upper arm from the shoulder to the elbow: a slim violet sleeve, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.037, 0.031), "violet")
    .geometry(0.008);
}

/** The forearm from the elbow to the wrist: the sleeve, a white cuff, and the wrist inside it. Its rounded top
 *  covers the upper arm's narrower end however far the elbow bends. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.036, 0.03), "violet")
    .add(ring([0, -FOREARM + 0.03, 0], 0.027, 0.011), "boneLight", 0.004)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.014, 0.002], 0.019, 0.017), SKIN)
    .geometry(0.007);
}

/** A slim jeans leg from the hip to the knee, tapering to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.012, 0], [0, -THIGH, 0.004], 0.049, 0.039), "moon")
    .geometry(0.01);
}

/** A slim jeans leg from the knee into the sneaker. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.008, -0.004], 0.042, 0.031), "moon")
    .geometry(0.008);
}

/** A white sneaker on the base: a neat rounded toe, a violet stripe down its side, a pale sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.026, 0.07], [0.04, 0.028, 0.068]), "boneLight")
    .add(ellipsoid([x, BASE_TOP + 0.03, -0.024], [0.039, 0.034, 0.048]), "boneLight", 0.035)
    .add(rod([x, BASE_TOP + 0.034, -0.014], [x, BASE_TOP + 0.056, -0.01], 0.031), "boneLight", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((px, y, z) => (Math.abs(Math.abs(px - x) - 0.036) < 0.008 && Math.abs(y - BASE_TOP - 0.03 + z * 0.12) < 0.006 && z > -0.05 && z < 0.08 ? -1 : 1), "violet")
    .paint((_, y) => (y < BASE_TOP + 0.012 ? -1 : 1), "bone")
    .paint((_, y) => (y < BASE_TOP + 0.004 ? -1 : 1), "stone");
  return { geometry: shape.geometry(0.0075), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    ponytail: ponytail(),
    sweater: sweater(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const HEATHER_PARTS = figureParts("heather", meshParts);
declareParts(heather, [HEATHER_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);
const smooth = THREE.MathUtils.smoothstep;
/** A bump easing up from 0 to 1 between `a` and `b`, holding, and back down between `c` and `d`. */
const bump = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) - smooth(t, c, d);

/** Heather Granville as a miniature on a round base, 5'2" at the house's
 *  scale. She breathes and rests her weight on one hip, then the other; now
 *  and then she sets her hand on her hip and tosses her ponytail; now and then she
 *  lifts her hand and inspects her nails; and now and then she spots a flaw:
 *  she looks down, brushes at her sweater, and glances round to see whether
 *  anyone noticed. She walks with a light, quick step, her ponytail swinging.
 *  Either hand can hold a thing; the toss waits while her right does, the
 *  nails and the brushing while her left does. */
export function heather(seed = "heather", gait: Gait = STANDING): THREE.Group {
  const parts = HEATHER_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const tail = mesh(parts.ponytail, "ponytail");
  const tie = group(tail);
  tie.position.set(...TIE);
  const face = mesh(parts.head, "head");
  const neck = group(face, tie);
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
  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const posesOf = (of: Arm, side: -1 | 1) => ({
    hangs: reachWrist(of, wristAt(of, [side * 0.04, -0.395, 0.04]), new THREE.Vector3(side * 0.3, 0, -1)),
    carries: reachWrist(of, wristAt(of, [side * 0.02, -0.26, 0.2]), new THREE.Vector3(side * 0.2, 0, -1)),
  });
  const poses = { right: posesOf(right, -1), left: posesOf(left, 1) };
  // The toss: her right hand set on her hip, the elbow out, fingers forward and down.
  const onHip = pointHand(reachWrist(right, new THREE.Vector3(-0.162, 0.1, -0.035), new THREE.Vector3(-1, 0.05, -0.15)), new THREE.Vector3(0.25, -0.6, 0.75), 0);
  // The nails: her left hand lifted before her chest, fingers curled towards her, so she sees their backs.
  const nails = pointHand(reachWrist(left, new THREE.Vector3(0.06, 0.31, 0.23), new THREE.Vector3(1, -0.6, -0.3)), new THREE.Vector3(-0.2, 1, 0.15), Math.PI);
  // The flaw: her left hand brushing across the front of her sweater, from her side to her middle.
  const brushFrom = pointHand(reachWrist(left, new THREE.Vector3(0.1, 0.17, 0.13), new THREE.Vector3(1, -0.4, -0.5)), new THREE.Vector3(-0.6, -0.5, 0.6), 0);
  const brushTo = pointHand(reachWrist(left, new THREE.Vector3(-0.01, 0.15, 0.135), new THREE.Vector3(1, -0.4, -0.5)), new THREE.Vector3(-0.8, -0.4, 0.4), 0);

  const trunk = mesh(parts.sweater, "sweater");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.01),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), HEATHER_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    // The scrunchie and the tail's root sit in the hair gathered at the tie.
    { parts: [tail, face], at: tie, radius: 0.07 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.1 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.1, 0.08)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 },
    left: { limb: left, side: 1 as const, swing: ARM_SWING, pump: 1 },
  };
  const rig: StrideRig = { walking: HEATHER_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.06 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    toss: { every: 9, lasts: 2.4, chance: 0.6 },
    nails: { every: 12, lasts: 3.2, chance: 0.55 },
    flaw: { every: 14, lasts: 3.6, chance: 0.5 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.6) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 6) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const { toss, nails: inspect, flaw } = bursts(clock);
    // Each gesture eases out as the stride eases in, and waits while the hand it needs holds something.
    const tossing = right.hand.held === null ? toss.amount * still : 0;
    // The toss: her head tips one way and swings back the other, chin up, and the ponytail follows a beat behind.
    const tossed = Math.sin(smooth(toss.progress, 0.25, 0.7) * Math.PI * 2) * tossing;
    const flying = Math.sin(smooth(toss.progress, 0.3, 0.85) * Math.PI * 2) * tossing;
    const leftFree = left.hand.held === null ? still : 0;
    const fretting = flaw.amount * leftFree;
    const admiring = inspect.amount * leftFree * (1 - fretting);

    // Weight on one hip, then the other.
    body.rotation.z = sway * 0.03;
    hips.rotation.z = sway * -0.03;
    chest.rotation.z = sway * 0.012;
    // Looking down at herself she leans in a little.
    const lookDown = fretting * bump(flaw.progress, 0.0, 0.15, 0.55, 0.7);
    chest.rotation.x = breath * -0.014 + lookDown * 0.12;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.015);
    left.shoulder.position.y = left.at.y + breath * 0.004;
    right.shoulder.position.y = right.at.y + breath * 0.004;

    // A tilt of the head, down to her nails, down to her sweater, then a quick glance either way: did anyone see?
    const glance = fretting * Math.sin(smooth(flaw.progress, 0.55, 0.95) * Math.PI * 2) * (flaw.pick < 0.5 ? -1 : 1);
    neck.rotation.y = glance * 0.75 + admiring * -0.15 + tossed * 0.15;
    neck.rotation.x = 0.03 + admiring * 0.32 + lookDown * 0.42 - tossing * 0.12;
    neck.rotation.z = sway * -0.05 * (1 - fretting) + admiring * 0.12 + tossed * 0.22;

    const restOf = (arm: Arm, own: (typeof poses)["right"]) => (arm.hand.held?.carry === "upright" ? own.carries : own.hangs);
    poseArm(right, restOf(right, poses.right), onHip, tossing);
    // The left hand lifts to show her her nails, or brushes at her sweater twice.
    const brushing = between(brushFrom, brushTo, 0.5 - 0.5 * Math.cos(smooth(flaw.progress, 0.12, 0.55) * Math.PI * 4));
    const leftRests = restOf(left, poses.left);
    poseArm(left, leftRests, nails, admiring);
    if (fretting > 0) poseArm(left, between(leftRests, nails, admiring), brushing, fretting * bump(flaw.progress, 0.0, 0.12, 0.55, 0.68));

    const curled = { knuckles: [0.9, 1.1, 0.8] as [number, number, number], thumb: 0.3 };
    poseHand(right.hand, holding(right.hand, blendPose(blendPose(RELAXED, OPEN, tossing * 0.6), fist(right.hand), running * 0.7)));
    poseHand(left.hand, holding(left.hand, blendPose(blendPose(blendPose(RELAXED, curled, admiring), OPEN, fretting), fist(left.hand), running * 0.7)));
    for (const [arm, side] of [
      [right, "right"],
      [left, "left"],
    ] as const) {
      const held = arm.hand.held;
      swings[side].swing = held?.carry === "upright" ? ARM_SWING * 0.3 : ARM_SWING;
      swings[side].pump = held ? 0.4 : 1;
    }

    const step = stride(rig, moving);
    // Her hips sway with her step, and her shoulders answer them.
    hips.rotation.y = step * -0.05 * moving.amount;
    chest.rotation.y = step * 0.1;
    for (const arm of [right, left]) if (arm.hand.held?.carry === "upright") aimGrip(arm.hand, figure, UP, 1);

    // The ponytail swings side to side with her step and out behind her as she bounds, and flies out as she tosses it.
    tie.rotation.z = step * (0.18 + running * 0.12) + sway * 0.04 - flying * 0.55 - neck.rotation.z * 0.6;
    tie.rotation.x = Math.abs(step) * (0.08 + running * 0.25) + Math.abs(flying) * 0.3 + running * 0.2 - neck.rotation.x * 0.3;
  });
}
