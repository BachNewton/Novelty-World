import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, drum, ellipsoid, figureMaterial, form, intersect, plinth, ring, rod, roundBox, sculpt, stretched, type Solid, type Vec3 } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm } from "./hands";
import { skinOf, skinShade } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Darrin "Flash" Williams: a 20-year-old sprinter, all Speed, who loves music
 * and Shakespeare and can't shake the feeling that some Not Good Thing is
 * coming after him. Read at a glance: a lean, long-legged runner in a charcoal
 * tracksuit with red stripes over his shoulders and down his arms and legs,
 * a big gold lightning bolt on his chest, white headphones over close-cropped
 * black hair, and red running shoes. He faces +z; his right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("darrin-flash-williams");

/** 5'11" at the miniature's scale, to the top of his hair. */
const TOP = BASE_TOP + miniatureHeight(5, 11);
/** A runner's long legs: the hips sit higher than Longfellow's, at the same height. */
const WAIST = 0.74;
const HIP = WAIST - BASE_TOP;
/** A runner's spring: a long, light step and a high bounce. */
const FLASH_WALK: Walking = { step: 0.62, hop: 0.026 };
const ARM_SWING = 0.36;
/** The neck's pivot: the head and its hair stand 0.375 above it. */
const NECK = TOP - 0.375;
const SHOULDER: [number, number] = [0.235, 1.15];
const UPPER_ARM = 0.29;
/** From the elbow to the wrist. */
const FOREARM = 0.23;
const LEG_X = 0.07;
/** The ankle, in the shoe, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.062;
const THIGH = 0.3;
const SHIN = 0.3;

/** Everything on the side of `boundary` its sign says is above, within a box: for hair down to a hairline. */
function above(boundary: (x: number, z: number) => number, min: Vec3, max: Vec3): Solid {
  return { distance: (x, y, z) => boundary(x, z) - y, min, max };
}

/** The head on its neck, in the neck's frame: a young face with a strong
 *  brow and a broad nose, close-cropped black hair, and white headphones
 *  with red cups over his ears. */
function head(): THREE.BufferGeometry {
  const skull = ellipsoid([0, 0.225, -0.01], [0.105, 0.125, 0.12]);
  const shape = sculpt()
    .add(rod([0, -0.03, -0.01], [0, 0.12, 0], 0.056, 0.05), SKIN)
    .add(skull, SKIN, 0.04)
    .add(ellipsoid([0, 0.15, 0.025], [0.088, 0.09, 0.1]), SKIN, 0.05)
    .add(ellipsoid([0, 0.22, 0.092], [0.08, 0.02, 0.03]), SKIN, 0.02)
    .add(rod([0, 0.205, 0.114], [0, 0.16, 0.136], 0.014, 0.024), SKIN, 0.012)
    .add(ellipsoid([0, 0.124, 0.112], [0.03, 0.011, 0.016]), SKIN, 0.008);
  for (const side of [-1, 1]) {
    const x = side * 0.04;
    shape.carve(ball([x, 0.188, 0.12], 0.019), { blend: 0.008 });
    shape.add(ball([x, 0.188, 0.102], 0.018), "boneLight");
    shape.paint(ball([x, 0.189, 0.12], 0.009), "void");
    shape.add(rod([side * 0.018, 0.222, 0.118], [side * 0.068, 0.226, 0.104], 0.008, 0.006), "soot", 0.004);
  }
  // The close crop: a thin cap of hair over the skull, down to a hairline at the brow, the temples and the nape.
  const hairline = (x: number, z: number) => 0.27 - 0.12 * THREE.MathUtils.smoothstep(-z, -0.06, 0.1) - 0.04 * THREE.MathUtils.smoothstep(Math.abs(x), 0.06, 0.1);
  shape
    .add(intersect(ellipsoid([0, 0.228, -0.012], [0.111, 0.132, 0.127]), above(hairline, [-0.12, 0.1, -0.15], [0.12, 0.37, 0.13])), "soot", 0.006)
    .paint(ellipsoid([0, 0.124, 0.126], [0.026, 0.006, 0.012]), skinShade(SKIN));
  // The headphones: a band arching over the crown, from cup to cup, and a padded cup over each ear.
  const band = Array.from({ length: 13 }, (_, i): Vec3 => {
    const angle = ((i - 6) / 6) * 1.4;
    return [Math.sin(angle) * 0.132, 0.19 + Math.cos(angle) * 0.188, -0.012];
  });
  shape.add(chain(band, band.map(() => 0.011)), "boneLight", 0.004);
  for (const side of [-1, 1]) {
    shape.add(drum([side * 0.106, 0.185, -0.01], 0.036, 0.008, 0.004, [0, 0, Math.PI / 2]), "soot", 0.004);
    shape.add(drum([side * 0.124, 0.185, -0.01], 0.042, 0.014, 0.008, [0, 0, Math.PI / 2]), "bloodLight", 0.004);
    shape.paint(ring([side * 0.139, 0.185, -0.01], 0.036, 0.007, [0, 0, Math.PI / 2]), "boneLight");
  }
  return shape.geometry(0.007);
}

/** Where the lightning bolt sits on the jacket's front (his left breast), and how big it is. */
const BOLT_AT: [number, number] = [0.095, 0.27];
const BOLT_SIZE = 1.35;
/** The bolt's outline, seen from the front, about its middle. */
const BOLT: readonly [number, number][] = [
  [0.005, 0.065],
  [0.037, 0.065],
  [0.014, 0.016],
  [0.034, 0.016],
  [-0.024, -0.067],
  [-0.004, -0.008],
  [-0.026, -0.008],
];

/** Signed distance in x and y to a closed polygon: negative inside. */
function polygon(points: readonly [number, number][], x: number, y: number): number {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    const [ex, ey] = [bx - ax, by - ay];
    const t = THREE.MathUtils.clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

/** The lightning bolt as a flat patch, grown by `grow` for its border. */
function bolt(x: number, y: number, grow: number): number {
  return polygon(BOLT, (x - BOLT_AT[0]) / BOLT_SIZE, (y - BOLT_AT[1]) / BOLT_SIZE) * BOLT_SIZE - grow;
}

/** The track jacket from the hem up, built from the waist: a runner's V from
 *  broad shoulders to a narrow waist, zipped up the front to a stand-up
 *  collar, a red stripe over each shoulder, a ribbed hem, and the gold bolt
 *  on his left breast; and below the hem, the seat of his track pants, which
 *  his thighs swing from. */
function jacket(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, -0.025, 0], [0.145, 0.085, 0.105]), "ash")
    .add(roundBox([0, 0.09, 0], [0.145, 0.1, 0.1], 0.07), "ash", 0.02)
    .add(ellipsoid([0, 0.28, 0], [0.19, 0.175, 0.118]), "ash", 0.08);
  // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one and never shows as a ball.
  for (const side of [-1, 1]) shape.add(rod([side * 0.06, 0.425, -0.01], [side * 0.235, 0.41, -0.004], 0.056, 0.068), "ash", 0.06);
  shape
    .add(stretched(ring([0, 0.005, 0], 0.135, 0.026), [0, 0.005, 0], [1.08, 1, 0.78]), "soot", 0.01)
    .add(stretched(ring([0, 0.475, -0.012], 0.068, 0.028), [0, 0.475, -0.012], [1, 1.4, 0.92]), "ash", 0.012)
    .paint((_, y) => (y > 0.505 ? -1 : 1), "scarlet")
    // A stripe from the collar over each shoulder, and the zip down the front.
    .paint((x, y, z) => (Math.abs(x) > 0.08 && y > 0.37 && Math.abs(z + 0.006) < 0.018 ? -1 : 1), "scarlet")
    .paint((x, y, z) => (Math.abs(x) < 0.006 && z > 0.05 && y > 0.02 && y < 0.5 ? -1 : 1), "stoneLight");
  return shape
    .paint((x, y, z) => (z > 0 ? bolt(x, y, 0.008) : 1), "void")
    .paint((x, y, z) => (z > 0 ? bolt(x, y, 0) : 1), "gold")
    .geometry(0.011);
}

/** Paints a red stripe down the outside of a limb, `side` −1 for the right, from `top` to `bottom` in its frame. */
function striped(side: -1 | 1, top: number, bottom: number) {
  return (x: number, y: number, z: number) => (side * x > 0 && Math.abs(Math.atan2(z, side * x)) < 0.42 && y < top && y > bottom ? -1 : 1);
}

/** The upper arm from the shoulder to the elbow: a tracksuit sleeve with its
 *  stripe, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.052, 0.04), "ash")
    .paint(striped(side, 0.1, -UPPER_ARM - 0.1), "scarlet")
    .geometry(0.011);
}

/** The forearm from the elbow to the wrist: the sleeve and its stripe, a
 *  ribbed cuff, and the wrist inside it. Its rounded top covers the upper
 *  arm's narrower end however far the elbow bends. */
function forearm(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.047, 0.039), "ash")
    .paint(striped(side, 0.1, -FOREARM + 0.05), "scarlet")
    .add(ring([0, -FOREARM + 0.028, 0], 0.034, 0.015), "soot", 0.004)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.016, 0.002], 0.021, 0.019), SKIN)
    .geometry(0.008);
}

/** A track-pants leg from the hip to the knee, its stripe down the outside,
 *  tapering to the knee, where it ends inside the shin's top. */
function thigh(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.062, 0.044), "ash")
    .paint(striped(side, 0.2, -THIGH - 0.1), "scarlet")
    .geometry(0.012);
}

/** A track-pants leg from the knee to the shoe, its stripe, and a ribbed
 *  cuff at the ankle, its end inside the shoe. */
function shin(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.05, 0.036), "ash")
    .paint(striped(side, 0.1, -SHIN + 0.045), "scarlet")
    .add(ring([0, -SHIN + 0.03, -0.003], 0.034, 0.012), "soot", 0.012)
    .geometry(0.01);
}

/** A red running shoe on the base: a sleek toe, a white midsole, a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.03, 0.085], [0.048, 0.033, 0.08]), "bloodLight")
    .add(ellipsoid([x, BASE_TOP + 0.035, -0.03], [0.046, 0.04, 0.055]), "bloodLight", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.015], [x, BASE_TOP + 0.065, -0.01], 0.034), "bloodLight", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.02 ? -1 : 1), "boneLight")
    .paint((_, y) => (y < BASE_TOP + 0.007 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.009), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jacket: jacket(),
    /** The right arm's parts, then the left's: each stripe runs down its outside. */
    upperArms: [upperArm(-1), upperArm(1)],
    forearms: [forearm(-1), forearm(1)],
    hands: [handParts(-1, 1, SKIN), handParts(1, 1, SKIN)],
    thighs: [thigh(-1), thigh(1)],
    shins: [shin(-1), shin(1)],
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const FLASH_PARTS = figureParts("flash", meshParts);
declareParts(flash, [FLASH_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);
/** His music's beat, in nods a second. */
const BEAT = 1.6;

/** Darrin "Flash" Williams as a miniature on a round base, 5'11" at the
 *  house's scale. He breathes, shifts his weight and nods along to the music
 *  in his headphones; now and then he stretches both arms overhead like a
 *  sprinter before a race, leaning side to side; now and then he flings out
 *  his right hand and declaims a line of Shakespeare; and now and then he
 *  glances back over his shoulder, weight forward, ready to bolt from
 *  whatever is coming after him. He walks with a long, springy step, both
 *  arms swinging. Either hand can hold a thing; the stretch waits while
 *  either does, the speech while his right hand does. */
export function flash(seed = "flash", gait: Gait = STANDING): THREE.Group {
  const parts = FLASH_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const face = mesh(parts.head, "head");
  const neck = group(face);
  neck.position.y = NECK - WAIST;

  const limb = (side: -1 | 1) => {
    const i = side < 0 ? 0 : 1;
    return buildArm(
      mesh,
      { upperArm: parts.upperArms[i], forearm: parts.forearms[i], hand: parts.hands[i] },
      side,
      new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0),
      UPPER_ARM,
      FOREARM,
      1,
    );
  };
  const left = limb(1);
  const right = limb(-1);
  const posesOf = (of: Arm, side: -1 | 1) => {
    const outward = new THREE.Vector3(side, 0.2, -0.3);
    // Overhead in two stages, out to the side and then up, so the arm never sweeps in through the body.
    const out = reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.44, 0.12, 0.04)), new THREE.Vector3(0, -0.3, -1));
    const up = reachWrist(of, new THREE.Vector3(side * 0.12, 0.86, -0.02), outward);
    return {
      hangs: reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.05, -0.48, 0.05)), new THREE.Vector3(side * 0.3, 0, -1)),
      carries: reachWrist(of, of.at.clone().add(new THREE.Vector3(side * 0.02, -0.3, 0.22)), new THREE.Vector3(side * 0.2, 0, -1)),
      out,
      up: pointHand(up, new THREE.Vector3(-side * 0.15, 1, 0), side * (Math.PI / 2)),
    };
  };
  const poses = { right: posesOf(right, -1), left: posesOf(left, 1) };
  // "All the world's a stage": his right hand flung out and up before him, palm up.
  const declaims = pointHand(reachWrist(right, new THREE.Vector3(-0.42, 0.36, 0.3), new THREE.Vector3(0, -1, -0.3)), new THREE.Vector3(-0.45, 0.35, 0.8), -Math.PI / 2);

  const trunk = mesh(parts.jacket, "jacket");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thighs[i], `${name} thigh`), mesh(parts.shins[i], `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.012),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), FLASH_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.11 },
    // Raised overhead, a sleeve turns up out of the top of the jacket's shoulder.
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.12 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.12 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.14, 0.11, 0.09)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING },
    left: { limb: left, side: 1 as const, swing: ARM_SWING },
  };
  const rig: StrideRig = { walking: FLASH_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.08 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    stretch: { every: 11, lasts: 3.4, chance: 0.7 },
    speech: { every: 13, lasts: 2.8, chance: 0.6 },
    behind: { every: 8, lasts: 1.8, chance: 0.55 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 3.8) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 7) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const { stretch, speech, behind: glance } = bursts(clock);
    const handsFree = right.hand.held === null && left.hand.held === null;
    // The stretch and the speech fight the stride, so they ease out as it eases in.
    const stretching = handsFree ? stretch.amount * still : 0;
    const speaking = right.hand.held === null ? speech.amount * still * (1 - stretching) : 0;
    // The glance back carries on walking, and running, when it matters most.
    const look = glance.amount * (1 - stretching) * (1 - speaking);
    const way = glance.pick < 0.5 ? -1 : 1;
    const nod = (0.5 + 0.5 * Math.sin(seconds * BEAT * Math.PI * 2)) ** 2 * (1 - look) * (1 - stretching) * (1 - speaking);

    body.rotation.z = sway * 0.02;
    hips.rotation.z = sway * -0.008;
    // Leaning side to side as he stretches; weight forward, ready to run, as he looks back.
    chest.rotation.z = sway * -0.012 + Math.sin(stretch.progress * Math.PI * 2) * 0.12 * stretching;
    chest.rotation.x = breath * -0.014 + look * 0.07 * still;
    trunk.scale.set(1 + breath * 0.014, 1, 1 + breath * 0.016);
    left.shoulder.position.y = left.at.y + breath * 0.005;
    right.shoulder.position.y = right.at.y + breath * 0.005;

    neck.rotation.y = look * way * 1.1 + speaking * -0.3;
    neck.rotation.x = 0.06 + nod * 0.06 - speaking * 0.18 - look * 0.06;
    neck.rotation.z = sway * 0.012;

    for (const [arm, side, own] of [
      [right, "right", poses.right],
      [left, "left", poses.left],
    ] as const) {
      const upright = arm.hand.held?.carry === "upright";
      const rest = upright ? own.carries : own.hangs;
      const stretched = stretching < 0.5 ? between(rest, own.out, stretching * 2) : between(own.out, own.up, stretching * 2 - 1);
      poseArm(arm, stretched, declaims, side === "right" ? speaking : 0);
      const empty = blendPose(blendPose(RELAXED, OPEN, Math.max(stretching, side === "right" ? speaking : 0)), fist(arm.hand), Math.max(running, look * 0.8));
      poseHand(arm.hand, holding(arm.hand, empty));
      swings[side].swing = upright ? ARM_SWING * 0.3 : ARM_SWING;
    }

    const step = stride(rig, moving);
    chest.rotation.y = step * 0.08 + look * way * 0.35 * still;
    for (const arm of [right, left]) if (arm.hand.held?.carry === "upright") aimGrip(arm.hand, figure, UP, 1);
  });
}
