import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, painted, plinth, ring, rod, roundBox, sculpt, stretched, surfaceAt, type Vec3 } from "../forms";
import { group } from "../shapes";
import {
  arm,
  BASE_TOP,
  burst,
  limbEnd,
  miniatureHeight,
  pose,
  reach,
  STANDING,
  stride,
  walks,
  type Gait,
  type Limb,
  type StrideRig,
  type Walking,
} from "./figure";

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
const OX_WALK: Walking = { step: 0.66, hop: 0.025 };
const ARM_SWING = 0.32;
/** How far he rolls from one planted foot to the other as he walks. */
const ROLL = 0.05;
/** The neck's pivot, where his small head turns on that bull neck. */
const NECK = TOP - 0.35;
const SHOULDER: [number, number] = [0.31, 1.26];
const UPPER_ARM = 0.3;
const FOREARM = 0.26;
const HAND = 0.1;
const LOWER_ARM = FOREARM + HAND / 2;
const LEG_X = 0.11;

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
 *  narrower at the hem than across the chest, with a ribbed hem and collar,
 *  snaps down the front, and the big felt "O" on his left breast. */
function jacket(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(roundBox([0, 0.03, 0], [0.235, 0.16, 0.155], 0.08), "bloodLight")
    .add(roundBox([0, 0.27, 0], [0.29, 0.16, 0.175], 0.1), "bloodLight", 0.08);
  for (const side of [-1, 1]) shape.add(rod([side * 0.08, 0.42, -0.01], [side * 0.22, 0.43, 0], 0.085, 0.09), "bloodLight", 0.08);
  shape
    .add(stretched(ring([0, -0.1, 0], 0.2, 0.035), [0, -0.1, 0], [1.1, 1, 0.74]), "bloodDark", 0.01)
    .paint((_, y) => (Math.abs(y + 0.075) < 0.011 ? -1 : 1), "boneLight")
    .add(stretched(ring([0, 0.5, -0.01], 0.125, 0.038), [0, 0.5, -0.01], [1, 1, 0.85]), "bloodDark", 0.015);
  for (const y of [0.0, 0.12, 0.24, 0.36]) shape.add(ball([0, y, surfaceAt(shape.distance, 0, y) + 0.003], 0.012), "boneLight");
  const letter: Vec3 = [0.145, 0.29, 0];
  const front = surfaceAt(shape.distance, letter[0], letter[1]);
  shape.add(ring([letter[0], letter[1], front + 0.004], 0.052, 0.016, [Math.PI / 2, 0, 0]), "boneLight", 0.004);
  return shape.geometry(0.013);
}

/** A cream leather sleeve on a thick upper arm, set in under the jacket's shoulder. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(ball([0, -0.03, 0], 0.084), "boneLight")
    .add(rod([0, -0.04, 0], [0, -UPPER_ARM, 0], 0.084, 0.068), "boneLight", 0.04)
    .geometry(0.012);
}

/** The forearm from the elbow: a cream sleeve, a red ribbed cuff, and a big fist. */
function forearm(side: -1 | 1): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.02, 0], [0, -FOREARM + 0.02, 0], 0.068, 0.06), "boneLight")
    .add(ring([0, -FOREARM + 0.015, 0], 0.052, 0.02), "bloodDark", 0.006)
    .add(rod([0, -FOREARM, 0], [0, -FOREARM - 0.02, 0.004], 0.04), "skin", 0.01)
    .add(roundBox([0, -FOREARM - 0.05, 0.008], [0.042, 0.048, 0.05], 0.03), "skin", 0.015)
    .add(rod([-side * 0.035, -FOREARM - 0.03, 0.035], [-side * 0.02, -FOREARM - 0.06, 0.06], 0.016, 0.014), "skin", 0.01)
    .geometry(0.008);
}

/** A jeans leg from the hip to the ankle, in the body's frame, with a turned-up hem. */
function leg(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(chain([[x, LEG + 0.02, 0], [x, 0.36, 0.01], [x, 0.11, -0.01]], [0.092, 0.08, 0.072]), "moon")
    .add(ring([x, 0.12, -0.01], 0.068, 0.016), "moonDark", 0.01)
    .geometry(0.013);
}

/** A big white sneaker on the base, with a dark sole. */
function shoe(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.035, 0.08], [0.075, 0.045, 0.11]), "boneLight")
    .add(ellipsoid([x, BASE_TOP + 0.04, -0.03], [0.07, 0.05, 0.075]), "boneLight", 0.05)
    .add(rod([x, BASE_TOP + 0.05, -0.02], [x, BASE_TOP + 0.075, -0.015], 0.06), "boneLight", 0.03)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.016 ? -1 : 1), "soot")
    .geometry(0.011);
}

/** His lucky find: a big gold coin, face up, its middle on its origin. */
function coin(): THREE.BufferGeometry {
  return painted(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), "goldLight");
}

/** Every part's geometry, meshed once on first use and shared: none of it depends on the seed. */
function meshParts() {
  return {
    head: head(),
    jacket: jacket(),
    upperArm: upperArm(),
    /** The right forearm, then the left. */
    forearms: [forearm(-1), forearm(1)],
    legs: [leg(-LEG_X), leg(LEG_X)],
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    coin: coin(),
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

/** Ox Bellows as a miniature on a round base, 6'4" at the house's scale.
 *  He breathes deep and slow and shifts his great weight; now and then he
 *  fishes out a shiny coin, flips it and admires it, and now and then he
 *  glances over his shoulder into the dark. He walks with long, heavy
 *  steps, rolling from foot to foot, both arms swinging. */
export function ox(seed = "ox", gait: Gait = STANDING): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry) => form(material, geometry);

  const neck = group(mesh(parts.head));
  neck.position.y = NECK - WAIST;

  const limb = (side: -1 | 1) =>
    arm(mesh(parts.upperArm), mesh(parts.forearms[side < 0 ? 0 : 1]), new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0), UPPER_ARM);
  const left = limb(1);
  const right = limb(-1);
  const bend = new THREE.Vector3(0, 0, -1);
  const hangs = (of: Limb, side: number) => reach(of.at, of.at.clone().add(new THREE.Vector3(side * 0.06, -0.58, 0.05)), UPPER_ARM, LOWER_ARM, bend);
  const leftHangs = hangs(left, 1);
  const rightHangs = hangs(right, -1);
  const admires = reach(right.at, new THREE.Vector3(-0.03, NECK - WAIST - 0.14, 0.32), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -1, -0.3));

  const trunk = mesh(parts.jacket);
  const lucky = mesh(parts.coin);
  const chest = group(trunk, neck, left.shoulder, right.shoulder, lucky);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const [rightLeg, leftLeg] = parts.legs.map((geometry) => group(mesh(geometry)));
  const [rightShoe, leftShoe] = parts.shoes.map((geometry) => group(mesh(geometry)));
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base), body, rightShoe, leftShoe), OX_WALK);
  const rig: StrideRig = {
    walking: OX_WALK,
    legs: [rightLeg, leftLeg],
    shoes: [rightShoe, leftShoe],
    hipInBody: new THREE.Vector3(0, LEG, 0),
    hipInFigure: new THREE.Vector3(0, WAIST, 0),
    leg: LEG,
    arms: [
      { limb: right, side: -1, swing: ARM_SWING },
      { limb: left, side: 1, swing: ARM_SWING },
    ],
    chest,
    lean: 0.06,
  };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 5.5) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 8) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    // The coin comes out walking, but not running.
    const shiny = burst(seconds, `${seed}:coin`, { every: 10, lasts: 3.6, chance: 0.75 });
    const admiring = shiny.amount * (moving.running ? 1 - moving.amount : 1);
    const glance = burst(seconds, `${seed}:dark`, { every: 7, lasts: 2.2, chance: 0.55 });
    const look = glance.amount * (1 - admiring);

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

    pose(left, leftHangs, leftHangs, 0);
    pose(right, rightHangs, admires, admiring);

    const step = stride(rig, moving);
    body.rotation.z += step * ROLL;
    chest.rotation.y = step * 0.12;

    // The coin rests on his fist, flips once while he holds it up, and turns to catch the light.
    const flip = THREE.MathUtils.clamp((shiny.progress - 0.36) / 0.22, 0, 1);
    const toss = 4 * flip * (1 - flip) * 0.2;
    lucky.position.copy(limbEnd(right, UPPER_ARM, LOWER_ARM)).add(new THREE.Vector3(0, HAND / 2 + 0.03 + toss, 0));
    lucky.rotation.set(-0.5 * admiring + flip * Math.PI * 4, 0, 0);
    lucky.visible = admiring > 0;
  });
}
