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
 * Zoe Ingstrom: an eight-year-old who loves her dolls and music, and is
 * afraid of the boogeyman. Read at a glance: the smallest figure in the
 * house, a big head on a little body, a bell of yellow dress over white
 * socks and red shoes, two pigtails sticking out, and a doll dangling from
 * her hand. She faces +z; her right hand is on −x.
 *
 * Every size is in metres and every height measured from the floor; each
 * pivot sits at its joint.
 */

/** 3'9" at the miniature's scale. */
const TOP = BASE_TOP + miniatureHeight(3, 9);
const WAIST = 0.47;
const LEG = WAIST - BASE_TOP;
/** Short, quick steps, with a skip in them. */
const ZOE_WALK: Walking = { step: 0.36, hop: 0.05 };
const LEG_SWING = legSwing(ZOE_WALK, LEG);
const ARM_SWING = 0.5;

/** A child's head is nearly as big as a grown-up's: the same 24 texels
 *  round as Longfellow's, but only 8 high. */
const HEAD_RADIUS = 24 / TEXELS_PER_METRE / (16 * Math.sin(Math.PI / 8));
const HEAD_HEIGHT = 8 / TEXELS_PER_METRE;
const HEAD_LIFT = 0.02;
const DOME = 0.04;
const NECK = TOP - DOME - HEAD_HEIGHT - HEAD_LIFT;

const SHOULDER: [number, number] = [0.125, 0.665];
const UPPER_ARM = 0.14;
const FOREARM = 0.12;
const HAND = 0.05;
const LOWER_ARM = FOREARM + HAND / 2;

const FACE_LEGEND: PixelLegend = {
  s: "bone",
  h: "woodLight",
  e: "void",
  m: "bloodLight",
};

/**
 * Round the head from the back, past her right ear, across the face and back
 * by her left: a straight fringe, big dark eyes, a small mouth, and hair down
 * to her neck behind. The front is the edge between columns 11 and 12.
 */
const RIGHT_SIDE = ["hhh", "hhh", "hhs", "hhs", "hhs", "hss", "hss", "hss"];
const FRONT = ["hhhhhhhh", "hhhhhhhh", "shhhhhhs", "sesssses", "sesssses", "ssssssss", "sssmmsss", "ssssssss"];
const mirror = (row: string) => [...row].reverse().join("");
const HEAD_STRIP = FRONT.map((front, y) => "hhhhh" + RIGHT_SIDE[y] + front + mirror(RIGHT_SIDE[y]) + "hhhhh");

/** A pigtail hanging from its tie, at its origin: the pivot it swings about. */
function pigtail(): THREE.Group {
  return group(box([0.065, 0.15, 0.07], flat("woodLight"), [0, -0.15, 0]), box([0.075, 0.03, 0.08], flat("bloodLight"), [0, -0.035, 0]));
}

function head(): { head: THREE.Group; pigtails: THREE.Group[] } {
  const skin = flat("bone");
  const hair = flat("woodLight");
  const geometry = new THREE.CylinderGeometry(HEAD_RADIUS, HEAD_RADIUS, HEAD_HEIGHT, 8, 1, false, -Math.PI);
  geometry.translate(0, HEAD_LIFT + HEAD_HEIGHT / 2, 0);
  const skull = new THREE.Mesh(geometry, [textured(pixelTexture(HEAD_STRIP, FACE_LEGEND)), hair, skin]);
  const top = HEAD_LIFT + HEAD_HEIGHT;
  const pigtails = [-1, 1].map((side) => {
    const tail = pigtail();
    tail.position.set(side * (HEAD_RADIUS + 0.01), top - 0.07, -0.03);
    return tail;
  });
  return {
    head: group(
      cylinder(0.04, 0.07, skin, [0, -0.04, 0], { sides: 6 }),
      skull,
      lathe([[HEAD_RADIUS, top - 0.001], [HEAD_RADIUS * 0.8, top + 0.028], [0, top + DOME]], hair, 8),
      box([0.03, 0.035, 0.03], skin, [0, top - 0.17, HEAD_RADIUS + 0.005]),
      ...pigtails,
    ),
    pigtails,
  };
}

/** The bodice and its white collar, built from the waist up. */
function bodice(): THREE.Group {
  const dress = batch();
  dress.block([0.2, 0.22, 0.14], "gold", [0, -0.02, 0]);
  dress.block([0.17, 0.035, 0.15], "boneLight", [0, 0.19, 0]);
  // A sash at the waist, tied in a bow behind.
  dress.block([0.205, 0.035, 0.145], "bloodLight", [0, -0.005, 0]);
  dress.block([0.12, 0.05, 0.03], "bloodLight", [0, -0.015, -0.08]);
  return group(dress.mesh());
}

/** The bell of the skirt, from the waist down, with a white petticoat peeping under its hem. */
function skirt(): THREE.Group {
  const bell = lathe(
    [
      [0.215, -0.19],
      [0.2, -0.12],
      [0.15, -0.02],
      [0.105, 0.02],
      [0, 0.02],
    ],
    flat("gold"),
    10,
  );
  const petticoat = lathe([[0.205, -0.205], [0.21, -0.18], [0, -0.18]], flat("boneLight"), 10);
  const result = group(bell, petticoat);
  result.scale.z = 0.8;
  return result;
}

/** A puffed yellow sleeve over a thin bare arm. */
function arm(side: -1 | 1): Limb {
  const skin = flat("bone");
  const elbow = group(box([0.05, FOREARM, 0.055], skin, [0, -FOREARM, 0]), box([0.052, HAND, 0.05], skin, [0, -FOREARM - HAND + 0.005, 0]));
  elbow.position.y = -UPPER_ARM;
  const shoulder = group(box([0.055, UPPER_ARM + 0.01, 0.06], skin, [0, -UPPER_ARM - 0.005, 0]), box([0.09, 0.08, 0.095], flat("gold"), [0, -0.07, 0]), elbow);
  const at = new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** Her rag doll, hanging from its raised arm at the origin, where Zoe holds
 *  it, its body out to +x, away from her skirt. */
function doll(): THREE.Group {
  const parts = batch();
  parts.block([0.022, 0.05, 0.022], "bone", [0, -0.05, 0]);
  parts.block([0.075, 0.065, 0.06], "bone", [0.035, -0.095, 0]);
  parts.block([0.08, 0.025, 0.065], "woodDark", [0.035, -0.04, -0.003]);
  parts.block([0.085, 0.11, 0.055], "boneLight", [0.035, -0.2, 0]);
  parts.block([0.088, 0.03, 0.058], "bloodLight", [0.035, -0.2, 0]);
  for (const x of [0.018, 0.052]) parts.block([0.024, 0.05, 0.024], "bone", [x, -0.25, 0]);
  return group(parts.mesh());
}

/** Zoe Ingstrom as a miniature on a round base, 3'9" at the house's scale,
 *  holding her doll. She sways and nods to a tune only she hears; now and
 *  then she spins round to see her skirt fly out, and now and then she
 *  clutches her doll to her and peeks behind her for the boogeyman. She
 *  walks with quick little steps, both arms swinging. */
export function zoe(seed = "zoe", gait: Gait = STANDING): THREE.Group {
  const { head: face, pigtails } = head();
  const neck = group(face);
  neck.position.y = NECK - WAIST;

  const left = arm(1);
  const right = arm(-1);
  const bend = new THREE.Vector3(0, 0, -1);
  const leftHangs = reach(left.at, left.at.clone().add(new THREE.Vector3(0.1, -0.23, 0.07)), UPPER_ARM, LOWER_ARM, bend);
  const rightHangs = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.04, -0.26, 0.03)), UPPER_ARM, LOWER_ARM, bend);
  const leftHugs = reach(left.at, new THREE.Vector3(0.02, 0.12, 0.2), UPPER_ARM, LOWER_ARM, new THREE.Vector3(1, -1, 0));
  const rightHugs = reach(right.at, new THREE.Vector3(-0.03, 0.1, 0.15), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -1, 0));
  const leftOut = reach(left.at, left.at.clone().add(new THREE.Vector3(0.2, -0.16, 0)), UPPER_ARM, LOWER_ARM, bend);
  const rightOut = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.2, -0.16, 0)), UPPER_ARM, LOWER_ARM, bend);

  const top = bodice();
  const held = doll();
  const chest = group(top, neck, left.shoulder, right.shoulder, held);
  const dress = skirt();
  const hips = group(dress, chest);
  hips.position.y = WAIST - BASE_TOP;

  const sock = flat("boneLight");
  const [rightLeg, leftLeg] = [-0.05, 0.05].map((x) => group(box([0.065, LEG + 0.02, 0.07], sock, [x, 0, 0])));
  const [rightShoe, leftShoe] = [-0.05, 0.05].map((x) => group(box([0.075, 0.05, 0.12], flat("blood"), [x, BASE_TOP, 0.02])));
  const hipInBody = new THREE.Vector3(0, LEG, 0);
  const hipInFigure = new THREE.Vector3(0, WAIST, 0);
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;
  // She spins as a whole, shoes and all, on the base.
  const standing = group(body, rightShoe, leftShoe);

  const figure = walks(group(figureBase(), standing), ZOE_WALK);

  const rng = createRng(seed);
  const tunePhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const stride = gait(clock);
    const tune = Math.sin((seconds / 1.8) * Math.PI * 2 + tunePhase);
    const breath = Math.sin((seconds / 3) * Math.PI * 2);
    const scared = burst(seconds, `${seed}:boogeyman`, { every: 8, lasts: 3, chance: 0.55 });
    const twirl = burst(seconds, `${seed}:twirl`, { every: 11, lasts: 2.2, chance: 0.6 });
    const spinning = twirl.amount * (1 - scared.amount) * (1 - stride.amount);
    const humming = 1 - scared.amount;

    standing.rotation.y = THREE.MathUtils.smootherstep(twirl.progress, 0, 1) * Math.PI * 2 * (twirl.pick < 0.5 ? -1 : 1) * (1 - scared.amount) * (1 - stride.amount);
    const flare = 1 + 0.3 * spinning * Math.sin(Math.PI * twirl.progress);
    dress.scale.set(flare, 1, 0.8 * flare);

    body.rotation.z = tune * 0.035 * humming;
    chest.rotation.z = tune * -0.02 * humming;
    chest.rotation.x = breath * -0.015 + scared.amount * 0.12;
    top.scale.set(1 + breath * 0.015, 1, 1 + breath * 0.015);

    neck.rotation.z = tune * -0.14 * humming;
    neck.rotation.y = scared.amount * (scared.pick < 0.5 ? -1 : 1) * 1.0;
    neck.rotation.x = 0.06 - spinning * 0.15;

    pose(left, leftHangs, leftHugs, scared.amount);
    pose(right, rightHangs, rightHugs, scared.amount);
    if (spinning > 0) {
      pose(left, leftHangs, leftOut, spinning);
      pose(right, rightHangs, rightOut, spinning);
    }

    let bounce = 0;
    if (stride.amount > 0) {
      const step = Math.sin(stride.phase) * stride.amount;
      bounce = Math.abs(step);
      swing(rightLeg, hipInBody, step * LEG_SWING);
      swing(leftLeg, hipInBody, -step * LEG_SWING);
      swing(rightShoe, hipInFigure, step * LEG_SWING);
      swing(leftShoe, hipInFigure, -step * LEG_SWING);
      right.shoulder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -step * ARM_SWING));
      left.shoulder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), step * ARM_SWING * 0.6));
      chest.rotation.x += 0.05 * stride.amount;
    } else {
      for (const piece of [rightLeg, leftLeg, rightShoe, leftShoe]) {
        piece.rotation.x = 0;
        piece.position.set(0, 0, 0);
      }
    }

    // The pigtails swing with her head, fly out as she spins, and bounce as she walks.
    for (const [i, tail] of pigtails.entries()) {
      const side = i === 0 ? -1 : 1;
      tail.rotation.z = side * (0.75 + spinning * 0.6 + bounce * 0.25) + tune * 0.12 * humming;
    }

    // The doll hangs straight down from her hand, swinging a little, whichever way her arm is turned.
    held.position.copy(limbEnd(left, UPPER_ARM, LOWER_ARM)).add(new THREE.Vector3(0, -0.01, 0));
    held.rotation.set(0, -scared.amount * 0.4, tune * 0.08 * humming + spinning * 0.7);
  });
}
