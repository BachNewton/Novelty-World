import * as THREE from "three";
import { createRng, pick } from "@/shared/lib/seeded-random";
import { cask, chair, chamberstick, crate, table } from "../kit";
import { trunk } from "../kit/trunk";
import { lightAnchor } from "../light-anchor";
import { RAMPS, type PaletteKey } from "../palette";
import { crossLanes, onWall, type RoomDefinition } from "../room";
import { batch, box, cylinder, flat, glow, group } from "../shapes";
import { panelling, wallpaper, woodPlanks } from "../textures";

/** The heap in the top-left corner the lamp stands on: where its table stands. */
const HEAP: [number, number] = [-1.98, -2.0];
const TABLE_TOP = 0.76;
const HEAP_CRATE = 0.42;

/** A brass oil lamp with a glass chimney, its wick turned low: the only
 *  light anyone left up here. Base at y = 0. */
function oilLamp(): THREE.Group {
  const brass = flat("brass");
  const result = group(
    cylinder(0.08, 0.03, brass, [0, 0, 0], { top: 0.06, sides: 8 }),
    cylinder(0.025, 0.08, brass, [0, 0.03, 0], { sides: 6 }),
    cylinder(0.07, 0.07, brass, [0, 0.11, 0], { top: 0.05, sides: 8 }),
    cylinder(0.04, 0.16, glow("amber"), [0, 0.18, 0], { top: 0.03, sides: 8 }),
    cylinder(0.012, 0.05, glow("flame"), [0, 0.2, 0], { sides: 4 }),
  );
  result.traverse((child) => {
    child.userData.noShadow = true;
  });
  result.add(lightAnchor({ colour: "amber", intensity: 10, range: 9, flicker: 0.12 }, [0, 0.42, 0]));
  return result;
}

/** A wardrobe gone over on its back along the wall, one door burst open
 *  and hanging off the side, clothes spilled out of it. Lies along x, its
 *  front up. */
function toppledWardrobe(): THREE.Group {
  const b = batch();
  const [l, w, h] = [1.9, 0.95, 0.55];
  b.block([l, h, w], "wood", [0, 0, 0]);
  b.block([l + 0.04, 0.06, w + 0.04], "woodDark", [0, h - 0.03, 0]);
  b.block([l - 0.2, 0.03, w * 0.45], "woodMid", [-0.0, h + 0.03, -w * 0.24]);
  b.block([0.04, 0.03, 0.16], "brass", [0.1, h + 0.06, -0.06]);
  // The other door, burst open, hangs down the side to the floor.
  b.add([l - 0.2, 0.03, w * 0.45], "woodMid", new THREE.Matrix4().compose(new THREE.Vector3(0, h * 0.5, w / 2 + 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.25, 0, 0)), new THREE.Vector3(1, 1, 1)));
  // Clothes spilled from the opening.
  const rng = createRng("junk-clothes");
  for (let k = 0; k < 5; k++) {
    b.add([0.4 + rng.next() * 0.3, 0.05, 0.35], pick(rng, ["bruise", "blood", "boneDark", "moonDark"] as PaletteKey[]), new THREE.Matrix4().compose(new THREE.Vector3(-0.35 + k * 0.25, 0.025 + k * 0.004, w / 2 + 0.35 + rng.next() * 0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rng.next() - 0.5) * 0.8, 0)), new THREE.Vector3(1, 1, 1)));
  }
  return group(b.mesh());
}

/** A chair fallen on its side. Its seat faces +x as it lies. */
function fallenChair(): THREE.Group {
  const piece = chair({ cushion: null });
  piece.rotation.z = Math.PI / 2;
  // A hair off the floor, which puts no face of it in the plane of the house's choice glow.
  piece.position.set(0.255, 0.232, 0);
  return group(piece);
}

/** A carpet rolled up and stood on end against the wall, leaning. */
function rolledCarpet(): THREE.Group {
  const roll = group(cylinder(0.13, 1.6, flat("blood"), [0, 0, 0], { sides: 8 }), cylinder(0.08, 1.61, flat("bloodDark"), [0, 0, 0], { sides: 8 }));
  roll.rotation.z = -0.22;
  roll.position.set(0.04, 0.03, 0);
  return group(roll);
}

/** A domed brass birdcage, its door open and empty. */
function birdcage(): THREE.Group {
  const brass = flat("brass");
  const result = group(cylinder(0.16, 0.03, brass, [0, 0, 0], { sides: 8 }));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    result.add(box([0.012, 0.32, 0.012], brass, [Math.cos(a) * 0.14, 0.03, Math.sin(a) * 0.14]));
  }
  result.add(cylinder(0.15, 0.08, brass, [0, 0.35, 0], { top: 0.05, sides: 8 }), box([0.03, 0.06, 0.03], brass, [0, 0.43, 0]));
  return result;
}

/** A tall mirror in a frame, stood against the wall, its glass cracked
 *  across: a pale sheet catching what light there is. Its back at z = 0. */
function crackedMirror(): THREE.Group {
  const frame = flat("woodMid");
  const glass = flat("moonLight");
  const result = group(
    box([0.7, 1.5, 0.05], frame, [0, 0, 0.025]),
    box([0.56, 1.36, 0.02], glass, [0, 0.07, 0.055]),
  );
  // Each crack lies a little proud of the last, so where they cross their faces never share a plane.
  for (const [i, [x, y, turn]] of ([[-0.05, 0.9, 0.6], [0.08, 0.7, -0.9], [0.02, 0.45, 0.3]] as const).entries()) {
    const crack = box([0.012, 0.42, 0.006], flat("ash"), [0, -0.21, 0]);
    crack.rotation.z = turn;
    crack.position.set(x, y, 0.066 + i * 0.002);
    result.add(crack);
  }
  result.rotation.x = -0.16;
  return group(result);
}

/** Stacked books and papers, a few slid off the pile. */
function bookPile(seed: string): THREE.Group {
  const rng = createRng(`junk-books-${seed}`);
  const b = batch();
  let y = 0;
  for (let k = 0; k < 7; k++) {
    const h = 0.04 + rng.next() * 0.04;
    b.add([0.24 + rng.next() * 0.1, h, 0.18 + rng.next() * 0.06], pick(rng, ["blood", "bruise", "verdigris", "woodMid", "boneDark"] as PaletteKey[]), new THREE.Matrix4().compose(new THREE.Vector3((rng.next() - 0.5) * 0.05, y + h / 2, (rng.next() - 0.5) * 0.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rng.next() - 0.5) * 0.7), new THREE.Vector3(1, 1, 1)));
    y += h - 0.002;
  }
  return group(b.mesh());
}

/** Round hatboxes stacked crooked. */
function hatboxes(): THREE.Group {
  return group(
    cylinder(0.2, 0.22, flat("bone"), [0, 0, 0], { sides: 10 }),
    cylinder(0.21, 0.05, flat("blood"), [0, 0.2, 0], { sides: 10 }),
    cylinder(0.16, 0.18, flat("moon"), [0.03, 0.25, 0.02], { sides: 10 }),
    cylinder(0.17, 0.04, flat("boneDark"), [0.03, 0.41, 0.02], { sides: 10 }),
  );
}

/**
 * Furniture heaped under dust sheets: pale lumps of something, one on
 * another, the sheet hanging in folds to the floor. `size` is its footprint
 * and height; faces +z.
 */
function sheetedHeap(size: [number, number, number], seed: string): THREE.Group {
  const rng = createRng(`junk-sheet-${seed}`);
  const [w, h, d] = size;
  const b = batch();
  const tilt = (s: [number, number, number], at: [number, number, number], colour: PaletteKey, lean: number) =>
    b.add(s, colour, new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * lean, (rng.next() - 0.5) * 0.3, (rng.next() - 0.5) * lean)), new THREE.Vector3(1, 1, 1)));
  tilt([w, h * 0.55, d], [0, h * 0.275 + 0.01, 0], "bone", 0.04);
  tilt([w * 0.6, h * 0.45, d * 0.7], [(rng.next() - 0.5) * w * 0.3, h * 0.72, (rng.next() - 0.5) * d * 0.2], "boneLight", 0.25);
  tilt([w * 0.3, h * 0.35, d * 0.35], [w * 0.28, h * 0.62, d * 0.2], "boneDark", 0.4);
  // The folds of the sheet where it hangs to the floor.
  for (const x of [-w * 0.32, 0, w * 0.3]) b.block([0.12, h * 0.5, 0.06], "boneDark", [x + (rng.next() - 0.5) * 0.06, 0.005, d / 2 - 0.01]);
  return group(b.mesh());
}

/** How high a junk pile's flat top crate stands. */
const PILE_TOP = 1.3;

const JUNK: PaletteKey[] = ["woodMid", "woodLight", "wood", "bone", "boneDark", "blood", "bruise", "moon", "verdigris", "brass", "stoneDark"];

/**
 * A heap of everything, `size` metres square, banked into a corner: drawers,
 * boxes, cases and broken furniture tumbled on each other, highest at the
 * middle, with a few chair legs sticking out and a flat crate on top at
 * `PILE_TOP` for things to stand on.
 */
function junkPile(size: number, seed: string): THREE.Group {
  const rng = createRng(`junk-pile-${seed}`);
  const b = batch();
  const half = size / 2;
  const tumble = (s: [number, number, number], at: [number, number, number], lean: number) =>
    b.add(s, pick(rng, JUNK), new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler((rng.next() - 0.5) * lean, rng.next() * Math.PI, (rng.next() - 0.5) * lean)), new THREE.Vector3(1, 1, 1)));
  for (let x = -half + 0.22; x < half - 0.15; x += 0.36) {
    for (let z = -half + 0.22; z < half - 0.15; z += 0.36) {
      const h = 0.3 + rng.next() * 0.25;
      tumble([0.36 + rng.next() * 0.1, h, 0.32 + rng.next() * 0.1], [x, h / 2 + 0.02, z], 0.08);
    }
  }
  for (let k = 0; k < 12; k++) {
    const r = Math.sqrt(rng.next()) * half * 0.7;
    const a = rng.next() * Math.PI * 2;
    const s = 0.22 + rng.next() * 0.18;
    tumble([s * 1.3, s * 0.8, s], [Math.cos(a) * r, 0.62 + (1 - r / half) * 0.35, Math.sin(a) * r], 0.6);
  }
  // Chair legs and a bedpost poking out of the heap, each at its own distance from the middle: two leaning mirror-wise at
  // one distance would lie in one plane.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.next();
    const out = half * (0.3 + k * 0.025);
    b.add([0.045, 0.6 + rng.next() * 0.4, 0.045], pick(rng, ["woodDark", "wood", "woodMid"] as PaletteKey[]), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * out, 0.95, Math.sin(a) * out), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)), new THREE.Vector3(1, 1, 1)));
  }
  b.block([0.62, 0.32, 0.55], "woodMid", [0, PILE_TOP - 0.32, 0]);
  b.block([0.66, 0.05, 0.59], "woodDark", [0, PILE_TOP - 0.21, 0]);
  return group(b.mesh());
}

/** The Junk Room: a lumber room where the household's cast-offs are heaped
 *  into every corner and pressed up against every doorway, a lamp burning
 *  on top of the tallest heap: anyone leaving must shove a way out. */
export const JUNK_ROOM: RoomDefinition = {
  id: "junk-room",
  floor: () => woodPlanks({ ramp: RAMPS.wood, seed: "junk-room" }),
  wall: () => wallpaper({ ground: "sootLight", stripe: "ash", motif: "stoneDark", seed: "junk-room" }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: "junk-room" }),
  trim: "woodDark",
  props: [
    // The tall heap, top left: a table piled with a crate, a chair and the lamp.
    { build: () => table({ length: 1.15, width: 0.75 }), name: "heapTable", at: HEAP, turn: 40 },
    { build: () => crate([0.5, HEAP_CRATE, 0.45]), name: "heapCrate", at: [HEAP[0] - 0.12, HEAP[1] - 0.12], y: TABLE_TOP, turn: 25 },
    { build: oilLamp, at: [HEAP[0] - 0.12, HEAP[1] - 0.12], y: TABLE_TOP + HEAP_CRATE },
    { build: () => chair({ cushion: "bruise" }), name: "heapChair", at: [HEAP[0] + 0.3, HEAP[1] + 0.22], y: TABLE_TOP, turn: 215 },
    { build: () => cask({ height: 0.6, radius: 0.2 }), name: "cask", at: [HEAP[0] - 0.15, HEAP[1] + 0.05] },
    { build: fallenChair, at: [-1.05, -2.45], turn: 15 },
    // Top right: the toppled wardrobe across the corner, crates on it.
    { build: toppledWardrobe, at: [1.62, -2.2] },
    { build: () => crate([0.5, 0.42, 0.45]), name: "crate", at: [2.2, -1.95], y: 0.611, turn: 12 },
    { build: () => chamberstick({ height: 0.12, intensity: 2.6, range: 6 }), name: "chamberstick", at: [2.2, -1.95], y: 1.031 },
    // Bottom right: a heap of everything, the birdcage and a candle on top, a rolled carpet by it.
    { build: () => junkPile(1.3, "br"), name: "junkPile", at: [2.1, 2.1] },
    { build: birdcage, at: [2.15, 2.2], y: PILE_TOP },
    { build: () => chamberstick({ height: 0.1, intensity: 3, range: 7 }), name: "chamberstick", at: [1.85, 1.9], y: PILE_TOP },
    { build: rolledCarpet, at: [2.32, 1.15], contacts: [{ with: "right", because: "it is stood on end, leaning on the wall" }] },
    { build: () => bookPile("right"), name: "bookPile", at: [2.4, 0.75] },
    { build: () => bookPile("bottom"), name: "bookPile", at: [0.95, 2.45] },
    // Bottom left: another heap, the open trunk, the cracked mirror.
    { build: () => junkPile(1.2, "bl"), name: "junkPile", at: [-2.15, 2.15] },
    { build: hatboxes, at: [-2.2, 2.2], y: PILE_TOP },
    { build: () => chamberstick({ height: 0.07, intensity: 2.6, range: 6 }), name: "chamberstick", at: [-1.95, 1.95], y: PILE_TOP },
    { build: () => trunk({ size: [0.8, 0.42, 0.45], body: "blood", open: 1.1 }), name: "trunk", at: [-1.05, 2.4] },
    { build: crackedMirror, ...onWall("left", -1.0, { out: 0.12 }), contacts: [{ with: "left", because: "it is stood leaning against the wall" }] },
    // Sheeted furniture heaped against the walls, pressing in on the side doorways.
    { build: () => sheetedHeap([0.8, 0.9, 0.6], "r"), name: "sheetedHeap", ...onWall("right", -1.0, { out: 0.31 }), contacts: [{ with: "toppledWardrobe", because: "the wardrobe's spilled clothes run in under the sheet" }] },
    { build: () => sheetedHeap([0.75, 0.95, 0.6], "l"), name: "sheetedHeap", ...onWall("left", 0.95, { out: 0.31 }) },
  ],
  focus: [-1.4, 0.8, -1.4],
  pawn: [0.75, 0.7],
  spots: [[-0.75, 0.7], [0.75, -0.75], [-0.75, -0.75], [0.0, 0.0], [1.55, 0.05]],
  // Doorway to doorway through the middle, clear of the heaps.
  lanes: crossLanes(),
};
