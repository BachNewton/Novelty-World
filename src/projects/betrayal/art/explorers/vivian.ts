import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, intersect, plinth, ring, rod, roundBox, sculpt, stretched, surfaceAt, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm } from "./hands";
import { skinOf } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Vivian Lopez: 42, who keeps the Something Written bookstore, loves old
 * movies and horses, and is afraid of fire (and can't stop watching it).
 * Read at a glance: a trim woman with a silver-screen stance, one hand on her
 * hip, in a blue 1940s jacket with strong shoulders and a belted waist, a
 * white blouse collar at the throat, dark auburn hair in victory rolls over
 * a rolled pageboy, and cream riding breeches tucked into tall brown boots.
 * She faces +z; her right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("vivian-lopez");

/** 5'5" at the miniature's scale, to the top of her victory rolls. */
const TOP = BASE_TOP + miniatureHeight(5, 5);
const WAIST = 0.66;
const HIP = WAIST - BASE_TOP;
/** A rider's upright, even step, a little shorter than Longfellow's for her shorter legs. */
const VIVIAN_WALK: Walking = { step: 0.55, hop: 0.02 };
const ARM_SWING = 0.3;
/** The neck's pivot: the head and its hair stand 0.355 above it. */
const NECK = TOP - 0.355;
const SHOULDER: [number, number] = [0.19, 1.035];
const UPPER_ARM = 0.25;
/** From the elbow to the wrist. */
const FOREARM = 0.2;
/** Her hands, this many times Longfellow's. */
const HAND = 0.9;
const LEG_X = 0.06;
/** The ankle, in the boot, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.06;
const THIGH = 0.26;
const SHIN = 0.26;

const HAIR = "wood";
const JACKET = "moon";
const BREECHES = "bone";
const BOOT = "wood";

/** Everything on the side of `boundary` its sign says is above, within a box: for hair down to a hairline. */
function above(boundary: (x: number, z: number) => number, min: Vec3, max: Vec3): Solid {
  return { distance: (x, y, z) => boundary(x, z) - y, min, max };
}

/** The head on its neck, in the neck's frame: a heart-shaped face with high
 *  cheeks, dark lashes, arched brows and red lips; dark auburn hair parted
 *  at the side, two victory rolls on the crown and a pageboy rolled under at
 *  the jaw all round the back. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.03, -0.01], [0, 0.11, 0], 0.043, 0.039), SKIN)
    .add(ellipsoid([0, 0.212, -0.008], [0.098, 0.116, 0.11]), SKIN, 0.04)
    .add(ellipsoid([0, 0.145, 0.024], [0.078, 0.084, 0.09]), SKIN, 0.05)
    .add(ellipsoid([0, 0.207, 0.087], [0.07, 0.016, 0.026]), SKIN, 0.02)
    .add(rod([0, 0.196, 0.105], [0, 0.16, 0.122], 0.011, 0.016), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.037;
    shape.add(ellipsoid([side * 0.05, 0.155, 0.075], [0.028, 0.022, 0.024]), SKIN, 0.02);
    shape.add(ellipsoid([side * 0.098, 0.168, -0.004], [0.015, 0.03, 0.022]), SKIN, 0.01);
    shape.carve(ball([x, 0.182, 0.112], 0.018), { blend: 0.008 });
    shape.add(ball([x, 0.182, 0.094], 0.017), "boneLight");
    shape.paint(ball([x, 0.182, 0.111], 0.0095), "woodMid");
    shape.paint(ball([x, 0.182, 0.113], 0.0052), "void");
    // Dark lashes along each upper lid, and a thin arched brow above.
    shape.add(rod([side * 0.019, 0.193, 0.11], [side * 0.058, 0.194, 0.1], 0.0055, 0.0045), "soot", 0.003);
    shape.add(chain([[side * 0.018, 0.212, 0.11], [side * 0.042, 0.222, 0.108], [side * 0.066, 0.214, 0.096]], [0.0055, 0.006, 0.0045]), "woodDark", 0.003);
  }
  shape.paint(ellipsoid([0, 0.117, 0.11], [0.024, 0.009, 0.022]), "bloodLight");

  // The hair: a cap over the skull down to a hairline at the brow, parted on her right.
  const hairline = (x: number, z: number) => 0.26 - 0.13 * THREE.MathUtils.smoothstep(-z, -0.07, 0.07) - 0.035 * THREE.MathUtils.smoothstep(Math.abs(x), 0.05, 0.09);
  shape.add(intersect(ellipsoid([0, 0.218, -0.012], [0.106, 0.124, 0.12]), above(hairline, [-0.12, 0.08, -0.14], [0.12, 0.36, 0.13])), HAIR, 0.006);
  // Victory rolls: two fat rolls lying front to back on the crown, either side of the part.
  for (const [x, r] of [
    [-0.052, 0.036],
    [0.045, 0.04],
  ] as const) {
    shape.add(rod([x, 0.3, 0.075], [x * 1.1, 0.305, -0.035], r, r * 0.92), HAIR, 0.02);
  }
  // The pageboy: the hair falls full round the sides and back to the jaw, and rolls under all the way round.
  shape.add(ellipsoid([0, 0.17, -0.035], [0.122, 0.12, 0.105]), HAIR, 0.03);
  const curl = Array.from({ length: 11 }, (_, i): Vec3 => {
    const angle = ((i - 5) / 5) * 2.0;
    return [Math.sin(angle) * 0.112, 0.09 + 0.008 * Math.cos(angle), -0.03 - Math.cos(angle) * 0.085];
  });
  shape.add(chain(curl, curl.map(() => 0.03)), HAIR, 0.02);
  // The part, and the face kept clear of the hair.
  shape.paint((x, y, z) => (Math.abs(x + 0.008) < 0.004 && y > 0.29 && z > -0.02 ? -1 : 1), "woodDark");
  return shape.geometry(0.0065);
}

/** Where the blouse shows in the jacket's V, in the hips' frame: below the throat, narrowing to its point. */
const V_TOP = 0.44;
const V_POINT = 0.27;
const opening = (y: number) => 0.02 + (y - V_POINT) * 0.3;
/** The belt's middle, at her natural waist. */
const BELT = 0.08;

/** The jacket from the hem up, built from the waist: a 1940s cut, padded
 *  square shoulders tapering to a belted waist, a short flared hem over the
 *  hips, lapels round a white blouse with its collar spread at the throat,
 *  and a brass brooch; and below the hem, the seat of her breeches, which her
 *  thighs swing from. */
function jacket(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.03, 0], [0.142, 0.085, 0.106]), BREECHES)
    .add(ellipsoid([0, 0.02, 0], [0.152, 0.07, 0.112]), JACKET, 0.02)
    .add(roundBox([0, 0.1, 0], [0.118, 0.08, 0.083], 0.06), JACKET, 0.03)
    .add(ellipsoid([0, 0.26, 0], [0.155, 0.16, 0.098]), JACKET, 0.08);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.052, 0.25, 0.045], [0.058, 0.052, 0.05]), JACKET, 0.04);
    // Padded shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one.
    shape.add(rod([side * 0.05, 0.378, -0.01], [side * 0.19, 0.372, -0.004], 0.05, 0.058), JACKET, 0.05);
  }
  // The short flare of the hem over the hips, and the belt round the waist.
  shape
    .add(ellipsoid([0, 0.0, 0], [0.158, 0.035, 0.114]), JACKET, 0.03)
    .paint((_, y) => (y < -0.03 ? -1 : 1), BREECHES)
    .paint((_, y) => (Math.abs(y - BELT) < 0.015 ? -1 : 1), "moonDark");
  // The blouse in the V, and its collar standing round the throat.
  shape.paint((x, y, z) => (z > 0.02 && y > V_POINT && y < V_TOP + 0.02 && Math.abs(x) < opening(y) ? -1 : 1), "boneLight");
  shape.add(stretched(ring([0, 0.445, -0.004], 0.058, 0.018), [0, 0.445, -0.004], [1, 1, 0.9]), "boneLight", 0.01);
  for (const side of [-1, 1]) {
    // The lapels stand proud either side of the V.
    const points = [V_POINT + 0.01, 0.34, 0.42].map((y): Vec3 => {
      const x = side * (opening(y) + 0.01);
      return [x, y, surfaceAt(shape.distance, x, y) - 0.004];
    });
    shape.add(chain(points, [0.011, 0.014, 0.018]), JACKET, 0.01);
    // The blouse's collar points spread over the lapels.
    const tip: Vec3 = [side * 0.07, 0.385, 0];
    shape.add(rod([side * 0.03, 0.44, surfaceAt(shape.distance, side * 0.03, 0.44) - 0.006], [tip[0], tip[1], surfaceAt(shape.distance, tip[0], tip[1]) - 0.002], 0.016, 0.008), "boneLight", 0.006);
  }
  // Two buttons below the V, a buckle on the belt, and the brooch on her left lapel.
  for (const y of [0.2, 0.14]) shape.add(ball([0, y, surfaceAt(shape.distance, 0, y) + 0.002], 0.01), "moonDark");
  shape.add(roundBox([0, BELT, surfaceAt(shape.distance, 0, BELT) - 0.002], [0.022, 0.017, 0.008], 0.005), "brass", 0.002);
  shape.add(ball([0.085, 0.36, surfaceAt(shape.distance, 0.085, 0.36) + 0.002], 0.013), "brass", 0.003);
  return shape.geometry(0.0085);
}

/** The upper arm from the shoulder to the elbow: a jacket sleeve, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.046, 0.035), JACKET)
    .geometry(0.011);
}

/** The forearm from the elbow to the wrist: the sleeve, a dark cuff, and the
 *  wrist inside it. Its rounded top covers the upper arm's narrower end
 *  however far the elbow bends. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.041, 0.035), JACKET)
    .add(ring([0, -FOREARM + 0.03, 0], 0.031, 0.012), "moonDark", 0.004)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.016, 0.002], 0.019, 0.017), SKIN)
    .geometry(0.008);
}

/** A breeches leg from the hip to the knee, flaring out at the side of the
 *  thigh as riding breeches do, tapering to the knee, where it ends inside
 *  the shin's top. `side` −1 is the right. */
function thigh(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.058, 0.038), BREECHES)
    .add(ellipsoid([side * 0.014, -0.085, -0.004], [0.058, 0.085, 0.056]), BREECHES, 0.04)
    .geometry(0.011);
}

/** A tall riding boot from the knee down: the breeches tucked in at its top,
 *  a turned welt at the top of the boot just below the knee, its end inside
 *  the boot's foot. Its rounded top covers the thigh's end at the knee. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.044, 0.034), BOOT)
    .paint((_, y) => (y > -0.05 ? -1 : 1), BREECHES)
    .add(stretched(ring([0, -0.058, 0.002], 0.042, 0.008), [0, -0.058, 0.002], [1, 1, 1.05]), BOOT, 0.004)
    .geometry(0.009);
}

/** A riding boot's foot on the base: a slim toe, a low block heel, a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.028, 0.08], [0.044, 0.032, 0.072]), BOOT)
    .add(ellipsoid([x, BASE_TOP + 0.034, -0.025], [0.042, 0.038, 0.052]), BOOT, 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.012], [x, BASE_TOP + 0.07, -0.008], 0.036), BOOT, 0.02)
    .add(roundBox([x, BASE_TOP + 0.012, -0.05], [0.032, 0.012, 0.026], 0.006), "soot", 0.006)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.009 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.009), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jacket: jacket(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    /** The right thigh, then the left: each flares to its outside. */
    thighs: [thigh(-1), thigh(1)],
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const VIVIAN_PARTS = figureParts("vivian", meshParts);
declareParts(vivian, [VIVIAN_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);

/** Vivian Lopez as a miniature on a round base, 5'5" at the house's scale.
 *  She stands like a film star between takes, her left hand on her hip,
 *  breathing and shifting her weight; now and then she swoons like a
 *  heroine of the old movies, the back of her hand to her brow and her head
 *  thrown back; and now and then she catches a whiff of smoke, her hand
 *  flying to her collar as she looks about for the fire. She walks with a
 *  rider's upright, even step, both arms swinging. Her right hand is free to
 *  hold a thing, and the swoon waits while it does. */
export function vivian(seed = "vivian", gait: Gait = STANDING): THREE.Group {
  const parts = VIVIAN_PARTS.get();
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
  const posesOf = (of: Arm, side: -1 | 1) => ({
    hangs: reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.05, -0.425, 0.04)), new THREE.Vector3(side * 0.3, 0, -1)),
    carries: reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.02, -0.27, 0.2)), new THREE.Vector3(side * 0.2, 0, -1)),
  });
  const poses = { right: posesOf(right, -1), left: posesOf(left, 1) };
  // Her left hand on her hip, the elbow out, the fingers down over the hip bone.
  const akimbo = pointHand(reachWrist(left, new THREE.Vector3(0.21, 0.12, -0.005), new THREE.Vector3(1, 0, -0.4)), new THREE.Vector3(-0.2, -1, 0.05));
  // The swoon: out to the side first, then the back of the wrist to her brow, the hand limp before her face.
  const swoonOut = reachWrist(right, new THREE.Vector3(-0.38, 0.3, 0.16), new THREE.Vector3(-0.4, -1, -0.4));
  const swoon = pointHand(reachWrist(right, new THREE.Vector3(-0.035, 0.665, 0.16), new THREE.Vector3(-1, 0, -0.1)), new THREE.Vector3(0.45, 0.05, 0.9), Math.PI / 2);
  // Smoke: her left hand flies from her hip to her collar.
  const collarOut = reachWrist(left, new THREE.Vector3(0.3, 0.22, 0.16), new THREE.Vector3(1, -0.4, -0.4));
  const collar = pointHand(reachWrist(left, new THREE.Vector3(0.06, 0.29, 0.16), new THREE.Vector3(1, -0.5, -0.3)), new THREE.Vector3(-0.35, 1, -0.1), -Math.PI / 2);

  const trunk = mesh(parts.jacket, "jacket");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} boot`));
    return leg(mesh(parts.thighs[i], `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.01),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), VIVIAN_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.1 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.1, 0.085)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING },
    left: { limb: left, side: 1 as const, swing: ARM_SWING },
  };
  const rig: StrideRig = { walking: VIVIAN_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.06 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    swoon: { every: 12, lasts: 3.2, chance: 0.65 },
    smoke: { every: 13, lasts: 2.6, chance: 0.6 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 8.5) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const { swoon: swooned, smoke } = bursts(clock);
    // The swoon fights the stride, so it eases out as the stride eases in, and waits while her right hand is full.
    const swooning = right.hand.held ? 0 : swooned.amount * still;
    // She looks about for the fire walking too; her hand goes to her collar only standing.
    const alarm = smoke.amount * (1 - swooning);
    const clutching = left.hand.held ? 0 : alarm * still;
    const way = smoke.pick < 0.5 ? -1 : 1;
    // Sniffing about: her head turns one way, then the other.
    const search = Math.sin(smoke.progress * Math.PI * 2) * way;

    // A film star's stance: her weight on one hip, the chest counter-turned.
    body.rotation.z = sway * 0.022;
    hips.rotation.z = sway * -0.012;
    chest.rotation.z = sway * -0.012 + swooning * 0.04;
    chest.rotation.x = breath * -0.012 - swooning * 0.08 - clutching * 0.05;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.014);
    const shrug = clutching * 0.012;
    left.shoulder.position.y = left.at.y + breath * 0.004 + shrug;
    right.shoulder.position.y = right.at.y + breath * 0.004 + shrug;

    neck.rotation.y = swooning * 0.35 + alarm * search * 0.8;
    neck.rotation.x = 0.04 - swooning * 0.3 - alarm * 0.12;
    neck.rotation.z = sway * 0.03 + swooning * 0.1;

    // Her right arm: hanging, carrying, or raised to her brow.
    const rightRest = right.hand.held?.carry === "upright" ? poses.right.carries : poses.right.hangs;
    poseArm(right, rightRest, swoonOut, THREE.MathUtils.clamp(swooning * 2, 0, 1));
    if (swooning > 0.5) poseArm(right, swoonOut, swoon, swooning * 2 - 1);
    poseHand(right.hand, holding(right.hand, blendPose(blendPose(RELAXED, OPEN, swooning * 0.7), fist(right.hand), running * 0.7)));

    // Her left: on her hip standing, swinging free walking, at her collar in alarm.
    const leftRest = left.hand.held ? (left.hand.held.carry === "upright" ? poses.left.carries : poses.left.hangs) : between(akimbo, poses.left.hangs, moving.amount);
    poseArm(left, leftRest, collarOut, THREE.MathUtils.clamp(clutching * 2, 0, 1));
    if (clutching > 0.5) poseArm(left, collarOut, collar, clutching * 2 - 1);
    // On her hip her fingers lie nearly flat along it.
    const onHip = left.hand.held ? 0 : still * (1 - clutching);
    poseHand(left.hand, holding(left.hand, blendPose(blendPose(RELAXED, OPEN, Math.max(clutching * 0.6, onHip * 0.7)), fist(left.hand), running * 0.7)));

    for (const [arm, side] of [
      [right, "right"],
      [left, "left"],
    ] as const) {
      const upright = arm.hand.held?.carry === "upright";
      const free = side === "left" && !arm.hand.held ? moving.amount : 1;
      swings[side].swing = (upright ? ARM_SWING * 0.3 : ARM_SWING) * free;
    }

    stride(rig, moving);
    for (const arm of [right, left]) if (arm.hand.held?.carry === "upright") aimGrip(arm.hand, figure, UP, 1);
  });
}
