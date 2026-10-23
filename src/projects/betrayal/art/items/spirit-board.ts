import * as THREE from "three";
import { ball, ellipsoid, rod, roundBox, sculpt, stretched, union, type Distance } from "../forms";
import { figureParts } from "../figure-parts";
import { assembled, FACE_UP, itemModel, piece } from "./item";

/*
 * The Spirit Board (omen): a talking board, its alphabet in two arcs, its
 * numbers in a row under them, a sun and a moon in its top corners and the
 * farewell along its foot, framed in a dark violet border; on it the
 * planchette, a pale heart with a window, resting where the thumb pins it.
 * It reads by the broad, flat board held up face to the front, its warm wood
 * and the dark arcs of its letters; the Book, the other flat thing held up,
 * is thick, violet and pale-edged.
 *
 * In life it takes two hands, flat on a table. One-handed, it is held up by
 * the edge to show it, as a sign is: the right hand grips a handhold cut in
 * the board's near edge (a slot behind a rail, as a tray's), so the fist
 * closes round wood and nothing else, the board reaching out from the back
 * of the hand away from the body (−x), letters to the front, the planchette
 * held to the face by the thumb's side of the grip.
 */

/** The board: from its near edge, just past the handhold, out to its far edge (−x), its height over and under the grip, and its thickness. */
const BOARD = { near: -0.06, far: -0.4, low: -0.11, high: 0.13, half: 0.009 };
/** The handhold: the rail the fist closes round, along the board's near edge, and the slot behind it. */
const RAIL = { radius: 0.0115, low: -0.068, high: 0.068 };
const across = (BOARD.near + BOARD.far) / 2;
const wide = (BOARD.near - BOARD.far) / 2;
const up = (BOARD.low + BOARD.high) / 2;
const tall = (BOARD.high - BOARD.low) / 2;

/** Where the letters are: a mark at each, along two arcs and a row, on the board's face. */
function marks(): [number, number][] {
  const arc = (count: number, lift: number, sag: number): [number, number][] =>
    Array.from({ length: count }, (_, k) => {
      const t = (k + 0.5) / count;
      return [BOARD.far + 0.03 + (wide * 2 - 0.06) * t, up + lift - sag * (1 - Math.sin(Math.PI * t))];
    });
  const row = (count: number, y: number, from: number, to: number): [number, number][] =>
    Array.from({ length: count }, (_, k) => [from + ((to - from) * (k + 0.5)) / count, y]);
  return [...arc(13, 0.07, 0.022), ...arc(13, 0.03, 0.022), ...row(10, up - 0.018, BOARD.far + 0.06, BOARD.near - 0.06)];
}

/** The board's face, its border, sun and moon, letters and farewell, painted on one slab with its handhold cut through it. */
function boardGeometry(): THREE.BufferGeometry {
  const face = BOARD.half;
  const onFace = (z: number) => face - 0.0012 - z;
  const glyphs = marks();
  const letters: Distance = (x, y, z) => {
    let d = Infinity;
    for (const [gx, gy] of glyphs) d = Math.min(d, Math.max(Math.abs(x - gx) - 0.0035, Math.abs(y - gy) - 0.0075));
    return Math.max(d, onFace(z));
  };
  const sun: [number, number] = [BOARD.far + 0.045, BOARD.high - 0.04];
  const moon: [number, number] = [BOARD.near - 0.045, BOARD.high - 0.04];
  return sculpt()
    .add(roundBox([across, up, 0], [wide, tall, BOARD.half], 0.006), "woodLight")
    // The near edge's top and foot reach back to the rail, round the slot the hand goes through.
    .add(roundBox([BOARD.near / 2, (RAIL.high + BOARD.high) / 2, 0], [-BOARD.near / 2, (BOARD.high - RAIL.high) / 2, BOARD.half], 0.006), "woodLight", 0.006)
    .add(roundBox([BOARD.near / 2, (RAIL.low + BOARD.low) / 2, 0], [-BOARD.near / 2, (RAIL.low - BOARD.low) / 2, BOARD.half], 0.006), "woodLight", 0.006)
    .add(rod([0, RAIL.low - 0.01, 0], [0, RAIL.high + 0.01, 0], RAIL.radius), "woodLight", 0.008)
    // The border, dark violet round the face, and a fine line inside it.
    .paint((x, y, z) => Math.max(onFace(z), 0.014 - Math.min(x - BOARD.far, BOARD.near - x + 0.06, y - BOARD.low, BOARD.high - y)), "bruise")
    .paint((x, y, z) => Math.max(onFace(z), Math.abs(Math.min(x - BOARD.far, y - BOARD.low, BOARD.high - y) - 0.021) - 0.0015, BOARD.far + 0.022 - x, x - BOARD.near + 0.04), "bruiseDark")
    .paint(letters, "soot")
    // The sun and the moon, pale, the moon a crescent.
    .paint((x, y, z) => Math.max(onFace(z), Math.hypot(x - sun[0], y - sun[1]) - 0.018), "bone")
    .paint((x, y, z) => Math.max(onFace(z), Math.hypot(x - moon[0], y - moon[1]) - 0.018, 0.016 - Math.hypot(x - moon[0] - 0.008, y - moon[1] - 0.004)), "bone")
    // The farewell, a dark line along the foot.
    .paint((x, y, z) => Math.max(onFace(z), Math.abs(y - BOARD.low - 0.04) - 0.004, Math.abs(x - across + 0.01) - 0.07), "soot")
    .geometry(0.0021);
}

/** Where the planchette rests on the face: near the hand, as if the thumb's side of the grip holds it there. */
const PLANCHETTE = { x: BOARD.near - 0.085, y: up - 0.045, z: BOARD.half + 0.006 };

/** The planchette: a pale heart pointing up at the letters, its round window, and its three short legs. */
function planchetteGeometry(): THREE.BufferGeometry {
  const { x, y, z } = PLANCHETTE;
  const heart = union(ellipsoid([x - 0.022, y - 0.006, z], [0.028, 0.03, 0.006]), ellipsoid([x + 0.022, y - 0.006, z], [0.028, 0.03, 0.006]));
  return sculpt()
    .add(heart, "boneLight")
    .add(stretched(rod([x, y - 0.025, z], [x, y + 0.045, z], 0.03, 0.004), [x, y, z], [1, 1, 0.2]), "boneLight", 0.02)
    .carve(ball([x, y + 0.002, z + 0.004], 0.0115), { colour: "moonLight", blend: 0.002 })
    .add(rod([x - 0.035, y - 0.02, z - 0.002], [x - 0.035, y - 0.02, z - 0.009], 0.004), "boneDark", 0.002)
    .add(rod([x + 0.035, y - 0.02, z - 0.002], [x + 0.035, y - 0.02, z - 0.009], 0.004), "boneDark", 0.002)
    .add(rod([x, y + 0.04, z - 0.002], [x, y + 0.04, z - 0.009], 0.003), "boneDark", 0.002)
    .geometry(0.0018);
}

const PARTS = figureParts("item:spirit-board", () => ({ board: boardGeometry(), planchette: planchetteGeometry() }));

function spiritBoard(): THREE.Group {
  const parts = PARTS.get();
  const board = piece(parts.board, "spirit board");
  const planchette = piece(parts.planchette, "planchette");
  return assembled("spirit board", [board, planchette], [{ between: [board, planchette], at: [PLANCHETTE.x, PLANCHETTE.y, BOARD.half], radius: 0.06 }]);
}

export const SPIRIT_BOARD = itemModel({
  card: "spirit-board",
  parts: [PARTS],
  held: () => ({ object: spiritBoard(), handle: RAIL.radius, carry: "upright" }),
  plate: FACE_UP,
});
