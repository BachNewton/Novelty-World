import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import { ball, chain, ellipsoid, figureMaterial, form, loft, mergeAll, painted, plinth, ring, rod, roundBox, sculpt, stretched, surfaceAt, type Section, type Vec3 } from "../forms";
import type { PaletteKey } from "../palette";
import { group } from "../shapes";
import { ADULT_WALK, arm, BASE_TOP, burst, pose, reach, STANDING, stride, walks, type Gait, type StrideRig } from "./figure";

/*
 * Professor Longfellow: a slight, elderly scholar, all Knowledge and no Might.
 * Read at a glance: a long green coat open over a mustard waistcoat, a
 * wine-red scarf (Gaelic music, fine wines), wild white tufts round a bald
 * crown, brass spectacles, and an open book held up to read. He faces +z;
 * his right hand is on −x.
 *
 * Every size is in metres, every height from the floor; each pivot sits at its joint.
 */

const WAIST = 0.7;
const HIP = WAIST - BASE_TOP;
const ARM_SWING = 0.3;
const NECK = 1.18;
const SHOULDER: [number, number] = [0.22, 1.12];
const UPPER_ARM = 0.28;
const FOREARM = 0.24;
const HAND = 0.08;
const LOWER_ARM = FOREARM + HAND / 2;
const LEG_X = 0.065;

/** The head on its neck, in the neck's frame: a bald dome over a long face,
 *  white brows, moustache and short beard, brass spectacles, and wild white
 *  tufts above the ears. */
function head(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, -0.03, -0.01], [0, 0.12, 0], 0.05, 0.047), "skin")
    .add(ellipsoid([0, 0.235, -0.005], [0.118, 0.15, 0.13]), "skin", 0.04)
    .add(ellipsoid([0, 0.15, 0.025], [0.095, 0.1, 0.105]), "skin", 0.05)
    .add(ellipsoid([0, 0.218, 0.1], [0.085, 0.022, 0.032]), "skin", 0.02)
    .add(rod([0, 0.205, 0.118], [0, 0.152, 0.15], 0.014, 0.021), "skin", 0.012);
  for (const side of [-1, 1]) {
    const x = side * 0.043;
    shape.add(ellipsoid([side * 0.117, 0.18, 0], [0.018, 0.042, 0.028]), "skin", 0.01);
    // Eyes sunk under the brow.
    shape.carve(ball([x, 0.188, 0.128], 0.02), { blend: 0.01 });
    shape.add(ball([x, 0.188, 0.11], 0.019), "boneLight");
    shape.paint(ball([x, 0.19, 0.128], 0.011), "void");
    // Bushy white brows, the moustache, and sideburns down to the beard.
    shape.add(rod([side * 0.02, 0.226, 0.128], [side * 0.072, 0.236, 0.112], 0.012, 0.009), "stoneLight", 0.006);
    shape.add(rod([side * 0.008, 0.138, 0.153], [side * 0.048, 0.124, 0.13], 0.013, 0.008), "stoneLight", 0.006);
    shape.add(rod([side * 0.112, 0.21, 0.01], [side * 0.08, 0.1, 0.06], 0.018, 0.022), "stoneLight", 0.012);
    // Wild white tufts above the ears: soft masses, with wisps escaping out and back.
    for (const [hx, hy, hz, rx, ry, rz] of [
      [0.118, 0.225, -0.02, 0.042, 0.036, 0.046],
      [0.135, 0.19, -0.06, 0.042, 0.04, 0.048],
      [0.115, 0.215, -0.09, 0.044, 0.04, 0.046],
      [0.09, 0.17, -0.115, 0.046, 0.045, 0.042],
      [0.152, 0.212, -0.045, 0.032, 0.03, 0.036],
    ]) {
      shape.add(ellipsoid([side * hx, hy, hz], [rx, ry, rz]), "stoneLight", 0.025);
    }
    for (const [from, to] of [
      [[0.16, 0.205, -0.04], [0.192, 0.19, -0.065]],
      [[0.14, 0.175, -0.1], [0.165, 0.155, -0.135]],
    ] as const) {
      shape.add(rod([side * from[0], from[1], from[2]], [side * to[0], to[1], to[2]], 0.022, 0.011), "stoneLight", 0.015);
    }
  }
  shape
    .add(ellipsoid([0, 0.098, 0.07], [0.078, 0.062, 0.066]), "stoneLight", 0.02)
    .paint(ellipsoid([0, 0.118, 0.128], [0.022, 0.008, 0.03]), "ash");
  return mergeAll([shape.geometry(0.0085), spectaclesFrame()]);
}

/** Thin wire, too fine for the head's grid: a tube through `points`. */
function wire(points: Vec3[], radius: number): THREE.BufferGeometry {
  return loft(points.map((at) => ({ at, radius, colour: "brass" as const })), { sides: 6 });
}

/** Round brass rims before the eyes, the bridge, and the arms back to the ears. */
function spectaclesFrame(): THREE.BufferGeometry {
  const parts = [-1, 1].flatMap((side) => {
    const rim = painted(new THREE.TorusGeometry(0.029, 0.005, 6, 24), "brass");
    rim.translate(side * 0.043, 0.19, 0.134);
    return [rim, wire([[side * 0.071, 0.194, 0.128], [side * 0.112, 0.199, 0.06], [side * 0.117, 0.2, 0.025]], 0.0045)];
  });
  return mergeAll([...parts, wire([[-0.015, 0.193, 0.141], [0, 0.198, 0.143], [0.015, 0.193, 0.141]], 0.004)]);
}

/** The coat from the waist up, open over the waistcoat, with lapels, buttons and the scarf. */
function torso(): THREE.BufferGeometry {
  const shape = sculpt()
    .add(ellipsoid([0, 0.27, 0], [0.165, 0.2, 0.11]), "verdigris")
    .add(ellipsoid([0, 0.09, 0.005], [0.138, 0.15, 0.097]), "verdigris", 0.08);
  for (const side of [-1, 1]) shape.add(rod([side * 0.05, 0.43, -0.01], [side * 0.2, 0.395, -0.005], 0.05, 0.062), "verdigris", 0.06);
  const opening = (y: number) => 0.03 + (0.43 - y) * 0.2;
  shape.paint((x, y, z) => (z > 0.03 && y < 0.43 && Math.abs(x) < opening(y) ? -1 : 1), "brass");
  // The lapels: the coat's edges stand proud either side of the opening.
  for (const side of [-1, 1]) {
    const points = [0.02, 0.2, 0.38].map((y): Vec3 => {
      const x = side * (opening(y) + 0.008);
      return [x, y, surfaceAt(shape.distance, x, y) - 0.004];
    });
    shape.add(chain(points, [0.013, 0.016, 0.022]), "verdigris", 0.01);
  }
  for (const y of [0.1, 0.18, 0.26]) shape.add(ball([0, y, surfaceAt(shape.distance, 0, y) + 0.002], 0.011), "woodDark");

  // The scarf: wound round the neck, one end down his right front, the other
  // thrown back over his left shoulder. Its ends are ribbons lofted down the
  // coat, so their stripes are crisp.
  const onCoat = (x: number, y: number, facing: 1 | -1): Vec3 => [x, y, surfaceAt(shape.distance, x, y, facing) + facing * 0.011];
  const band = (at: Vec3, colour: PaletteKey): Section => ({ at, radius: [0.042, 0.009], colour });
  const striped = (x: number, facing: 1 | -1, heights: number[]) =>
    heights.map((y, i) => band(onCoat(x, y, facing), i % 2 === 1 && i < heights.length - 2 ? "bone" : "bloodLight"));
  const frontEnd = loft([band([-0.07, 0.47, 0.06], "bloodLight"), ...striped(-0.08, 1, [0.4, 0.3, 0.195, 0.17, 0.15, 0.12, 0.1])]);
  const backEnd = loft([band([0.075, 0.47, 0.03], "bloodLight"), band([0.1, 0.45, -0.07], "bloodLight"), ...striped(0.095, -1, [0.4, 0.33, 0.3, 0.28, 0.26, 0.24, 0.22])]);
  shape.add(ring([0, 0.445, 0.005], 0.075, 0.034, [0.18, 0, 0]), "bloodLight", 0.008);
  return mergeAll([shape.geometry(0.012), frontEnd, backEnd]);
}

/** The coat's skirts from the waist to the knee, split up the front and back, with pocket flaps. */
function skirt(): THREE.BufferGeometry {
  return sculpt()
    .add(stretched(rod([0, 0.07, 0], [0, -0.3, 0], 0.155, 0.205), [0, 0, 0], [1, 1, 0.72]), "verdigris")
    .carve(roundBox([0, 0.4, 0], [0.5, 0.3, 0.5], 0))
    .carve(roundBox([0, -0.62, 0], [0.5, 0.29, 0.5], 0), { blend: 0.012 })
    .carve(roundBox([0, -0.27, 0.16], [0.01, 0.12, 0.06], 0.008), { blend: 0.01, colour: "verdigrisDark" })
    .carve(roundBox([0, -0.27, -0.16], [0.01, 0.12, 0.06], 0.008), { blend: 0.01, colour: "verdigrisDark" })
    .add(roundBox([0.16, -0.06, 0.07], [0.05, 0.01, 0.03], 0.008, [0, 0.75, 0.15]), "verdigrisDark", 0.004)
    .add(roundBox([-0.16, -0.06, 0.07], [0.05, 0.01, 0.03], 0.008, [0, -0.75, -0.15]), "verdigrisDark", 0.004)
    .geometry(0.014);
}

/** An open book, pages up, spread along x, its origin the middle of its spine:
 *  hard-edged, so rounded boxes rather than a sculpture, with lines of text. */
function book(): THREE.BufferGeometry {
  const cover = painted(new RoundedBoxGeometry(0.33, 0.014, 0.224, 2, 0.005), "bloodDark");
  cover.translate(0, 0.007, 0);
  const spine = painted(new THREE.CylinderGeometry(0.011, 0.011, 0.222, 10), "bloodDark");
  spine.rotateX(Math.PI / 2);
  spine.translate(0, 0.004, 0);
  const parts = [cover, spine];
  for (const side of [-1, 1]) {
    // Each leaf turned about the spine, its outer edge lifted, as the original's.
    const leaf = [painted(new RoundedBoxGeometry(0.144, 0.03, 0.202, 3, 0.01), "boneLight")];
    leaf[0].translate(side * 0.077, 0.015, 0);
    for (let row = 0; row < 9; row++) {
      const short = row === 8;
      const line = painted(new THREE.BoxGeometry(short ? 0.06 : 0.1, 0.002, 0.005), "boneDark");
      line.translate(side * (short ? 0.06 : 0.08), 0.0302, -0.07 + row * 0.0175);
      leaf.push(line);
    }
    for (const piece of leaf) {
      piece.rotateZ(side * 0.1);
      piece.translate(0, 0.012, 0);
    }
    parts.push(...leaf);
  }
  return mergeAll(parts);
}

/** The forearm from the elbow, with its turned-back cuff and a hand: palm, thumb and four fingers. */
function forearm(side: -1 | 1): THREE.BufferGeometry {
  const shape = sculpt()
    .add(rod([0, 0.015, 0], [0, -0.2, 0], 0.046, 0.04), "verdigris")
    .add(ring([0, -0.198, 0], 0.036, 0.016), "verdigrisDark", 0.004)
    .add(rod([0, -0.21, 0], [0, -0.245, 0.003], 0.022, 0.021), "skin")
    .add(ellipsoid([0, -0.265, 0.004], [0.022, 0.044, 0.036]), "skin", 0.012)
    .add(rod([-side * 0.014, -0.24, 0.026], [-side * 0.024, -0.282, 0.045], 0.012, 0.01), "skin", 0.008);
  for (const z of [-0.021, -0.006, 0.009, 0.024]) shape.add(rod([0, -0.288, z], [side * 0.004, -0.318, z * 1.1], 0.011, 0.009), "skin", 0.006);
  return shape.geometry(0.009);
}

function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(ball([0, -0.005, 0], 0.058), "verdigris")
    .add(rod([0, -0.01, 0], [0, -UPPER_ARM, 0], 0.054, 0.045), "verdigris", 0.03)
    .geometry(0.014);
}

/** A trouser leg from the hip to the ankle, in the body's frame. */
function leg(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(chain([[x, HIP + 0.02, 0], [x, 0.33, 0.012], [x, 0.05, -0.004]], [0.058, 0.047, 0.038]), "ash")
    .add(stretched(ring([x, 0.175, -0.004], 0.042, 0.01), [x, 0.175, -0.004], [1, 1, 1.05]), "ash", 0.02)
    .geometry(0.014);
}

/** A shoe standing on the base: a rounded toe and heel, a dark sole. */
function shoe(x: number): THREE.BufferGeometry {
  return sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.03, 0.085], [0.05, 0.035, 0.075]), "woodDark")
    .add(ellipsoid([x, BASE_TOP + 0.035, -0.03], [0.046, 0.04, 0.055]), "woodDark", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.015], [x, BASE_TOP + 0.065, -0.01], 0.034), "woodDark", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.011 ? -1 : 1), "soot")
    .geometry(0.01);
}

/** Every part's geometry, meshed once on first use: none of it depends on the
 *  seed, so every Longfellow shares it and only the first pays for the meshing. */
function meshParts() {
  return {
    head: head(),
    torso: torso(),
    skirt: skirt(),
    book: book(),
    upperArm: upperArm(),
    /** The right forearm, then the left. */
    forearms: [forearm(-1), forearm(1)],
    legs: [leg(-LEG_X), leg(LEG_X)],
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

/** Professor Longfellow as a miniature on a round base, 5'11" at the house's
 *  scale. He breathes and shifts his weight as he reads; now and then he
 *  pushes his spectacles up his nose, and now and then he glances up from the
 *  page. He walks with an ordinary adult's step, the book held up before him. */
export function longfellow(seed = "longfellow", gait: Gait = STANDING): THREE.Group {
  meshed ??= meshParts();
  const parts = meshed;
  const material = figureMaterial();
  const mesh = (geometry: THREE.BufferGeometry) => form(material, geometry);

  const neck = group(mesh(parts.head));
  neck.position.y = NECK - WAIST;

  const holding = group(mesh(parts.book));
  holding.position.set(0.02, 0.33, 0.25);
  holding.rotation.set(-0.45, -0.1, 0);
  const bookEdge = new THREE.Vector3(0.11, -0.01, -0.07).applyEuler(holding.rotation).add(holding.position);

  const limb = (side: -1 | 1) =>
    arm(mesh(parts.upperArm), mesh(parts.forearms[side < 0 ? 0 : 1]), new THREE.Vector3(side * SHOULDER[0], SHOULDER[1] - WAIST, 0), UPPER_ARM);
  const left = limb(1);
  const right = limb(-1);
  const holds = reach(left.at, bookEdge, UPPER_ARM, LOWER_ARM, new THREE.Vector3(1, -0.6, -0.4));
  const hangs = reach(right.at, right.at.clone().add(new THREE.Vector3(-0.02, -0.52, 0.07)), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-0.3, 0, -1));
  const spectacles = reach(right.at, new THREE.Vector3(0, NECK - WAIST + 0.28, 0.17), UPPER_ARM, LOWER_ARM, new THREE.Vector3(-1, -0.8, 0));
  left.shoulder.quaternion.copy(holds.shoulder);
  left.elbow.quaternion.copy(holds.elbow);

  const trunk = mesh(parts.torso);
  const chest = group(trunk, neck, left.shoulder, right.shoulder, holding);
  const hips = group(mesh(parts.skirt), chest);
  hips.position.y = WAIST - BASE_TOP;

  const [rightLeg, leftLeg] = parts.legs.map((geometry) => group(mesh(geometry)));
  const [rightShoe, leftShoe] = parts.shoes.map((geometry) => group(mesh(geometry)));
  const hipInBody = new THREE.Vector3(0, HIP, 0);
  const hipInFigure = new THREE.Vector3(0, WAIST, 0);
  const body = group(rightLeg, leftLeg, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base), body, rightShoe, leftShoe), ADULT_WALK);
  // His left hand holds the book, so only his right arm swings.
  const rig: StrideRig = {
    walking: ADULT_WALK,
    legs: [rightLeg, leftLeg],
    shoes: [rightShoe, leftShoe],
    hipInBody,
    hipInFigure,
    leg: HIP,
    arms: [{ limb: right, side: -1, swing: ARM_SWING }],
    chest,
    lean: 0.08,
  };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4.2) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 9.5) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    // Running, he needs his free arm: the spectacles wait.
    const gesture = burst(seconds, `${seed}:spectacles`, { every: 9, lasts: 2, chance: 0.7 }).amount * (moving.running ? 1 - moving.amount : 1);
    const glance = burst(seconds, `${seed}:glance`, { every: 6, lasts: 2.6, chance: 0.6 });

    body.rotation.z = sway * 0.02;
    hips.rotation.z = sway * -0.008;
    chest.rotation.z = sway * -0.012;
    chest.rotation.x = breath * -0.012;
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.012);
    left.shoulder.position.y = left.at.y + breath * 0.004;
    right.shoulder.position.y = right.at.y + breath * 0.004;

    const look = glance.amount * (1 - gesture);
    neck.rotation.y = look * (glance.pick < 0.5 ? -1 : 1) * (0.25 + glance.pick * 0.3);
    neck.rotation.x = 0.28 - gesture * 0.33 - look * 0.2;
    neck.rotation.z = sway * 0.01;

    pose(right, hangs, spectacles, gesture);

    stride(rig, moving);
  });
}
