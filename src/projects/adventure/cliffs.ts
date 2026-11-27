import type { NaturePiece } from "./nature-kit";
import type { Placement } from "./town";
import type { Cell } from "./ways";

/**
 * The Nature Kit's cliffs, derived from the ground's heights as a path's tiles
 * are from its neighbours: every face, corner and post round raised ground
 * follows from the height differences, so a broken cliff can't be built.
 *
 * Heights are in half storeys. The kit's faces are thin walls along a cell's
 * +z edge, their outside facing back into the cell, a storey high: so a face
 * stands in the low cell at the foot of a rise, against the raised cell, and
 * a rise of two storeys is two faces stacked, the upper one with the grass lip
 * of the top (`cliff_top_*`). Round an outer corner of the rise the faces of
 * the two sides end at the corner's two cells, and a post stands in the low
 * cell between them, in its −x, +z corner unturned (`cliff_corner_*`); round
 * an inner corner one piece faces both sides (`cliff_cornerInner_*`, along its
 * +z and −x edges). A low cell between two rises on opposite sides has a face
 * on each; one walled in on three or four sides has an inner corner at every
 * corner where two meet. Where a rise climbs only half a storey, its faces are
 * the kit's half faces, sloped, with their own lip.
 *
 * Each raised cell says how the faces round it are made (`Cliff`): in the
 * kit's two stones, `stone`, grey, and `rock`, sandstone; and plain, large (a
 * face more than twice as thick for every storey but the top one, which keeps
 * the plain top) or steps (a whole cell of stairs climbing a storey toward its
 * +z, its corners a pyramid of stairs and a stair cut into an inner corner).
 * A face whose raised cell is water is a waterfall, the water going over the
 * edge (`cliff_waterfall_*` below its top storey, `cliff_waterfallTop_*` at it).
 *
 * A low cell may show another face at its own level in place of the plain one
 * (`Face`): a flight of steps up to the cell it faces, a walled ramp (the
 * kit's half-storey ramp up a half storey), or a cave's mouth. And a low cell
 * at a corner of a rise may be cut on the diagonal: the kit's diagonal face
 * runs across it from its −x, −z corner to its +x, +z one, the raised side
 * toward its −x, +z unturned, storey on storey up to the lower of the two
 * raised sides, and its triangle of top is the diagonal block's; no post
 * stands at its corners. Each stands only where it fits; elsewhere the cell
 * shows the faces it would without it.
 */

export type Rock = "rock" | "stone";
export type Edge = "plain" | "large" | "steps";

/** How the faces round a raised cell are made. */
export interface Cliff {
  rock: Rock;
  edge: Edge;
}

/** What a low cell shows at its own level in place of the plain face. */
export type Face = "steps" | "ramp" | "cave" | "cut";
export const FACES: readonly Face[] = ["steps", "ramp", "cave", "cut"];

/** What the cliffs are derived from, cell by cell; off the grid and where there is no ground, a cell is at 0 and nothing of its own stands. */
export interface Terrain {
  /** The cell's height, in half storeys: 0 where there is no ground. */
  level(x: number, z: number): number;
  /** Whether the cell has ground: none off the grid, nor in an empty cell. */
  ground(x: number, z: number): boolean;
  water(x: number, z: number): boolean;
  cliff(x: number, z: number): Cliff;
  face(x: number, z: number): Face | undefined;
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

interface Names {
  face: string;
  corner: string;
  inner: string;
}
const PIECES: Record<Edge | "half", Names> = {
  plain: { face: "cliff_", corner: "cliff_corner_", inner: "cliff_cornerInner_" },
  large: { face: "cliff_large_", corner: "cliff_cornerLarge_", inner: "cliff_cornerInnerLarge_" },
  steps: { face: "cliff_steps_", corner: "cliff_stepsCorner_", inner: "cliff_stepsCornerInner_" },
  half: { face: "cliff_half_", corner: "cliff_halfCorner_", inner: "cliff_halfCornerInner_" },
};
const TOP: Names = { face: "cliff_top_", corner: "cliff_cornerTop_", inner: "cliff_cornerInnerTop_" };

const piece = (name: string, rock: Rock): NaturePiece => `${name}${rock}` as NaturePiece;

/** A cut cell's two raised sides and the height its diagonal reaches, or null where a cut doesn't fit: not two neighbouring sides higher by whole storeys. */
function cutOf(t: Terrain, x: number, z: number): { a: Step; b: Step; top: number } | null {
  if (t.face(x, z) !== "cut" || !t.ground(x, z)) return null;
  const own = t.level(x, z);
  const sides = ORTHOGONAL.filter(([dx, dz]) => t.level(x + dx, z + dz) > own);
  if (sides.length !== 2) return null;
  const [a, b] = sides;
  if (a[0] + b[0] === 0 && a[1] + b[1] === 0) return null;
  const top = Math.min(t.level(x + a[0], z + a[1]), t.level(x + b[0], z + b[1]));
  return (top - own) % 2 === 0 ? { a, b, top } : null;
}

/** Whether a cut cell has this corner of the grid, by the cell it is the −x, −z corner of: where a diagonal face meets the straight ones and no post stands. */
function cutCorner(t: Terrain, cx: number, cz: number): boolean {
  return [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]].some(([x, z]) => cutOf(t, x, z) !== null);
}

/** The cliff pieces standing in one cell: every face, corner and post up from its level to its highest neighbour, or its diagonal where it is cut. */
export function cliffPieces(t: Terrain, x: number, z: number): Placement[] {
  const cut = cutOf(t, x, z);
  if (cut !== null) return cutPieces(t, x, z, cut);
  const own = t.level(x, z);
  const level = ([dx, dz]: Step): number => t.level(x + dx, z + dz);
  const top = Math.max(...[...ORTHOGONAL, ...DIAGONAL].map(level));
  const placed: Placement[] = [];
  for (let layer = own; layer < top; ) {
    const { pieces, step } = layerAt(layer);
    placed.push(...pieces);
    layer += step;
  }
  return placed;

  /** The pieces of one layer, a storey high or half a storey where a side climbs only that, and how high it is. */
  function layerAt(layer: number): { pieces: Placement[]; step: number } {
    const above = (s: Step): boolean => level(s) > layer;
    const sides = ORTHOGONAL.filter(above);
    const posts = DIAGONAL.filter(
      (d) => above(d) && !above([d[0], 0]) && !above([0, d[1]]) && !cutCorner(t, x + (d[0] > 0 ? 1 : 0), z + (d[1] > 0 ? 1 : 0)),
    );
    const half = [...sides, ...posts].some((s) => level(s) === layer + 1);
    const isTop = (s: Step): boolean => level(s) === layer + 2;
    const cliff = ([dx, dz]: Step): Cliff => t.cliff(x + dx, z + dz);
    const names = (s: Step, top: boolean): Names => (half ? PIECES.half : cliff(s).edge === "steps" ? PIECES.steps : top ? TOP : PIECES[cliff(s).edge]);
    const y = layer / 2;
    const pieces: Placement[] = [];

    const paired = new Set<number>();
    for (let i = 0; i < 4; i++) {
      const [a, b] = [ORTHOGONAL[i], ORTHOGONAL[(i + 1) % 4]];
      if (!above(a) || !above(b)) continue;
      paired.add(i).add((i + 1) % 4);
      // The side first in ORTHOGONAL names the corner.
      const first = i === 3 ? b : a;
      const name = names(first, isTop(a) && isTop(b)).inner;
      pieces.push({ piece: piece(name, cliff(first).rock), x, z, y, turn: cornerTurn([a[0] + b[0], a[1] + b[1]]) });
    }
    ORTHOGONAL.forEach((s, i) => {
      if (above(s) && !paired.has(i)) pieces.push({ piece: faceAt(s), x, z, y, turn: faceTurn(s) });
    });
    for (const d of posts) pieces.push({ piece: piece(names(d, isTop(d)).corner, cliff(d).rock), x, z, y, turn: cornerTurn(d) });
    return { pieces, step: half ? 1 : 2 };

    /** A lone face: a waterfall where its raised cell is water, the cell's own face at its own level, or the plain one. */
    function faceAt(s: Step): NaturePiece {
      const { rock } = cliff(s);
      if (!half && t.water(x + s[0], z + s[1])) return piece(isTop(s) ? "cliff_waterfallTop_" : "cliff_waterfall_", rock);
      const face = layer === own && t.ground(x, z) ? t.face(x, z) : undefined;
      if (face === "steps") return piece(half ? "cliff_blockSlopeHalfWalls_" : "cliff_steps_", rock);
      if (face === "ramp") return piece(half ? "cliff_blockSlopeHalfWalls_" : "cliff_blockSlopeWalls_", rock);
      if (face === "cave" && !half) return piece("cliff_cave_", rock);
      return piece(names(s, isTop(s)).face, rock);
    }
  }
}

/** A corner cell cut on the diagonal: its faces across it, storey on storey, and the diagonal block's top over the top one. */
function cutPieces(t: Terrain, x: number, z: number, { a, b, top }: { a: Step; b: Step; top: number }): Placement[] {
  const turn = cornerTurn([a[0] + b[0], a[1] + b[1]]);
  const { rock } = t.cliff(x + a[0], z + a[1]);
  const out: Placement[] = [];
  for (let layer = t.level(x, z); layer < top; layer += 2) {
    out.push({ piece: piece(layer === top - 2 ? "cliff_topDiagonal_" : "cliff_diagonal_", rock), x, z, y: layer / 2, turn });
  }
  out.push({ piece: piece("cliff_blockDiagonal_", rock), x, z, y: top / 2 - 1, turn });
  return out;
}

/** Cells raised to a height, as a rectangle from its −x, −z corner cell to its +x, +z one. */
export interface Raised {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** In storeys, or half storeys for a half rise. */
  height: number;
}

/** A rise as the code lays one: rectangles of raised cells, how their faces are made, and the faces and cuts of cells round them. */
export interface Rise {
  rock: Rock;
  /** How its faces are made, or half: a rise whose heights are half storeys. */
  edge: Edge | "half";
  /** The raised cells, later rectangles over earlier ones. */
  raised: readonly Raised[];
  /** Low cells showing another face at their level. */
  faces?: readonly { x: number; z: number; face: Exclude<Face, "cut"> }[];
  /** Corner cells cut on the diagonal. */
  cuts?: readonly Cell[];
}

/** A rise's cells: each raised cell's height in half storeys and its cliff, and each face. */
export function riseCells(spec: Rise): { heights: Map<string, { height: number; cliff: Cliff }>; faces: Map<string, Face> } {
  const cliff: Cliff = { rock: spec.rock, edge: spec.edge === "half" ? "plain" : spec.edge };
  const halves = spec.edge === "half" ? 1 : 2;
  const heights = new Map<string, { height: number; cliff: Cliff }>();
  for (const r of spec.raised) {
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) heights.set(`${x},${z}`, { height: r.height * halves, cliff });
  }
  const faces = new Map<string, Face>();
  for (const [x, z] of spec.cuts ?? []) {
    heights.delete(`${x},${z}`);
    faces.set(`${x},${z}`, "cut");
  }
  for (const f of spec.faces ?? []) faces.set(`${f.x},${f.z}`, f.face);
  return { heights, faces };
}

/** The terrain of some rises on flat grass and nothing else: what the code's rises raise, for the country to keep its scatter clear of. */
export function risesTerrain(rises: readonly Rise[]): Terrain {
  const heights = new Map<string, { height: number; cliff: Cliff }>();
  const faces = new Map<string, Face>();
  for (const spec of rises) {
    const cells = riseCells(spec);
    for (const [cell, h] of cells.heights) heights.set(cell, h);
    for (const [cell, f] of cells.faces) faces.set(cell, f);
  }
  const flat: Cliff = { rock: "stone", edge: "plain" };
  return {
    level: (x, z) => heights.get(`${x},${z}`)?.height ?? 0,
    ground: () => true,
    water: () => false,
    cliff: (x, z) => heights.get(`${x},${z}`)?.cliff ?? flat,
    face: (x, z) => faces.get(`${x},${z}`),
  };
}
