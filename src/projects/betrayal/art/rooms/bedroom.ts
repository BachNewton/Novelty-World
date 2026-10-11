import * as THREE from "three";
import { chair, rug, table } from "../kit";
import { lightAnchor } from "../light-anchor";
import { solidLathe, vessel } from "../kit/vessel";
import { RAMPS, paletteHex } from "../palette";
import { INNER, onWall, type RoomDefinition } from "../room";
import { batch, box, flat, glow, group, lightMaterial, textured } from "../shapes";
import { shiny, SHINES } from "../shine";
import { panelling, pixelTexture, wallpaper, woodPlanks } from "../textures";

const SEED = "bedroom";

/** A narrow iron bedstead's footprint in its own frame: across x, from the wall (z = 0) out to its foot. */
const BED = { width: 0.95, length: 1.95, head: 0.95, foot: 0.72, mattress: 0.52 };
const HALF = BED.width / 2;
const HEAD_Z = 0.04;
const FOOT_Z = BED.length - 0.04;
/** Where the two beds stand along the top wall, either side of the night table. */
const MADE_X = -0.9;
const EMPTY_X = 0.9;
const BED_Z = -INNER + 0.03;

/** Spindles between two rails, from `from` up to a top given across x. */
function spindles(b: ReturnType<typeof batch>, z: number, from: number, top: (x: number) => number) {
  const count = 7;
  for (let i = 1; i < count; i++) {
    const x = -HALF + (i * BED.width) / count;
    b.block([0.022, top(x) - from, 0.022], "ash", [x, from, z]);
  }
}

/**
 * The iron frame of a narrow bedstead, head at z = 0 against the wall and foot
 * towards +z: plain posts with brass knobs, a hooped head of spindles under a
 * round top rail, a lower foot rail, and the side irons the mattress rests on.
 */
function ironFrame(): THREE.Group {
  const iron = shiny(flat("ash"), SHINES.iron);
  const brass = shiny(flat("brass"), SHINES.brass);
  const b = batch();
  for (const z of [HEAD_Z, FOOT_Z]) {
    const height = z === HEAD_Z ? BED.head : BED.foot;
    for (const x of [-HALF, HALF]) b.block([0.045, height, 0.045], "ash", [x, 0, z]);
  }
  // The rails run between the posts, inset from their faces.
  for (const [z, ys] of [[HEAD_Z, [0.36, 0.6]], [FOOT_Z, [0.36, 0.5, BED.foot - 0.06]]] as const) {
    for (const y of ys) b.block([BED.width - 0.04, 0.035, 0.032], "ash", [0, y, z]);
  }
  spindles(b, HEAD_Z, 0.6, (x) => BED.head - 0.05 + Math.sqrt(HALF * HALF - x * x) - 0.02);
  spindles(b, FOOT_Z, 0.5, () => BED.foot - 0.06);
  // The side irons run between the end rails.
  for (const x of [-HALF, HALF]) b.block([0.032, 0.06, FOOT_Z - HEAD_Z - 0.045], "ash", [x, 0.3, BED.length / 2]);
  const frame = b.mesh();
  shiny(frame.material, SHINES.iron);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(HALF, 0.022, 4, 14, Math.PI), iron);
  hoop.position.set(0, BED.head - 0.05, HEAD_Z);
  const result = group(frame, hoop);
  for (const [z, y] of [[HEAD_Z, BED.head], [FOOT_Z, BED.foot]]) {
    for (const x of [-HALF, HALF]) {
      const knob = solidLathe([[0.02, 0], [0.04, 0.03], [0.042, 0.05], [0.028, 0.08], [0, 0.085]], brass, 6);
      knob.position.set(x, y - 0.005, z);
      result.add(knob);
    }
  }
  return result;
}

/** The mattress the frame holds, in ticking or covered in linen. */
function mattress(colour: THREE.Material): THREE.Mesh {
  return box([BED.width - 0.08, BED.mattress - 0.33, FOOT_Z - HEAD_Z - 0.08], colour, [0, 0.33, BED.length / 2]);
}

const QUILT = [
  "aaaabbbbccccdddd",
  "aaaabbbbccccdddd",
  "aaeabbfbccgcddhd",
  "aaaabbbbccccdddd",
  "ccccddddaaaabbbb",
  "ccccddddaaaabbbb",
  "ccgcddhdaaeabbfb",
  "ccccddddaaaabbbb",
];

/** A patchwork of faded blues, rose and cream, stitched in squares. */
const QUILT_LEGEND = {
  a: "moon",
  b: "bone",
  c: "boneDark",
  d: "moonLight",
  e: "moonDark",
  f: "bloodLight",
  g: "moon",
  h: "bloodLight",
} as const;

/** The made bed: linen turned down over a patchwork quilt, two pillows plumped, a doll sat up on them. */
function madeBed(): THREE.Group {
  const quilt = textured(pixelTexture(QUILT, QUILT_LEGEND, true));
  const from = 0.62;
  const to = FOOT_Z + 0.02;
  const mid = (from + to) / 2;
  const len = to - from;
  const top = BED.mattress;
  const pillow = box([BED.width - 0.22, 0.13, 0.32], flat("boneLight"), [0, top - 0.02, 0.3]);
  pillow.rotation.x = -0.12;
  return group(
    ironFrame(),
    mattress(flat("bone")),
    box([BED.width - 0.04, 0.035, len], quilt, [0, top - 0.005, mid]),
    box([0.025, 0.3, len - 0.004], quilt, [-HALF + 0.03, top - 0.3, mid]),
    box([0.025, 0.3, len - 0.004], quilt, [HALF - 0.03, top - 0.3, mid]),
    box([BED.width - 0.025, 0.045, 0.22], flat("boneLight"), [0, top - 0.005, from + 0.08]),
    pillow,
  );
}

/** Narrow stripes of mattress ticking. */
const TICKING = ["abab", "abab"];

/**
 * The empty bed: a bare ticking mattress, its pillow fallen, and its quilt
 * pulled off the far side and dragged down, its end drawn in under the bed
 * where the light is. Head at z = 0, foot towards +z.
 */
function emptyBed(): THREE.Group {
  const ticking = textured(pixelTexture(TICKING, { a: "bone", b: "moon" }, true));
  const quilt = textured(pixelTexture(QUILT, QUILT_LEGEND, true));
  const top = BED.mattress;
  const result = group(ironFrame(), mattress(ticking));
  // The quilt hangs from the mattress's edge over the side iron.
  const hanging = box([0.03, top - 0.05, 1.0], quilt, [0, 0, 0]);
  hanging.position.set(HALF + 0.06, 0.03, 1.1);
  hanging.rotation.set(0, 0.1, 0.06);
  // On the floor it heaps, then runs back in under the bed in a narrowing tongue.
  const heap = box([0.36, 0.06, 0.9], quilt, [0, 0, 0]);
  heap.position.set(HALF + 0.2, 0, 1.15);
  heap.rotation.y = 0.15;
  const tongue = box([0.6, 0.02, 0.44], quilt, [0, 0, 0]);
  tongue.position.set(HALF - 0.25, 0.004, 0.88);
  tongue.rotation.y = 0.35;
  result.add(hanging, heap, tongue);
  return result;
}

/** The empty bed's pillow, fallen to the floor by its foot. */
function fallenPillow(): THREE.Mesh {
  const pillow = box([0.56, 0.11, 0.32], flat("boneLight"), [0, 0, 0]);
  pillow.rotation.y = 0.6;
  return pillow;
}

/** A floor of spectral teal light welling out from under the empty bed, brightest at its middle. Lies flat, centred on the origin. */
function underGlow(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2.0, 2.7, 12, 16);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colour = new THREE.Color(paletteHex("spectre")).multiplyScalar(0.7);
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const dx = position.getX(i) / 1.0;
    const dz = (position.getZ(i) + 0.2) / 1.35;
    const fall = Math.max(0, 1 - Math.hypot(dx, dz)) ** 1.2;
    colours.set([colour.r * fall, colour.g * fall, colour.b * fall], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.translate(0, 0.012, 0);
  const mesh = new THREE.Mesh(geometry, lightMaterial(1, { vertexColors: true }));
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * A nursery night-lamp: a brass foot, a squat bone-china font and a frosted
 * chimney glowing with the low flame inside it, turned down for the night.
 * Base at y = 0.
 */
function nightLamp(): THREE.Group {
  const result = group(
    solidLathe([[0.07, 0], [0.07, 0.015], [0.03, 0.03], [0.025, 0.06], [0, 0.06]], shiny(flat("brass"), SHINES.brass), 8),
    solidLathe([[0.025, 0.06], [0.06, 0.09], [0.055, 0.13], [0.025, 0.15], [0, 0.15]], shiny(flat("boneLight"), SHINES.glazedChina), 8),
    solidLathe([[0.03, 0.149], [0.045, 0.2], [0.03, 0.27], [0.025, 0.32]], glow("amber"), 8),
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 2.8, range: 6, flicker: 0.08, signal: 3 }, [0, 0.3, 0]));
  return result;
}

/** A rag doll sat up against the made bed's pillows, turned to watch the empty bed (towards +x). */
function doll(): THREE.Group {
  const b = batch();
  b.block([0.13, 0.12, 0.1], "moonLight", [0, 0, 0]);
  b.block([0.1, 0.06, 0.08], "moonLight", [0, 0.12, 0]);
  b.block([0.04, 0.03, 0.14], "boneLight", [-0.03, 0, 0.1]);
  b.block([0.04, 0.03, 0.14], "boneLight", [0.03, 0, 0.1]);
  b.block([0.11, 0.1, 0.1], "boneLight", [0, 0.18, 0]);
  b.block([0.12, 0.05, 0.1], "woodLight", [0, 0.26, -0.01]);
  b.block([0.115, 0.07, 0.03], "woodLight", [0, 0.2, -0.05]);
  b.block([0.018, 0.018, 0.01], "void", [-0.025, 0.23, 0.05]);
  b.block([0.018, 0.018, 0.01], "void", [0.025, 0.23, 0.05]);
  const result = group(b.mesh());
  result.rotation.x = -0.15;
  return group(result);
}

/** A low chest of drawers, faces +z, back at z = 0. */
function chestOfDrawers(): THREE.Group {
  const top = shiny(textured(woodPlanks({ plankPx: 5, size: 32, seed: `${SEED}-chest`, glints: false })), SHINES.polishedWood);
  const brass = shiny(flat("brass"), SHINES.brass);
  const result = group(
    box([0.86, 0.84, 0.44], shiny(flat("wood"), SHINES.polishedWood), [0, 0.04, 0.23]),
    box([0.92, 0.04, 0.5], top, [0, 0.88, 0.25]),
    box([0.84, 0.04, 0.42], flat("woodDark"), [0, 0, 0.23]),
  );
  const front = shiny(flat("woodMid"), SHINES.polishedWood);
  for (const [i, y] of [0.1, 0.34, 0.58].entries()) {
    result.add(box([0.78, 0.2, 0.02], front, [0, y, 0.455]));
    for (const x of [-0.2, 0.2]) result.add(box([0.05, 0.03, 0.025], brass, [x, y + 0.09, 0.47]));
    if (i === 1) result.add(box([0.12, 0.03, 0.04], flat("boneLight"), [0.25, y + 0.2, 0.47]));
  }
  return result;
}

/** A jug and a small framed likeness on the chest of drawers. Front towards +z. */
function chestThings(): THREE.Group {
  const jug = vessel([[0.05, 0], [0.07, 0.06], [0.06, 0.14], [0.035, 0.19], [0.045, 0.22]], shiny(flat("boneLight"), SHINES.glazedChina), { wall: 0.006, depth: 0.18, sides: 8 });
  jug.position.set(-0.22, 0, 0.05);
  const frame = group(box([0.16, 0.2, 0.02], shiny(flat("brass"), SHINES.brass), [0, 0, 0]), box([0.11, 0.14, 0.01], shiny(flat("moonDark"), SHINES.glass), [0, 0.03, 0.012]));
  frame.position.set(0.15, 0, -0.02);
  frame.rotation.x = -0.15;
  return group(jug, frame);
}

/** A little wooden horse on rockers, left by the wall; its head towards +x. */
function rockingHorse(): THREE.Group {
  const b = batch();
  b.block([0.34, 0.12, 0.1], "bone", [0, 0.16, 0]);
  b.block([0.08, 0.16, 0.08], "bone", [0.15, 0.26, 0]);
  b.block([0.13, 0.07, 0.07], "bone", [0.2, 0.39, 0]);
  b.block([0.06, 0.14, 0.11], "woodDark", [0.11, 0.3, 0]);
  for (const x of [-0.12, 0.12]) b.block([0.04, 0.14, 0.12], "blood", [x, 0.03, 0]);
  b.block([0.46, 0.036, 0.14], "blood", [0, 0, 0]);
  return group(b.mesh());
}

const STARS = [
  "...#...",
  "..###..",
  "...#...",
  ".......",
  "#......",
  ".......",
  "....#..",
];

/** A children's bedroom on the upper floor: two narrow iron beds, one made
 *  and watched over by a doll, the other stripped, its quilt drawn in under
 *  the bed where a spectral teal light wells out; a night-lamp burns low between them. */
export const BEDROOM: RoomDefinition = {
  id: "bedroom",
  floor: () => woodPlanks({ seed: SEED, glints: false }),
  wall: () => wallpaper({ ground: "moonDark", stripe: "moon", motif: "boneDark", pattern: STARS, seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.bone, seed: SEED, glints: false }),
  trim: "woodDark",
  props: [
    { build: () => rug({ width: 2.4, length: 1.1, field: "moonDark", border: "bloodDark", motif: "bone", fringe: "boneDark" }), name: "rug", at: [0, -0.15] },
    { build: madeBed, at: [MADE_X, BED_Z], walls: ["top"] },
    { build: emptyBed, at: [EMPTY_X, BED_Z], walls: ["top"] },
    { build: underGlow, at: [EMPTY_X + 0.1, BED_Z + 1.0] },
    { build: doll, at: [MADE_X + 0.05, BED_Z + 0.7], y: BED.mattress + 0.045, turn: 70 },
    { build: fallenPillow, at: [EMPTY_X + 0.85, BED_Z + 1.95] },
    { build: () => table({ length: 0.5, width: 0.4, height: 0.6 }), name: "nightTable", ...onWall("top", 0, { out: 0.25 }) },
    { build: nightLamp, at: [0, -INNER + 0.25], y: 0.6 },
    { build: rockingHorse, at: [-2.2, -1.25], turn: -30 },
    { build: chestOfDrawers, ...onWall("left", -1.7) },
    { build: chestThings, ...onWall("left", -1.7, { y: 0.92, out: 0.22 }) },
    { build: () => chair({ cushion: "moon", back: 1.0 }), name: "chair", at: [1.55, 1.75], turn: 200 },
  ],
  lights: [{ at: [EMPTY_X, 0.14, BED_Z + 1.0], colour: "spectre", intensity: 7, range: 6, flicker: 0.15, signal: 1 }],
  focus: [0.4, 0.5, -1.6],
  prime: [-0.8, 1.1],
  keepClear: [{ from: [EMPTY_X + 0.85, BED_Z + 0.5], to: [EMPTY_X + 0.85, BED_Z + 1.9], radius: 0.3 }],
};
