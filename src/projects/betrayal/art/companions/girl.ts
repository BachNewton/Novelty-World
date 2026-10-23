import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, drum, ellipsoid, figureMaterial, form, plinth, ring, rod, roundBox, sculpt, stretched, type Solid } from "../forms";
import { declareParts, figureParts } from "../figure-parts";
import { group } from "../shapes";
import { windOf } from "../wind";
import { hangsCloth } from "../explorers/cloth";
import { clothMode, clothMoment, clothNet, clothOnClock, clothSheet, FABRICS, legCapsules, simulatesCloth, type ClothMode, type LegsAsCloth, type SheetLook } from "../explorers/cloth-sim";
import { BASE_TOP, idleBursts, joins, leg, legJoints, miniatureHeight, soleEnds, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "../explorers/figure";
import { aimGrip, between, blendPose, buildArm, fist, handParts, hasHands, holding, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Arm, type HandPose } from "../explorers/hands";
import { skinOf, skinShade } from "../explorers/skin";

/*
 * The Girl: a lost child of the house, an omen an explorer keeps, who follows
 * them from room to room. Eerie but sympathetic, an ally. Read at a glance: a
 * slight, still child a little taller than Zoe, in a long, straight ash-grey
 * nightgown to her calves (a column, never Zoe's bell of yellow skirt), long
 * straight black hair down her back and framing her face, a plum ribbon, and
 * bare feet. Grey is no character card's colour, so she is never taken for a
 * seat. She faces +z; her right hand is on −x.
 *
 * She takes the children's build (Missy's, a little shorter) and the shared
 * arms, hands, legs and stride.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const SKIN = skinOf("girl");
/** Her nightgown, faded grey as an old photograph; its lace at the collar, cuffs and hem; her hair and ribbon. */
const GOWN = "stone";
const GOWN_SHADE = "stoneDark";
const LACE = "bone";
const HAIR = "soot";
const RIBBON = "bruise";

/** 4'0" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(4, 0);
const WAIST = 0.5;
const LEG = WAIST - BASE_TOP;
/** A child's short, soft step and barely any bounce: she seems to drift after her explorer rather than bound. */
const GIRL_WALK: Walking = { step: 0.38, hop: 0.012 };
const ARM_SWING = 0.3;
/** The neck's pivot, the head above it as big as a child's. */
const NECK = TOP - 0.3;
const SHOULDER: [number, number] = [0.122, 0.735];
const UPPER_ARM = 0.158;
/** From the elbow to the wrist. */
const FOREARM = 0.122;
/** Her hands, this many times an adult's. */
const HAND = 0.58;
const LEG_X = 0.052;
/** The ankle, over the bare foot, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.04;
const THIGH = (LEG - (ANKLE - BASE_TOP)) / 2;
const SHIN = THIGH;
/** Where her long hair hangs from, at the back of her head, in the neck's frame, and how far back it leans as it hangs. */
const HAIR_ROOT: [number, number, number] = [0, 0.085, -0.094];
const HAIR_HANG = 0.06;

/** The head on its neck: a round child's face, kept smooth and simple, with
 *  dark eyes (white, a brown iris and a glint) a little wide, soft brows and
 *  a small closed mouth; long straight black hair parted in the middle,
 *  falling past her cheeks, and a plum ribbon tied at one side. */
function head(): THREE.BufferGeometry {
  const skull = ellipsoid([0, 0.16, -0.004], [0.114, 0.122, 0.114]);
  const shape = sculpt()
    .add(rod([0, -0.04, 0], [0, 0.06, 0], 0.036, 0.034), SKIN)
    .add(skull, SKIN, 0.03)
    .add(ellipsoid([0, 0.1, 0.026], [0.09, 0.083, 0.092]), SKIN, 0.05)
    .add(ball([0, 0.112, 0.124], 0.013), SKIN, 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.041;
    shape.carve(ball([x, 0.132, 0.122], 0.02), { blend: 0.008 });
    shape.add(ball([x, 0.131, 0.1], 0.022), "boneLight");
    shape.paint(ball([x, 0.13, 0.121], 0.012), "woodMid");
    shape.paint(ball([x, 0.13, 0.123], 0.0065), "void");
    shape.paint(ball([x - side * 0.005, 0.137, 0.122], 0.004), "boneLight");
    shape.paint(ellipsoid([x, 0.165, 0.111], [0.02, 0.0045, 0.03]), "wood");
  }
  // Her hair: a smooth cap over the skull, parted down the middle, and two
  // straight curtains falling past her cheeks to her jaw.
  const cap: Solid = {
    distance: (x, y, z) => {
      const hairline = 0.205 + 0.05 * THREE.MathUtils.smoothstep(Math.abs(x), 0.0, 0.07) * THREE.MathUtils.smoothstep(z, 0.02, 0.1) - 0.11 * THREE.MathUtils.smoothstep(-z, -0.05, 0.06);
      return Math.max(skull.distance(x, y, z) - 0.012, (hairline - y) * 0.7);
    },
    min: [-0.14, 0.04, -0.14],
    max: [0.14, 0.3, 0.14],
  };
  shape.add(cap, HAIR, 0.006);
  for (const side of [-1, 1]) {
    shape.add(roundBox([side * 0.106, 0.14, 0.0], [0.024, 0.1, 0.075], 0.022), HAIR, 0.02);
  }
  return shape
    // The parting, and a small, solemn closed mouth.
    .paint((x, y, z) => (Math.abs(x) < 0.003 && y > 0.22 && z > -0.04 ? -1 : 1), skinShade(SKIN))
    .paint(ellipsoid([0, 0.07, 0.112], [0.016, 0.0045, 0.02]), "blood")
    // The ribbon tied at her left temple: a knot and two loops.
    .add(ball([0.098, 0.235, 0.03], 0.014), RIBBON, 0.004)
    .add(ellipsoid([0.104, 0.256, 0.006], [0.012, 0.022, 0.016]), RIBBON, 0.004)
    .add(ellipsoid([0.104, 0.246, 0.058], [0.012, 0.02, 0.016]), RIBBON, 0.004)
    .geometry(0.0075);
}

/** Her long hair down her back, hanging from the back of her head: a soft, straight sheet, a little wider as it falls,
 *  its end gently rounded. */
function longHair(): THREE.BufferGeometry {
  return sculpt()
    .add(chain([[0, 0.04, 0.0], [0, -0.08, -0.006], [0, -0.2, -0.004], [0, -0.26, 0.004]], [0.03, 0.028, 0.024, 0.016]), HAIR)
    .add(stretched(rod([0, 0.04, 0.0], [0, -0.24, -0.002], 0.034, 0.03), [0, -0.1, 0], [2.4, 1, 0.55]), HAIR, 0.03)
    .geometry(0.0065);
}

/** The nightgown from the waist up: a slim, plain bodice, a lace yoke and a frilled collar at her throat, and a plum
 *  ribbon round the high waist tied in a bow behind; the shoulders reach out over the tops of her sleeves. */
function bodice(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.11, 0], [0.09, 0.13, 0.066]), GOWN)
    .add(roundBox([0, 0.19, 0], [0.085, 0.06, 0.064], 0.05), GOWN, 0.04);
  for (const side of [-1, 1]) shape.add(rod([side * 0.03, 0.226, -0.004], [side * 0.124, 0.232, 0], 0.036, 0.041), GOWN, 0.04);
  shape
    .add(stretched(ring([0, 0.28, -0.004], 0.04, 0.012), [0, 0.28, -0.004], [1, 1, 0.92]), LACE, 0.006)
    .paint((x, y, z) => (z > 0.02 && y > 0.205 && Math.abs(x) < 0.07 ? -1 : 1), "stoneLight")
    .add(stretched(drum([0, 0.014, 0], 0.096, 0.016, 0.007), [0, 0.014, 0], [1, 1, 0.8]), RIBBON, 0.004)
    .add(ball([0, 0.02, -0.07], 0.016), RIBBON, 0.004);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.034, 0.024, -0.076], [0.034, 0.022, 0.012]), RIBBON, 0.006);
    shape.add(rod([side * 0.01, 0.012, -0.076], [side * 0.026, -0.04, -0.104], 0.009, 0.007), RIBBON, 0.004);
  }
  // Three small lace buttons down the yoke.
  for (const y of [0.215, 0.24, 0.262]) shape.add(ball([0, y, 0.07 - (y - 0.215) * 0.25], 0.006), LACE);
  return shape.geometry(0.0075);
}

/** A long nightgown sleeve from the shoulder, set in under the bodice's, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.034, 0.027), GOWN)
    .geometry(0.0062);
}

/** The forearm from the elbow: the sleeve to a frilled lace cuff, and a thin wrist. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.026, 0], 0.03, 0.027), GOWN)
    .add(ring([0, -FOREARM + 0.026, 0], 0.024, 0.009), LACE, 0.004)
    .add(rod([0, -FOREARM + 0.04, 0], [0, -FOREARM + 0.01, 0.002], 0.016, 0.015), SKIN)
    .geometry(0.0055);
}

/** A bare thigh from the hip, under her nightgown, to the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.01, 0], [0, -THIGH, 0.002], 0.034, 0.026), SKIN)
    .geometry(0.0065);
}

/** A bare knee and shin, down into the foot. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.002], [0, -SHIN + 0.006, -0.002], 0.029, 0.021), SKIN)
    .geometry(0.006);
}

/** A bare foot on the base: a narrow child's foot, its heel, its toes a soft rounded edge, and its sole a shade darker. */
function foot(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.016, 0.04], [0.027, 0.017, 0.052]), SKIN)
    .add(ellipsoid([x, BASE_TOP + 0.022, -0.012], [0.024, 0.026, 0.03]), SKIN, 0.03)
    .add(rod([x, BASE_TOP + 0.024, -0.006], [x, BASE_TOP + 0.05, -0.004], 0.021, 0.02), SKIN, 0.02)
    .add(ellipsoid([x - 0.008 * Math.sign(x), BASE_TOP + 0.014, 0.082], [0.02, 0.012, 0.016]), SKIN, 0.014)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.004 ? -1 : 1), skinShade(SKIN));
  return { geometry: shape.geometry(0.0055), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    hair: longHair(),
    bodice: bodice(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1, HAND, SKIN), handParts(1, HAND, SKIN)],
    thigh: thigh(),
    shin: shin(),
    feet: [foot(-LEG_X), foot(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
/** Her parts, meshed once a session (ahead of time in a worker, in the house) and shared by every copy. */
export const GIRL_PARTS = figureParts("girl", meshParts);
declareParts(girl, [GIRL_PARTS]);

/** The nightgown below the waist, in the hips' frame: from the waist (its top, at the hips' pivot) to the hem at her
 *  calves, its radii across and front to back at the waist and at the hem. */
const GOWN_SKIRT = { top: 0.0, hem: -0.27, waist: [0.094, 0.074], flare: [0.15, 0.13] } as const;

/** The simulated nightgown: a net 12 round by 7 down, of a child's cotton, with room for her legs inside it. */
const NET = { around: 12, down: 7 };
const NET_FEEL = { ...FABRICS.cottonDress, room: 0.022, roomAtTop: 0.015 };
/** How the net hangs while she walks: deeper front to back and narrower at the sides, its hem no longer, so her
 *  stride has room inside it. */
const WALKING_HEM = { deeper: 1.3, narrower: 0.82 };

/** A point on the nightgown as it hangs, `round` it as a share of a turn and `along` it from the waist to the hem. */
function onGown(round: number, along: number): THREE.Vector3 {
  const y = GOWN_SKIRT.top + (GOWN_SKIRT.hem - GOWN_SKIRT.top) * along;
  // A gentle A-line: it eases out from the waist and falls nearly straight to the hem.
  const t = 1 - (1 - along) ** 2;
  const rx = GOWN_SKIRT.waist[0] + (GOWN_SKIRT.flare[0] - GOWN_SKIRT.waist[0]) * t;
  const rz = GOWN_SKIRT.waist[1] + (GOWN_SKIRT.flare[1] - GOWN_SKIRT.waist[1]) * t;
  const turn = round * Math.PI * 2;
  return new THREE.Vector3(rx * Math.cos(turn), y, rz * Math.sin(turn));
}

/** The net's points as it hangs, a share `walking` of the way into its walking shape, into `out`. */
function gownRest(walking: number, out: Float64Array): Float64Array {
  const { around, down } = NET;
  for (let j = 0; j < down; j++) {
    const along = j / (down - 1);
    const [deeper, narrower] = [1 + (WALKING_HEM.deeper - 1) * along * walking, 1 - (1 - WALKING_HEM.narrower) * along * walking];
    for (let i = 0; i < around; i++) {
      const point = onGown(i / around, along);
      out.set([point.x * narrower, point.y, point.z * deeper], (j * around + i) * 3);
    }
  }
  return out;
}

/** Where the lace hem begins, as a share of the way down the gown. */
const HEM_LACE = 0.9;

/** The nightgown's look: soft gathers falling from the waist, grey outside and darker within, and a band of lace at the hem. */
const NET_LOOK: SheetLook = {
  across: 72,
  down: 22,
  thickness: 0.007,
  inset: (u, v) => -0.004 * v * (1 + Math.cos(14 * u * Math.PI * 2)) * 0.5,
  colour: (_, v, inside) => (inside ? GOWN_SHADE : v > HEM_LACE ? LACE : GOWN),
};

/** Her legs as the nightgown sees them; the thigh's top is inside her hips, under the ribbon. */
const LEGS_AS_CLOTH: LegsAsCloth = {
  radii: { thigh: 0.035, shin: 0.03, foot: 0.032 },
  hidden: 0.05,
  heel: new THREE.Vector3(0, BASE_TOP + 0.022, -0.014),
  toe: new THREE.Vector3(0, BASE_TOP + 0.016, 0.07),
};

/** The nightgown as a simulated net: the net, its mesh, the moment it hangs in, and its walking shape. */
function gownNet() {
  const { around, down } = NET;
  const shape = { rest: gownRest(0, new Float64Array(around * down * 3)), around, down, closed: true, outward: 1 as const, round: true, waistband: true };
  const body = clothNet(shape, NET_FEEL);
  const sheet = clothSheet(body, shape, NET_LOOK);
  const moment = clothMoment(6);
  const rest = new Float64Array(shape.rest.length);
  let hung = 0;
  return {
    body,
    sheet,
    moment,
    swing: clothOnClock(body, moment.capsules.length, sheet.follow),
    /** The gown hung at rest from where the moment's anchor is, unsimulated. */
    hang: () => {
      body.reset(moment);
      sheet.follow(moment.anchor.clone().invert());
    },
    walking: (share: number) => {
      if (Math.abs(share - hung) < 1e-4) return;
      hung = share;
      body.reshape(gownRest(share, rest));
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = THREE.MathUtils.smoothstep;
/** A bump easing up from 0 to 1 between `a` and `b`, holding, and back down between `c` and `d`. */
const bump = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) - smooth(t, c, d);
/** A beckoning hand's fingers, curled in. */
const CURLED: HandPose = { knuckles: [0.9, 1.1, 0.8], thumb: 0.3 };

/** The Girl as a miniature on a round base, 4'0" at the house's scale. She
 *  stands very still, breathing slowly, her head turning a little now and
 *  then as if she watched something no one else can see; now and then she
 *  lifts her hand and beckons, come this way; and now and then, afraid of the
 *  house, she hides her face in her hands. She walks with a short, soft step,
 *  barely bobbing, her nightgown swaying round her calves. Her right hand is
 *  free to hold anything; the beckoning waits while it does. Her nightgown is
 *  always simulated: she has no heavy cloth, so with `cloth` "off" it only
 *  hangs at rest from her hips, for the checks that leave it out. */
export function girl(seed = "girl", gait: Gait = STANDING, { cloth = clothMode() }: { cloth?: ClothMode } = {}): THREE.Group {
  const parts = GIRL_PARTS.get();
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry, name: string) => {
    const made = form(material, geometry);
    made.name = name;
    return made;
  };

  const face = mesh(parts.head, "head");
  const hair = group(mesh(parts.hair, "hair"));
  hair.position.set(...HAIR_ROOT);
  const neck = group(face, hair);
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
  // Her arms hang straight and still at her sides, a little forward.
  const hangs = (of: Arm) => reachWrist(of, wristAt(of, [of.hand.side * 0.035, -0.268, 0.03]), bend);
  const rightHangs = hangs(right);
  const leftHangs = hangs(left);
  const rightCarries = reachWrist(right, wristAt(right, [-0.08, -0.1, 0.2]), new THREE.Vector3(-0.3, 0, -1));
  const rightHolds = reachWrist(right, wristAt(right, [-0.07, -0.262, 0.06]), bend);
  // Beckoning: her right forearm raised before her, the palm up, the fingers curling in.
  const beckons = pointHand(reachWrist(right, new THREE.Vector3(-0.13, 0.21, 0.16), new THREE.Vector3(-0.4, -1, 0)), new THREE.Vector3(-0.05, 1, 0.35), Math.PI / 2);
  // Hiding: both hands over her face, the palms towards it, the head bowed into them.
  const hides = (of: Arm) => {
    const side = of.hand.side;
    return pointHand(reachWrist(of, new THREE.Vector3(side * 0.055, 0.33, 0.215), new THREE.Vector3(side, -1, -0.2)), new THREE.Vector3(-side * 0.12, 1, 0.1), -side * 0.3);
  };
  const rightHides = hides(right);
  const leftHides = hides(left);
  // On the way up, her hands come forward first, clear of her bodice.
  const lifts = (of: Arm) => reachWrist(of, new THREE.Vector3(of.hand.side * 0.07, 0.1, 0.2), new THREE.Vector3(of.hand.side, -1, -0.3));
  const rightLifts = lifts(right);
  const leftLifts = lifts(left);
  /** An arm from `rest` into `to`, `amount` of the way: forward first, then up. */
  const raised = (rest: ReturnType<typeof hangs>, via: ReturnType<typeof hangs>, to: ReturnType<typeof hangs>, amount: number) =>
    amount < 0.5 ? between(rest, via, amount * 2) : between(via, to, amount * 2 - 1);

  const trunk = mesh(parts.bodice, "bodice");
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const gown = gownNet();
  const skirt = mesh(gown.sheet.geometry, "nightgown");
  const hips = group(skirt, chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.feet[i];
    const name = side < 0 ? "right" : "left";
    const bare = group(mesh(geometry, `${name} foot`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), bare, new THREE.Vector3(side * LEG_X, LEG, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.004),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), GIRL_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  hangsCloth(figure, [skirt]);
  simulatesCloth(figure, gown.body);
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.09 },
    // Her long hair hangs from inside the back of her hair.
    { parts: [hair.children[0], face], at: hair, radius: 0.1 },
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.085 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.085 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.12, 0.08, 0.07)),
  ]);
  const swings = {
    right: { limb: right, side: -1 as const, swing: ARM_SWING, pump: 1 },
    left: { limb: left, side: 1 as const, swing: ARM_SWING, pump: 1 },
  };
  const rig: StrideRig = { walking: GIRL_WALK, legs, body, rest: BASE_TOP, arms: [swings.right, swings.left], chest, lean: 0.03, lifts: 0.5 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const watchPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const bursts = idleBursts(figure, seed, offset, {
    beckon: { every: 11, lasts: 3.4, chance: 0.6 },
    hide: { every: 13, lasts: 3.6, chance: 0.5 },
  });

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const still = 1 - moving.amount;
    const breath = Math.sin((seconds / 4.2) * Math.PI * 2 + breathPhase);
    // Her head turns slowly, now one way and now the other, as if following something.
    const watch = Math.sin((seconds / 9) * Math.PI * 2 + watchPhase) * Math.sin((seconds / 23) * Math.PI * 2);

    const { beckon, hide } = bursts(clock);
    const held = right.hand.held;
    const upright = held?.carry === "upright";
    const hiding = hide.amount * (1 - running);
    const calm = 1 - hiding;
    const beckoning = held ? 0 : beckon.amount * still * calm;

    body.rotation.z = Math.sin((seconds / 6.5) * Math.PI * 2 + breathPhase) * 0.012 * calm;
    chest.rotation.x = breath * -0.012 + hiding * 0.16 - beckoning * 0.03;
    chest.rotation.z = beckoning * 0.03;
    trunk.scale.set(1 + breath * 0.014, 1, 1 + breath * 0.016);
    const shrug = breath * 0.003 + hiding * 0.018;
    left.shoulder.position.y = left.at.y + shrug;
    right.shoulder.position.y = right.at.y + shrug;

    neck.rotation.y = watch * 0.4 * calm * (1 - beckoning) - beckoning * 0.12;
    neck.rotation.x = 0.05 + hiding * 0.3 - beckoning * 0.04;
    // She tilts her head as she beckons.
    neck.rotation.z = beckoning * 0.22 + watch * 0.05 * calm;

    const rightRests = upright ? rightCarries : held ? rightHolds : rightHangs;
    const rightPose = between(raised(rightRests, rightLifts, beckons, beckoning), raised(rightRests, rightLifts, rightHides, hiding), held ? 0 : Math.min(1, hiding * 2));
    poseArm(right, rightPose, rightPose, 1);
    const leftPose = raised(leftHangs, leftLifts, leftHides, hiding);
    poseArm(left, leftPose, leftPose, 1);
    // The beckoning fingers curl in, twice.
    const curl = beckoning * bump(beckon.progress, 0.3, 0.38, 0.6, 0.68) * (0.5 - 0.5 * Math.cos((beckon.progress - 0.3) * Math.PI * 2 * 6.5));
    const rightEmpty = blendPose(blendPose(blendPose(RELAXED, OPEN, Math.max(beckoning, hiding)), CURLED, curl), fist(right.hand), running * 0.6);
    poseHand(right.hand, holding(right.hand, rightEmpty));
    poseHand(left.hand, blendPose(blendPose(RELAXED, OPEN, hiding), fist(left.hand), running * 0.6));
    swings.right.swing = upright ? ARM_SWING * 0.2 : ARM_SWING;
    swings.right.pump = held ? 0.4 : 1;
    swings.left.swing = ARM_SWING;

    stride(rig, moving);
    if (upright) aimGrip(right.hand, figure, UP, 1);
    // Her long hair lies down her back however her head turns and tips; bowing, her head carries her nape forward
    // over her back, so the hair swings back a little to stay clear of it.
    hair.rotation.x = HAIR_HANG - neck.rotation.x + Math.max(0, neck.rotation.x) * 0.45;
    hair.rotation.y = -neck.rotation.y * 0.85;
    hair.rotation.z = -neck.rotation.z * 0.8;

    // Her nightgown swings from her hips as she moves, round her legs and in the room's air.
    figure.updateWorldMatrix(true, true);
    gown.moment.anchor.copy(hips.matrixWorld);
    legCapsules(legs, LEGS_AS_CLOTH, gown.moment.capsules);
    windOf(figure)(clock, gown.moment.wind);
    gown.moment.floor = figure.matrixWorld.elements[13] + BASE_TOP;
    gown.walking(moving.running ? 0 : moving.amount);
    if (cloth === "off") gown.hang();
    else gown.swing(clock, gown.moment);
  });
}
