import * as THREE from "three";
import { candle } from "../kit";
import { trunk } from "../kit/trunk";
import { crossLanes, INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group } from "../shapes";
import { shiny, SHINES } from "../shine";
import { plaster, woodPlanks } from "../textures";

/** A cot's footprint in its own frame: across x, and from its head (z = 0) to its foot. */
const COT = { width: 0.82, length: 1.9, head: 0.86, foot: 0.64, rail: 0.34, mattress: 0.12 };
const POST = 0.04;
const SIDE_X = COT.width / 2 - POST / 2;
const HEAD_Z = POST / 2;
const FOOT_Z = COT.length - POST / 2;

/**
 * A plain black iron bedstead: four square posts, a barred head and foot,
 * and angle-iron sides. Its head is at z = 0 and its foot towards +z.
 */
function ironFrame(): THREE.Mesh {
  const b = batch();
  const iron = "soot" as const;
  for (const [z, height] of [[HEAD_Z, COT.head], [FOOT_Z, COT.foot]] as const) {
    for (const x of [-SIDE_X, SIDE_X]) {
      b.block([POST, height, POST], iron, [x, 0, z]);
      b.block([POST + 0.02, 0.025, POST + 0.02], iron, [x, height, z]);
    }
    // The bars run between the posts, a little inside their faces.
    const span = SIDE_X * 2 - POST;
    b.block([span, 0.03, POST - 0.012], iron, [0, height - 0.06, z]);
    b.block([span, 0.03, POST - 0.012], iron, [0, height - 0.32, z]);
    for (let k = 1; k < 6; k++) b.block([0.016, 0.24, 0.016], iron, [-SIDE_X + POST / 2 + (k * span) / 6, height - 0.31, z]);
  }
  for (const x of [-SIDE_X, SIDE_X]) b.block([POST - 0.012, 0.06, FOOT_Z - HEAD_Z - POST], iron, [x, COT.rail - 0.06, COT.length / 2]);
  const frame = b.mesh();
  shiny(frame.material, SHINES.iron);
  return frame;
}

/** The cots' surfaces in their own frame: the inside of the frame, and the mattress's top. */
const ACROSS = SIDE_X * 2 - POST - 0.01;
const INSIDE = FOOT_Z - HEAD_Z - POST - 0.01;
const MATTRESS_TOP = COT.rail + COT.mattress;
/** The blanket's top, and the height a uniform is laid out at, clear of the sheet's turn. */
const BLANKET_TOP = MATTRESS_TOP + 0.025;
const LAID = MATTRESS_TOP + 0.034;

/**
 * A maid's uniform laid out flat on a cot as if someone lay in it: the black
 * dress with its sleeves at its sides and white cuffs, the white apron and
 * collar, and the frilled cap on the pillow. Its collar is towards the head (z = 0).
 */
function uniform(b: ReturnType<typeof batch>, shift: number) {
  const y = LAID;
  b.block([0.34, 0.017, 0.42], "soot", [shift, y, 0.68]);
  b.block([0.46, 0.015, 0.78], "soot", [shift, y, 1.24]);
  for (const side of [-1, 1]) {
    b.block([0.09, 0.019, 0.5], "soot", [shift + side * 0.215, y, 0.74]);
    b.block([0.095, 0.022, 0.07], "boneLight", [shift + side * 0.215, y, 1.02]);
  }
  b.block([0.2, 0.024, 0.06], "boneLight", [shift, y, 0.49]);
  b.block([0.18, 0.026, 0.3], "boneLight", [shift, y, 0.72]);
  b.block([0.3, 0.025, 0.66], "boneLight", [shift, y, 1.2]);
  b.block([0.22, 0.03, 0.15], "boneLight", [shift, MATTRESS_TOP + 0.09, 0.24]);
}

/** A servant's cot made up tight: a thin ticking mattress under a grey-buff
 *  blanket, the sheet turned down over it, one flat pillow and its maid's
 *  uniform laid out on top. Head at z = 0. */
function madeCot(shift: number): () => THREE.Group {
  return function madeCot() {
    const b = cotBedding(0.62);
    uniform(b, shift);
    return group(b.mesh(), ironFrame());
  };
}

/** The cot whose uniform is gone: its blanket flung back to the foot and the
 *  sheet left creased, as if whoever slept here got up in the night. Head at z = 0. */
function emptyCot(): THREE.Group {
  const b = cotBedding(1.3);
  b.block([ACROSS - 0.1, 0.02, 0.5], "bone", [0.03, MATTRESS_TOP, 0.7]);
  return group(b.mesh(), ironFrame());
}

/** The mattress, pillow and blanket of a cot, the blanket turned
 *  down to `from` metres from the head; the rest goes in the returned batch. */
function cotBedding(from: number): ReturnType<typeof batch> {
  const b = batch();
  const top = MATTRESS_TOP;
  b.block([ACROSS, COT.mattress, INSIDE], "stone", [0, COT.rail, COT.length / 2]);
  // The blanket hangs a little over the sides, from below the sheet's turn to the foot.
  const to = FOOT_Z - POST / 2 - 0.01;
  const middle = (from + to) / 2;
  b.block([ACROSS + 0.04, BLANKET_TOP - top + 0.005, to - from], "boneDark", [0, top - 0.005, middle]);
  b.block([0.02, 0.16, to - from - 0.006], "boneDark", [-ACROSS / 2 - 0.013, top - 0.16, middle]);
  b.block([0.02, 0.16, to - from - 0.006], "boneDark", [ACROSS / 2 + 0.013, top - 0.16, middle]);
  b.block([ACROSS + 0.07, 0.036, 0.08], "woodMid", [0, top - 0.005, to - 0.2]);
  b.block([ACROSS + 0.05, 0.035, 0.2], "boneLight", [0, top - 0.004, from + 0.07]);
  b.block([ACROSS - 0.16, 0.09, 0.32], "bone", [0, top, 0.25]);
  return b;
}

/** A pair of work boots caked in mud and wet through, in the puddle they
 *  have dripped, toes towards +z. */
function wetBoots(): THREE.Group {
  const b = batch();
  for (const [x, z] of [[-0.08, 0.02], [0.08, -0.03]]) {
    b.block([0.104, 0.014, 0.29], "soot", [x, 0.006, z]);
    b.block([0.1, 0.06, 0.27], "woodDark", [x, 0.016, z]);
    b.block([0.09, 0.16, 0.11], "woodDark", [x, 0.066, z - 0.07]);
    b.block([0.108, 0.035, 0.2], "stone", [x, 0.014, z + 0.02]);
  }
  const boots = b.mesh();
  shiny(boots.material, SHINES.wetStone);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14).scale(0.62, 0.48, 1).rotateX(-Math.PI / 2).translate(0.04, 0.004, 0.05), shiny(flat("tideDark"), SHINES.wetStone));
  return group(puddle, boots);
}

/** Wet, muddy footprints coming in from the top door to the boots,
 *  in room metres: a pair of prints every stride, fading as they dry. */
function wetPrints(): THREE.Group {
  const b = batch();
  const from = new THREE.Vector2(0.15, -2.05);
  const to = new THREE.Vector2(1.7, 0.72);
  const along = to.clone().sub(from);
  const strides = 7;
  const heading = Math.atan2(along.x, along.y);
  const across = new THREE.Vector2(along.y, -along.x).normalize().multiplyScalar(0.09);
  for (let k = 0; k < strides; k++) {
    const at = from.clone().add(along.clone().multiplyScalar(k / (strides - 1))).add(across.clone().multiplyScalar(k % 2 ? 1 : -1));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    b.add([0.09, 0.002, 0.24], k > 3 ? "stoneDark" : "stone", new THREE.Matrix4().compose(new THREE.Vector3(at.x, 0.004 + k * 0.0002, at.y), turn, new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** A plain deal stool by a cot's head. Faces +z. */
function stool(): THREE.Group {
  const b = batch();
  for (const x of [-0.12, 0.12]) for (const z of [-0.12, 0.12]) b.block([0.04, 0.42, 0.04], "woodMid", [x, 0, z]);
  b.block([0.25, 0.03, 0.03], "wood", [0, 0.14, 0.12]);
  b.block([0.25, 0.03, 0.03], "wood", [0, 0.14, -0.12]);
  b.block([0.34, 0.035, 0.34], "woodLight", [0, 0.42, 0]);
  return group(b.mesh());
}

/** A tallow dip burnt low in a tin saucer, on a stool top. */
function tallowDip(): THREE.Group {
  const tin = shiny(flat("stone"), SHINES.pewter);
  const saucer = group(cylinder(0.07, 0.015, tin, [0, 0, 0], { top: 0.075, sides: 8 }), box([0.07, 0.01, 0.018], tin, [0.09, 0.008, 0]));
  const dip = candle({ height: 0.07, wax: "boneDark", intensity: 2.4, range: 7, lift: 0.16 });
  dip.position.y = 0.015;
  return group(saucer, dip);
}

/** A washstand: a plain deal stand with an enamel basin and jug, and a towel on its rail. Faces +z, back at z = 0. */
function washstand(): THREE.Group {
  const b = batch();
  for (const x of [-0.3, 0.3]) for (const z of [0.04, 0.34]) b.block([0.04, 0.72, 0.04], "woodMid", [x, 0, z]);
  b.block([0.68, 0.03, 0.38], "woodLight", [0, 0.72, 0.19]);
  b.block([0.56, 0.025, 0.28], "wood", [0, 0.18, 0.19]);
  b.block([0.04, 0.02, 0.04], "woodMid", [-0.3, 0.75, 0.04]);
  b.block([0.6, 0.06, 0.016], "boneDark", [0, 0.53, 0.37]);
  b.block([0.3, 0.32, 0.012], "bone", [0.06, 0.4, 0.38]);
  const enamel = shiny(flat("boneLight"), SHINES.glazedChina);
  const basin = cylinder(0.11, 0.07, enamel, [-0.08, 0.75, 0.19], { top: 0.16, sides: 10 });
  const jug = group(cylinder(0.065, 0.18, enamel, [0, 0, 0], { top: 0.045, sides: 8 }), cylinder(0.045, 0.05, enamel, [0, 0.18, 0], { top: 0.06, sides: 8 }));
  jug.position.set(0.2, 0.75, 0.2);
  return group(b.mesh(), basin, jug);
}

/** A row of wooden pegs along a wall, with a cap and an apron hung on it. Back at z = 0. */
function pegRail(): THREE.Group {
  const b = batch();
  b.block([1.3, 0.08, 0.025], "woodMid", [0, 0, 0.0125 + 0.04]);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) b.block([0.035, 0.035, 0.1], "wood", [x, 0.025, 0.1]);
  b.block([0.34, 0.58, 0.02], "bone", [-0.17, -0.55, 0.1]);
  b.block([0.22, 0.05, 0.03], "boneLight", [-0.17, 0.0, 0.115]);
  b.block([0.22, 0.1, 0.16], "soot", [0.5, -0.06, 0.11]);
  return group(b.mesh());
}

const BOARDS = ["woodDark", "wood", "woodMid", "woodLight"] as const;
const DADO = ["woodDark", "wood", "wood", "woodMid"] as const;

/** The Servants' Quarters: a bare dormitory under the eaves (or in the
 *  cellars), four black iron cots in two rows across the crossing aisles, a
 *  maid's uniform laid out flat on each as if someone lay in it. The fourth
 *  cot's is gone, its blanket flung back, and muddy wet boots stand by it
 *  in a dip's light, at the end of a trail of prints from the door. Two
 *  tallow dips burn on stools by the cots' heads. */
export const SERVANTS_QUARTERS: RoomDefinition = {
  id: "servants-quarters",
  floor: () => woodPlanks({ ramp: BOARDS, plankPx: 7, seed: "servants-quarters", glints: false }),
  wall: () => plaster({ ramp: ["stoneDark", "boneDark", "stone"], seed: "servants-quarters" }),
  wainscot: () => woodPlanks({ ramp: DADO, plankPx: 4, seed: "servants-quarters-dado", glints: false }),
  trim: "woodDark",
  shine: { glass: SHINES.glass },
  props: [
    { build: madeCot(0.02), ...onWall("left", 1.75, { out: 0.04 }) },
    { build: madeCot(-0.03), ...onWall("left", -1.75, { out: 0.04 }) },
    { build: madeCot(0), ...onWall("right", -1.75, { out: 0.04 }) },
    { build: emptyCot, ...onWall("right", 1.75, { out: 0.04 }) },
    { build: stool, ...onWall("left", 0.98, { out: 0.2 }) },
    { build: tallowDip, at: [-INNER + 0.2, -0.98], y: 0.455 },
    { build: stool, ...onWall("right", 0.98, { out: 0.2 }) },
    { build: tallowDip, at: [INNER - 0.2, 0.98], y: 0.455 },
    { build: wetBoots, at: [1.98, 0.9], turn: 95 },
    { build: wetPrints, at: [0, 0] },
    { build: washstand, ...onWall("top", 1.65, { out: 0.02 }) },
    { build: () => trunk({ size: [0.78, 0.36, 0.42], body: "woodMid" }), name: "trunk", ...onWall("bottom", 1.6, { out: 0.24 }) },
    { build: pegRail, ...onWall("top", -1.65, { y: 1.55 }) },
    { build: pegRail, ...onWall("bottom", -1.7, { y: 1.55 }) },
  ],
  focus: [1.2, 0.3, 1.3],
  prime: [-0.55, -0.7],
  // Every walk goes by the crossing aisles, past the cots' feet.
  lanes: crossLanes(),
  keepClear: [{ from: [2.2, 0.9], to: [1.75, 0.9], radius: 0.35 }],
};
