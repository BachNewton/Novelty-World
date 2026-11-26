import type { NaturePiece } from "./nature-kit";

/** A cell of the grid, by its −x, −z corner: cell (0, 0) spans 0 to 1 on x and z. */
export type Cell = readonly [x: number, z: number];

/** The ground's extent: the whole grid, 80 cells a side, centred on the origin: the village in its middle and the country round it. */
export const GROUND: { readonly min: number; readonly max: number } = { min: -40, max: 39 };

/** A tile laid on a cell, with the quarter turns it takes (anticlockwise seen from above). */
export interface Tile {
  x: number;
  z: number;
  piece: NaturePiece;
  turn: number;
}

/** What a run of the Nature Kit's ground tiles is: a dirt track sunk in the grass, or water in its bed. */
export type Ground = "path" | "river";

/** A step on the grid: across x, then across z. */
export type Step = readonly [dx: number, dz: number];

const ORTHOGONAL: readonly Step[] = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const DIAGONAL: readonly Step[] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

/** A step turned a quarter anticlockwise seen from above, as a piece is: its +x goes to −z. */
const quarter = ([dx, dz]: Step): Step => [dz, -dx];
const sameStep = (a: Step, b: Step): boolean => a[0] === b[0] && a[1] === b[1];
const sameSteps = (a: readonly Step[], b: readonly Step[]): boolean => a.length === b.length && a.every((s) => b.some((t) => sameStep(s, t)));

/** The turn that takes a tile's own steps onto the ones a cell asks for, or null when none does. */
function turnOnto(own: readonly Step[], asked: readonly Step[]): number | null {
  let steps = own;
  for (let turn = 0; turn < 4; turn++) {
    if (sameSteps(steps, asked)) return turn;
    steps = steps.map(quarter);
  }
  return null;
}

/**
 * The tiles for a way one cell wide, and the cells each leads to unturned, as
 * seen on the bench. A narrow way runs into a wide stretch as into another
 * narrow one, its banks meeting the nubs of the stretch's `SideOpen`.
 */
const NARROW: readonly { name: string; ways: readonly Step[] }[] = [
  { name: "EndClosed", ways: [[0, 1]] },
  { name: "Straight", ways: [[0, -1], [0, 1]] },
  { name: "Bend", ways: [[0, 1], [1, 0]] },
  { name: "Split", ways: [[-1, 0], [1, 0], [0, 1]] },
  { name: "Cross", ways: [[-1, 0], [1, 0], [0, -1], [0, 1]] },
];

/**
 * The tiles inside a wide stretch, two cells or more across, unturned: which
 * of their sides meet the grass (a bank along that side), and which of their
 * corners alone do (a small rounded nub there). `SideOpen` is the stretch's
 * edge where a narrow way leaves it, at its +z.
 */
const WIDE: readonly { name: string; banks: readonly Step[]; nubs: readonly Step[] }[] = [
  { name: "Open", banks: [], nubs: [] },
  { name: "CornerSmall", banks: [], nubs: [[-1, 1]] },
  { name: "SideOpen", banks: [], nubs: [[-1, 1], [1, 1]] },
  { name: "Side", banks: [[0, -1]], nubs: [] },
  { name: "Corner", banks: [[-1, 0], [0, -1]], nubs: [] },
];

/** Which tile a rough stretch takes in place of its plain one: a straight run strewn with rocks, a bend with a wide bank round its outside. */
const ROUGH: Readonly<Record<string, string>> = { Straight: "Rocks", Bend: "BendBank" };

/**
 * The tiles the kit makes for one shape, the plain one first, as the bench
 * shows them: each joins the same neighbours the same way and differs only in
 * how it looks (a straight strewn with rocks, a bend with a wide bank round
 * its outside, an end running out level rather than closed in a bank).
 */
export const VARIANTS: Readonly<Partial<Record<string, readonly string[]>>> = {
  Straight: ["Straight", "Rocks"],
  Bend: ["Bend", "BendBank"],
  EndClosed: ["EndClosed", "End"],
};

/** A cell's tile by its name without its kind's prefix, and its turn. */
export interface Shape {
  name: string;
  turn: number;
}

/** Whether a cell holds the stretch. */
export type Has = (x: number, z: number) => boolean;

const key = ([x, z]: Cell): string => `${x},${z}`;

/**
 * The cells a way runs through, from its first cell to its last by each one
 * between, in straight runs along x or z; a run on a slant is a mistake.
 */
export function cellsAlong(way: readonly Cell[]): Cell[] {
  const cells: Cell[] = [way[0]];
  for (let i = 1; i < way.length; i++) {
    const [fx, fz] = way[i - 1];
    const [tx, tz] = way[i];
    if (fx !== tx && fz !== tz) throw new Error(`adventure: the way from ${key(way[i - 1])} to ${key(way[i])} runs on a slant`);
    const steps = Math.abs(tx - fx) + Math.abs(tz - fz);
    for (let s = 1; s <= steps; s++) cells.push([fx + (Math.sign(tx - fx) * s), fz + (Math.sign(tz - fz) * s)]);
  }
  return cells;
}

/**
 * The Nature Kit's tiles for a stretch of path or water over some cells: a way
 * one cell wide runs from cell to cell by its neighbours (its ends closed, its
 * bends and branches each turned to the cells it joins), a stretch two cells
 * or more across is open in its middle and banked round its rim, and a narrow
 * way leaving a wide stretch opens out where it meets it. A lone cell is a
 * small pit, or pond, of its own. `through` are cells that join the stretch
 * but take no tile of its own (water where a path crosses it, the foot of a
 * waterfall); `rough` are cells whose straight or bend takes its rough tile;
 * and `open` are ends that run out level onto the ground (the kit's `End`:
 * a path onto steps or a ramp, a ditch onto a field) rather than closing in a
 * rounded bank.
 */
export function tilesOf(ground: Ground, cells: readonly Cell[], through: readonly Cell[] = [], rough: readonly Cell[] = [], open: readonly Cell[] = []): Tile[] {
  const inside = new Set([...cells, ...through].map(key));
  const has = (x: number, z: number): boolean => inside.has(`${x},${z}`);
  const roughCells = new Set(rough.map(key));
  const openEnds = new Set(open.map(key));
  const tiles: Tile[] = [];
  // A cell two stretches share, where one runs into another, takes one tile.
  for (const [x, z] of new Map(cells.map((c) => [key(c), c])).values()) {
    const shape = shapeAt(x, z, has) ?? fail(`adventure: the ${ground} at ${x},${z} has a shape the kit has no tile for`);
    let tile = shape.name;
    if (openEnds.has(key([x, z]))) {
      if (tile !== "EndClosed") fail(`adventure: the way at ${x},${z} is to run out level but isn't an end`);
      tile = "End";
    }
    if (roughCells.has(key([x, z]))) tile = ROUGH[tile] ?? fail(`adventure: the ${ground} at ${x},${z} has no rough tile for ${tile}`);
    tiles.push({ x, z, piece: tilePiece(ground, tile), turn: shape.turn });
  }
  return tiles;
}

/** The kit's piece for a tile of a stretch of path or water. */
export function tilePiece(ground: Ground, tile: string): NaturePiece {
  return `${ground === "path" ? "ground_path" : "ground_river"}${tile}` as NaturePiece;
}

/**
 * The plain tile a cell of a stretch takes by which of its neighbours hold
 * the stretch too, or null where the kit has no tile for its shape: some
 * shapes of a wide stretch (a narrow way leaving it flush with its side, two
 * nubs across from each other) have none.
 */
export function shapeAt(x: number, z: number, has: Has): Shape | null {
  return wide(x, z, has) ? wideTile(x, z, has) : narrowTile(x, z, has);
}

/**
 * The tile a cell is laid with whatever its shape: its plain tile, or where
 * the kit has none for the shape, the narrow way joining the same neighbours,
 * so a stretch painted into any shape is laid joined up.
 */
export function laidShapeAt(x: number, z: number, has: Has): Shape {
  return shapeAt(x, z, has) ?? narrowTile(x, z, has);
}

/** The step by which an end's way goes on, from its turn: unturned, toward +z. */
export function endWay(turn: number): Step {
  return quarterTimes([0, 1], turn);
}

/** A cell is wide when some square of two cells by two holds it. */
function wide(x: number, z: number, has: Has): boolean {
  return has(x, z) && DIAGONAL.some(([dx, dz]) => has(x + dx, z) && has(x, z + dz) && has(x + dx, z + dz));
}

function wideTile(x: number, z: number, has: Has): Shape | null {
  const banks = ORTHOGONAL.filter(([dx, dz]) => !has(x + dx, z + dz));
  const nubs = DIAGONAL.filter(([dx, dz]) => !has(x + dx, z + dz) && has(x + dx, z) && has(x, z + dz));
  const narrow = ORTHOGONAL.filter(([dx, dz]) => has(x + dx, z + dz) && !wide(x + dx, z + dz, has));
  for (const tile of WIDE) {
    let [b, n] = [tile.banks, tile.nubs];
    for (let turn = 0; turn < 4; turn++) {
      // A narrow way leaves only at the open side between a SideOpen's nubs.
      const opening: Step = quarterTimes([0, 1], turn);
      const leaves = tile.name === "SideOpen" ? sameSteps(narrow, [opening]) : narrow.length === 0;
      if (sameSteps(b, banks) && sameSteps(n, nubs) && leaves) return { name: tile.name, turn };
      b = b.map(quarter);
      n = n.map(quarter);
    }
  }
  return null;
}

/** A way one cell wide, by the neighbours it joins: every set of them has a tile. The kit's open end, `End`, runs out at its −z, the way going on at its +z, as its closed end's does. */
function narrowTile(x: number, z: number, has: Has): Shape {
  const ways = ORTHOGONAL.filter(([dx, dz]) => has(x + dx, z + dz));
  if (ways.length === 0) return { name: "Tile", turn: 0 };
  for (const tile of NARROW) {
    const turn = turnOnto(tile.ways, ways);
    if (turn !== null) return { name: tile.name, turn };
  }
  return fail(`adventure: the way at ${x},${z} has a shape the kit has no tile for`);
}

const quarterTimes = (step: Step, turns: number): Step => (turns === 0 ? step : quarterTimes(quarter(step), turns - 1));

function fail(message: string): never {
  throw new Error(message);
}
