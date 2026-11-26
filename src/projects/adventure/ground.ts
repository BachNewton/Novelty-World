import type { NaturePiece } from "./nature-kit";
import type { Placement } from "./town";

/** A cell of the grid, by its −x, −z corner: cell (0, 0) spans 0 to 1 on x and z. */
export type Cell = readonly [x: number, z: number];

/** The ground's extent: the whole grid, 40 cells a side, centred on the origin. */
export const GROUND: { readonly min: number; readonly max: number } = { min: -20, max: 19 };

/** The four ways out of a cell, as steps on the grid. */
const WAYS = { "+x": [1, 0], "-z": [0, -1], "-x": [-1, 0], "+z": [0, 1] } as const;
type Way = keyof typeof WAYS;

/** A way turned a quarter anticlockwise seen from above, as a piece is: its +x goes to −z. */
const QUARTER: Record<Way, Way> = { "+x": "-z", "-z": "-x", "-x": "+z", "+z": "+x" };

/**
 * The Nature Kit's tiles for a path one cell wide, and the ways each leads out
 * of its cell unturned, as seen on the bench. The kit's other path tiles edge a
 * wide open patch of dirt.
 */
const PATH_TILES: readonly { piece: NaturePiece; ways: readonly Way[] }[] = [
  { piece: "ground_pathEndClosed", ways: ["+z"] },
  { piece: "ground_pathStraight", ways: ["-z", "+z"] },
  { piece: "ground_pathBend", ways: ["+z", "+x"] },
  { piece: "ground_pathSplit", ways: ["-x", "+x", "+z"] },
  { piece: "ground_pathCross", ways: ["-x", "+x", "-z", "+z"] },
];

const key = ([x, z]: Cell): string => `${x},${z}`;

/**
 * The cells a path runs through, from its first cell to its last by each one
 * between, in straight runs along x or z; a run on a slant is a mistake.
 */
export function pathCells(path: readonly Cell[]): Cell[] {
  const cells: Cell[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [fx, fz] = path[i - 1];
    const [tx, tz] = path[i];
    if (fx !== tx && fz !== tz) throw new Error(`adventure: the path from ${key(path[i - 1])} to ${key(path[i])} runs on a slant`);
    const steps = Math.abs(tx - fx) + Math.abs(tz - fz);
    for (let s = 1; s <= steps; s++) cells.push([fx + (Math.sign(tx - fx) * s), fz + (Math.sign(tz - fz) * s)]);
  }
  return cells;
}

/** The tile and turn for a path cell, from which of its neighbours are path too. */
function pathTile(cell: Cell, isPath: (cell: Cell) => boolean): { piece: NaturePiece; turn: number } {
  const out = new Set((Object.keys(WAYS) as Way[]).filter((way) => isPath([cell[0] + WAYS[way][0], cell[1] + WAYS[way][1]])));
  for (const tile of PATH_TILES) {
    if (tile.ways.length !== out.size) continue;
    let ways = tile.ways;
    for (let turn = 0; turn < 4; turn++) {
      if (ways.every((way) => out.has(way))) return { piece: tile.piece, turn };
      ways = ways.map((way) => QUARTER[way]);
    }
  }
  throw new Error(`adventure: the path at ${key(cell)} leads nowhere`);
}

/** The ground: grass on every cell of the grid, but a path's, which is the path tile its neighbours call for. */
export function groundOf(paths: readonly (readonly Cell[])[]): Placement[] {
  const path = new Set(paths.flatMap(pathCells).map(key));
  const isPath = (cell: Cell): boolean => path.has(key(cell));
  const tiles: Placement[] = [];
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) {
      tiles.push(isPath([x, z]) ? { x, z, ...pathTile([x, z], isPath) } : { piece: "ground_grass", x, z });
    }
  }
  return tiles;
}
