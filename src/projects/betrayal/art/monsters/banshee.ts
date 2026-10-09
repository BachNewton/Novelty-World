import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { BASE_TOP, burst, pose, reach, STANDING, walks, type Gait, type Limb } from "../explorers/figure";
import { box, cylinder, group, lathe, lightMaterial } from "../shapes";
import { paletteHex } from "../palette";
import { pixelTexture, TEXELS_PER_METRE, type PixelLegend } from "../textures";
import { ghostly, monsterBase, type MonsterOptions } from "./base";

/*
 * The Banshee: a wailing spirit in sickly green, the supernatural's colour.
 * Read at a glance: a glowing woman taller than an explorer, hovering on a
 * twist of mist where a miniature's flying stand would be, her robe tattered
 * into points, her hair streaming, her mouth a black hole. When she wails she
 * throws her head back and flings her arms wide, and rings of light pulse out
 * of her mouth. She faces +z, as the arrow on her base shows (haunt 08 turns
 * her by it). She is all glow and no paint: she lights herself, so she reads
 * in the darkest room without a live light.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const BASE_RADIUS = 0.42;
/** Her waist, where the robe hangs from and the chest turns. */
const WAIST = 1.22;
const HEM = 0.5;
const SHOULDER: [number, number] = [0.17, 0.34];
const NECK = 0.42;
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const HAND = 0.1;
const LOWER_ARM = FOREARM + HAND / 2;
const HEAD_RADIUS = 24 / TEXELS_PER_METRE / (16 * Math.sin(Math.PI / 8));
const HEAD_HEIGHT = 11 / TEXELS_PER_METRE;
const HEAD_LIFT = 0.03;

const FACE_LEGEND: PixelLegend = {
  f: "wraithLight",
  F: "wraith",
  h: "wraith",
  H: "wraithDark",
  e: "void",
  m: "void",
};

/** Round the head from the back: long hair all round, a gaunt face with
 *  hollow eyes and a mouth stretched open in the wail. The face is at the front. */
const SIDE = ["hhh", "hhh", "Hhh", "Hhf", "Hhf", "Hhf", "Hhf", "Hhh", "Hhh", "HHh", "HHh"];
const FRONT = [
  "hhhhhhhh",
  "hhffffhh",
  "hffffffh",
  "fFFffFFf",
  "feeffeef",
  "feeffeef",
  "ffFffFff",
  "fffmmfff",
  "fffmmfff",
  "hffmmffh",
  "hhffffhh",
];
const mirror = (row: string) => [...row].reverse().join("");
const HEAD_STRIP = FRONT.map((front, y) => {
  const back = y === 0 ? "hhhhh" : "HhhhH";
  return back + SIDE[y] + front + mirror(SIDE[y]) + back;
});

function head(): THREE.Group {
  const geometry = new THREE.CylinderGeometry(HEAD_RADIUS, HEAD_RADIUS * 0.85, HEAD_HEIGHT, 8, 1, false, -Math.PI);
  geometry.translate(0, HEAD_LIFT + HEAD_HEIGHT / 2, 0);
  const skull = new THREE.Mesh(geometry, [ghostly("wraithLight", pixelTexture(HEAD_STRIP, FACE_LEGEND)), ghostly("wraith"), ghostly("wraithLight")]);
  const top = HEAD_LIFT + HEAD_HEIGHT;
  return group(
    cylinder(0.045, 0.06, ghostly("wraithLight"), [0, 0, 0], { sides: 6 }),
    skull,
    lathe([[HEAD_RADIUS, top - 0.001], [HEAD_RADIUS * 0.7, top + 0.035], [0, top + 0.05]], ghostly("wraith"), 8),
  );
}

interface Mane {
  root: THREE.Group;
  ends: THREE.Group[];
}

/** Her hair: one long sheet hanging from the back of her crown to between her
 *  shoulders, splitting into ragged ends that stream behind her. A sheet hugging
 *  her back reads as long hair from above; separate locks read as antennae. */
function mane(rng: { next: () => number }): Mane {
  const ends = [-0.09, -0.03, 0.03, 0.09].map((x, i) => {
    const length = 0.24 + rng.next() * 0.16;
    const end = group(box([0.065, length, 0.02], ghostly(i % 2 ? "wraith" : "wraithLight"), [0, 0, 0]));
    end.position.set(x, 0.3, 0);
    end.rotation.z = x * 1.5;
    return end;
  });
  const root = group(box([0.25, 0.32, 0.035], ghostly("wraith"), [0, 0, 0]), ...ends);
  root.position.set(0, HEAD_LIFT + HEAD_HEIGHT - 0.02, -HEAD_RADIUS + 0.01);
  return { root, ends };
}

/** A long sleeve that flares at the wrist, and a bony hand of three long fingers. */
function arm(side: -1 | 1): Limb {
  const sleeve = ghostly("wraith");
  const skin = ghostly("wraithLight");
  const fingers = [-0.02, 0, 0.02].map((x) => box([0.014, HAND * 0.6, 0.02], skin, [x, -HAND * 1.05, 0.005]).geometry);
  const hand = new THREE.Mesh(mergeGeometries([box([0.06, HAND * 0.5, 0.05], skin, [0, -HAND * 0.5, 0]).geometry, ...fingers]), skin);
  hand.position.y = -FOREARM;
  const elbow = group(cylinder(0.09, FOREARM, sleeve, [0, -FOREARM, 0], { top: 0.045, sides: 5 }), hand);
  elbow.position.y = -UPPER_ARM;
  const shoulder = group(box([0.08, UPPER_ARM + 0.02, 0.08], sleeve, [0, -UPPER_ARM - 0.01, 0]), elbow);
  const at = new THREE.Vector3(side * SHOULDER[0], SHOULDER[1], 0);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** A ragged point hanging from the hem, from its top. */
function tatter(material: THREE.Material, length: number): THREE.Mesh {
  return cylinder(0.004, length, material, [0, -length, 0], { top: 0.075, sides: 4 });
}

/** A ring of light that leaves her mouth as she wails, facing +z. */
function wailRing(): THREE.Mesh {
  const material = lightMaterial(0);
  material.color.set(paletteHex("wraithLight"));
  material.toneMapped = false;
  return new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 20), material);
}

/**
 * The Banshee hovering over her base, about 1.95 m to the crown. Her idle:
 * she drifts up and down, sways, her tatters and hair ripple, her hands reach
 * slowly forward, and every few seconds she wails. Stunned, she sinks low,
 * slumps with her head bowed and her arms hanging, and her glow dims to its
 * darkest greens. Moving, she glides: she leans into the way she goes and her
 * tatters and hair stream behind her; she has no legs to stride.
 */
export function banshee(seed = "banshee", gait: Gait = STANDING, { stunned = false }: MonsterOptions = {}): THREE.Group {
  const robe = ghostly(stunned ? "wraithDark" : "wraith");
  const bodice = ghostly(stunned ? "wraith" : "wraithLight");
  const halo = lightMaterial(stunned ? 0.12 : 0.28);
  halo.color.set(paletteHex("wraithLight"));
  halo.toneMapped = false;
  const mist = lightMaterial(stunned ? 0.2 : 0.45);
  mist.color.set(paletteHex("wraith"));
  mist.toneMapped = false;

  // The robe, from the hem up to the waist, and a halo of light round it.
  const robeProfile: [number, number][] = [
    [0.3, HEM - WAIST],
    [0.27, HEM - WAIST + 0.18],
    [0.2, -0.32],
    [0.14, -0.08],
    [0.12, 0.02],
  ];
  // Solid at the waist, fading to a see-through veil towards the hem.
  const veil = lightMaterial(stunned ? 0.35 : 0.7);
  veil.color.set(paletteHex("wraith"));
  veil.toneMapped = false;
  const skirt = group(lathe(robeProfile.slice(2), robe, 9), lathe(robeProfile.slice(0, 3), veil, 9));
  const skirtHalo = lathe(robeProfile.map(([r, y]) => [r + 0.05, y - 0.02]), halo, 9);
  const tatters: THREE.Group[] = [];
  const hem = group(skirt, skirtHalo);
  const rng = createRng(seed);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + rng.next() * 0.4;
    const piece = group(tatter(i % 2 ? veil : mist, 0.26 + rng.next() * 0.2));
    piece.position.set(Math.sin(angle) * 0.27, HEM - WAIST + 0.03, Math.cos(angle) * 0.27);
    piece.rotation.y = angle;
    tatters.push(piece);
    hem.add(piece);
  }

  // The chest, from the waist up: bodice, shoulders, head and arms.
  const torso = lathe(
    [
      [0.12, 0],
      [0.15, 0.16],
      [0.13, 0.28],
      [0.19, SHOULDER[1]],
      [0.17, SHOULDER[1] + 0.04],
      [0.05, NECK],
    ],
    bodice,
    8,
  );
  torso.scale.z = 0.75;
  const neck = group(head());
  neck.position.y = NECK;
  const hair = mane(rng);
  neck.add(hair.root);
  const rings = [wailRing(), wailRing(), wailRing()];
  const mouth = group(...rings);
  mouth.position.set(0, HEAD_LIFT + HEAD_HEIGHT * 0.3, HEAD_RADIUS + 0.02);
  neck.add(mouth);

  const left = arm(1);
  const right = arm(-1);
  const bend = (side: number) => new THREE.Vector3(side, -0.2, -1);
  const toward = (limb: Limb, offset: [number, number, number]) => limb.at.clone().add(new THREE.Vector3(...offset));
  const poses = (limb: Limb, side: number) => ({
    reaching: reach(limb.at, toward(limb, [side * 0.05, -0.18, 0.5]), UPPER_ARM, LOWER_ARM, bend(side)),
    beckoning: reach(limb.at, toward(limb, [side * 0.12, 0.02, 0.48]), UPPER_ARM, LOWER_ARM, bend(side)),
    flung: reach(limb.at, toward(limb, [side * 0.45, 0.4, 0.12]), UPPER_ARM, LOWER_ARM, new THREE.Vector3(side, -1, 0)),
    limp: reach(limb.at, toward(limb, [side * 0.06, -0.55, 0.12]), UPPER_ARM, LOWER_ARM, new THREE.Vector3(0, 0, -1)),
  });
  const leftPoses = poses(left, 1);
  const rightPoses = poses(right, -1);

  const chest = group(torso, neck, left.shoulder, right.shoulder);
  const body = group(hem, chest);
  body.position.y = WAIST;

  // The mist she hovers on, twisting up from the base to her hem: her flying stand.
  const wisp = group();
  const wisps = [0, 1, 2].map((i) => {
    const height = (HEM - BASE_TOP + 0.05) / 3;
    const piece = group(cylinder(0.05 + i * 0.03, height + 0.02, mist, [0, 0, 0], { top: 0.07 + i * 0.035, sides: 6 }));
    piece.position.y = BASE_TOP + i * height;
    wisp.add(piece);
    return piece;
  });

  const figure = group(monsterBase(BASE_RADIUS, { arrow: "wraithLight" }), wisp, body);

  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;
  const sink = stunned ? -0.22 : 0;

  // She glides: no hop, and the step only paces how her tatters stream.
  return walks(animated(figure, (clock) => {
    const seconds = clock + offset;
    const glide = gait(clock).amount;
    const drift = Math.sin((seconds / 3.4) * Math.PI * 2);
    const sway = Math.sin((seconds / 7.3) * Math.PI * 2 + swayPhase);
    const wail = stunned ? 0 : burst(seconds, `${seed}:wail`, { every: 7, lasts: 3, chance: 0.75 }).amount * (1 - glide);
    const beckon = stunned ? 0 : burst(seconds, `${seed}:beckon`, { every: 5, lasts: 2.4, chance: 0.5 }).amount * (1 - wail);

    body.position.y = WAIST + sink + drift * (stunned ? 0.015 : 0.05) + wail * 0.06;
    body.rotation.z = sway * 0.05;
    body.rotation.x = glide * 0.25;
    chest.rotation.x = stunned ? 0.5 : -wail * 0.18 + drift * 0.02;
    neck.rotation.x = stunned ? 0.45 : 0.08 - wail * 0.55;
    neck.rotation.y = stunned ? 0 : sway * 0.25 * (1 - wail);
    neck.rotation.z = sway * 0.04;

    // The mist leans after her as she drifts and sways, its top following her hem.
    wisps.forEach((piece, i) => {
      piece.rotation.z = sway * 0.08 * (i + 1) - body.rotation.z * 0.3;
      piece.rotation.x = Math.sin(seconds * 1.7 + i) * 0.06 - glide * 0.25 * (i + 1);
    });

    // Tatters ripple, and stream back as she glides.
    tatters.forEach((piece, i) => {
      piece.rotation.x = 0.25 + Math.sin(seconds * 2.3 + i * 1.7) * 0.18 + glide * 0.4 * Math.cos(piece.rotation.y) + wail * 0.2;
    });

    // Her hair hangs down her back, its ends rippling; wailing or gliding, it lifts and streams behind.
    hair.root.rotation.x = stunned ? -2.55 : -2.85 + wail * 0.75 + glide * 0.5 + drift * 0.04;
    hair.ends.forEach((end, i) => {
      end.rotation.x = stunned ? 0 : 0.25 + Math.sin(seconds * 2.4 + i * 1.3) * 0.25 + wail * 0.3;
    });

    if (stunned) {
      pose(left, leftPoses.limp, leftPoses.limp, 1);
      pose(right, rightPoses.limp, rightPoses.limp, 1);
    } else {
      const sweep = Math.sin(seconds * 0.9) * 0.5 + 0.5;
      for (const [limb, set] of [
        [left, leftPoses],
        [right, rightPoses],
      ] as const) {
        pose(limb, set.reaching, set.beckoning, Math.max(beckon, sweep * 0.3));
        if (wail > 0) {
          limb.shoulder.quaternion.slerp(set.flung.shoulder, wail);
          limb.elbow.quaternion.slerp(set.flung.elbow, wail);
        }
      }
    }

    // Rings of light leave her mouth while she wails, growing and fading.
    rings.forEach((ring, i) => {
      const travel = (seconds * 0.9 + i / rings.length) % 1;
      ring.visible = wail > 0.01;
      ring.scale.setScalar(0.06 + travel * 0.55);
      ring.position.z = travel * 0.9;
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - travel) * wail * 0.85;
    });
    halo.opacity = stunned ? 0.1 + Math.max(0, Math.sin(seconds * 5.3)) * 0.06 : 0.24 + wail * 0.25;
  }), { step: 0.9, hop: 0 });
}
