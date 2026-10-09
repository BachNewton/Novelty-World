import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { batch, box, cylinder, flat, group, lathe, textured } from "../shapes";
import { pixelTexture, TEXELS_PER_METRE, type PixelLegend } from "../textures";
import { burst, figureBase, reach, STANDING, type Gait, type Reach } from "./figure";

/*
 * Professor Longfellow: a slight, elderly scholar, all Knowledge and no Might.
 * Read at a glance: a long green coat, a wine-red scarf (Gaelic music,
 * fine wines), wild white tufts round a bald crown, brass spectacles, and an
 * open book held up to read. He faces +z; his right hand is on −x.
 *
 * Every size here is in metres and every height measured from the floor, so
 * the numbers can be checked against the room; each pivot sits at its joint.
 */

const BASE_TOP = 0.08;
const WAIST = 0.7;
/** The legs swing from the hips, at the waist. */
const HIP = WAIST - BASE_TOP;
/** How far a leg swings forward and back in full stride, and the free arm. */
const LEG_SWING = 0.42;
const ARM_SWING = 0.3;
const NECK = 1.18;
const SHOULDER: [number, number] = [0.22, 1.12];
const UPPER_ARM = 0.28;
const FOREARM = 0.24;
const HAND = 0.08;
/** From the elbow to the middle of the hand, where a reach aims. */
const LOWER_ARM = FOREARM + HAND / 2;
/** The head is an eight-sided column wrapped in one strip of pixel art, exactly
 *  its size, so its pixels match the room's: 24 texels round, 10 high. */
const HEAD_RADIUS = 24 / TEXELS_PER_METRE / (16 * Math.sin(Math.PI / 8));
const HEAD_HEIGHT = 10 / TEXELS_PER_METRE;
const HEAD_LIFT = 0.04;

const FACE_LEGEND: PixelLegend = {
  s: "bone",
  S: "boneDark",
  h: "stoneLight",
  H: "stone",
  g: "brass",
  e: "void",
  m: "ash",
};

/**
 * Round the head from the back, past his right ear, across the face and back
 * by his left: a bald crown, white brows, round brass spectacles whose arms
 * run back to the ears, and a short white beard. The front of the head is the
 * edge between columns 11 and 12, where the nose stands.
 */
const RIGHT_SIDE = ["sss", "sss", "hss", "hgg", "hSs", "hSs", "hhs", "hhh", "hhh", "hhh"];
const FRONT = [
  "ssssssss",
  "sHHssHHs",
  "sggggggs",
  "sgeggegs",
  "sggSSggs",
  "sssSSsss",
  "shhhhhhs",
  "hhhmmhhh",
  "hhhhhhhh",
  "hhhhhhhh",
];
const mirror = (row: string) => [...row].reverse().join("");
const HEAD_STRIP = FRONT.map((front, y) => {
  const back = y === 0 ? "sssss" : "hhhhh";
  return back + RIGHT_SIDE[y] + front + mirror(RIGHT_SIDE[y]) + back;
});

function head(): THREE.Group {
  const skin = flat("bone");
  const hair = flat("stoneLight");
  // Starting the wrap at the back puts the strip's middle, the face, at the front (+z).
  const geometry = new THREE.CylinderGeometry(HEAD_RADIUS, HEAD_RADIUS, HEAD_HEIGHT, 8, 1, false, -Math.PI);
  geometry.translate(0, HEAD_LIFT + HEAD_HEIGHT / 2, 0);
  const skull = new THREE.Mesh(geometry, [
    textured(pixelTexture(HEAD_STRIP, FACE_LEGEND)),
    skin,
    hair,
  ]);
  const top = HEAD_LIFT + HEAD_HEIGHT;
  const result = group(
    cylinder(0.05, 0.08, skin, [0, 0, 0], { sides: 6 }),
    skull,
    // A low dome over the crown, so the head is rounded rather than a flat-topped can.
    lathe([[HEAD_RADIUS, top - 0.001], [HEAD_RADIUS * 0.75, top + 0.03], [0, top + 0.045]], skin, 8),
    // The nose stands out of the face, so he has a profile.
    box([0.045, 0.065, 0.05], skin, [0, top - 0.1875, HEAD_RADIUS + 0.005]),
  );
  // Wild white tufts above the ears: the silhouette of an old professor.
  for (const side of [-1, 1]) {
    const tuft = box([0.045, 0.07, 0.12], hair, [0, 0, 0]);
    tuft.position.set(side * (HEAD_RADIUS - 0.004), top - 0.13, -0.04);
    tuft.rotation.x = 0.3;
    result.add(tuft);
  }
  return result;
}

/** The coat over a mustard waistcoat, the scarf, and the shoulders. Built from the waist up. */
function torso(coat: THREE.Material): THREE.Group {
  const result = group(
    box([0.28, 0.46, 0.2], flat("brass"), [0, 0, 0]),
    box([0.34, 0.44, 0.18], coat, [0, 0, -0.025]),
    box([0.4, 0.08, 0.22], coat, [0, 0.4, 0]),
  );
  for (const side of [-1, 1]) result.add(box([0.1, 0.45, 0.05], coat, [side * 0.12, 0, 0.1]));

  // The scarf: a collar round the neck, one end down his front, the other thrown back over his left shoulder.
  const scarf = batch();
  scarf.block([0.3, 0.07, 0.26], "bloodLight", [0, 0.44, 0]);
  const tail = (x: number, z: number, length: number) => {
    const stripes = [0.04, 0.03, 0.03];
    let y = 0.44 - length;
    stripes.forEach((height, i) => {
      scarf.block([0.09, height, 0.03], i % 2 ? "bloodLight" : "bone", [x, y, z]);
      y += height;
    });
    scarf.block([0.09, 0.44 - y, 0.03], "bloodLight", [x, y, z]);
  };
  tail(-0.09, 0.145, 0.38);
  tail(0.1, -0.13, 0.3);
  result.add(scarf.mesh());
  return result;
}

/** An open book, pages up, spread along x. Its origin is the middle of its spine. */
function book(): THREE.Group {
  const result = group(box([0.32, 0.02, 0.22], flat("bloodDark"), [0, 0, 0]));
  for (const side of [-1, 1]) {
    const leaf = box([0.15, 0.03, 0.2], flat("boneLight"), [side * 0.075, 0, 0]);
    leaf.position.y = 0.012;
    leaf.rotation.z = side * 0.1;
    result.add(leaf);
  }
  return result;
}

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  at: THREE.Vector3;
}

/** An upper arm hanging from the shoulder pivot and a forearm from the elbow pivot, ending in a hand. */
function arm(side: -1 | 1, coat: THREE.Material): Arm {
  const elbow = group(
    box([0.085, FOREARM, 0.09], coat, [0, -FOREARM, 0]),
    box([0.07, HAND, 0.06], flat("bone"), [0, -FOREARM - HAND + 0.01, 0]),
  );
  elbow.position.y = -UPPER_ARM;
  const shoulder = group(box([0.09, UPPER_ARM + 0.02, 0.1], coat, [0, -UPPER_ARM - 0.01, 0]), elbow);
  const at = new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** Blends a limb between two poses: 0 is `from`, 1 is `to`. */
function pose(limb: Arm, from: Reach, to: Reach, amount: number) {
  limb.shoulder.quaternion.slerpQuaternions(from.shoulder, to.shoulder, amount);
  limb.elbow.quaternion.slerpQuaternions(from.elbow, to.elbow, amount);
}

/** Swings a piece built in place about a hip at `at`, turning it `angle`
 *  forward. At rest its transform is exactly the identity, so a figure that
 *  never walks is drawn exactly as it was built. */
function swing(piece: THREE.Group, at: THREE.Vector3, angle: number) {
  piece.rotation.x = angle;
  piece.position.copy(at).sub(at.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle));
}

/** Professor Longfellow as a miniature on a round base, about 1.6 m tall,
 *  reading his book; he breathes, shifts his weight, glances up, and now and
 *  then pushes his spectacles back up his nose. When `gait` walks him, his
 *  legs and free arm swing and he leans into the walk, his book still open. */
export function longfellow(seed = "longfellow", gait: Gait = STANDING): THREE.Group {
  const coat = flat("verdigris");

  const neck = group(head());
  neck.position.y = NECK - WAIST;

  const holding = book();
  holding.position.set(0.02, 0.33, 0.25);
  holding.rotation.set(-0.45, -0.1, 0);
  const bookEdge = new THREE.Vector3(0.11, -0.01, -0.07).applyEuler(holding.rotation).add(holding.position);

  const left = arm(1, coat);
  const right = arm(-1, coat);
  const holds = reach(left.at, bookEdge, UPPER_ARM, LOWER_ARM, new THREE.Vector3(1, -0.6, -0.4));
  const hangs = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.02, -0.52, 0.07)), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-0.3, 0, -1));
  const spectacles = reach(right.at, new THREE.Vector3(0, NECK - WAIST + 0.28, 0.17), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -0.8, 0));
  left.shoulder.quaternion.copy(holds.shoulder);
  left.elbow.quaternion.copy(holds.elbow);

  const trunk = torso(coat);
  const chest = group(trunk, neck, left.shoulder, right.shoulder, holding);

  const skirt = lathe(
    [
      [0.205, -0.32],
      [0.19, -0.2],
      [0.17, 0],
      [0.165, 0.07],
      [0, 0.07],
    ],
    coat,
    8,
  );
  skirt.scale.z = 0.72;
  const hips = group(skirt, chest);
  hips.position.y = WAIST - BASE_TOP;

  const trousers = flat("ash");
  const shoe = flat("woodDark");
  // The trouser legs swing in the body from the hip; the shoes stand outside it, so its sway leaves them planted.
  const [rightLeg, leftLeg] = [-0.065, 0.065].map((x) => group(box([0.11, HIP + 0.02, 0.13], trousers, [x, 0, 0])));
  const [rightShoe, leftShoe] = [-0.065, 0.065].map((x) => group(box([0.12, 0.06, 0.2], shoe, [x, BASE_TOP, 0.03])));
  const hipInBody = new THREE.Vector3(0, HIP, 0);
  const hipInFigure = new THREE.Vector3(0, WAIST, 0);
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;

  const figure = group(figureBase(), body, rightShoe, leftShoe);

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4.2) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 9.5) * Math.PI * 2 + swayPhase);
    const gesture = burst(seconds, `${seed}:spectacles`, { every: 9, lasts: 2, chance: 0.7 });
    const glance = burst(seconds, `${seed}:glance`, { every: 6, lasts: 2.6, chance: 0.6 });

    body.rotation.z = sway * 0.02;
    hips.rotation.z = sway * -0.008;
    chest.rotation.z = sway * -0.012;
    chest.rotation.x = breath * -0.012;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.012);
    left.shoulder.position.y = left.at.y + breath * 0.004;
    right.shoulder.position.y = right.at.y + breath * 0.004;

    const look = glance.amount * (1 - gesture.amount);
    neck.rotation.y = look * (glance.pick < 0.5 ? -1 : 1) * (0.25 + glance.pick * 0.3);
    neck.rotation.x = 0.28 - gesture.amount * 0.33 - look * 0.2;
    neck.rotation.z = sway * 0.01;

    pose(right, hangs, spectacles, gesture.amount);

    const stride = gait(clock);
    if (stride.amount > 0) {
      const step = Math.sin(stride.phase) * stride.amount;
      swing(rightLeg, hipInBody, step * LEG_SWING);
      swing(leftLeg, hipInBody, -step * LEG_SWING);
      swing(rightShoe, hipInFigure, step * LEG_SWING);
      swing(leftShoe, hipInFigure, -step * LEG_SWING);
      right.shoulder.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -step * ARM_SWING));
      chest.rotation.x += 0.08 * stride.amount;
    } else {
      for (const piece of [rightLeg, leftLeg, rightShoe, leftShoe]) {
        piece.rotation.x = 0;
        piece.position.set(0, 0, 0);
      }
    }
  });
}
