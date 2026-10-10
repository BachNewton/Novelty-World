import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { chamberstick, cobweb, pictureFrame, pitHaze, pitShell, table } from "../kit";
import { crossCorners } from "../kit/wall-mass";
import { RAMPS, type PaletteKey } from "../palette";
import { crossLanes, INNER, type RoomDefinition } from "../room";
import { batch, box, glow, group } from "../shapes";
import { panelling, wallpaper, woodPlanks } from "../textures";

const SEED = "creaky-hallway";
/** The corridors run this far either side of the middle; the corners are solid wall. */
const ARM = 1.3;
const SURFACES = {
  wall: () => wallpaper({ ground: "ash", stripe: "sootLight", motif: "stoneDark", seed: SEED }),
  wainscot: () => panelling({ ramp: RAMPS.wood, seed: SEED }),
  trim: "woodDark",
} satisfies Pick<RoomDefinition, "wall" | "wainscot" | "trim">;

/** The loose boards lie in rows along x, one every `PITCH` from `FIRST`, with a gap between each. */
const PITCH = 0.25;
const BOARD = 0.21;
const FIRST = -1.25;
const ROWS = 13;
/** Where the floor has given way, down the bottom corridor: the boards over it have sprung up. */
const HOLE = { x: [0.45, 1.22] as [number, number], z: [1.21, 2.0] as [number, number] };
const HOLE_MIDDLE: [number, number] = [(HOLE.x[0] + HOLE.x[1]) / 2, (HOLE.z[0] + HOLE.z[1]) / 2];

/** Where row `k`'s board runs along x, in one or two pieces: ragged ends,
 *  out into the side corridors where it crosses them, broken off at the hole. */
function rowPieces(k: number): [number, number][] {
  const rng = createRng(`${SEED}:row:${k}`);
  const z0 = FIRST + k * PITCH;
  const inCrossing = z0 + BOARD < ARM;
  const reach = (side: number) => (inCrossing ? ARM + 0.1 + rng.next() * 0.6 : ARM - 0.06 - (side > 0 ? 0 : rng.next() * 0.2));
  const [x0, x1] = [-reach(-1), reach(1)];
  const overHole = z0 < HOLE.z[1] && z0 + BOARD > HOLE.z[0];
  return overHole ? [[x0, HOLE.x[0]]] : [[x0, x1]];
}

/**
 * The floorboards of the crossing and the bottom corridor, prised loose and
 * warped, lying on the floor with a gap between each through which a sickly
 * green light wells up, brightest by the hole. Built in room metres.
 */
function looseBoards(): THREE.Group {
  const boards = batch();
  const seams = batch();
  const shades: PaletteKey[] = ["woodDark", "wood", "wood", "ash", "stoneDark"];
  const seamShade = (x: number, z: number): PaletteKey => {
    const d = Math.hypot(x - HOLE_MIDDLE[0], z - HOLE_MIDDLE[1]);
    return d < 0.9 ? "wraithLight" : d < 2.2 ? "wraith" : "wraithDark";
  };
  for (let k = 0; k < ROWS; k++) {
    const rng = createRng(`${SEED}:board:${k}`);
    const z0 = FIRST + k * PITCH;
    for (const [x0, x1] of rowPieces(k)) {
      // Each board is warped: its middle stands a little higher than its ends.
      const thick = 0.022 + rng.next() * 0.006;
      const bow = 0.004 + rng.next() * 0.01;
      const pieces = 3;
      const step = (x1 - x0) / pieces;
      for (let p = 0; p < pieces; p++) {
        const lift = p === 1 ? bow : 0;
        boards.block([step + (p === 1 ? 0.004 : 0), thick + lift, BOARD], shades[Math.floor(rng.next() * shades.length)], [x0 + (p + 0.5) * step, 0, z0 + BOARD / 2]);
      }
      boards.block([0.03, 0.004, 0.03], "stoneDark", [x0 + 0.06, thick, z0 + 0.05]);
    }
    // The seam before this row, lit from below, in lengths that fade away from the hole.
    if (k === 0) continue;
    const before = rowPieces(k - 1);
    const here = rowPieces(k);
    const from = Math.max(before[0][0], here[0][0]);
    const to = Math.min(before.at(-1)?.[1] ?? 0, here.at(-1)?.[1] ?? 0);
    const z = z0 - (PITCH - BOARD) / 2;
    for (let x = from; x < to - 0.01; x += 0.25) {
      const end = Math.min(x + 0.25, to);
      seams.block([end - x + 0.002, 0.003, PITCH - BOARD - 0.006], seamShade((x + end) / 2, z), [(x + end) / 2, 0.006, z]);
    }
  }
  // The seams are their own light, so they take the batch's colours unlit.
  const seamMesh = new THREE.Mesh(seams.mesh().geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  seamMesh.userData.noShadow = true;
  return group(boards.mesh(), seamMesh);
}

/** A board sprung up out of the hole: hinged at `foot` on the floor's edge, rising `rise` radians towards `towards` along x. */
function sprung(b: ReturnType<typeof batch>, foot: number, z: number, length: number, rise: number, towards: 1 | -1, colour: PaletteKey) {
  const matrix = new THREE.Matrix4()
    .makeTranslation(foot, 0.012, z)
    .multiply(new THREE.Matrix4().makeRotationZ(towards * rise))
    .multiply(new THREE.Matrix4().makeTranslation((towards * length) / 2, 0, 0));
  b.add([length, 0.024, BOARD - 0.01], colour, matrix);
}

/**
 * The hole where the floor gave way: two boards sprung up into a tent over
 * it and a third snapped upright, the joists below, and the green light
 * welling up out of the dark. Built in room metres.
 */
function brokenFloor(): THREE.Group {
  const b = batch();
  const rowZ = (k: number) => FIRST + k * PITCH + BOARD / 2;
  sprung(b, HOLE.x[0] + 0.01, rowZ(10), 0.52, 0.7, 1, "stoneDark");
  sprung(b, HOLE.x[1] - 0.01, rowZ(10) + 0.02, 0.46, 0.84, -1, "wood");
  sprung(b, HOLE.x[1] - 0.01, rowZ(11), 0.5, 0.62, -1, "ash");
  sprung(b, HOLE.x[0] + 0.01, rowZ(12), 0.42, 1.2, 1, "woodMid");
  // The splintered end of the upright board.
  b.add([0.05, 0.03, BOARD - 0.04], "boneDark", new THREE.Matrix4().makeRotationZ(0.5).setPosition(HOLE.x[0] + 0.17, 0.4, rowZ(12)));
  // Joists across the hole, under the floor.
  for (const x of [0.66, 1.0]) b.block([0.07, 0.14, HOLE.z[1] - HOLE.z[0] - 0.02], "woodDark", [x, -0.34, HOLE_MIDDLE[1]]);
  const glowBed = box([HOLE.x[1] - HOLE.x[0] - 0.02, 0.01, HOLE.z[1] - HOLE.z[0] - 0.02], glow("wraithLight"), [HOLE_MIDDLE[0], -0.5, HOLE_MIDDLE[1]]);
  glowBed.userData.noShadow = true;
  return group(
    b.mesh(),
    pitShell({ ...HOLE, bottom: -0.52 }),
    glowBed,
    pitHaze({ ...HOLE, y: -0.4, colour: "wraithLight", opacity: 0.85 }),
    pitHaze({ ...HOLE, y: -0.1, colour: "wraithLight", opacity: 0.45 }),
  );
}

/** The faded hall paper's portrait, for a frame hung askew. */
function askewFrame(): THREE.Group {
  const frame = pictureFrame({ frame: "woodLight" });
  frame.rotation.z = 0.12;
  return group(frame);
}

/** The Creaky Hallway: a cross of corridors on warped boards, where the floor
 *  has given way down one arm and a sickly green light wells up through
 *  every seam. */
export const CREAKY_HALLWAY: RoomDefinition = {
  id: "creaky-hallway",
  floor: () => woodPlanks({ seed: SEED }),
  ...SURFACES,
  floorOpenings: [HOLE],
  props: [
    ...crossCorners({ arm: ARM, ...SURFACES }),
    { build: looseBoards, at: [0, 0] },
    { build: brokenFloor, at: [0, 0] },
    { build: () => table({ length: 0.8, width: 0.32, height: 0.8, wood: RAMPS.wood }), name: "hall table", at: [-2.15, -ARM + 0.21] },
    { build: () => chamberstick({ height: 0.05, intensity: 1.1, range: 4 }), at: [-1.95, -ARM + 0.21], y: 0.8 },
    { build: askewFrame, at: [-2.05, -ARM - 0.005], y: 1.35, walls: ["top", "left"] },
    { build: () => pictureFrame({ frame: "brass" }), at: [ARM + 0.005, -2.05], y: 1.4, turn: -90, walls: ["top", "right"] },
    { build: () => cobweb({ form: "slung" }), at: [-ARM + 0.29, INNER - 0.29], y: 3.05, turn: -45, walls: ["bottom", "left"] },
  ],
  lights: [
    { at: [HOLE_MIDDLE[0], 0.08, HOLE_MIDDLE[1]], colour: "wraithLight", intensity: 9, range: 8, flicker: 0.12, signal: 2 },
    { at: [0, 0.06, 0.3], colour: "wraith", intensity: 2.5, range: 4 },
  ],
  focus: [0.6, 0.4, 1.2],
  pawn: [-0.5, 0.45],
  spots: [[0.5, -0.5], [-0.55, -0.55], [0.55, 0.5], [-1.8, 0.45], [0.5, -1.8]],
  lanes: crossLanes(),
};
