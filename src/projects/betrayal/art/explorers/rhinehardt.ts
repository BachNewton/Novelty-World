import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, ellipsoid, figureMaterial, form, plinth, ring, rod, roughened, roundBox, sculpt, stretched, type Solid } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, burst, joins, leg, legJoints, legPoints, miniatureHeight, pushAside, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Swept, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, holdIn, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm, type ArmPose, type Prop } from "./hands";

/*
 * Father Rhinehardt: a stocky parish priest of 62 who fences and gardens,
 * hears Ox's confessions and teaches Sunday school, and whose greatest fear
 * is going mad. Read at a glance: the only figure robed to his shoes, a
 * column of black cassock under a white surplice that covers his shoulders,
 * chest and wide bell sleeves down to the knee, a purple stole hanging down
 * its front, steel-grey hair, and a gold crucifix held up before his chest.
 * He faces +z; his right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

/** 5'9" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(5, 9);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.68;
const LEG = WAIST - BASE_TOP;
/** Short, brisk steps, his cassock round his ankles, and barely a bob: he
 *  carries himself upright, as a fencer does. */
const PRIEST_WALK: Walking = { step: 0.5, hop: 0.012 };
const ARM_SWING = 0.24;
const NECK = TOP - 0.37;
const SHOULDER: [number, number] = [0.225, 1.1];
const UPPER_ARM = 0.27;
/** From the elbow to the wrist. */
const FOREARM = 0.21;
/** His hands, a little bigger than an ordinary adult's: a gardener's. */
const HAND = 1.05;
const LEG_X = 0.07;
/** The ankle, in the shoe, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.065;
const THIGH = (LEG - 0.065) / 2;
const SHIN = THIGH;

/** The head on its neck: a round, jowly, clean-shaven face, heavy grey brows
 *  over eyes sunk under them, a broad nose, and short steel-grey hair combed
 *  close, receding a little at the temples. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, -0.005], [0, 0.11, 0], 0.055, 0.052), "skin")
    .add(ellipsoid([0, 0.235, -0.01], [0.12, 0.13, 0.13]), "skin", 0.04)
    .add(ellipsoid([0, 0.15, 0.03], [0.105, 0.1, 0.1]), "skin", 0.05)
    .add(ellipsoid([0, 0.088, 0.075], [0.048, 0.032, 0.04]), "skin", 0.03)
    .add(ellipsoid([0, 0.222, 0.1], [0.088, 0.022, 0.032]), "skin", 0.02)
    .add(rod([0, 0.208, 0.122], [0, 0.158, 0.148], 0.016, 0.023), "skin", 0.014);
  for (const side of [-1, 1]) {
    const x = side * 0.043;
    // The jowls, and the ears.
    shape.add(ellipsoid([side * 0.062, 0.12, 0.065], [0.05, 0.045, 0.05]), "skin", 0.04);
    shape.add(ellipsoid([side * 0.12, 0.18, -0.005], [0.018, 0.04, 0.027]), "skin", 0.01);
    // Eyes sunk under the brow: white, a small dark iris.
    shape.carve(ball([x, 0.19, 0.126], 0.019), { blend: 0.01 });
    shape.add(ball([x, 0.19, 0.108], 0.018), "boneLight");
    shape.paint(ball([x, 0.191, 0.125], 0.0095), "void");
    // Heavy grey brows.
    shape.add(rod([side * 0.018, 0.226, 0.126], [side * 0.072, 0.232, 0.108], 0.012, 0.01), "stone", 0.006);
  }
  // Steel-grey hair: a close cap from the hairline over the crown down to the nape.
  const hairline = (x: number, y: number, z: number) => (0.205 + 0.45 * z - y + 0.25 * Math.max(0, Math.abs(x) - 0.07) * Math.max(0, z)) / 1.1;
  const crown = ellipsoid([0, 0.24, -0.016], [0.127, 0.135, 0.136]);
  const cap: Solid = {
    distance: (x, y, z) => Math.max(crown.distance(x, y, z), hairline(x, y, z)),
    min: [-0.13, 0.1, -0.16],
    max: [0.13, 0.38, 0.13],
  };
  return shape
    .add(roughened(cap, 0.0015, 0.04), "stone", 0.012)
    .paint(ellipsoid([0, 0.118, 0.13], [0.026, 0.006, 0.02]), "bloodDark")
    .geometry(0.008);
}

/** The surplice from the waist up, white over his shoulders, chest and round
 *  belly, the black cassock's band collar with its white tab at his throat,
 *  and the purple stole round his neck and down his front. */
function torso(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.27, 0], [0.18, 0.2, 0.125]), "boneLight")
    .add(ellipsoid([0, 0.1, 0.005], [0.205, 0.15, 0.168]), "boneLight", 0.08);
  // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one.
  for (const side of [-1, 1]) shape.add(rod([side * 0.05, 0.43, -0.01], [side * 0.225, 0.41, -0.004], 0.055, 0.066), "boneLight", 0.06);
  shape.add(stretched(ring([0, 0.475, 0.002], 0.056, 0.017), [0, 0.475, 0.002], [1, 1.5, 1.05]), "sootLight", 0.006);
  return shape
    .paint((x, y, z) => (z > 0.03 && Math.abs(x) < 0.017 && Math.abs(y - 0.474) < 0.016 ? -1 : 1), "boneLight")
    .paint((x, y, z) => (stoleFront(x, y, z) && y < 0.44) || (y > 0.38 && y < 0.47 && Math.abs(Math.hypot(x, z * 1.15) - 0.09) < 0.022) ? -1 : 1, "bruiseLight")
    .geometry(0.012);
}

/** The stole's two bands down his front, either side of the middle. */
function stoleFront(x: number, _y: number, z: number): boolean {
  return z > 0.02 && Math.abs(Math.abs(x) - 0.062) < 0.023;
}

/** The robe from the waist down, in the hips' frame: a black cassock to his
 *  ankles, and over it the surplice to his knees, its hem trimmed. It hangs
 *  in two halves, front and back, each a hollow shell a cloth's thickness
 *  from the waist, so his legs swing inside it and push each half out: the
 *  front forward over a striding knee, the back behind a heel. */
const ROBE = { top: 0.03, hem: -0.49, surplice: -0.26, cloth: 0.012, layer: 0.016, gap: 0.004 };
/** The front half reaches round to his sides; the back half from a little in front of them, tucked under the front's edges. */
const FRONT_EDGE = Math.PI / 2;
const BACK_EDGE = THREE.MathUtils.degToRad(78);
const TUCKED = THREE.MathUtils.degToRad(98);
const TUCK = THREE.MathUtils.degToRad(110);

function robeRadii(y: number, surplice = true): { rx: number; rz: number } {
  const t = THREE.MathUtils.clamp((ROBE.top - y) / (ROBE.top - ROBE.hem), 0, 1);
  const layer = (surplice ? ROBE.layer : 0) * THREE.MathUtils.smoothstep(y, ROBE.surplice - 0.006, ROBE.surplice + 0.006);
  return { rx: 0.158 + 0.08 * t + layer, rz: 0.128 + 0.1 * t + layer };
}

const ellipse = (x: number, z: number, rx: number, rz: number) => (Math.hypot(x / rx, z / rz) - 1) * Math.min(rx, rz);
/** Where a point lies round the robe, from 0 at the front to π at the back. */
const around = (x: number, z: number) => Math.atan2(Math.abs(x), z);
/** The signed distance to a wedge of the robe from the front round to `edge` either side (negative inside it). */
const frontOf = (x: number, z: number, edge: number) => Math.abs(x) * Math.cos(edge) - z * Math.sin(edge);

function robeHalf(front: boolean): THREE.BufferGeometry {
  const { top, hem, cloth, surplice } = ROBE;
  // The back half is drawn in where the front's edges lie over it.
  const inset = (x: number, z: number) => (front ? 0 : (ROBE.cloth + ROBE.gap) * (1 - THREE.MathUtils.smoothstep(around(x, z), TUCKED, TUCK)));
  const outside = (x: number, y: number, z: number) => {
    const { rx, rz } = robeRadii(y);
    return ellipse(x, z, rx, rz) + inset(x, z);
  };
  const bounds: Pick<Solid, "min" | "max"> = { min: [-0.25, hem - 0.01, front ? -0.06 : -0.24], max: [0.25, top + 0.01, front ? 0.24 : 0.06] };
  const half = (x: number, z: number) => (front ? frontOf(x, z, FRONT_EDGE) : -frontOf(x, z, BACK_EDGE));
  const shell: Solid = { distance: (x, y, z) => Math.max(outside(x, y, z), y - top, hem - y, half(x, z)), ...bounds };
  const hollow: Solid = { distance: (x, y, z) => outside(x, y, z) + cloth, ...bounds };
  const shape = sculpt()
    .add(shell, "sootLight")
    .carve(hollow, { colour: "soot" })
    .paint((x, y, z) => (y > surplice && outside(x, y, z) > -0.006 ? -1 : 1), "boneLight")
    .paint((x, y, z) => (y > surplice && y < surplice + 0.022 && outside(x, y, z) > -0.006 ? -1 : 1), "bone");
  if (front) {
    // The stole's ends, down to the surplice's hem, each with a gold cross near its end.
    const crossAt = surplice + 0.075;
    shape.paint((x, y, z) => (stoleFront(x, y, z) && y > surplice + 0.03 && outside(x, y, z) > -0.006 ? -1 : 1), "bruiseLight");
    shape.paint((x, y, z) => {
      const across = Math.abs(Math.abs(x) - 0.062);
      const upright = across < 0.006 && Math.abs(y - crossAt) < 0.026;
      const bar = across < 0.017 && Math.abs(y - crossAt - 0.008) < 0.006;
      return z > 0.02 && (upright || bar) && outside(x, y, z) > -0.006 ? -1 : 1;
    }, "gold");
  }
  return shape.geometry(0.008);
}

/** How far a point of a radius lies clear in front of a robe half's inside
 *  back, in that half's frame (the front half's, mirrored front to back): a
 *  point beside the robe, above its top or below its hem doesn't press on it. */
function robeMargin({ x, y, z }: THREE.Vector3, radius: number): number {
  // The inside is narrowest without the surplice's layer, and higher up: the narrowest a point's reach meets.
  const { rx, rz } = robeRadii(y + radius, false);
  const [ix, iz] = [rx - ROBE.cloth, rz - ROBE.cloth];
  const across = x / ix;
  const back = -iz * Math.sqrt(Math.max(0, 1 - across * across));
  const pressing =
    (1 - THREE.MathUtils.smoothstep(Math.abs(across), 1, 1.3)) *
    THREE.MathUtils.smoothstep(y + radius, ROBE.hem - 0.03, ROBE.hem + 0.01) *
    (1 - THREE.MathUtils.smoothstep(y - radius, ROBE.top - 0.03, ROBE.top));
  return z - radius - back + (1 - pressing) * 0.5;
}

/** A white surplice sleeve on the upper arm, set in under the shoulder, tapering to the elbow. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.055, 0.047), "boneLight")
    .geometry(0.01);
}

/** The forearm from the elbow: the surplice's wide bell sleeve to halfway
 *  down, open and dark inside, and below it the cassock's black sleeve to
 *  the wrist. Its rounded top covers the upper arm's narrower end. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -0.1, 0.004], 0.05, 0.068), "boneLight")
    .carve(rod([0, -0.075, 0.004], [0, -0.16, 0.006], 0.036, 0.05), { colour: "soot" })
    .add(rod([0, -0.07, 0.004], [0, -FOREARM + 0.03, 0.002], 0.034, 0.031), "sootLight", 0.004)
    .add(rod([0, -FOREARM + 0.045, 0.002], [0, -FOREARM + 0.012, 0.002], 0.022, 0.02), "skin")
    .geometry(0.007);
}

/** A black trouser leg from the hip to the knee, tapering to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.058, 0.044), "sootLight")
    .geometry(0.012);
}

/** A black trouser leg from the knee into the shoe. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.047, 0.036), "sootLight")
    .geometry(0.01);
}

/** A plain black shoe on the base, with a darker sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.03, 0.08], [0.05, 0.034, 0.075]), "soot")
    .add(ellipsoid([x, BASE_TOP + 0.035, -0.03], [0.046, 0.04, 0.055]), "soot", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.015], [x, BASE_TOP + 0.065, -0.01], 0.036), "soot", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.01 ? -1 : 1), "void");
  return { geometry: shape.geometry(0.01), ...soleEnds(shape.distance, x) };
}

/** His crucifix, held upright by the foot of its upright: gold, oversized as
 *  a miniature's held things are, its crossbar across his hand. Built round
 *  the grip: the upright along +y, the crossbar along x. */
const CRUCIFIX = { foot: -0.08, top: 0.23, bar: 0.145, arm: 0.075, half: 0.014 };
function crucifix(): THREE.BufferGeometry {
  const { foot, top, bar, arm, half } = CRUCIFIX;
  return sculpt()
    .add(roundBox([0, (foot + top) / 2, 0], [half, (top - foot) / 2, half], 0.006), "gold")
    .add(roundBox([0, bar, 0], [arm, half, half], 0.006), "gold", 0.004)
    .add(ball([0, bar, 0], half * 1.5), "goldLight", 0.004)
    .geometry(0.004);
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    torso: torso(),
    robe: { front: robeHalf(true), back: robeHalf(false) },
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND), handParts(1, HAND)],
    crucifix: crucifix(),
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

const UP = new THREE.Vector3(0, 1, 0);
/** The middles of a shoe's heel and toe, as built (x set per foot): what a lifted foot pushes the robe with. */
const SHOE_POINTS = [
  { at: new THREE.Vector3(0, BASE_TOP + 0.035, -0.03), radius: 0.05 },
  { at: new THREE.Vector3(0, BASE_TOP + 0.04, -0.062), radius: 0.04 },
  { at: new THREE.Vector3(0, BASE_TOP + 0.03, 0.08), radius: 0.04 },
  { at: new THREE.Vector3(0, BASE_TOP + 0.03, 0.12), radius: 0.03 },
];
/** How far a robe half eases out past what the legs need: offset so that, unpushed, it hangs straight. */
const HANGS = -0.1 * Math.LN2;
const MIRROR = new THREE.Vector3(1, 1, -1);

/** Where his right wrist traces the blessing, `s` of the way through it: down, then across from his left to his right. */
function blessingAt(s: number): THREE.Vector3 {
  const top = new THREE.Vector3(-0.1, 0.52, 0.34);
  const bottom = new THREE.Vector3(-0.1, 0.29, 0.36);
  const left = new THREE.Vector3(-0.01, 0.41, 0.35);
  const right = new THREE.Vector3(-0.22, 0.41, 0.33);
  const ease = (from: number, to: number) => THREE.MathUtils.smootherstep(s, from, to);
  return top
    .clone()
    .lerp(bottom, ease(0, 0.4))
    .add(left.clone().sub(bottom).multiplyScalar(ease(0.4, 0.55)))
    .add(right.clone().sub(left).multiplyScalar(ease(0.6, 1)));
}

/** Father Rhinehardt as a miniature on a round base, 5'9" at the house's
 *  scale. He breathes slow and even, shifting his weight, the crucifix held
 *  before him; now and then he raises his right hand and blesses the room,
 *  now and then he holds the crucifix out at arm's length against the dark,
 *  and now and then, fearing for his mind, he presses a hand to his temple
 *  and shakes his head to clear it. He walks with short, brisk, upright
 *  steps, his robe swinging round his ankles. His left hand holds the
 *  crucifix; his right hand is free to hold anything else. */
export function rhinehardt(seed = "rhinehardt", gait: Gait = STANDING): THREE.Group {
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
  const cross: Prop = { object: group(mesh(parts.crucifix, "crucifix")), handle: CRUCIFIX.half, carry: "upright" };
  holdIn(left.hand, cross);

  const wristAt = (of: Arm, offset: [number, number, number]) => of.at.clone().add(new THREE.Vector3(...offset));
  const bend = new THREE.Vector3(0, 0, -1);
  // The crucifix held up before his chest, and held out at arm's length against the dark.
  const presents = reachWrist(left, wristAt(left, [-0.05, -0.2, 0.27]), new THREE.Vector3(0.5, -0.3, -1));
  const wards = reachWrist(left, wristAt(left, [-0.03, 0, 0.44]), new THREE.Vector3(0.6, -1, -0.3));
  const hangs = reachWrist(right, wristAt(right, [-0.1, -0.45, 0.05]), bend);
  const holds = reachWrist(right, wristAt(right, [-0.14, -0.43, 0.06]), bend);
  const carries = reachWrist(right, wristAt(right, [-0.12, -0.3, 0.24]), new THREE.Vector3(-0.3, 0, -1));
  // His brow in his hand, the palm towards his face.
  const temple = pointHand(reachWrist(right, new THREE.Vector3(-0.08, 0.56, 0.3), new THREE.Vector3(-1, -1, 0)), new THREE.Vector3(0.3, 1, -0.5), 0);
  const blessing = (s: number): ArmPose => pointHand(reachWrist(right, blessingAt(s), new THREE.Vector3(-0.6, -1, 0)), new THREE.Vector3(0.05, 1, 0.2), 0);

  const trunk = mesh(parts.torso, "torso");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const front = group(mesh(parts.robe.front, "robe front"));
  const back = group(mesh(parts.robe.back, "robe back"));
  const hips = group(front, back, chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const foot = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), foot, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.012),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), PRIEST_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.11 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.11 },
    // The robe's halves hang from the waist, inside the surplice's belly.
    { parts: [front, trunk], at: hips, radius: 0.26 },
    { parts: [back, trunk], at: hips, radius: 0.26 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.14, 0.11, 0.09)),
  ]);

  // His left hand holds the crucifix, so only his right arm swings.
  const swinging = { limb: right, side: -1 as const, swing: ARM_SWING };
  const rig: StrideRig = { walking: PRIEST_WALK, legs, body, rest: BASE_TOP, arms: [swinging], chest, lean: 0.03, lifts: 0.6 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4.6) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 10) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const held = right.hand.held;
    const upright = held?.carry === "upright";
    // His right hand's gestures wait while it holds something, and while he walks.
    const free = held ? 0 : 1 - moving.amount;
    const dread = burst(seconds, `${seed}:dread`, { every: 13, lasts: 3.4, chance: 0.5 });
    const fearing = dread.amount * free;
    const ward = burst(seconds, `${seed}:ward`, { every: 11, lasts: 3, chance: 0.6 });
    const warding = ward.amount * (1 - running) * (1 - fearing);
    const bless = burst(seconds, `${seed}:bless`, { every: 9, lasts: 3.2, chance: 0.65 });
    const blessed = bless.amount * free * (1 - fearing) * (1 - warding);

    body.rotation.z = sway * 0.018;
    hips.rotation.z = sway * -0.008;
    chest.rotation.z = sway * -0.01;
    chest.rotation.x = breath * -0.012 - warding * 0.05;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.014);
    const hunch = fearing * 0.025;
    left.shoulder.position.y = left.at.y + breath * 0.004 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.004 + hunch;

    // He shakes his head slowly, as if to clear it.
    const shake = Math.sin(dread.progress * Math.PI * 6) * 0.1 * fearing;
    neck.rotation.y = shake + blessed * -0.12;
    neck.rotation.x = 0.06 + fearing * 0.3 + blessed * 0.1 - warding * 0.12;
    neck.rotation.z = sway * 0.01 - fearing * 0.08;

    poseArm(left, presents, wards, warding);
    const rests = upright ? carries : held ? holds : hangs;
    const raised = blessed > 0 ? between(rests, blessing(THREE.MathUtils.clamp((bless.progress - 0.3) / 0.4, 0, 1)), blessed) : rests;
    poseArm(right, raised, temple, fearing);
    poseHand(right.hand, held ? holding(right.hand, RELAXED) : blendPose(blendPose(RELAXED, OPEN, Math.max(blessed, fearing * 0.6)), fist(right.hand), running * 0.7));
    swinging.swing = (upright ? ARM_SWING * 0.3 : ARM_SWING) * (1 - Math.max(blessed, fearing));

    stride(rig, moving);
    aimGrip(left.hand, figure, UP, 1);
    if (upright) aimGrip(right.hand, figure, UP, 1);

    // Each half of the robe is pushed out by the legs: the back behind a heel, the front over a knee.
    hips.updateMatrix();
    const intoHips = hips.matrix.clone().invert();
    const intoBody = body.matrix.clone().invert();
    const swept: Swept[] = legs.flatMap((one) => {
      one.shoe.updateMatrix();
      const shoe = SHOE_POINTS.map(({ at, radius }) => ({ at: at.clone().setX(one.ankle.x).applyMatrix4(one.shoe.matrix).applyMatrix4(intoBody), radius }));
      return [...legPoints(one, 0.062, 0.05), ...shoe].map(({ at, radius }) => ({ at: at.applyMatrix4(intoHips), radius }));
    });
    back.rotation.x = pushAside(robeMargin, back.position, swept, HANGS + running * 0.2);
    const mirrored = swept.map(({ at, radius }) => ({ at: at.clone().multiply(MIRROR), radius }));
    front.rotation.x = -pushAside(robeMargin, front.position, mirrored, HANGS);
  });
}
