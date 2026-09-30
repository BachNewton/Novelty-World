import { createRng } from "@/shared/lib/seeded-random";
import { cellKey, frogCells, pieceSize } from "./logic";
import type { Cell, Frog, HopHeight, Opening, Rotation, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

export const COURSE_SEED = 20260930;
export const WALL_COUNT = 4;
// Open cells grown around each wall's placement, beyond the piece's own four.
// The fewer, the tighter the opening.
const GROWN_CELLS = 7;

export interface CourseWall {
  opening: Opening;
  // Where the wall starts, before it begins moving toward the start zone.
  depth: number;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

const NEIGHBOURS: readonly Cell[] = [
  { col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 },
];

// One wall's opening: a real placement of the piece, grown by a few cells.
// A raised opening grows only above the floor row, so no grounded placement
// can pass it and it always needs a hop.
function makeOpening(kind: TetrominoKind, hop: HopHeight, tuning: Tuning, random: () => number): Opening {
  const rotation = pick<Rotation>([0, 1, 2, 3], random);
  const { width, height } = pieceSize(kind, rotation);
  if (height + hop > tuning.wallRows) throw new Error(`A ${kind} does not fit a ${String(tuning.wallRows)}-row wall`);
  const col = Math.floor(random() * (tuning.corridorCols - width + 1));
  const frog: Frog = { kind, col, rotation, hop };

  const open = new Map(frogCells(frog).map((c) => [cellKey(c), c]));
  const lowestRow = hop;
  for (let grown = 0; grown < GROWN_CELLS; grown++) {
    const candidates = new Map<string, Cell>();
    for (const cell of open.values()) {
      for (const n of NEIGHBOURS) {
        const next = { col: cell.col + n.col, row: cell.row + n.row };
        const inside =
          next.col >= 0 && next.col < tuning.corridorCols && next.row >= lowestRow && next.row < tuning.wallRows;
        if (inside && !open.has(cellKey(next))) candidates.set(cellKey(next), next);
      }
    }
    if (candidates.size === 0) break;
    const cell = pick([...candidates.values()], random);
    open.set(cellKey(cell), cell);
  }
  return [...open.values()];
}

// A course of walls from a seed: always the same walls for the same seed,
// every one passable, spread along the course. Only the last wall is raised,
// so a new player meets the hop once they have the feel of the rest.
export function generateCourse(seed: number, tuning: Tuning, kind: TetrominoKind = "L"): CourseWall[] {
  const random = createRng(seed).next;
  return Array.from({ length: WALL_COUNT }, (_, i) => {
    const hop: HopHeight = i === WALL_COUNT - 1 ? 1 : 0;
    const opening = makeOpening(kind, hop, tuning, random);
    const shift = (random() * 2 - 1) * tuning.wallJitter;
    return { opening, depth: tuning.firstWallDepth + i * tuning.wallSpacing + shift };
  });
}
