import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { batch, box, cylinder, flat, group, lathe, textured } from "../shapes";
import { pixelTexture, TEXELS_PER_METRE, type PixelLegend } from "../textures";
import {
  BASE_TOP,
  burst,
  figureBase,
  legSwing,
  limbEnd,
  miniatureHeight,
  pose,
  reach,
  STANDING,
  swing,
  walks,
  type Gait,
  type Limb,
  type Walking,
} from "./figure";

/*
 * Ox Bellows: a huge young linebacker, all Might, who is afraid of the dark
 * and can't pass anything that glitters. Read at a glance: the widest figure
 * in the house, a wedge of red letterman jacket with cream sleeves and a
 * chest letter, a small buzz-cut head on a thick neck, and blue jeans on
 * planted legs. He faces +z; his right hand is on −x.
 *
 * Every size is in metres and every height measured from the floor; each
 * pivot sits at its joint.
 */

/** 6'4" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(6, 4);
/** The legs swing from the hips, at the waist. */
const WAIST = 0.8;
const LEG = WAIST - BASE_TOP;
/** Long, heavy steps: a slower cadence than anyone's, and a low hop. */
const OX_WALK: Walking = { step: 0.66, hop: 0.025 };
const LEG_SWING = legSwing(OX_WALK, LEG);
const ARM_SWING = 0.32;
/** How far he rolls from one planted foot to the other as he walks. */
const ROLL = 0.05;

/** The head is an eight-sided column wrapped in one strip of pixel art, 24
 *  texels round and 9 high: small on that body, which is the point. */
const HEAD_RADIUS = 24 / TEXELS_PER_METRE / (16 * Math.sin(Math.PI / 8));
const HEAD_HEIGHT = 9 / TEXELS_PER_METRE;
const HEAD_LIFT = 0.03;
const DOME = 0.035;
const NECK = TOP - DOME - HEAD_HEIGHT - HEAD_LIFT;

const SHOULDER: [number, number] = [0.31, 1.26];
const UPPER_ARM = 0.3;
const FOREARM = 0.26;
const HAND = 0.1;
const LOWER_ARM = FOREARM + HAND / 2;

const FACE_LEGEND: PixelLegend = {
  s: "bone",
  S: "boneDark",
  d: "woodDark",
  e: "void",
  m: "bloodDark",
};

/**
 * Round the head from the back, past his right ear, across the face and back
 * by his left: a buzz cut, heavy brows, a broad jaw with a day's stubble. The
 * front is the edge between columns 11 and 12, where the nose stands.
 */
const RIGHT_SIDE = ["ddd", "dds", "dds", "dSs", "dSs", "sss", "sss", "SSs", "SSS"];
const FRONT = ["dddddddd", "ssssssss", "sddssdds", "sesssses", "sssSSsss", "sssSSsss", "ssmmmmss", "SssssssS", "SSSSSSSS"];
const mirror = (row: string) => [...row].reverse().join("");
const HEAD_STRIP = FRONT.map((front, y) => {
  const back = y < 6 ? "ddddd" : "sssss";
  return back + RIGHT_SIDE[y] + front + mirror(RIGHT_SIDE[y]) + back;
});

function head(): THREE.Group {
  const skin = flat("bone");
  const hair = flat("woodDark");
  const geometry = new THREE.CylinderGeometry(HEAD_RADIUS, HEAD_RADIUS, HEAD_HEIGHT, 8, 1, false, -Math.PI);
  geometry.translate(0, HEAD_LIFT + HEAD_HEIGHT / 2, 0);
  const skull = new THREE.Mesh(geometry, [textured(pixelTexture(HEAD_STRIP, FACE_LEGEND)), hair, skin]);
  const top = HEAD_LIFT + HEAD_HEIGHT;
  return group(
    // A bull neck, nearly as wide as the head.
    cylinder(0.1, 0.12, skin, [0, -0.07, 0], { top: 0.09, sides: 8 }),
    skull,
    lathe([[HEAD_RADIUS, top - 0.001], [HEAD_RADIUS * 0.8, top + 0.025], [0, top + DOME]], hair, 8),
    box([0.05, 0.06, 0.05], skin, [0, top - 0.17, HEAD_RADIUS + 0.005]),
  );
}

/** The letterman jacket from the hem up: red body, ribbed hem and collar, and
 *  the letter on his left breast. Built from the waist. */
function jacket(): THREE.Group {
  const red = flat("bloodLight");
  // Narrower at the hem than across the chest: a linebacker's wedge.
  const result = group(
    box([0.48, 0.3, 0.32], red, [0, -0.12, 0]),
    box([0.58, 0.28, 0.36], red, [0, 0.16, 0]),
    box([0.68, 0.06, 0.34], red, [0, 0.44, 0]),
  );
  const trim = batch();
  // The ribbed hem: dark red with a cream stripe.
  trim.block([0.485, 0.07, 0.325], "bloodDark", [0, -0.125, 0]);
  trim.block([0.49, 0.02, 0.33], "boneLight", [0, -0.1, 0]);
  // The ribbed collar, round the bottom of the neck.
  trim.block([0.3, 0.05, 0.24], "bloodDark", [0, 0.49, -0.01]);
  // The chest letter, an O in cream felt, standing proud of the jacket.
  const letter = { x: 0.14, y: 0.24, z: 0.185 };
  trim.block([0.11, 0.025, 0.02], "boneLight", [letter.x, letter.y, letter.z]);
  trim.block([0.11, 0.025, 0.02], "boneLight", [letter.x, letter.y + 0.105, letter.z]);
  for (const side of [-1, 1]) trim.block([0.025, 0.13, 0.02], "boneLight", [letter.x + side * 0.0425, letter.y, letter.z]);
  result.add(trim.mesh());
  return result;
}

/** A cream sleeve on a thick arm, ending in a ribbed cuff and a fist. */
function arm(side: -1 | 1): Limb {
  const sleeve = flat("boneLight");
  const elbow = group(
    box([0.13, FOREARM, 0.14], sleeve, [0, -FOREARM, 0]),
    box([0.135, 0.045, 0.145], flat("bloodDark"), [0, -FOREARM, 0]),
    box([0.1, HAND, 0.11], flat("bone"), [0, -FOREARM - HAND + 0.01, 0]),
  );
  elbow.position.y = -UPPER_ARM;
  // The sleeve is set in under the jacket's shoulder, which covers its top.
  const shoulder = group(box([0.15, UPPER_ARM + 0.03, 0.16], sleeve, [0, -UPPER_ARM - 0.01, 0]), elbow);
  const at = new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** His lucky find: a big gold coin, face up, its middle on its origin. */
function coin(): THREE.Mesh {
  return cylinder(0.035, 0.012, flat("goldLight"), [0, -0.006, 0], { sides: 8 });
}

/** Ox Bellows as a miniature on a round base, 6'4" at the house's scale.
 *  He breathes deep and slow and shifts his great weight; now and then he
 *  fishes out a shiny coin, flips it and admires it, and now and then he
 *  glances over his shoulder into the dark. He walks with long, heavy
 *  steps, rolling from foot to foot, both arms swinging. */
export function ox(seed = "ox", gait: Gait = STANDING): THREE.Group {
  const neck = group(head());
  neck.position.y = NECK - WAIST;

  const left = arm(1);
  const right = arm(-1);
  const bend = new THREE.Vector3(0, 0, -1);
  const hangs = (limb: Limb, side: number) =>
    reach(limb.at, limb.at.clone().add(new THREE.Vector3(side * 0.06, -0.58, 0.05)), UPPER_ARM, LOWER_ARM, bend);
  const leftHangs = hangs(left, 1);
  const rightHangs = hangs(right, -1);
  const admires = reach(right.at, new THREE.Vector3(-0.03, NECK - WAIST - 0.14, 0.3), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -1, -0.3));

  const trunk = jacket();
  const lucky = coin();
  const chest = group(trunk, neck, left.shoulder, right.shoulder, lucky);
  const hips = group(chest);
  hips.position.y = WAIST - BASE_TOP;

  const jeans = flat("moon");
  const [rightLeg, leftLeg] = [-0.11, 0.11].map((x) => group(box([0.17, LEG + 0.02, 0.19], jeans, [x, 0, 0])));
  const sneaker = (x: number) => {
    const shoe = batch();
    shoe.block([0.18, 0.025, 0.28], "soot", [x, BASE_TOP, 0.05]);
    shoe.block([0.17, 0.06, 0.26], "boneLight", [x, BASE_TOP + 0.02, 0.045]);
    return group(shoe.mesh());
  };
  const [rightShoe, leftShoe] = [-0.11, 0.11].map(sneaker);
  const hipInBody = new THREE.Vector3(0, LEG, 0);
  const hipInFigure = new THREE.Vector3(0, WAIST, 0);
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(figureBase(), body, rightShoe, leftShoe), OX_WALK);

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 5.5) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 8) * Math.PI * 2 + swayPhase);
    const shiny = burst(seconds, `${seed}:coin`, { every: 10, lasts: 3.6, chance: 0.75 });
    const glance = burst(seconds, `${seed}:dark`, { every: 7, lasts: 2.2, chance: 0.55 });
    const look = glance.amount * (1 - shiny.amount);

    body.rotation.z = sway * 0.025;
    chest.rotation.z = sway * -0.015;
    chest.rotation.x = breath * -0.02;
    chest.rotation.y = 0;
    trunk.scale.set(1 + breath * 0.02, 1, 1 + breath * 0.025);
    // He hunches his shoulders as he peers into the dark.
    const hunch = look * 0.035;
    left.shoulder.position.y = left.at.y + breath * 0.006 + hunch;
    right.shoulder.position.y = right.at.y + breath * 0.006 + hunch;

    neck.rotation.y = look * (glance.pick < 0.5 ? -1 : 1) * 0.85;
    neck.rotation.x = 0.05 + shiny.amount * 0.4 - look * 0.05;
    neck.rotation.z = sway * 0.015;

    left.shoulder.quaternion.copy(leftHangs.shoulder);
    left.elbow.quaternion.copy(leftHangs.elbow);
    pose(right, rightHangs, admires, shiny.amount);

    // The coin rests on his fist, flips once while he holds it up, and turns to catch the light.
    const flip = THREE.MathUtils.clamp((shiny.progress - 0.36) / 0.22, 0, 1);
    const toss = 4 * flip * (1 - flip) * 0.2;
    lucky.position.copy(limbEnd(right, UPPER_ARM, LOWER_ARM)).add(new THREE.Vector3(0, HAND / 2 + 0.015 + toss, 0));
    lucky.rotation.set(-0.5 * shiny.amount + flip * Math.PI * 4, 0, 0);
    lucky.visible = shiny.amount > 0;

    const stride = gait(clock);
    if (stride.amount > 0) {
      const step = Math.sin(stride.phase) * stride.amount;
      swing(rightLeg, hipInBody, step * LEG_SWING);
      swing(leftLeg, hipInBody, -step * LEG_SWING);
      swing(rightShoe, hipInFigure, step * LEG_SWING);
      swing(leftShoe, hipInFigure, -step * LEG_SWING);
      right.shoulder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -step * ARM_SWING));
      left.shoulder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), step * ARM_SWING));
      body.rotation.z += step * ROLL;
      chest.rotation.y = step * 0.12;
      chest.rotation.x += 0.06 * stride.amount;
    } else {
      for (const piece of [rightLeg, leftLeg, rightShoe, leftShoe]) {
        piece.rotation.x = 0;
        piece.position.set(0, 0, 0);
      }
    }
  });
}
