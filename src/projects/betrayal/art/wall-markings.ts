import * as THREE from "three";
import { windowPool } from "./kit/decor";
import { paletteHex, type PaletteKey } from "./palette";
import { CUT_HEIGHT, DOOR_HEIGHT, WALL_THICKNESS } from "./room";
import { batch, box, glow, group, lightMaterial, type Batch } from "./shapes";

/*
 * The cutaway markings: how a wall's meaning to the rules survives being cut
 * down to its stub (see "Walls under the cutaway" in design/presentation.md).
 * A real door shows as a gap with a lit threshold; a window as glass on the
 * stub's cap with its pool of light on the floor; a false door or window, one
 * against a neighbour's wall, boarded up. The stub's cap takes a colour of
 * its own.
 *
 * These are the pieces the stage adds to a wall for them, each built in the
 * wall's own frame as `buildWall` builds a wall: x along it, y up, and its
 * inner face at z = `FACE`, towards the room.
 * Stub pieces stand on the cut-down wall and show only while it is cut; floor
 * pieces lie in front of it and show whatever the wall does.
 */

/** Where an opening lies in its wall: its centre along x, its width, and its bottom and top. */
export interface WallOpening {
  centre: number;
  width: number;
  bottom: number;
  top: number;
}

const FACE = WALL_THICKNESS / 2;
/** The stub's cap: the top of a wall cut down, in a colour of its own, so the cut reads as a line round every room. */
export const STUB_CAP: PaletteKey = "stoneLight";
/** A real doorway's threshold: a strip of warm light across the floor through the wall, reaching a little into the room. */
const THRESHOLD = { colour: "amber", opacity: 0.5, into: 0.08, lift: 0.012 } as const;
/** The frame on a stub's cap round a window's strip, and the glass or boards inside it: sunk a little into the cap, and set in a
 *  little from the stub's faces, so its sunk foot never shares their planes. */
const CAP_FRAME = { rail: 0.04, height: 0.03, sink: 0.005, inset: 0.002 } as const;
/** Boards nailed across a false opening, standing clear of the casings in front of it. */
const BOARD = { thickness: 0.03, standOff: 0.09, height: 0.17, overhang: 0.14 } as const;

function lit(colour: PaletteKey, opacity: number): THREE.MeshBasicMaterial {
  const material = lightMaterial(opacity);
  material.color.set(paletteHex(colour));
  return material;
}

/** A flat rectangle facing up at height `y`, `width` along x and `depth` along z, centred at (x, z). */
function flatPatch(width: number, depth: number, x: number, z: number, y: number, material: THREE.Material): THREE.Mesh {
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).translate(x, y, z), material);
  patch.userData.noShadow = true;
  return patch;
}

/** The lit strip across a real doorway's floor. */
export function litThreshold(door: WallOpening): THREE.Mesh {
  const depth = WALL_THICKNESS + THRESHOLD.into;
  return flatPatch(door.width, depth, door.centre, -FACE + depth / 2, THRESHOLD.lift, lit(THRESHOLD.colour, THRESHOLD.opacity));
}

/** A window's own pool of light on the floor, falling straight out of it into the room. */
export function windowLight(window: WallOpening): THREE.Mesh {
  const pool = windowPool();
  pool.position.set(window.centre, 0, FACE);
  return pool;
}

/** Boards laid side by side across a strip `width` long and `depth` deep, standing on `y`: a boarded opening seen from
 *  above. Like a window's glass on the cap, they are a marking, shown unlit, so they read in a room with no lamp. */
function capBoards(width: number, depth: number, x: number, y: number): THREE.Mesh {
  const boards = batch();
  const count = Math.max(2, Math.round(width / 0.16));
  const step = width / count;
  for (let i = 0; i < count; i++) {
    // Uneven heights and two woods, so they read as boards rather than stripes.
    boards.block([step - 0.02, 0.018 + (i % 2) * 0.008, depth + 0.01], i % 3 === 1 ? "wood" : "woodMid", [x - width / 2 + (i + 0.5) * step, y, 0]);
  }
  const mesh = boards.mesh();
  mesh.material.dispose();
  return new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

/** The frame on the stub's cap above a window, and what fills it: glass for a real window, boards for a false one. */
export function capWindow(window: WallOpening, trim: THREE.Material, blocked: boolean): THREE.Group {
  const { rail, height, sink, inset } = CAP_FRAME;
  const y = CUT_HEIGHT - sink;
  const x = window.centre;
  const inner = WALL_THICKNESS - (rail + inset) * 2;
  const frame = group(
    box([window.width + rail * 2, height, rail], trim, [x, y, -FACE + inset + rail / 2]),
    box([window.width + rail * 2, height, rail], trim, [x, y, FACE - inset - rail / 2]),
    box([rail, height, inner], trim, [x - window.width / 2 - rail / 2, y, 0]),
    box([rail, height, inner], trim, [x + window.width / 2 + rail / 2, y, 0]),
  );
  if (blocked) frame.add(capBoards(window.width, inner, x, y));
  else frame.add(flatPatch(window.width, inner, x, 0, CUT_HEIGHT + height / 2, glow("moon")), box([rail / 2, height, inner], trim, [x, y, 0]));
  return frame;
}

/** Nails boards across an opening on the wall's inner face, at these heights above `from`, each tilted a little; a board that would rise past `height` is left off. */
function nailBoards(boards: Batch, opening: WallOpening, from: number, height: number, rows: number[]) {
  const z = FACE + BOARD.standOff;
  const length = opening.width + BOARD.overhang * 2;
  rows.forEach((at, i) => {
    const y = from + at;
    if (y + BOARD.height > height) return;
    const tilt = THREE.MathUtils.degToRad([3, -4, 2, -2, 4][i % 5]);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(opening.centre, y + BOARD.height / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)), new THREE.Vector3(1, 1, 1));
    boards.add([length, BOARD.height, BOARD.thickness], i % 2 ? "woodMid" : "woodLight", matrix);
  });
}

/** A false window boarded up: boards across its opening, in a wall standing full. */
export function boardedWindow(window: WallOpening): THREE.Mesh {
  const span = window.top - window.bottom;
  const boards = batch();
  nailBoards(boards, window, window.bottom, window.top, [0.08, span * 0.3, span * 0.55, span - BOARD.height - 0.08]);
  return boards.mesh();
}

/** A false door boarded up over its shut leaf, in a wall `height` tall: the boards that fit, with a brace behind them
 *  when the wall stands full, and boards across the stub's cap when it is cut, so it reads from every side. */
export function boardedDoor(door: WallOpening, height: number): THREE.Group {
  const boards = batch();
  nailBoards(boards, door, 0, height, [0.12, 0.95, 1.7]);
  if (height < DOOR_HEIGHT) return group(boards.mesh(), capBoards(door.width + CAP_FRAME.rail * 2, WALL_THICKNESS, door.centre, height - CAP_FRAME.sink));
  // The brace runs corner to corner inside the doorway, between the leaf and the boards, so it crosses neither.
  const rise = 1.6;
  const run = door.width - 0.2;
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(door.centre, 0.3 + rise / 2, 0.065), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(rise, run))), new THREE.Vector3(1, 1, 1));
  boards.add([Math.hypot(run, rise), 0.14, 0.03], "wood", matrix);
  return group(boards.mesh());
}
