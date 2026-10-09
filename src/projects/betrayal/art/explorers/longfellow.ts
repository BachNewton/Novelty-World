import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createRng } from "@/shared/lib/seeded-random";
import { animated } from "../animate";
import {
  ball,
  chain,
  ellipsoid,
  figureMaterial,
  form,
  loft,
  mergeAll,
  painted,
  plinth,
  ring,
  rod,
  roundBox,
  sculpt,
  shaped,
  stretched,
  surfaceAt,
  union,
  type Section,
  type Solid,
  type Vec3,
} from "../forms";
import type { PaletteKey } from "../palette";
import { group } from "../shapes";
import { ADULT_WALK, BASE_TOP, burst, joins, leg, legJoints, legPoints, pushAside, soleEnds, STANDING, stride, walks, type Gait, type StrideRig } from "./figure";
import { aimGrip, blendPose, buildArm, fist, gripAt, handParts, hasHands, holding, holdIn, OPEN, pointHand, poseArm, poseHand, reachWrist, RELAXED, type Prop } from "./hands";

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
const ARM_SWING = 0.32;
const NECK = 1.18;
const SHOULDER: [number, number] = [0.22, 1.12];
const UPPER_ARM = 0.28;
/** From the elbow to the wrist. */
const FOREARM = 0.22;
const LEG_X = 0.065;
/** The ankle, in the shoe, and the leg's two bones from the hip down to it. */
const ANKLE = BASE_TOP + 0.062;
const THIGH = 0.28;
const SHIN = 0.28;
/** How far the coat's tails follow the thighs as they swing. */
const TAIL_FOLLOW = 0.8;

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
    shaped(rim, ring([side * 0.043, 0.19, 0.134], 0.029, 0.005, [Math.PI / 2, 0, 0]));
    return [rim, wire([[side * 0.071, 0.194, 0.128], [side * 0.112, 0.199, 0.06], [side * 0.117, 0.2, 0.025]], 0.0045)];
  });
  return mergeAll([...parts, wire([[-0.015, 0.193, 0.141], [0, 0.198, 0.143], [0.015, 0.193, 0.141]], 0.004)]);
}

/** The scarf's ends: half their width and thickness, how clear of the coat
 *  they lie, and where each comes out of the knot under his chin, in the chest's frame. */
export const SCARF = {
  width: 0.038,
  thick: 0.009,
  gap: 0.004,
  knots: [
    [-0.07, 0.47, 0.06],
    [0.075, 0.47, 0.03],
  ] as const satisfies readonly Vec3[],
};

/** A ribbon section's middle, near `at`, lifted out along the coat's slope
 *  until the ribbon's whole width, across x, lies clear of the coat. */
function lying(coat: (x: number, y: number, z: number) => number, at: Vec3): Vec3 {
  const point = new THREE.Vector3(...at);
  const clearance = SCARF.thick + SCARF.gap;
  const clearest = () => Math.min(...[-1, -0.5, 0, 0.5, 1].map((k) => coat(point.x + k * SCARF.width, point.y, point.z)));
  const e = 0.001;
  for (let i = 0; i < 80 && clearest() < clearance; i++) {
    const slope = new THREE.Vector3(
      coat(point.x + e, point.y, point.z) - coat(point.x - e, point.y, point.z),
      coat(point.x, point.y + e, point.z) - coat(point.x, point.y - e, point.z),
      coat(point.x, point.y, point.z + e) - coat(point.x, point.y, point.z - e),
    ).normalize();
    point.addScaledVector(slope, 0.001);
  }
  return [point.x, point.y, point.z];
}

/** The coat from the waist up, open over the waistcoat, with lapels, buttons
 *  and the scarf wound round the collar; and the scarf's two ends, a part of
 *  their own lying on the coat, so the clipping check sees them against it. */
function torso(): { coat: THREE.BufferGeometry; scarf: THREE.BufferGeometry } {
  const shape = sculpt()
    .add(ellipsoid([0, 0.27, 0], [0.165, 0.2, 0.11]), "verdigris")
    .add(ellipsoid([0, 0.09, 0.005], [0.138, 0.15, 0.097]), "verdigris", 0.08);
  // The shoulders reach out over the tops of the sleeves, so a sleeve's round top sits inside one and never shows as a ball.
  for (const side of [-1, 1]) shape.add(rod([side * 0.05, 0.43, -0.01], [side * 0.218, 0.4, -0.004], 0.05, 0.064), "verdigris", 0.06);
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
  // coat, so their stripes are crisp, each section lifted off the coat until
  // the ribbon's whole width clears it: a flat ribbon laid on a curved coat
  // by its middle alone sinks into it at the edges.
  const band = (at: Vec3, colour: PaletteKey): Section => ({ at: lying(shape.distance, at), radius: [SCARF.width, SCARF.thick], colour });
  const onCoat = (x: number, y: number, facing: 1 | -1): Vec3 => [x, y, surfaceAt(shape.distance, x, y, facing)];
  const striped = (x: number, facing: 1 | -1, heights: number[]) =>
    heights.map((y, i) => band(onCoat(x, y, facing), i % 2 === 1 && i < heights.length - 2 ? "bone" : "bloodLight"));
  // Each end starts tucked into the knot under the chin.
  const knot = (at: Vec3): Section => ({ at, radius: [SCARF.width, SCARF.thick], colour: "bloodLight" });
  const frontEnd = loft([knot(SCARF.knots[0]), ...striped(-0.08, 1, [0.4, 0.3, 0.195, 0.17, 0.15, 0.12, 0.1])]);
  const backEnd = loft([knot(SCARF.knots[1]), band([0.1, 0.45, -0.07], "bloodLight"), ...striped(0.095, -1, [0.4, 0.33, 0.3, 0.28, 0.26, 0.24, 0.22])]);
  shape.add(ring([0, 0.445, 0.005], 0.075, 0.034, [0.18, 0, 0]), "bloodLight", 0.008);
  return { coat: shape.geometry(0.012), scarf: mergeAll([frontEnd, backEnd]) };
}

/** One of the coat's tails, from the waist to the knee, in the hips' frame: a
 *  hollow half-cone round its own leg, split from its fellow up the back.
 *  The coat hangs open, so its front edge falls away from the waist towards
 *  the hem. Hollow and open, it lets the leg swing forward through the
 *  front, and the calf push it back from behind. */
function tailShell(side: -1 | 1) {
  const [top, hem, thick] = [0.06, -0.33, 0.016];
  const centre = side * 0.05;
  const down = (y: number) => THREE.MathUtils.clamp((top - y) / (top - hem), 0, 1);
  const cone = (x: number, y: number, z: number, inset: number) => {
    const t = down(y);
    const rx = 0.105 + 0.05 * t - inset;
    const rz = 0.11 + 0.042 * t - inset;
    return (Math.hypot((x - centre) / rx, z / rz) - 1) * Math.min(rx, rz);
  };
  const bounds: Pick<Solid, "min" | "max"> = { min: [side < 0 ? -0.22 : 0, hem - 0.01, -0.17], max: [side < 0 ? 0 : 0.22, top + 0.01, 0.17] };
  const outside: Solid = { distance: (x, y, z) => Math.max(cone(x, y, z, 0), y - top, hem - y, 0.003 - side * x), ...bounds };
  const hollow: Solid = { distance: (x, y, z) => cone(x, y, z, thick), ...bounds };
  /** The open front: in front of the hips and nearer the middle than the front edge. */
  const front: Solid = { distance: (x, y, z) => Math.max(0.01 - z, side * x - (0.13 + 0.03 * down(y))), ...bounds };
  /** How far a leg's point, of a radius, is clear in front of the tail's
   *  inside back: a point beside the tail, above its top or below its hem
   *  doesn't press on it. */
  const margin = ({ x, y, z }: THREE.Vector3, radius: number) => {
    const t = down(y);
    const across = (x - centre) / (0.105 + 0.05 * t - thick);
    const back = -(0.11 + 0.042 * t - thick) * Math.sqrt(Math.max(0, 1 - across * across));
    const pressing =
      (1 - THREE.MathUtils.smoothstep(Math.abs(across), 1, 1.3)) *
      THREE.MathUtils.smoothstep(y + radius, hem - 0.04, hem) *
      (1 - THREE.MathUtils.smoothstep(y - radius, top - 0.03, top));
    return z - radius - back + (1 - pressing) * 0.5;
  };
  return { outside, hollow, front, margin };
}

/** A coat tail's mesh: the shell lined dark, with a pocket flap on its side. */
function tail(side: -1 | 1): THREE.BufferGeometry {
  const { outside, hollow, front } = tailShell(side);
  return sculpt()
    .add(outside, "verdigris")
    .add(roundBox([side * 0.16, -0.06, 0.075], [0.05, 0.01, 0.03], 0.008, [0, side * 0.75, side * 0.15]), "verdigrisDark", 0.004)
    .carve(hollow, { colour: "verdigrisDark" })
    .carve(front)
    .geometry(0.008);
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
  const leaves = [-1, 1].map((side) => {
    const middle = new THREE.Vector3(side * 0.077, 0.015, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), side * 0.1).add(new THREE.Vector3(0, 0.012, 0));
    return roundBox([middle.x, middle.y, middle.z], [0.072, 0.015, 0.101], 0.01, [0, 0, side * 0.1]);
  });
  return shaped(mergeAll(parts), union(roundBox([0, 0.007, 0], [0.165, 0.007, 0.112], 0.005), ...leaves));
}

/** Where the book is held, in its own frame: by the left page's outer edge,
 *  a little nearer him than its middle, the hand under the cover with its
 *  palm up and its fingers curled round the edge. The edge runs along the
 *  grip's axis, away from him. */
const BOOK_GRIP = new THREE.Matrix4()
  .makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0))
  .setPosition(0.152, 0.016, -0.03);

/** His book as a prop, held at its edge. */
function heldBook(geometry: THREE.BufferGeometry, mesh: (geometry: THREE.BufferGeometry, name: string) => THREE.Mesh): Prop {
  const pages = mesh(geometry, "book");
  BOOK_GRIP.clone().invert().decompose(pages.position, pages.quaternion, pages.scale);
  return { object: group(pages), handle: 0.012, carry: "hang" };
}

/** The forearm from the elbow to the wrist: a sleeve with a turned-back cuff,
 *  and the wrist inside it. Its rounded top at the elbow is no wider than the
 *  sleeve, and covers the upper arm's narrower end however far the elbow bends. */
function forearm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0], [0, -FOREARM + 0.03, 0], 0.046, 0.041), "verdigris")
    .add(ring([0, -FOREARM + 0.028, 0], 0.036, 0.016), "verdigrisDark", 0.004)
    .add(rod([0, -FOREARM + 0.05, 0], [0, -FOREARM + 0.016, 0.002], 0.021, 0.019), "skin")
    .geometry(0.008);
}

/** The upper arm from the shoulder to the elbow: a coat sleeve, round at the
 *  shoulder, tapering to the elbow, where it ends inside the forearm's top. */
function upperArm(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, -0.005, 0], [0, -UPPER_ARM, 0], 0.05, 0.039), "verdigris")
    .geometry(0.012);
}

/** A trouser leg from the hip to the knee, hanging from the hip, tapering to
 *  the knee, where it ends inside the shin's top. */
function thigh(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0.03, 0], [0, -THIGH, 0.004], 0.058, 0.04), "ash")
    .geometry(0.012);
}

/** A trouser leg from the knee to the shoe, with a turn-up, its end inside
 *  the shoe; its rounded top covers the thigh's end at the knee. */
function shin(): THREE.BufferGeometry {
  return sculpt()
    .add(rod([0, 0, 0.004], [0, -SHIN + 0.005, -0.004], 0.047, 0.036), "ash")
    .add(stretched(ring([0, -SHIN + 0.04, -0.003], 0.041, 0.01), [0, -SHIN + 0.04, -0.003], [1, 1, 1.05]), "ash", 0.02)
    .geometry(0.01);
}

/** A shoe standing on the base: a rounded toe and heel, a dark sole. */
function shoe(x: number) {
  const shape = sculpt()
    .add(ellipsoid([x, BASE_TOP + 0.03, 0.085], [0.05, 0.035, 0.075]), "woodDark")
    .add(ellipsoid([x, BASE_TOP + 0.035, -0.03], [0.046, 0.04, 0.055]), "woodDark", 0.04)
    .add(rod([x, BASE_TOP + 0.04, -0.015], [x, BASE_TOP + 0.065, -0.01], 0.034), "woodDark", 0.02)
    .carve(roundBox([x, BASE_TOP - 0.1, 0], [0.2, 0.1, 0.3], 0))
    .paint((_, y) => (y < BASE_TOP + 0.011 ? -1 : 1), "soot");
  return { geometry: shape.geometry(0.01), ...soleEnds(shape.distance, x) };
}

/** Every part's geometry, meshed once on first use: none of it depends on the
 *  seed, so every Longfellow shares it and only the first pays for the meshing. */
function meshParts() {
  return {
    head: head(),
    torso: torso(),
    tails: [tail(-1), tail(1)],
    book: book(),
    upperArm: upperArm(),
    forearm: forearm(),
    /** The right hand, then the left. */
    hands: [handParts(-1), handParts(1)],
    thigh: thigh(),
    shin: shin(),
    shoes: [shoe(-LEG_X), shoe(LEG_X)],
    base: plinth(0.36, 0.34, BASE_TOP, "boneDark"),
  };
}
type Parts = ReturnType<typeof meshParts>;
let meshed: Parts | undefined;

const UP = new THREE.Vector3(0, 1, 0);
/** The middles of a shoe's heel and toe, as built (x set per foot): what a kicked-up foot pushes the coat with. */
const SHOE_POINTS = [new THREE.Vector3(0, BASE_TOP + 0.035, -0.03), new THREE.Vector3(0, BASE_TOP + 0.03, 0.085)];

/** Professor Longfellow as a miniature on a round base, 5'11" at the house's
 *  scale. He breathes and shifts his weight as he reads; now and then he
 *  pushes his spectacles up his nose, and now and then he glances up from the
 *  page. He walks with an ordinary adult's step, the book held up before him.
 *  His left hand holds the book; his right hand is free to hold anything else. */
export function longfellow(seed = "longfellow", gait: Gait = STANDING): THREE.Group {
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
      1,
    );
  const left = limb(1);
  const right = limb(-1);
  holdIn(left.hand, heldBook(parts.book, mesh));

  // The book held up to read, in the chest's frame, and the left hand at its edge.
  const reading = new THREE.Matrix4().compose(new THREE.Vector3(0.02, 0.33, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, -0.1, 0)), new THREE.Vector3(1, 1, 1));
  const holds = gripAt(left, reading.multiply(BOOK_GRIP), new THREE.Vector3(1, -0.6, -0.4));
  const hangs = reachWrist(right, right.at.clone().add(new THREE.Vector3(-0.05, -0.48, 0.06)), new THREE.Vector3(-0.3, 0, -1));
  const carries = reachWrist(right, right.at.clone().add(new THREE.Vector3(0, -0.3, 0.22)), new THREE.Vector3(-0.2, 0, -1));
  // He pushes his spectacles up with his fingertips, the palm towards his face,
  // bringing his hand up past the book's right edge.
  const aside = reachWrist(right, right.at.clone().add(new THREE.Vector3(-0.2, -0.1, 0.2)), new THREE.Vector3(-0.4, -1, -0.4));
  const towards = new THREE.Vector3(0.12, 0.95, -0.28).normalize();
  const bridge = new THREE.Vector3(0.0, NECK - WAIST + 0.2, 0.185);
  const spectacles = pointHand(reachWrist(right, bridge.clone().addScaledVector(towards, -0.115), new THREE.Vector3(-1, -0.4, -0.2)), towards, Math.PI / 2);

  const trunk = mesh(parts.torso.coat, "torso");
  const scarf = mesh(parts.torso.scarf, "scarf");
  // Where each of the scarf's ends comes out of its knot, tucked into the wound collar.
  const knots = SCARF.knots.map((at) => {
    const knot = group();
    knot.position.set(at[0], at[1], at[2]);
    return knot;
  });
  trunk.add(scarf, ...knots);
  const chest = group(trunk, neck, left.shoulder, right.shoulder);
  const tails = parts.tails.map((geometry, i) => group(mesh(geometry, i === 0 ? "right tail" : "left tail")));
  const tailMargins = ([-1, 1] as const).map((side) => tailShell(side).margin);
  const hips = group(...tails, chest);
  hips.position.y = WAIST - BASE_TOP;

  const legs = ([-1, 1] as const).map((side, i) => {
    const { geometry, heel, toe } = parts.shoes[i];
    const name = side < 0 ? "right" : "left";
    const shoe = group(mesh(geometry, `${name} shoe`));
    return leg(mesh(parts.thigh, `${name} thigh`), mesh(parts.shin, `${name} shin`), shoe, new THREE.Vector3(side * LEG_X, HIP, 0), THIGH, SHIN, {
      ankle: new THREE.Vector3(side * LEG_X, ANKLE, -0.012),
      heel,
      toe,
    });
  }) as unknown as StrideRig["legs"];
  const body = group(legs[0].hip, legs[1].hip, hips);
  body.position.y = BASE_TOP;

  const figure = walks(group(mesh(parts.base, "base"), body, legs[0].shoe, legs[1].shoe), ADULT_WALK);
  hasHands(figure, { right: right.hand, left: left.hand });
  joins(figure, [
    { parts: [face, trunk], at: neck, radius: 0.1 },
    ...knots.map((knot) => ({ parts: [scarf, trunk] as const, at: knot, radius: 0.05 })),
    { parts: [left.shoulder.children[0], trunk], at: left.shoulder, radius: 0.1 },
    { parts: [right.shoulder.children[0], trunk], at: right.shoulder, radius: 0.1 },
    { parts: [tails[0], trunk], at: hips, radius: 0.23 },
    { parts: [tails[1], trunk], at: hips, radius: 0.23 },
    ...left.joints,
    ...right.joints,
    ...legs.flatMap((one) => legJoints(one, trunk, 0.13, 0.11, 0.09)),
  ]);

  // His left hand holds the book, so only his right arm swings: freely when
  // empty or hanging something at his side, little when he carries it upright.
  const swinging = { limb: right, side: -1 as const, swing: ARM_SWING };
  const rig: StrideRig = { walking: ADULT_WALK, legs, body, rest: BASE_TOP, arms: [swinging], chest, lean: 0.08 };

  const rng = createRng(seed);
  const breathPhase = rng.next() * Math.PI * 2;
  const swayPhase = rng.next() * Math.PI * 2;
  const offset = rng.next() * 100;

  return animated(figure, (clock) => {
    const seconds = clock + offset;
    const breath = Math.sin((seconds / 4.2) * Math.PI * 2 + breathPhase);
    const sway = Math.sin((seconds / 9.5) * Math.PI * 2 + swayPhase);
    const moving = gait(clock);
    const running = moving.running ? moving.amount : 0;
    const held = right.hand.held;
    // His spectacles wait while his right hand is full, or he runs.
    const gesture = held ? 0 : burst(seconds, `${seed}:spectacles`, { every: 9, lasts: 2, chance: 0.7 }).amount * (1 - running);
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

    poseArm(left, holds, holds, 0);
    const upright = held?.carry === "upright";
    poseArm(right, upright ? carries : hangs, aside, THREE.MathUtils.clamp(gesture * 2, 0, 1));
    if (gesture > 0.5) poseArm(right, aside, spectacles, gesture * 2 - 1);
    poseHand(right.hand, held ? holding(right.hand, RELAXED) : blendPose(blendPose(RELAXED, OPEN, gesture), fist(right.hand), running * 0.7));
    swinging.swing = upright ? ARM_SWING * 0.3 : ARM_SWING;

    stride(rig, moving);
    if (upright) aimGrip(right.hand, figure, UP, 1);

    // Each tail follows its thigh back, streams behind running, and is pushed aside wherever the leg would pass through it.
    hips.updateMatrix();
    const intoHips = hips.matrix.clone().invert();
    for (const one of legs) one.shoe.updateMatrix();
    const intoBody = body.matrix.clone().invert();
    for (const [i, one] of legs.entries()) {
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(one.hip.quaternion);
      // A thigh swinging forward passes out through the open front; one swinging back carries the tail with it.
      const rest = Math.max(0, Math.atan2(-down.z, -down.y)) * TAIL_FOLLOW + running * 0.3;
      const shoe = SHOE_POINTS.map((at) => ({ at: at.clone().setX(one.ankle.x).applyMatrix4(one.shoe.matrix).applyMatrix4(intoBody), radius: 0.05 }));
      const swept = [...legPoints(one, 0.06, 0.05), ...shoe].map(({ at, radius }) => ({ at: at.applyMatrix4(intoHips), radius }));
      tails[i].rotation.x = pushAside(tailMargins[i], tails[i].position, swept, rest);
    }
  });
}
