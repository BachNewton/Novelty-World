import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, ellipsoid, figureMaterial, form, plinth, ring, rod, roundBox, sculpt, stretched, surfaceAt, type Vec3 } from "../forms";
import { declareParts, figureParts } from "../figure-parts";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "../explorers/figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm, type ArmPose, type HandPose } from "../explorers/hands";
import { skinOf, skinShade } from "../explorers/skin";

/*
 * The Madman: an omen an explorer keeps, a lost soul of the house who follows
 * them as an ally of uncertain mind: he lends his strength, and costs a little
 * of their reason. Gothic and unsettling, but a man, never a joke: he listens
 * to the walls, whispers to someone who isn't there, and flinches from what he
 * alone can see. Read at a glance: the tallest, thinnest figure in the house,
 * stooped, his head jutting forward under a wild shock of grey hair, in a
 * shabby plum frock jacket hanging open on a grimy cream shirt, its tails
 * untucked, sleeves rolled to bare bony forearms, grey trousers and old
 * boots. Plum is no character card's colour (its nearest, the purple card,
 * is far lighter), so he is never taken for a seat. He faces +z; his right
 * hand is on −x.
 *
 * He takes Flash's adult build, stretched to his 6'2" and thinned to a gaunt
 * man's, and the shared arms, hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("madman");
/** His frock jacket, its worn edges; his shirt; his trousers; his boots; his hair. */
const JACKET = "bruise";
const JACKET_EDGE = "bruiseDark";
const SHIRT = "bone";
const TROUSERS = "stone";
const BOOTS = "woodDark";
const HAIR = "stoneLight";

/** 6'2" at the miniature's scale, standing straight; he seldom does. */
const TOP = BASE_TOP + miniatureHeight(6, 2);
/** Long legs: the hips higher than Flash's. */
const WAIST = 0.78;
const HIP = WAIST - BASE_TOP;
/** A long, loping step with a loose bounce in it. */
const MADMAN_WALK: Walking = { step: 0.64, hop: 0.03 };
const ARM_SWING = 0.4;
/** The neck's pivot: the head and its hair stand about 0.38 above it. */
const NECK = TOP - 0.385;
/** Narrow, bony shoulders. */
const SHOULDER: [number, number] = [0.205, 1.2];
/** Long arms. */
const UPPER_ARM = 0.31;
/** From the elbow to the wrist. */
const FOREARM = 0.25;
/** Big, bony hands. */
const HAND = 1.08;
const LEG_X = 0.066;
/** The ankle, in the boot, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.064;
const THIGH = (HIP - (ANKLE - BASE_TOP)) / 2;
const SHIN = THIGH;
/** How far he stoops: the chest forward from the waist, and the head forward on the neck. */
const STOOP = 0.13;
const JUT = 0.16;

/** His wild hair: clumps standing out from the skull's centre, each from inside the scalp out to its rounded end, a
 *  fixed spread of ways over the crown, the sides above his ears and the back of his head (never over his face),
 *  lopsided in length so the shock stands out more on his right and behind. */
const SKULL_MIDDLE: Vec3 = [0, 0.235, -0.01];
const TUFTS: readonly { way: THREE.Vector3; length: number; radius: number }[] = Array.from({ length: 44 }, (_, i) => {
  // A golden-angle spiral over the head, from the crown down.
  const down = 0.1 + (i / 43) * 1.45;
  const round = i * 2.39996;
  const way = new THREE.Vector3(Math.sin(down) * Math.cos(round), Math.cos(down), Math.sin(down) * Math.sin(round));
  const lopsided = 1 + 0.18 * Math.max(0, -way.x) + 0.12 * Math.max(0, -way.z);
  return { way, length: (0.165 + 0.025 * Math.sin(i * 7.3)) * lopsided, radius: 0.042 + 0.009 * Math.cos(i * 5.1) };
}).filter(({ way }) => way.y > -0.1 && !(way.z > 0.3 && way.y < 0.8) && !(way.z > -0.2 && way.y < 0.25));

/** The head on its neck: a long, gaunt face, kept smooth and simple, a long
 *  nose, eyes wide under heavy brows, grey stubble on his jaw, and a wild,
 *  lopsided shock of grey hair standing out round his head. */
function head(): THREE.BufferGeometry {
  const skull = ellipsoid([0, 0.235, -0.01], [0.1, 0.125, 0.115]);
  const shape = sculpt()
    .add(rod([0, -0.04, -0.01], [0, 0.12, 0], 0.046, 0.042), SKIN)
    .add(skull, SKIN, 0.04)
    // A long jaw, narrow at the chin.
    .add(ellipsoid([0, 0.14, 0.03], [0.074, 0.1, 0.09]), SKIN, 0.05)
    .add(ellipsoid([0, 0.075, 0.07], [0.035, 0.03, 0.035]), SKIN, 0.03)
    .add(ellipsoid([0, 0.225, 0.088], [0.078, 0.022, 0.03]), SKIN, 0.02)
    .add(rod([0, 0.215, 0.112], [0, 0.15, 0.146], 0.013, 0.021), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.038;
    shape.add(ellipsoid([side * 0.1, 0.19, -0.005], [0.016, 0.035, 0.025]), SKIN, 0.01);
    // Eyes wide open under the brow: the white showing round a small dark iris.
    shape.carve(ball([x, 0.193, 0.118], 0.02), { blend: 0.008 });
    shape.add(ball([x, 0.193, 0.1], 0.0195), "boneLight");
    shape.paint(ball([x, 0.193, 0.119], 0.0075), "void");
    shape.paint(ball([x - side * 0.003, 0.197, 0.12], 0.0028), "boneLight");
    shape.add(rod([side * 0.014, 0.226, 0.118], [side * 0.066, 0.232, 0.1], 0.01, 0.008), HAIR, 0.006);
  }
  shape
    // Stubble along his jaw and upper lip, and a thin, straight mouth.
    .paint((x, y, z) => (z > -0.02 && y < 0.135 && y > 0.04 && Math.hypot(x / 0.08, (y - 0.12) / 0.09) < 1.15 ? -1 : 1), skinShade(SKIN))
    .paint(ellipsoid([0, 0.107, 0.103], [0.022, 0.0045, 0.02]), "blood");
  // The hair's clumps, standing out from his scalp.
  for (const { way, length, radius } of TUFTS) {
    const end = new THREE.Vector3(...SKULL_MIDDLE).addScaledVector(way, length);
    const root = new THREE.Vector3(...SKULL_MIDDLE).addScaledVector(way, 0.07);
    shape.add(rod(root.toArray(), end.toArray(), radius * 1.2, radius * 0.65), HAIR, 0.022);
  }
  return shape.geometry(0.0075);
}

/** The front edges of his jacket, hanging open: where a point on the front lies inside the jacket's cloth. */
function onJacket(x: number, y: number, z: number): boolean {
  if (z < 0) return true;
  // The opening widens from a little below the collar to the hem, and the lapels turn back above.
  const open = 0.035 + 0.05 * THREE.MathUtils.smoothstep(y, 0.4, 0.05);
  return Math.abs(x) > open;
}

/** Where his jacket's buttons sit down its left front, in the jacket's frame, mismatched: the top one is missing. */
const BUTTONS: readonly [number, number][] = [
  [0.07, 0.3],
  [0.078, 0.22],
  [0.086, 0.14],
];

/** The torso from the waist up: a thin, stooped chest under a cream shirt open
 *  at the throat, its tails hanging untucked below a shabby plum frock jacket
 *  worn open, its lapels, its worn edges and three buttons on his left front,
 *  the jacket's shoulders reaching out over the tops of his sleeves; and below
 *  the hem, the seat of his trousers, which his thighs swing from. */
function jacket(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.025, 0], [0.13, 0.08, 0.095]), TROUSERS)
    .add(roundBox([0, 0.08, 0], [0.122, 0.1, 0.088], 0.07), SHIRT, 0.02)
    .add(ellipsoid([0, 0.27, -0.005], [0.165, 0.17, 0.1]), SHIRT, 0.08);
  for (const side of [-1, 1]) shape.add(rod([side * 0.05, 0.42, -0.012], [side * 0.205, 0.405, -0.004], 0.045, 0.051), JACKET, 0.05);
  // The open shirt collar's points at his throat.
  shape.add(stretched(ring([0, 0.46, -0.008], 0.056, 0.016), [0, 0.46, -0.008], [1, 1.3, 0.95]), SHIRT, 0.01);
  for (const side of [-1, 1]) shape.add(ellipsoid([side * 0.032, 0.452, 0.06], [0.03, 0.012, 0.022]), SHIRT, 0.006);
  const distance = shape.distance;
  // The jacket is painted over the shirt everywhere but its open front, down to its hem just below the waist; the
  // shirt's tails show below it in front, longer on his right, over the trousers' seat.
  shape
    .paint((x, y, z) => (y > 0.03 && y < 0.445 && onJacket(x, y, z) ? -1 : 1), JACKET)
    .paint((x, y, z) => (y > 0.03 && y < 0.445 && onJacket(x, y, z) && z > 0 && Math.abs(x) < 0.12 && !onJacket(x * 0.8, y, z) ? -1 : 1), JACKET_EDGE)
    .paint((x, y) => (y < 0.03 ? -1 : 1), SHIRT)
    .paint((x, y, z) => (y < 0.012 + 0.1 * Math.max(0, x) || (y < 0.03 && z < 0.02) ? -1 : 1), TROUSERS);
  for (const [x, y] of BUTTONS) shape.add(ball([x, y, surfaceAt(distance, x, y, 1) - 0.002], 0.009), "brass");
  return shape.geometry(0.011);
}

/** The upper arm from the shoulder to the elbow: a plum jacket sleeve, thin and worn, set in under the jacket's
 *  shoulder, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.045, 0.036), JACKET)
    .geometry(0.009);
}

/** The forearm from the elbow: the jacket's sleeve pushed up over the rolled cream shirt sleeve, and a bare, bony
 *  forearm to the wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -0.06, 0], 0.042, 0.04), JACKET)
    .add(ring([0, -0.065, 0], 0.036, 0.014), SHIRT, 0.006)
    .add(rod([0, -0.06, 0], [0, -FOREARM + 0.012, 0.002], 0.03, 0.021), SKIN, 0.012)
    .geometry(0.0075);
}

/** A grey trouser leg from the hip to the knee, thin, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.048, 0.04), TROUSERS)
    .geometry(0.011);
}

/** A grey trouser leg from the knee, frayed a little short, into the boot. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.01, -0.004], 0.044, 0.031), TROUSERS)
    .add(ring([0, -SHIN + 0.07, -0.003], 0.034, 0.008), "stoneDark", 0.006)
    .geometry(0.009);
}

/** An old dark boot on the base: a long toe, a heel, a scuffed lighter toe cap and a dark sole. */
function boot(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.028, 0.09], [0.044, 0.03, 0.085]), BOOTS)
    .add(ellipsoid([x, BASE_TOP + 0.035, -0.03], [0.044, 0.04, 0.056]), BOOTS, 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.012], [x, BASE_TOP + 0.1, -0.006], 0.047, 0.045), BOOTS, 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y, z) => (z > 0.13 && y > BASE_TOP + 0.012 ? -1 : 1), "wood")
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
    thigh: thigh(),
    shin: shin(),
    boots: [boot(-LEG_X), boot(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** His parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const MADMAN_PARTS = figureParts("madman", meshParts);
declareParts(madman, [MADMAN_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);
const smooth = THREE.MathUtils.smoothstep;
/** A bump easing up from 0 to 1 between `a` and `b`, holding, and back down between `c` and `d`. */
const bump = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) - smooth(t, c, d);
/** A hand cupped behind an ear: the fingers curled a little. */
const CUPPED: HandPose = { knuckles: [0.35, 0.5, 0.4], thumb: 0.2 };

/** The Madman as a miniature on a round base, 6'2" at the house's scale,
 *  stooped. He is never quite still: he shifts his weight, his head tilting
 *  this way and that, and his long fingers twitch; now and then he cups a
 *  hand to his ear and listens, his head cocked, to something in the walls;
 *  now and then he turns and leans to whisper to someone beside him who
 *  isn't there; and now and then he flinches back from nothing, his arms
 *  thrown up before his face, and lowers them slowly. He walks with a long,
 *  loose, loping step, his head bobbing forward. Either hand can hold a thing;
 *  the listening waits while his right does, the whisper while his left does. */
export function madman(seed = "madman", gait: Gait = STANDING): THREE.Group {
  const parts = MADMAN_PARTS.get();
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
  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const posesOf = (of: Arm) => {
    const side = of.hand.side;
    return {
      // His long arms hang loose, the hands a little before his thighs.
      hangs: reachWrist(of, wristAt(of, [side * 0.02, -0.52, 0.1]), new THREE.Vector3(side * 0.3, 0, -1)),
      carries: reachWrist(of, wristAt(of, [side * 0.02, -0.32, 0.24]), new THREE.Vector3(side * 0.2, 0, -1)),
      // Flinching: both arms thrown up before his face, the palms out, on the way up forward first.
      before: reachWrist(of, new THREE.Vector3(side * 0.14, 0.25, 0.3), new THREE.Vector3(side, -1, -0.3)),
      shields: pointHand(reachWrist(of, new THREE.Vector3(side * 0.1, 0.6, 0.32), new THREE.Vector3(side, -0.6, -0.3)), new THREE.Vector3(side * 0.15, 1, 0.25), side * 0.4),
    };
  };
  const poses = { right: posesOf(right), left: posesOf(left) };
  // Listening: his right hand cupped behind his right ear, the elbow out.
  const listens = pointHand(reachWrist(right, new THREE.Vector3(-0.24, 0.58, 0.15), new THREE.Vector3(-1, -0.5, -0.2)), new THREE.Vector3(0.4, 0.8, -0.45), -Math.PI / 2);
  const towardsEar = reachWrist(right, new THREE.Vector3(-0.3, 0.38, 0.12), new THREE.Vector3(-1, -0.6, -0.3));
  // Whispering: his left hand raised beside his mouth, shielding it, as he leans to his left.
  const whispers = pointHand(reachWrist(left, new THREE.Vector3(0.2, 0.55, 0.2), new THREE.Vector3(1, -0.8, -0.3)), new THREE.Vector3(-0.15, 1, 0.25), Math.PI / 2);
  const towardsMouth = reachWrist(left, new THREE.Vector3(0.24, 0.3, 0.26), new THREE.Vector3(1, -0.6, -0.3));
  /** An arm from `rest` into `to`, `amount` of the way, by way of `via`. */
  const raised = (rest: ArmPose, via: ArmPose, to: ArmPose, amount: number) => (amount < 0.5 ? between(rest, via, amount * 2) : between(via, to, amount * 2 - 1));

  const trunk = mesh(parts.jacket, "jacket");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.boots[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} boot`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.012),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), MADMAN_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.11 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.11 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.11 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.1, 0.09)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING },
    left: { limb: left, side: 1 as const, swing: ARM_SWING },
  };
  const rig: StrideRig = { walking: MADMAN_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.05 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const tiltPhase = rng.next() * Math.PI * 2;
  const twitchPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    listen: { every: 10, lasts: 3.6, chance: 0.6 },
    whisper: { every: 12, lasts: 3.4, chance: 0.55 },
    flinch: { every: 14, lasts: 3, chance: 0.45 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.4) * Math.PI * 2 + breathPhase);
    // An uneasy sway, never settling: two slow rhythms against each other.
    const sway = Math.sin((seconds / 5.3) * Math.PI * 2 + swayPhase) * 0.7 + Math.sin((seconds / 2.1) * Math.PI * 2 + swayPhase * 2) * 0.3;
    const tilt = Math.sin((seconds / 4.1) * Math.PI * 2 + tiltPhase) * Math.sin((seconds / 9.7) * Math.PI * 2);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const { listen, whisper, flinch } = bursts(clock);
    // The flinch carries on walking (he shies from it as he goes) but not running, when his arms pump.
    const flinching = flinch.amount * (1 - running);
    // Its arms go up at once and come down slowly.
    const thrown = flinching * bump(flinch.progress, 0, 0.12, 0.45, 0.95);
    const listening = right.hand.held ? 0 : listen.amount * still * (1 - flinching);
    const whispering = left.hand.held ? 0 : whisper.amount * still * (1 - flinching) * (1 - listening);
    const calm = (1 - flinching) * (1 - listening) * (1 - whispering);

    body.rotation.z = sway * 0.022 * calm - whispering * 0.03;
    hips.rotation.z = sway * -0.01 * calm;
    chest.rotation.x = STOOP + breath * -0.012 - thrown * 0.16 + whispering * 0.05;
    chest.rotation.z = sway * -0.014 * calm - whispering * 0.1 + listening * 0.04;
    chest.rotation.y = whispering * 0.35 - thrown * 0.1;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.014);
    const hunch = thrown * 0.03;
    left.shoulder.position.y = left.at.y + breath * 0.004 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.004 + hunch;

    // His head jutting forward, tilting this way and that; cocked hard to listen, turned to whisper, turned away from what he flinches at.
    neck.rotation.x = JUT - listening * 0.25 + whispering * 0.05 - thrown * 0.05;
    neck.rotation.y = tilt * 0.2 * calm + whispering * 0.45 + listening * -0.25 + thrown * (flinch.pick < 0.5 ? -0.5 : 0.5);
    neck.rotation.z = tilt * 0.14 * calm - listening * 0.38 + whispering * 0.08;

    for (const [arm, side, own] of [
      [right, "right", poses.right],
      [left, "left", poses.left],
    ] as const) {
      const upright = arm.hand.held?.carry === "upright";
      const rest = upright ? own.carries : own.hangs;
      const gesture = side === "right" ? raised(rest, towardsEar, listens, listening) : raised(rest, towardsMouth, whispers, whispering);
      const pose = between(gesture, raised(rest, own.before, own.shields, thrown), arm.hand.held ? 0 : thrown);
      poseArm(arm, pose, pose, 1);
      // His long fingers twitch, never at rest.
      const twitch = 0.5 + 0.5 * Math.sin(seconds * (side === "right" ? 5.3 : 4.1) + twitchPhase) * Math.sin(seconds * 1.7 + (side === "right" ? 0 : 1));
      const restless = blendPose(RELAXED, { knuckles: [0.6, 0.75, 0.5], thumb: 0.4 }, twitch * calm);
      const gesturing = side === "right" ? blendPose(restless, CUPPED, listening) : blendPose(restless, OPEN, whispering);
      const empty = blendPose(blendPose(gesturing, OPEN, thrown), fist(arm.hand), running * 0.6);
      poseHand(arm.hand, holding(arm.hand, empty));
      swings[side].swing = (upright ? ARM_SWING * 0.3 : ARM_SWING) * (1 - thrown);
    }

    const step = stride(rig, moving);
    // His head bobs forward at each step, and his thin shoulders twist.
    neck.rotation.x += Math.abs(step) * 0.06 * moving.amount * (1 - running);
    chest.rotation.y += step * 0.07;
    for (const arm of [right, left]) if (arm.hand.held?.carry === "upright") aimGrip(arm.hand, figure, UP, 1);
  });
}
