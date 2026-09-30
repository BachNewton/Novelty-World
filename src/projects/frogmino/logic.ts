import type { Cell, Frog, Opening, Rotation, TetrominoKind } from "./types";

// Each piece in its spawn orientation, resting on row 0 at column 0.
export const TETROMINOES: Record<TetrominoKind, readonly Cell[]> = {
  I: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }],
  O: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  T: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }],
  S: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }],
  Z: [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }],
  J: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }],
  L: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }],
};

// Shift cells so the lowest sits on row 0 and the leftmost on column 0.
function normalize(cells: readonly Cell[]): Cell[] {
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  return cells.map((c) => ({ col: c.col - minCol, row: c.row - minRow }));
}

// A piece's cells after `rotation` clockwise quarter turns, normalized so it
// still rests on row 0 from column 0.
export function pieceCells(kind: TetrominoKind, rotation: Rotation): Cell[] {
  let cells: readonly Cell[] = TETROMINOES[kind];
  for (let turn = 0; turn < rotation; turn++) {
    cells = cells.map((c) => ({ col: c.row, row: -c.col }));
  }
  return normalize(cells);
}

// The wall-face cells the frog covers.
export function frogCells(frog: Frog): Cell[] {
  return pieceCells(frog.kind, frog.rotation).map((c) => ({
    col: c.col + frog.col,
    row: c.row + frog.hop,
  }));
}

export function cellKey(cell: Cell): string {
  return `${String(cell.col)},${String(cell.row)}`;
}

// Every cell of the rectangle spanning the given columns and rows, inclusive.
export function rectOpening(cols: [number, number], rows: [number, number]): Opening {
  const cells: Cell[] = [];
  for (let col = cols[0]; col <= cols[1]; col++) {
    for (let row = rows[0]; row <= rows[1]; row++) cells.push({ col, row });
  }
  return cells;
}

// The core rule: the frog passes a wall only if every cell it covers is
// inside the opening; any cell that meets the wall is a bonk.
export function frogPasses(frog: Frog, opening: Opening): boolean {
  const open = new Set(opening.map(cellKey));
  return frogCells(frog).every((c) => open.has(cellKey(c)));
}
