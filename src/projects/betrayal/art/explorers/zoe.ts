import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, plinth, ring, rod, roundBox, sculpt, stretched, type Solid } from "../forms";
import { group } from "../shapes";
import { arm, BASE_TOP, burst, limbEnd, miniatureHeight, pose, reach, STANDING, stride, walks, type Gait, type StrideRig, type Walking } from "./figure";

/*
 * Zoe Ingstrom: an eight-year-old who hums little tunes, loves her dolls and
 * is afraid of the boogeyman. Read at a glance: the smallest figure in the
 * house, a big round head with a straight fringe and two copper pigtails, a
 * pleated bell of yellow dress over white socks and red shoes, and a rag doll
 * dangling from her hand. She faces +z; her right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const TOP = BASE_TOP + miniatureHeight(3, 9);
const WAIST = 0.47;
const LEG = WAIST - BASE_TOP;
const ZOE_WALK: Walking = { step: 0.36, hop: 0.05 };
const ARM_SWING = 0.5;
/** Where the original's head sat, so the neck pivot and the pigtails' ties stay where they were. */
const HEAD_RADIUS = 0.1225;
const NECK = TOP - 0.31;
const PIGTAIL_TIE: [number, number, number] = [HEAD_RADIUS + 0.01, 0.2, -0.03];
const SHOULDER: [number, number] = [0.125, 0.665];
const UPPER_ARM = 0.14;
const FOREARM = 0.12;
const HAND = 0.05;
const LOWER_ARM = FOREARM + HAND / 2;
const LEG_X = 0.05;

/** The head on its neck: a big round head with full cheeks, rosy, round eyes
 *  (white, a brown iris and a glint, so they read as a child's and not as two
 *  holes), a small smile, a straight fringe and hair to the neck behind. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.04, 0], [0, 0.06, 0], 0.04, 0.038), "skin")
    .add(ellipsoid([0, 0.16, 0], [0.122, 0.13, 0.122]), "skin", 0.03)
    .add(ellipsoid([0, 0.1, 0.03], [0.1, 0.085, 0.098]), "skin", 0.05)
    .add(ball([0, 0.105, 0.13], 0.015), "skin", 0.012);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.12, 0.12, 0], [0.016, 0.03, 0.022]), "skin", 0.01);
    shape.carve(ball([side * 0.044, 0.126, 0.128], 0.021), { blend: 0.008 });
    shape.add(ball([side * 0.044, 0.125, 0.105], 0.023), "boneLight");
    shape.paint(ball([side * 0.044, 0.124, 0.127], 0.0125), "woodMid");
    shape.paint(ball([side * 0.044, 0.124, 0.129], 0.0065), "void");
    shape.paint(ball([side * 0.039, 0.132, 0.128], 0.0045), "boneLight");
    shape.paint(ellipsoid([side * 0.07, 0.088, 0.1], [0.022, 0.013, 0.03]), "bloodLight");
  }
  return shape
    .paint(ellipsoid([0, 0.064, 0.112], [0.02, 0.006, 0.03]), "blood")
    .add(ellipsoid([0, 0.17, -0.012], [0.134, 0.14, 0.134]), "woodLight", 0.01)
    .add(roundBox([0, 0.178, 0.1], [0.1, 0.03, 0.025], 0.02), "woodLight", 0.02)
    .add(ellipsoid([0, 0.1, -0.055], [0.12, 0.1, 0.09]), "woodLight", 0.03)
    .geometry(0.008);
}

/** A pigtail hanging from its tie: the red tie, and a tapering bunch of hair. */
function pigtail(): THREE.BufferGeometry {
  return sculpt()
    .add(ring([0, -0.03, 0], 0.026, 0.014), "bloodLight")
    .add(chain([[0, -0.02, 0], [0, -0.09, 0.006], [0, -0.165, 0]], [0.032, 0.04, 0.02]), "woodLight", 0.01)
    .geometry(0.006);
}

/** The bodice from the waist up: a Peter Pan collar, buttons, and a red sash tied in a bow behind. */
function bodice(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.1, 0], [0.098, 0.13, 0.07]), "gold")
    .add(rod([-0.075, 0.18, 0], [0.075, 0.18, 0], 0.042), "gold", 0.05)
    .add(stretched(ring([0, 0.01, 0], 0.094, 0.026), [0, 0.01, 0], [1, 1, 0.78]), "bloodLight", 0.004)
    .add(ring([0, 0.207, 0], 0.045, 0.016), "boneLight", 0.004)
    .add(ball([0, 0.02, -0.082], 0.018), "bloodLight", 0.004);
  for (const side of [-1, 1]) {
    shape.add(ellipsoid([side * 0.034, 0.197, 0.052], [0.038, 0.012, 0.028]), "boneLight", 0.004);
    shape.add(ellipsoid([side * 0.042, 0.025, -0.088], [0.04, 0.026, 0.014]), "bloodLight", 0.006);
    shape.add(rod([side * 0.012, 0.01, -0.09], [side * 0.032, -0.07, -0.142], 0.011, 0.008), "bloodLight", 0.004);
  }
  for (const y of [0.07, 0.12, 0.16]) shape.add(ball([0, y, 0.069], 0.008), "boneLight");
  return shape.geometry(0.008);
}

/** The bell of the skirt, from the waist down: round, as the original's lathe, so the dress's z
 *  scale and twirl flare carry over; twelve pleats deepening to the hem, and a scalloped petticoat. */
function skirt(): THREE.BufferGeometry {
  const [top, hem, waist, width] = [0, -0.19, 0.098, 0.215];
  const bell: Solid = {
    distance: (x, y, z) => {
      const t = THREE.MathUtils.clamp((top - y) / (top - hem), 0, 1);
      const radius = waist + (width - waist) * (1 - (1 - t) ** 2);
      const pleat = 1 + 0.06 * t * Math.cos(12 * Math.atan2(z, x));
      const side = (Math.hypot(x, z) - radius * pleat) * 0.85;
      return Math.max(side, y - top, hem - y);
    },
    min: [-0.24, hem - 0.01, -0.24],
    max: [0.24, top + 0.01, 0.24],
  };
  const petticoat: Solid = {
    distance: (x, y, z) => Math.max(Math.hypot(x, z) - (0.207 + 0.006 * Math.cos(28 * Math.atan2(z, x))), y + 0.18, -0.205 - y),
    min: [-0.22, -0.21, -0.22],
    max: [0.22, -0.17, 0.22],
  };
  return sculpt().add(bell, "gold").add(petticoat, "boneLight", 0.004).geometry(0.0095);
}

/** A puffed yellow sleeve over a thin bare upper arm. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.02, 0], [0, -UPPER_ARM, 0], 0.026, 0.023), "skin")
    .add(ellipsoid([0, -0.035, 0], [0.052, 0.05, 0.054]), "gold", 0.01)
    .add(ring([0, -0.075, 0], 0.036, 0.009), "boneLight", 0.004)
    .geometry(0.007);
}

/** A thin forearm and a small hand: palm and thumb. */
function forearm(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.01, 0], [0, -FOREARM, 0.002], 0.024, 0.02), "skin")
    .add(ellipsoid([0, -FOREARM - 0.022, 0.004], [0.017, 0.03, 0.026]), "skin", 0.01)
    .add(rod([-side * 0.01, -FOREARM - 0.008, 0.02], [-side * 0.016, -FOREARM - 0.034, 0.03], 0.009, 0.008), "skin", 0.006)
    .geometry(0.0055);
}

/** Her rag doll, hanging from its raised arm at the origin, where Zoe holds
 *  it, its body out to +x, away from her skirt: woolly hair, button eyes, a
 *  white dress with a red sash. */
function doll(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0.004, -0.004, 0], [0.02, -0.06, 0], 0.011, 0.012), "bone")
    .add(ball([0.035, -0.068, 0], 0.033), "bone", 0.008)
    .add(ellipsoid([0.035, -0.05, -0.006], [0.038, 0.025, 0.034]), "woodDark", 0.006)
    .add(rod([0.035, -0.1, 0], [0.035, -0.19, 0], 0.026, 0.044), "boneLight", 0.012)
    .add(stretched(ring([0.035, -0.17, 0], 0.04, 0.01), [0.035, -0.17, 0], [1, 1, 0.9]), "bloodLight", 0.003)
    .add(rod([0.062, -0.105, 0], [0.078, -0.16, 0.004], 0.011, 0.01), "bone", 0.006);
  for (const x of [0.022, 0.05]) {
    shape.add(rod([x, -0.18, 0], [x, -0.25, 0.004], 0.012, 0.011), "bone", 0.006);
    shape.paint(ball([x, -0.07, 0.033], 0.007), "void");
  }
  return shape.geometry(0.006);
}

/** White socks, from the hip down. */
function leg(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(rod([x, LEG + 0.02, 0], [x, 0.03, 0], 0.033, 0.028), "boneLight")
    .geometry(0.008);
}

/** A red strapped shoe on the base, with a dark sole. */
function shoe(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.02, 0.045], [0.036, 0.026, 0.055]), "blood")
    .add(ellipsoid([x, BASE_TOP + 0.024, -0.01], [0.034, 0.03, 0.04]), "blood", 0.03)
    .add(ring([x, BASE_TOP + 0.042, 0.022], 0.03, 0.006, [0, 0, Math.PI / 2]), "bloodDark", 0.003)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.008 ? -1 : 1), "soot")
    .geometry(0.006);
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    pigtail: pigtail(),
    bodice: bodice(),
    skirt: skirt(),
    upperArm: upperArm(),
    /** The right forearm, then the left. */
    forearms: [forearm(-1), forearm(1)],
    doll: doll(),
    legs: [leg(-LEG_X), leg(LEG_X)],
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

/** Zoe Ingstrom as a miniature on a round base, 3'9" at the house's scale.
 *  She hums, nodding and swaying to a quick tune; now and then she twirls to
 *  see her skirt fly out, and now and then she clutches her doll and peeks
 *  behind her for the boogeyman. She walks with a quick patter of short steps,
 *  her pigtails bouncing. */
export function zoe(seed = "zoe", gait: Gait = STANDING): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry) => form(material, geometry);

  const pigtails = [-1, 1].map((side) => {
    const tail = group(mesh(parts.pigtail));
    tail.position.set(side * PIGTAIL_TIE[0], PIGTAIL_TIE[1], PIGTAIL_TIE[2]);
    return tail;
  });
  const neck = group(mesh(parts.head), ...pigtails);
  neck.position.y = NECK - WAIST;

  const limb = (side: -1 | 1) =>
    arm(mesh(parts.upperArm), mesh(parts.forearms[side < 0 ? 0 : 1]), new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0), UPPER_ARM);
  const left = limb(1);
  const right = limb(-1);
  const bend = new THREE.Vector3(0, 0, -1);
  const leftHangs = reach(left.at, left.at.clone().add(new THREE.Vector3(0.1, -0.23, 0.07)), UPPER_ARM, LOWER_ARM, bend);
  const rightHangs = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.04, -0.26, 0.03)), UPPER_ARM, LOWER_ARM, bend);
  const leftHugs = reach(left.at, new THREE.Vector3(0.02, 0.12, 0.2), UPPER_ARM, LOWER_ARM, new THREE.Vector3(1, -1, 0));
  const rightHugs = reach(right.at, new THREE.Vector3(-0.03, 0.1, 0.15), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -1, 0));
  const leftOut = reach(left.at, left.at.clone().add(new THREE.Vector3(0.2, -0.16, 0)), UPPER_ARM, LOWER_ARM, bend);
  const rightOut = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.2, -0.16, 0)), UPPER_ARM, LOWER_ARM, bend);

  const top = mesh(parts.bodice);
  const held = group(mesh(parts.doll));
  const chest = group(top, neck, left.shoulder, right.shoulder, held);
  const dress = group(mesh(parts.skirt));
  dress.scale.z = 0.8;
  const hips = group(dress, chest);
  hips.position.y = WAIST - BASE_TOP;

  const [rightLeg, leftLeg] = parts.legs.map((geometry) => group(mesh(geometry)));
  const [rightShoe, leftShoe] = parts.shoes.map((geometry) => group(mesh(geometry)));
  const hipInBody = new THREE.Vector3(0, LEG, 0);
  const hipInFigure = new THREE.Vector3(0, WAIST, 0);
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;
  const standing = group(body, rightShoe, leftShoe);

  const figure = walks(group(mesh(parts.base), standing), ZOE_WALK);
  // The doll arm swings less: she keeps it close.
  const rig: StrideRig = {
    walking: ZOE_WALK,
    legs: [rightLeg, leftLeg],
    shoes: [rightShoe, leftShoe],
    hipInBody,
    hipInFigure,
    leg: LEG,
    arms: [
      { limb: right, side: -1, swing: ARM_SWING },
      { limb: left, side: 1, swing: ARM_SWING * 0.6 },
    ],
    chest,
    lean: 0.05,
  };

  const rng = createRng(seed);
  const tunePhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const moving = gait(clock);
    const tune = Math.sin((seconds / 1.8) * Math.PI * 2 + tunePhase);
    const breath = Math.sin((seconds / 3) * Math.PI * 2);
    const scared = burst(seconds, `${seed}:boogeyman`, { every: 8, lasts: 3, chance: 0.55 });
    const twirl = burst(seconds, `${seed}:twirl`, { every: 11, lasts: 2.2, chance: 0.6 });
    const spinning = twirl.amount * (1 - scared.amount) * (1 - moving.amount);
    const humming = 1 - scared.amount;

    standing.rotation.y = THREE.MathUtils.smootherstep(twirl.progress, 0, 1) * Math.PI * 2 * (twirl.pick < 0.5 ? -1 : 1) * (1 - scared.amount) * (1 - moving.amount);
    const flare = 1 + 0.3 * spinning * Math.sin(Math.PI * twirl.progress);
    dress.scale.set(flare, 1, 0.8 * flare);

    body.rotation.z = tune * 0.035 * humming;
    chest.rotation.z = tune * -0.02 * humming;
    chest.rotation.x = breath * -0.015 + scared.amount * 0.12;
    top.scale.set(1 + breath * 0.015, 1, 1 + breath * 0.015);

    neck.rotation.z = tune * -0.14 * humming;
    neck.rotation.y = scared.amount * (scared.pick < 0.5 ? -1 : 1) * 1.0;
    neck.rotation.x = -0.04 - spinning * 0.15;

    pose(left, leftHangs, leftHugs, scared.amount);
    pose(right, rightHangs, rightHugs, scared.amount);
    if (spinning > 0) {
      pose(left, leftHangs, leftOut, spinning);
      pose(right, rightHangs, rightOut, spinning);
    }

    const bounce = Math.abs(stride(rig, moving));
    for (const [i, tail] of pigtails.entries()) {
      const side = i === 0 ? -1 : 1;
      tail.rotation.z = side * (0.75 + spinning * 0.6 + bounce * 0.25) + tune * 0.12 * humming;
    }

    held.position.copy(limbEnd(left, UPPER_ARM, LOWER_ARM)).add(new THREE.Vector3(0, -0.01, 0));
    held.rotation.set(0, -scared.amount * 0.4, tune * 0.08 * humming + spinning * 0.7);
  });
}
