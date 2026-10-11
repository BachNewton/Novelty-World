import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, ellipsoid, figureMaterial, form, intersect, loft, mergeAll, onSurface, plinth, ring, rod, roundBox, sculpt, stretched, type Distance, type Section, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, poseArm, poseHand, reachWrist, RELAXED, type Arm, type ArmPose } from "./hands";
import { skinOf } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Brandon Jaspers: a twelve-year-old paperboy who loves computers, camping
 * and hockey, and is afraid of puppets, clown puppets most of all. Read at a
 * glance: a lanky boy between Zoe and the grown-ups, a long grass-green hockey
 * jersey striped in cream, a green ball cap, and a camping pack on his back
 * with a bright orange bedroll across its top, over khaki shorts, bare knees,
 * striped socks and brown hiking boots. He faces +z; his right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("brandon-jaspers");

/** 5'1" at the miniature's scale, the cap's crown included. */
const TOP = BASE_TOP + miniatureHeight(5, 1);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.61;
const LEG = WAIST - BASE_TOP;
/** A boy's step, about his leg from hip to ankle: quicker than a grown-up's, with a spring in it. */
const BRANDON_WALK: Walking = { step: 0.46, hop: 0.026 };
const ARM_SWING = 0.42;
/** The neck's pivot: the head and cap stand 0.32 m above it, a big head for a boy's body. */
const NECK = TOP - 0.322;
const SHOULDER: [number, number] = [0.172, 0.985];
const UPPER_ARM = 0.21;
/** From the elbow to the wrist. */
const FOREARM = 0.165;
/** His hands, this many times an adult's. */
const HAND = 0.8;
const LEG_X = 0.064;
/** The ankle, in the boot, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.055;
const THIGH = 0.238;
const SHIN = 0.238;

/** The half-space above a plane through `y` at z = 0, rising `slope` metres per metre forward: where the cap ends. */
function above(y: number, slope: number): Solid {
  const norm = Math.hypot(1, slope);
  return { distance: (_, py, z) => (y + slope * z - py) / norm, min: [-0.3, y - 0.1, -0.3], max: [0.3, y + 0.3, 0.3] };
}

/** The head on its neck, in the neck's frame: a boy's longer face under a
 *  green ball cap, its brim forward over the brow, brown hair curling out
 *  beneath it at the sides and the nape, blue eyes, straight brows and a grin. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.05, 0], [0, 0.07, 0], 0.044, 0.042), SKIN)
    .add(ellipsoid([0, 0.18, 0], [0.11, 0.124, 0.116]), SKIN, 0.03)
    .add(ellipsoid([0, 0.108, 0.03], [0.086, 0.078, 0.088]), SKIN, 0.05)
    .add(rod([0, 0.15, 0.118], [0, 0.124, 0.132], 0.012, 0.017), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.041;
    shape.carve(ball([x, 0.152, 0.118], 0.019), { blend: 0.008 });
    shape.add(ball([x, 0.151, 0.097], 0.021), "boneLight");
    shape.paint(ball([x, 0.15, 0.117], 0.0115), "moon");
    shape.paint(ball([x, 0.15, 0.119], 0.0058), "void");
    shape.paint(ball([x + side * -0.004, 0.157, 0.118], 0.004), "boneLight");
    shape.add(rod([side * 0.018, 0.193, 0.117], [side * 0.066, 0.18, 0.104], 0.008, 0.007), "woodMid", 0.004);
  }
  shape
    // A grin: an arc under the nose.
    .paint((x, y, z) => Math.max(Math.abs(Math.hypot(x, y - 0.112) - 0.03) - 0.0055, y - 0.096, 0.07 - z), "blood")
    // Brown hair, cut short, showing under the cap behind the ears.
    .add(ellipsoid([0, 0.168, -0.045], [0.114, 0.1, 0.098]), "woodMid", 0.02);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.055, 0.115, -0.09], [0.04, 0.032, 0.028]), "woodMid", 0.02);
    shape.add(ellipsoid([side * 0.113, 0.155, 0.008], [0.017, 0.029, 0.021]), SKIN, 0.008);
  }
  return shape
    // The cap: a crown down to the brow in front and the nape behind, a brim forward and a button on top.
    .add(intersect(ellipsoid([0, 0.188, -0.005], [0.124, 0.136, 0.128]), above(0.2, 0.16)), "wraith", 0.004)
    .add(ellipsoid([0, 0.22, 0.122], [0.092, 0.015, 0.085]), "wraith", 0.008)
    .paint(above(0.218, 0.5), "wraith")
    .add(ball([0, 0.322, -0.005], 0.012), "wraithDark", 0.004)
    .geometry(0.007);
}

/** The jersey's back and front at its widest, in the chest's frame: the pack and straps are laid on it. */
function jersey() {
  const shape = sculpt()
    // The seat of his shorts, below the jersey's hem, which his thighs swing from.
    .add(ellipsoid([0, -0.035, 0], [0.122, 0.075, 0.088]), "boneDark")
    .add(roundBox([0, 0.09, 0], [0.122, 0.1, 0.085], 0.07), "wraith", 0.02)
    .add(roundBox([0, 0.26, 0], [0.122, 0.11, 0.092], 0.075), "wraith", 0.06);
  // The shoulders reach out over the tops of the sleeves, so a sleeve's round top never shows as a ball.
  for (const side of [-1, 1]) shape.add(rod([side * 0.05, 0.355, -0.005], [side * 0.175, 0.37, 0], 0.05, 0.06), "wraith", 0.05);
  shape
    // The loose hem, with its stripes.
    .add(stretched(ring([0, 0.012, 0], 0.118, 0.022), [0, 0.012, 0], [1.04, 1, 0.78]), "wraith", 0.01)
    .paint((_, y) => (y > 0.03 && y < 0.052 ? -1 : 1), "boneLight")
    .paint((_, y) => (y > 0.052 && y < 0.066 ? -1 : 1), "wraithDark")
    .paint((_, y) => (y > -0.012 && y < 0.03 && y > -0.03 ? -1 : 1), "wraith")
    // The laced collar.
    .add(stretched(ring([0, 0.415, -0.008], 0.052, 0.016), [0, 0.415, -0.008], [1, 1, 0.9]), "boneLight", 0.01)
    .paint(roundBox([0, 0.4, 0.07], [0.012, 0.035, 0.03], 0.006), "wraithDark");
  return shape;
}

/** Where the pack's back sits behind him, in the chest's frame. */
const PACK = { centre: [0, 0.2, -0.155] as Vec3, half: [0.105, 0.13, 0.06] as Vec3 };

/** The camping pack: a canvas sack with a pocket and a flap, and an orange bedroll strapped across its top. */
function pack(): THREE.BufferGeometry {
  const [cx, cy, cz] = PACK.centre;
  const [, hy, hz] = PACK.half;
  const top = cy + hy;
  return sculpt()
    .add(roundBox(PACK.centre, PACK.half, 0.045), "woodLight")
    .add(roundBox([cx, cy - 0.04, cz - hz + 0.005], [0.07, 0.05, 0.022], 0.02), "woodLight", 0.01)
    .paint((x, y, z) => (y > top - 0.07 && z < cz - 0.02 && Math.abs(x) < 0.09 ? -1 : 1), "woodMid")
    .add(ball([cx, top - 0.075, cz - hz - 0.008], 0.012), "brass")
    .add(rod([-0.15, top + 0.035, cz + 0.005], [0.15, top + 0.035, cz + 0.005], 0.048), "ember", 0.012)
    .paint((x) => Math.abs(Math.abs(x) - 0.085) - 0.009, "woodDark")
    .paint((x) => Math.abs(x) - 0.143, "amber")
    .geometry(0.01);
}

/** Lays a strap's spine on a surface: each point moved to the surface and lifted off it along its normal by `lift`. */
function laid(surface: Distance, points: readonly Vec3[], lift: number): Vec3[] {
  const e = 0.001;
  return points.map((point) => {
    const [x, y, z] = onSurface(surface, point, 0.1);
    const normal = new THREE.Vector3(
      surface(x + e, y, z) - surface(x - e, y, z),
      surface(x, y + e, z) - surface(x, y - e, z),
      surface(x, y, z + e) - surface(x, y, z - e),
    ).normalize();
    return [x + normal.x * lift, y + normal.y * lift, z + normal.z * lift];
  });
}

/** How thick his pack's straps are, and how clear of the jersey they lie. */
const STRAP = { radius: 0.011, gap: 0.004 };

/** The pack's straps over his shoulders and down his chest, joined by a strap across it with a buckle. */
function straps(): THREE.BufferGeometry {
  const surface = jersey().distance;
  const lift = STRAP.radius + STRAP.gap;
  const band = (at: Vec3): Section => ({ at, radius: STRAP.radius, colour: "woodDark" });
  const shoulders = [-1, 1].map((side) =>
    loft(
      laid(surface, [
        [side * 0.085, 0.3, -0.11],
        [side * 0.085, 0.37, -0.07],
        [side * 0.088, 0.405, 0],
        [side * 0.09, 0.37, 0.07],
        [side * 0.092, 0.3, 0.1],
        [side * 0.095, 0.2, 0.1],
        [side * 0.098, 0.13, 0.095],
      ], lift).map(band),
    ),
  );
  const across = laid(surface, [-0.09, -0.045, 0, 0.045, 0.09].map((x): Vec3 => [x, 0.235, 0.1]), STRAP.radius * 0.7 + STRAP.gap);
  const buckle = sculpt().add(ellipsoid(laid(surface, [[0, 0.235, 0.1]], 0.014 + STRAP.gap)[0], [0.018, 0.014, 0.008]), "brass").geometry(0.004);
  return mergeAll([...shoulders, loft(across.map((at) => ({ at, radius: STRAP.radius * 0.7, colour: "woodDark" as const }))), buckle]);
}

/** A green jersey sleeve from the shoulder, set in under the jersey's, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.02, 0], [0, -UPPER_ARM, 0], 0.05, 0.039), "wraith")
    .geometry(0.008);
}

/** The forearm from the elbow to the wrist: the sleeve with its cream stripes, a dark cuff, and a thin wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.025, 0], 0.043, 0.036), "wraith")
    .paint((_, y) => (y < -0.05 && y > -0.075 ? -1 : 1), "boneLight")
    .add(ring([0, -FOREARM + 0.027, 0], 0.03, 0.011), "wraithDark", 0.005)
    .add(rod([0, -FOREARM + 0.045, 0], [0, -FOREARM + 0.015, 0.002], 0.022, 0.02), SKIN)
    .geometry(0.006);
}

/** A khaki shorts leg from the hip, and a bare thigh below it down to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.1, 0.002], [0, -THIGH, 0.003], 0.043, 0.037), SKIN)
    .add(rod([0, -0.015, 0], [0, -0.115, 0.002], 0.055, 0.055), "boneDark", 0.01)
    .geometry(0.007);
}

/** A bare knee and shin, and a cream sock with two green stripes at its top, down into the boot. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.003], [0, -SHIN + 0.008, -0.002], 0.04, 0.032), SKIN)
    .paint((_, y) => (y < -0.1 ? -1 : 1), "boneLight")
    .paint((_, y) => (Math.abs(y + 0.115) < 0.006 || Math.abs(y + 0.135) < 0.006 ? -1 : 1), "wraith")
    .geometry(0.006);
}

/** A brown hiking boot on the base, laced up the front, with a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.028, 0.058], [0.05, 0.032, 0.078]), "woodMid")
    .add(ellipsoid([x, BASE_TOP + 0.034, -0.012], [0.047, 0.04, 0.056]), "woodMid", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.01], [x, BASE_TOP + 0.078, -0.006], 0.043, 0.041), "woodMid", 0.025)
    .add(ring([x, BASE_TOP + 0.078, -0.006], 0.04, 0.007), "woodDark", 0.004)
    .paint(roundBox([x, BASE_TOP + 0.06, 0.04], [0.014, 0.022, 0.05], 0.006), "boneLight")
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.012 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.007), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jersey: jersey().geometry(0.009),
    pack: pack(),
    straps: straps(),
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
export const BRANDON_PARTS = figureParts("brandon", meshParts);
declareParts(brandon, [BRANDON_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);

/** Brandon Jaspers as a miniature on a round base, 5'1" at the house's scale.
 *  He can't keep still: he rocks on his feet and bobs his head; now and then
 *  he grabs his pack's straps and hitches it up his back, and now and then he
 *  flinches, fists up, and looks round, as if a clown puppet had turned its
 *  head. He walks with quick, springy steps. His right hand is free to hold
 *  a thing; his left hitches his pack whatever the right holds. */
export function brandon(seed = "brandon", gait: Gait = STANDING): THREE.Group {
  const parts = BRANDON_PARTS.get();
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
  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const hangs = (of: Arm, side: number) => reachWrist(of, wristAt(of, [side * 0.095, -0.35, 0.04]), bend);
  const poses = {
    right: {
      hangs: hangs(right, -1),
      // A thing hanging from his hand is held a little out from his side.
      holds: reachWrist(right, wristAt(right, [-0.1, -0.33, 0.07]), bend),
      carries: reachWrist(right, wristAt(right, [-0.03, -0.2, 0.2]), new THREE.Vector3(-0.3, 0, -1)),
      hitches: reachWrist(right, new THREE.Vector3(-0.1, 0.13, 0.2), new THREE.Vector3(-1, -0.4, -0.5)),
      guards: reachWrist(right, new THREE.Vector3(-0.085, 0.27, 0.215), new THREE.Vector3(-1, -0.7, -0.3)),
    },
    left: {
      hangs: hangs(left, 1),
      hitches: reachWrist(left, new THREE.Vector3(0.1, 0.13, 0.2), new THREE.Vector3(1, -0.4, -0.5)),
      guards: reachWrist(left, new THREE.Vector3(0.085, 0.27, 0.215), new THREE.Vector3(1, -0.7, -0.3)),
    },
  };

  const trunk = mesh(parts.jersey, "jersey");
  const backpack = mesh(parts.pack, "pack");
  const strapped = mesh(parts.straps, "straps");
  const carried = group(backpack, strapped);
  const chest = group(trunk, carried, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} boot`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.008),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), BRANDON_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.09 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.1 },
    // The pack rides on his back, its face pressed into the jersey.
    { parts: [backpack, trunk], at: carried, radius: 0.5 },
    { parts: [backpack, strapped], at: carried, radius: 0.5 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.15, 0.085, 0.07)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 },
    left: { limb: left, side: 1 as const, swing: ARM_SWING },
  };
  const rig: StrideRig = { walking: BRANDON_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.05 };

  const rng = createRng(seed);
  const rockPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, { hitch: { every: 9, lasts: 1.8, chance: 0.7 }, puppet: { every: 11, lasts: 2.6, chance: 0.5 } });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const breath = Math.sin((seconds / 3.2) * Math.PI * 2);
    // A restless boy's rock from foot to foot, quicker than a grown-up's sway.
    const rock = Math.sin((seconds / 2.6) * Math.PI * 2 + rockPhase);
    const { hitch, puppet } = bursts(clock);
    // Running, he only runs. Walking, he still looks round, but his arms swing: they leave the gestures to standing.
    const scared = puppet.amount * (1 - running);
    const still = 1 - moving.amount;
    const hitching = hitch.amount * (1 - scared) * still;
    const guarding = scared * still;
    // Two quick tugs up his back, as the hands hold the straps.
    const tug = hitching * Math.max(0, Math.sin(hitch.progress * Math.PI * 4)) ** 2;
    const held = right.hand.held;
    const upright = held?.carry === "upright";

    body.rotation.z = rock * 0.022;
    chest.rotation.z = rock * -0.012;
    // He flinches back from the thing he saw.
    chest.rotation.x = breath * -0.015 - scared * 0.12;
    backpack.position.y = tug * 0.014;
    const shrug = breath * 0.004 + tug * 0.018 + scared * 0.02;
    left.shoulder.position.y = left.at.y + shrug;
    right.shoulder.position.y = right.at.y + shrug;

    neck.rotation.y = scared * (puppet.pick < 0.5 ? -1 : 1) * 0.95 + rock * 0.05;
    neck.rotation.x = -0.03 + scared * 0.08 + hitching * 0.06;
    neck.rotation.z = rock * -0.04;

    // Hitching his pack, he grabs his straps; scared, he puts his fists up.
    const rightRests = upright ? poses.right.carries : held ? poses.right.holds : poses.right.hangs;
    const rightBusy = held ? 0 : 1;
    const gesture = (hitches: ArmPose, guards: ArmPose) => between(hitches, guards, guarding / Math.max(guarding + hitching, 1e-6));
    poseArm(right, rightRests, gesture(poses.right.hitches, poses.right.guards), Math.max(hitching, guarding) * rightBusy);
    poseArm(left, poses.left.hangs, gesture(poses.left.hitches, poses.left.guards), Math.max(hitching, guarding));
    const clench = Math.max(running * 0.8, hitching, guarding);
    poseHand(right.hand, holding(right.hand, blendPose(RELAXED, fist(right.hand), clench)));
    poseHand(left.hand, blendPose(RELAXED, fist(left.hand), clench));
    swings.right.swing = upright ? ARM_SWING * 0.25 : ARM_SWING;
    swings.right.pump = held ? 0.4 : 1;

    const step = stride(rig, moving);
    chest.rotation.y = step * 0.08;
    if (upright) aimGrip(right.hand, figure, UP, 1);
  });
}
