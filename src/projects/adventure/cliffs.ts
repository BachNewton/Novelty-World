import type { NaturePiece } from "./nature-kit";
import type { Placement } from "./town";
import type { Cell } from "./ways";

/**
 * The Nature Kit's cliffs, raised from the ground as the kit builds them.
 *
 * Its cliff faces are thin walls along a cell's +z edge, their outside facing
 * back into the cell, a storey high: so a face stands in the low cell at the
 * foot of a rise, against the raised cell, and a rise of two storeys is two
 * faces stacked, the upper one with the grass lip of the top (`cliff_top_*`).
 * Round an outer corner of the rise the faces of the two sides end at the
 * corner's two cells, and a post stands in the low cell between them, in its
 * −x, +z corner unturned (`cliff_corner_*`); round an inner corner one piece
 * faces both sides (`cliff_cornerInner_*`, along its +z and −x edges). The
 * raised cells are floored with the kit's grass tile, a storey up for each
 * storey of the rise.
 *
 * Each face comes in four edges: plain; large, a face more than twice as
 * thick, for a rise's lower storeys (its top storey keeps the plain top);
 * steps, a whole cell of stairs climbing a storey toward its +z, its corners a
 * pyramid of stairs and a stair cut into an inner corner; and half, a sloped
 * face half a storey high with its own lip, for a low terrace. Each in the
 * kit's two stones: `rock`, sandstone, and `stone`, grey.
 *
 * A raised corner can be cut on the diagonal: the kit's diagonal face runs
 * across the corner cell from its −x, −z corner to its +x, +z one, the raised
 * side toward its −x, +z, and its triangle of top is the diagonal block's.
 */

export type Rock = "rock" | "stone";
export type Edge = "plain" | "large" | "steps" | "half";

/** Cells raised to a height, as a rectangle from its −x, −z corner cell to its +x, +z one. */
export interface Raised {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** In storeys, or half storeys for a half edge. */
  height: number;
}

export interface Rise {
  rock: Rock;
  edge: Edge;
  /** The raised cells, later rectangles over earlier ones. */
  raised: readonly Raised[];
  /** Faces swapped for another piece standing the same: a waterfall, a cave mouth. */
  faces?: readonly { x: number; z: number; storey: number; piece: NaturePiece }[];
  /** Low cells whose face is a flight of steps instead, climbing to the cell it faced. */
  steps?: readonly Cell[];
  /** Raised corner cells cut on the diagonal. */
  cuts?: readonly Cell[];
  /** Raised cells floored with something else: a stream or path at the top, steps climbing on. */
  bare?: readonly Cell[];
  /** The ground's extent: no face stands beyond it. */
  bounds: { min: number; max: number };
}

type Step = readonly [dx: number, dz: number];
const ORTHOGONAL: readonly Step[] = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const DIAGONAL: readonly Step[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const quarter = ([dx, dz]: Step): Step => [dz, -dx];

/** The quarter turns that take a piece's own step onto `to`. */
function turnTo(own: Step, to: Step): number {
  let step = own;
  for (let turn = 0; turn < 4; turn++) {
    if (step[0] === to[0] && step[1] === to[1]) return turn;
    step = quarter(step);
  }
  throw new Error(`adventure: no turn takes ${own.join(",")} to ${to.join(",")}`);
}
/** A face's turn: unturned it backs onto the cell at its +z. */
const faceTurn = (toward: Step): number => turnTo([0, 1], toward);
/** A corner's turn: unturned its corner is the cell's −x, +z. */
const cornerTurn = (toward: Step): number => turnTo([-1, 1], toward);

const PIECES: Record<Edge, { face: string; corner: string; inner: string }> = {
  plain: { face: "cliff_", corner: "cliff_corner_", inner: "cliff_cornerInner_" },
  large: { face: "cliff_large_", corner: "cliff_cornerLarge_", inner: "cliff_cornerInnerLarge_" },
  steps: { face: "cliff_steps_", corner: "cliff_stepsCorner_", inner: "cliff_stepsCornerInner_" },
  half: { face: "cliff_half_", corner: "cliff_halfCorner_", inner: "cliff_halfCornerInner_" },
};
const TOP = { face: "cliff_top_", corner: "cliff_cornerTop_", inner: "cliff_cornerInnerTop_" };

const key = (x: number, z: number): string => `${x},${z}`;

/** A rise's pieces: its faces, corners and steps in the low cells round it, and its floor of grass on top. */
export function rise(spec: Rise): Placement[] {
  const height = new Map<string, number>();
  for (const r of spec.raised) {
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) height.set(key(x, z), r.height);
  }
  const cuts = new Set((spec.cuts ?? []).map(([x, z]) => key(x, z)));
  for (const cut of cuts) height.delete(cut);
  const h = (x: number, z: number): number => height.get(key(x, z)) ?? 0;
  const storey = spec.edge === "half" ? 0.5 : 1;
  const piece = (name: string): NaturePiece => `${name}${spec.rock}` as NaturePiece;
  const swapped = new Map((spec.faces ?? []).map((f) => [`${f.x},${f.z},${f.storey}`, f.piece]));
  const stepped = new Set((spec.steps ?? []).map(([x, z]) => key(x, z)));
  /** The corners of cut cells, where a diagonal face meets the straight ones and no post stands. */
  const cutCorners = new Set([...cuts].flatMap((c) => {
    const [x, z] = c.split(",").map(Number);
    return [key(x, z), key(x + 1, z), key(x, z + 1), key(x + 1, z + 1)];
  }));
  const placed: Placement[] = [];

  const xs = spec.raised.flatMap((r) => [r.x0, r.x1]);
  const zs = spec.raised.flatMap((r) => [r.z0, r.z1]);
  const [lo, hi] = [spec.bounds.min, spec.bounds.max];
  for (let x = Math.max(lo, Math.min(...xs) - 1); x <= Math.min(hi, Math.max(...xs) + 1); x++) {
    for (let z = Math.max(lo, Math.min(...zs) - 1); z <= Math.min(hi, Math.max(...zs) + 1); z++) {
      if (cuts.has(key(x, z))) {
        placed.push(...cut(x, z));
        continue;
      }
      const top = Math.max(...[...ORTHOGONAL, ...DIAGONAL].map(([dx, dz]) => h(x + dx, z + dz)));
      for (let layer = h(x, z); layer < top; layer++) placed.push(...layerAt(x, z, layer));
    }
  }

  /** The faces in a low cell at one storey: toward each side raised above it, round an inner corner, or a post at an outer one. */
  function layerAt(x: number, z: number, layer: number): Placement[] {
    const above = (s: Step): boolean => h(x + s[0], z + s[1]) > layer;
    const isTop = (s: Step): boolean => h(x + s[0], z + s[1]) === layer + 1;
    const names = (s: Step): { face: string; corner: string; inner: string } =>
      isTop(s) && spec.edge !== "steps" && spec.edge !== "half" ? TOP : PIECES[spec.edge];
    const y = layer * storey;
    const sides = ORTHOGONAL.filter(above);
    const out: Placement[] = [];
    if (sides.length > 2 || (sides.length === 2 && sides[0][0] + sides[1][0] === 0 && sides[0][1] + sides[1][1] === 0)) {
      throw new Error(`adventure: the cliff at ${x},${z} rises on opposite or three sides, which the kit has no piece for`);
    }
    if (sides.length === 2) {
      const [a, b] = sides;
      if (isTop(a) !== isTop(b)) throw new Error(`adventure: the inner corner at ${x},${z} meets rises of two heights`);
      out.push({ piece: piece(names(a).inner), x, z, y, turn: cornerTurn([a[0] + b[0], a[1] + b[1]]) });
    } else if (sides.length === 1) {
      const [s] = sides;
      const swap = swapped.get(`${x},${z},${layer}`);
      const stairs = stepped.has(key(x, z)) && layer === h(x, z);
      out.push({ piece: swap ?? (stairs ? piece("cliff_steps_") : piece(names(s).face)), x, z, y, turn: faceTurn(s) });
    }
    for (const d of DIAGONAL) {
      if (!above(d) || above([d[0], 0]) || above([0, d[1]])) continue;
      if (cutCorners.has(key(x + (d[0] > 0 ? 1 : 0), z + (d[1] > 0 ? 1 : 0)))) continue;
      out.push({ piece: piece(names(d).corner), x, z, y, turn: cornerTurn(d) });
    }
    return out;
  }

  /** A corner cell cut on the diagonal: its faces across it, storey on storey, and the diagonal block's top over the top one. */
  function cut(x: number, z: number): Placement[] {
    const sides = ORTHOGONAL.filter(([dx, dz]) => h(x + dx, z + dz) > 0);
    if (sides.length !== 2) throw new Error(`adventure: the cut corner at ${x},${z} isn't at a corner of its rise`);
    const [a, b] = sides;
    const turn = cornerTurn([a[0] + b[0], a[1] + b[1]]);
    const storeys = Math.min(h(x + a[0], z + a[1]), h(x + b[0], z + b[1]));
    const out: Placement[] = [];
    for (let layer = 0; layer < storeys; layer++) {
      out.push({ piece: piece(layer === storeys - 1 ? "cliff_topDiagonal_" : "cliff_diagonal_"), x, z, y: layer * storey, turn });
    }
    out.push({ piece: piece("cliff_blockDiagonal_"), x, z, y: (storeys - 1) * storey, turn });
    return out;
  }

  const bare = new Set((spec.bare ?? []).map(([x, z]) => key(x, z)));
  for (const [cell, storeys] of height) {
    if (bare.has(cell)) continue;
    const [x, z] = cell.split(",").map(Number);
    placed.push({ piece: "ground_grass", x, z, y: storeys * storey });
  }
  return placed;
}
