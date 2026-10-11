import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, mergeAll, plinth, ring, rod, roughened, roundBox, sculpt, type Solid } from "../forms";
import { group } from "../shapes";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";
import { aimGrip, between, blendPose, buildArm, fist, gripAt, handParts, hasHands, holding, holdIn, OPEN, poseArm, poseHand, pointHand, reachWrist, RELAXED, type Arm, type Prop } from "./hands";
import { skinOf, skinShade } from "./skin";
import { declareParts, figureParts } from "../figure-parts";

/*
 * Peter Akimoto: a thirteen-year-old who collects bugs, plays basketball,
 * mows Professor Longfellow's yard for pocket money, and is afraid of being
 * trapped with no way out. Read at a glance: a lanky boy, a head shorter
 * than the adults, in a teal basketball jersey with a white "7" and baggy
 * teal shorts, bare arms and knees, tall white socks in dark high-tops, a
 * black mop of hair, and a butterfly net held up in his left hand, its hoop
 * high over his head. He faces +z; his right hand is on −x.
 *
 * He takes Zoe Ingstrom's child's build (a big head, a small body, the same
 * neck and hands) stretched to a teenager's long legs, and the shared arms,
 * hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("peter-akimoto");

/** 4'11" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(4, 11);
const WAIST = 0.59;
const LEG = WAIST - BASE_TOP;
/** A lanky boy's springy step, about his leg's length: quicker than an adult's, longer than Zoe's patter, with a bounce. */
const PETER_WALK: Walking = { step: 0.5, hop: 0.03 };
const ARM_SWING = 0.45;
/** The neck's pivot, the head above it as big as a child's. */
const NECK = TOP - 0.31;
/** Narrow shoulders: a boy's. */
const SHOULDER: [number, number] = [0.155, 0.95];
const UPPER_ARM = 0.2;
/** From the elbow to the wrist. */
const FOREARM = 0.17;
/** His hands, this many times an adult's. */
const HAND = 0.75;
const LEG_X = 0.07;
/** The ankle, in the high-top, and the leg's two bones from the hip down to it: a boy's, matched to Brandon's and Zoe's. */
const ANKLE = BASE_TOP + 0.05;
const THIGH = 0.232;
const SHIN = 0.232;

/** The head on its neck: a big round head with a firmer jaw than a small
 *  child's, a brow and a small nose that catch the light, dark eyes (white, a
 *  dark iris and a glint) sunk under it, and a thick black mop of hair, its
 *  fringe swept across his forehead. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, -0.005], [0, 0.07, 0], 0.042, 0.04), SKIN)
    .add(ellipsoid([0, 0.175, -0.005], [0.112, 0.13, 0.118]), SKIN, 0.03)
    .add(ellipsoid([0, 0.11, 0.03], [0.088, 0.085, 0.09]), SKIN, 0.05)
    .add(ball([0, 0.06, 0.07], 0.032), SKIN, 0.04)
    .add(rod([-0.062, 0.192, 0.098], [0.062, 0.192, 0.098], 0.017), SKIN, 0.025)
    .add(rod([0, 0.172, 0.116], [0, 0.128, 0.132], 0.011, 0.017), SKIN, 0.012);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.112, 0.15, 0], [0.016, 0.03, 0.022]), SKIN, 0.01);
    shape.carve(ball([side * 0.04, 0.16, 0.114], 0.018), { blend: 0.008 });
    shape.add(ball([side * 0.04, 0.16, 0.093], 0.019), "boneLight");
    shape.paint(ball([side * 0.04, 0.159, 0.111], 0.0115), "woodDark");
    shape.paint(ball([side * 0.04, 0.159, 0.113], 0.006), "void");
    shape.paint(ball([side * 0.036, 0.165, 0.111], 0.004), "boneLight");
    // Straight dark brows over them.
    shape.paint(ellipsoid([side * 0.043, 0.198, 0.112], [0.026, 0.0065, 0.03]), "soot");
  }
  shape
    .paint(ellipsoid([0, 0.085, 0.114], [0.022, 0.0055, 0.03]), skinShade(SKIN))
    // The mop: hair over the skull above a hairline that runs from the forehead
    // down past the ears to the nape, with soft lumps on top and a fringe.
    .add(roughened(above(ellipsoid([0, 0.19, -0.012], [0.126, 0.132, 0.131])), 0.004, 0.05), "sootLight", 0.006);
  for (const [x, y, z, rx, ry, rz] of [
    [0.05, 0.27, 0.01, 0.06, 0.04, 0.06],
    [-0.04, 0.275, -0.03, 0.06, 0.04, 0.06],
    [0.07, 0.245, -0.075, 0.05, 0.045, 0.05],
    [-0.08, 0.235, -0.055, 0.05, 0.045, 0.05],
    [0.0, 0.19, -0.11, 0.08, 0.07, 0.04],
  ]) {
    shape.add(ellipsoid([x, y, z], [rx, ry, rz]), "sootLight", 0.03);
  }
  // The fringe, swept across from his left to his right.
  for (const [from, to, r0, r1] of [
    [[0.07, 0.272, 0.078], [-0.045, 0.222, 0.116], 0.03, 0.016],
    [[0.0, 0.282, 0.07], [-0.09, 0.225, 0.098], 0.028, 0.015],
    [[0.085, 0.255, 0.092], [0.03, 0.215, 0.12], 0.022, 0.013],
  ] as const) {
    shape.add(rod(from, to, r0, r1), "sootLight", 0.012);
  }
  // A sheen on the crown, where the light from above falls.
  return shape.paint((x, y, z) => (y > 0.3 && z > -0.06 && Math.abs(x) < 0.07 ? -1 : 1), "ash").geometry(0.0075);
}

/** A solid cut to the hair's side of the hairline: low at the nape, over the ears at the sides, high at the forehead. */
function above(solid: Solid): Solid {
  return {
    distance: (x, y, z) => {
      const line = 0.07 + 0.15 * THREE.MathUtils.smoothstep(z, -0.11, 0.1);
      return Math.max(solid.distance(x, y, z), (line - y) * 0.7);
    },
    min: solid.min,
    max: solid.max,
  };
}

/** Where the "7" sits on the jersey, front and back, its height, and the dark border round it. */
const NUMBER = { x: 0, y: 0.235, half: 0.055 };
const NUMBER_BORDER = 0.007;

/** Distance in x and y to the segment from a to b, less `half` its stroke's width. */
function stroke(x: number, y: number, a: [number, number], b: [number, number], half: number): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) - half;
}

/** A flat block "7", seen from the front (or the back, mirrored), grown by `grow` for its border. */
function seven(x: number, y: number, grow: number): number {
  const { x: cx, y: cy, half } = NUMBER;
  const width = half * 0.72;
  const bar = stroke(x, y, [cx - width, cy + half], [cx + width, cy + half], 0.014 + grow);
  const leg = stroke(x, y, [cx + width, cy + half], [cx - width * 0.25, cy - half], 0.015 + grow);
  return Math.min(bar, leg);
}

/** The jersey from the shorts' seat up, built from the waist (the hips' pivot):
 *  a narrow, sleeveless teal top, white trim at the neck and armholes, his
 *  bare shoulders reaching out over the tops of his arms, the "7" front and
 *  back; and below its hem, the seat of his shorts, which his thighs swing from. */
function jersey(): THREE.BufferGeometry {
  const seat = ellipsoid([0, -0.01, 0], [0.124, 0.075, 0.088]);
  const top: Solid[] = [
    ellipsoid([0, 0.04, 0], [0.145, 0.065, 0.104]),
    roundBox([0, 0.2, 0], [0.115, 0.18, 0.084], 0.07),
    roundBox([0, 0.322, 0], [0.115, 0.07, 0.088], 0.065),
  ];
  const shoulders = [-1, 1].map((side) => ellipsoid([side * 0.153, 0.356, 0], [0.052, 0.05, 0.05]));
  const shape = sculpt().add(seat, "tide").add(top[0], "tide").add(top[1], "tide", 0.05).add(top[2], "tide", 0.05);
  for (const cap of shoulders) shape.add(cap, SKIN, 0.03);
  // The armholes' trim, where the jersey meets his shoulders.
  const jerseyAt = (x: number, y: number, z: number) => Math.min(...top.map((solid) => solid.distance(x, y, z)));
  const shoulderAt = (x: number, y: number, z: number) => Math.min(...shoulders.map((solid) => solid.distance(x, y, z)));
  shape.paint((x, y, z) => (y > 0.24 ? Math.abs(jerseyAt(x, y, z) - shoulderAt(x, y, z)) - 0.012 : 1), "boneLight");
  return shape
    .add(ring([0, 0.398, 0.004], 0.052, 0.013), "boneLight", 0.01)
    .add(ellipsoid([0, 0.396, 0.0], [0.06, 0.02, 0.05]), SKIN, 0.006)
    .paint((x, y, z) => seven(z > 0 ? x : -x, y, NUMBER_BORDER), "tideDark")
    .paint((x, y, z) => seven(z > 0 ? x : -x, y, 0), "boneLight")
    .geometry(0.009);
}

/** A bare upper arm, thin, from inside the shoulder to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.037, 0.027), SKIN)
    .geometry(0.006);
}

/** A bare forearm from the elbow to the wrist, with a white sweatband. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.01, 0.002], 0.031, 0.021), SKIN)
    .add(rod([0, -FOREARM + 0.07, 0.001], [0, -FOREARM + 0.035, 0.002], 0.029, 0.027), "boneLight", 0.004)
    .geometry(0.006);
}

/** A baggy teal shorts leg from the hip to above the knee, its hem trimmed white
 *  and a white stripe down its outside, and the bare thigh below it to the knee. */
function thigh(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.02, 0], [0, -0.17, 0.005], 0.06, 0.065), "tide")
    // Cut square across at the hem, open round the bare thigh.
    .carve(roundBox([0, -0.37, 0], [0.2, 0.2, 0.2], 0))
    .paint((_, y) => (y < -0.153 ? -1 : 1), "boneLight")
    .paint((x, y, z) => (y > -0.153 && y < -0.07 && side * x > 0.04 && Math.abs(z) < 0.014 ? -1 : 1), "boneLight")
    .add(rod([0, -0.12, 0], [0, -THIGH, 0.004], 0.039, 0.03), SKIN)
    .geometry(0.008);
}

/** The bare knee and a tall white sock with two teal stripes, from the knee into the high-top. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.003], [0, -0.08, 0], 0.036, 0.031), SKIN)
    .add(rod([0, -0.065, 0], [0, -SHIN + 0.008, 0], 0.033, 0.023), "boneLight", 0.006)
    .paint((_, y) => (Math.abs(y + 0.086) < 0.005 || Math.abs(y + 0.101) < 0.005 ? -1 : 1), "tide")
    .geometry(0.007);
}

/** A dark high-top sneaker on the base: a white sole and toe cap, laces up the front, and a collar round the ankle. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.026, 0.058], [0.045, 0.032, 0.07]), "sootLight")
    .add(ellipsoid([x, BASE_TOP + 0.03, -0.015], [0.044, 0.036, 0.05]), "sootLight", 0.03)
    .add(rod([x, BASE_TOP + 0.03, -0.01], [x, BASE_TOP + 0.09, -0.008], 0.045, 0.043), "sootLight", 0.02)
    .add(ring([x, BASE_TOP + 0.098, -0.008], 0.04, 0.007), "boneLight", 0.004)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y, z) => (y < BASE_TOP + 0.016 || (z > 0.09 && y < BASE_TOP + 0.035) ? -1 : 1), "boneLight")
    .paint((xx, y, z) => (z > 0.02 && Math.abs(xx - x) < 0.014 && y > BASE_TOP + 0.04 && y < BASE_TOP + 0.085 ? -1 : 1), "boneLight")
    .paint((_, y) => (y < BASE_TOP + 0.005 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.007), ...soleEnds(shape.distance, x) };
}

/** The butterfly net, built round its grip (its pole along +y, +z along his
 *  fingers): a long wooden pole, a brass hoop on its top, facing along the
 *  grip's x, and a pale net bag drooping back and down from the hoop, along
 *  −z. Seen through the hoop, the dark inside of the bag is crossed by the
 *  net's mesh. Oversized, as held things are, so it reads over his head. */
const NET = { pole: 0.78, butt: -0.22, hoop: 0.13, bag: 0.2, droop: 0.22 };
function net(): THREE.BufferGeometry {
  const centre = NET.pole + NET.hoop;
  const tip: [number, number, number] = [0, centre - NET.droop, -NET.bag];
  // The net's mesh: two sets of strands crossing on the diagonal.
  const mesh = (u: number, v: number) => {
    const across = (value: number) => Math.abs(value / 0.042 - Math.round(value / 0.042)) * 0.042;
    return Math.min(across(u + v), across(u - v)) - 0.005;
  };
  // The long pole meshes coarser than the hoop and its net, whose strands need a fine grid.
  const pole = sculpt()
    .add(rod([0, NET.butt, 0], [0, NET.pole + 0.01, 0], 0.015, 0.014), "woodLight")
    .add(rod([0, NET.butt - 0.005, 0], [0, NET.butt + 0.03, 0], 0.017), "brass", 0.004)
    .geometry(0.007);
  const hoop = sculpt()
    .add(rod([0, NET.pole - 0.03, 0], [0, NET.pole + 0.012, 0], 0.018), "brass", 0.005)
    .add(ring([0, centre, 0], NET.hoop, 0.009, [Math.PI / 2, 0, 0]), "brass", 0.004)
    .add(chain([[0, centre, -0.004], [0, centre - 0.06, -NET.bag * 0.6], tip], [NET.hoop - 0.006, 0.085, 0.045]), "boneLight")
    .carve(roundBox([0, centre, 0.15], [0.3, 0.3, 0.15], 0))
    .paint((x, y, z) => (z > -0.008 && Math.hypot(x, y - centre) < NET.hoop - 0.01 && mesh(x, y - centre) > 0 ? -1 : 1), "ash")
    .paint((x, y, z) => (z < -0.012 && y > NET.pole + 0.03 && mesh(x + z, y) < 0 ? -1 : 1), "bone")
    .geometry(0.006);
  return mergeAll([pole, hoop]);
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jersey: jersey(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    /** The right thigh, then the left: each shorts leg's stripe is on its outside. */
    thighs: [thigh(-1), thigh(1)],
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    net: net(),
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Its parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const PETER_PARTS = figureParts("peter", meshParts);
declareParts(peter, [PETER_PARTS]);

const UP = new THREE.Vector3(0, 1, 0);
/** The way the net's pole tips as he swoops it: forward and out to his left, away from himself. */
const SWOOP_AXIS = new THREE.Vector3(1, 0, -0.5).normalize();
/** Where he holds the net, in the chest's frame: his fist before his left hip, the pole upright; and, swooping, reached out ahead. */
const NET_HELD = new THREE.Vector3(0.27, 0.11, 0.13);
const NET_OUT = new THREE.Vector3(0.28, 0.18, 0.26);
/** How far the pole tips swooping, and then lifted to peer into the net. */
const SWOOPED = 1.0;
const PEERING = 0.45;

const smooth = THREE.MathUtils.smoothstep;
/** A bump easing up from 0 to 1 between `a` and `b`, holding, and back down between `c` and `d`. */
const bump = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) - smooth(t, c, d);

/** Peter Akimoto as a miniature on a round base, 4'11" at the house's scale.
 *  He breathes and shifts restlessly from foot to foot; now and then he
 *  swoops his net at a bug, then lifts it and peers in; now and then he dips
 *  and shoots an imaginary jump shot; and now and then he hunches and darts
 *  looks about him, up and round, for a way out. He walks with a springy,
 *  lanky step. His left hand holds the net upright; his right is free to hold
 *  anything else, and the jump shot waits while it does. */
export function peter(seed = "peter", gait: Gait = STANDING): THREE.Group {
  const parts = PETER_PARTS.get();
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
  const rightHangs = reachWrist(right, wristAt(right, [-0.09, -0.35, 0.03]), bend);
  const rightCarries = reachWrist(right, wristAt(right, [-0.05, -0.24, 0.25]), new THREE.Vector3(-0.3, 0, -1));
  const rightHolds = reachWrist(right, wristAt(right, [-0.1, -0.33, 0.08]), bend);
  // The jump shot: the hand set above his forehead, palm up, then pushed up and flicked over.
  const rightSets = pointHand(reachWrist(right, new THREE.Vector3(-0.11, 0.58, 0.2), new THREE.Vector3(-1, -0.3, 0)), new THREE.Vector3(0, 0.8, -0.6), Math.PI / 2);
  const rightShoots = pointHand(reachWrist(right, new THREE.Vector3(-0.13, 0.76, 0.12), new THREE.Vector3(-1, 0, -0.2)), new THREE.Vector3(0, 0.6, 1), Math.PI / 2);
  // Cornered, he draws his right fist in to his chest.
  const rightCowers = reachWrist(right, wristAt(right, [0.02, -0.2, 0.15]), new THREE.Vector3(-1, -0.4, -0.6));

  // The net rides his left fist.
  const butterflyNet: Prop = { object: group(mesh(parts.net, "net")), handle: 0.015, carry: "upright" };
  holdIn(left.hand, butterflyNet);
  const netPlace = new THREE.Matrix4();
  const netTurn = new THREE.Quaternion();
  const netAt = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const netBend = new THREE.Vector3(0.3, -0.5, -1).normalize();
  /** The left arm's pose holding the net with its pole tipped `tip` radians, reached out `out` of the way. */
  const holdsNet = (tip: number, out: number, shake: number) => {
    netTurn.setFromAxisAngle(SWOOP_AXIS, tip).multiply(new THREE.Quaternion().setFromAxisAngle(UP, shake));
    netAt.lerpVectors(NET_HELD, NET_OUT, out);
    return gripAt(left, netPlace.compose(netAt, netTurn, one), netBend);
  };
  const netCarried = holdsNet(0, 0, 0);
  const poleWay = new THREE.Vector3();

  const trunk = mesh(parts.jersey, "jersey");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thighs[i], `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.008),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), PETER_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.09 },
    // His bare shoulders reach out over the tops of his arms.
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.1 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.15, 0.11, 0.1)),
  ]);
  // The net arm swings little: he keeps the net up, and pumps it less running.
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 },
    left: { limb: left, side: 1 as const, swing: ARM_SWING * 0.25, pump: 0.3 },
  };
  const rig: StrideRig = { walking: PETER_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.05 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    trapped: { every: 9, lasts: 2.8, chance: 0.5 },
    bug: { every: 12, lasts: 4.2, chance: 0.65 },
    shot: { every: 10, lasts: 2.4, chance: 0.5 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const breath = Math.sin((seconds / 3.4) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 4.5) * Math.PI * 2 + swayPhase);

    const { trapped, bug, shot } = bursts(clock);
    const fear = trapped.amount * (1 - running);
    const calm = 1 - fear;
    const catching = bug.amount > 0 ? still * calm : 0;
    const held = right.hand.held;
    const shooting = held || shot.amount === 0 ? 0 : still * calm * shot.amount;
    const upright = held?.carry === "upright";

    // Weight from foot to foot, and a dip of the knees: to jump, or to cower.
    const p = shot.progress;
    const dip = 0.035 * shooting * bump(p, 0.15, 0.32, 0.4, 0.5) + 0.018 * fear;
    rig.rest = BASE_TOP - dip;
    body.rotation.z = sway * 0.03 * calm;
    chest.rotation.z = sway * -0.02 * calm;
    chest.rotation.x = breath * -0.018 + fear * 0.1;
    trunk.scale.set(1 + breath * 0.018, 1, 1 + breath * 0.02);
    // Cornered, he hunches his shoulders up.
    const hunch = fear * 0.03;
    left.shoulder.position.y = left.at.y + breath * 0.004 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.004 + hunch;

    // The swoop: out and down at a bug, a shake of the net, then lifted up to peer in.
    const b = bug.progress;
    const tip = (SWOOPED * smooth(b, 0.08, 0.24) - (SWOOPED - PEERING) * smooth(b, 0.42, 0.6) - PEERING * smooth(b, 0.8, 0.97)) * catching;
    const out = bump(b, 0.05, 0.2, 0.8, 0.97) * catching;
    const shake = 0.3 * Math.sin(b * Math.PI * 14) * bump(b, 0.25, 0.3, 0.36, 0.42) * catching;
    poseArm(left, netCarried, catching > 0 ? holdsNet(tip, out, shake) : netCarried, 1);

    // His eyes follow the net down, then up into it; cornered, they dart about for a way out.
    const watching = catching * (smooth(b, 0.05, 0.2) - smooth(b, 0.85, 1));
    const lookUp = catching * bump(b, 0.45, 0.6, 0.8, 0.95);
    const dart = Math.sin(trapped.progress * Math.PI * 5 + trapped.pick * 6) * (trapped.pick < 0.5 ? -1 : 1);
    neck.rotation.y = watching * 0.45 + fear * dart * 0.8;
    neck.rotation.x = watching * 0.3 - lookUp * 0.55 - shooting * 0.3 - fear * 0.15 * bump(trapped.progress, 0.3, 0.45, 0.6, 0.75) - 0.03;
    neck.rotation.z = sway * -0.02 * calm;

    // The right arm hangs, or carries what it holds, or shoots, or draws in.
    const rests = upright ? rightCarries : held ? rightHolds : rightHangs;
    const release = between(between(rests, rightSets, smooth(p, 0.05, 0.3)), rightShoots, smooth(p, 0.38, 0.5));
    poseArm(right, rests, release, shooting);
    if (fear > 0 && !held) poseArm(right, between(rests, release, shooting), rightCowers, fear);
    const empty = blendPose(RELAXED, fist(right.hand), Math.max(running * 0.7, fear));
    poseHand(right.hand, holding(right.hand, blendPose(empty, OPEN, shooting)));
    swings.right.swing = upright ? ARM_SWING * 0.2 : ARM_SWING;
    swings.right.pump = held ? 0.4 : 1;

    stride(rig, moving);
    // The pole stays as he tips it, however his arm swings: upright, unless he's swooping.
    poleWay.copy(UP).applyAxisAngle(SWOOP_AXIS, tip);
    aimGrip(left.hand, figure, poleWay, 1);
    if (upright) aimGrip(right.hand, figure, UP, 1);
  });
}
