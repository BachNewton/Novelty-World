import type { Cell, Frog, Lanes, Opening, Rotation, TetrominoKind } from "./types";

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

// The width and height of a piece's bounding box in a rotation.
export function pieceSize(kind: TetrominoKind, rotation: Rotation): { width: number; height: number } {
  const cells = pieceCells(kind, rotation);
  return {
    width: Math.max(...cells.map((c) => c.col)) + 1,
    height: Math.max(...cells.map((c) => c.row)) + 1,
  };
}

// A quarter turn: +1 is clockwise, -1 counter-clockwise.
export type Turn = 1 | -1;

export interface Placement {
  col: number;
  rotation: Rotation;
}

// Whether a piece in a rotation, its leftmost cell at `col`, lies inside the
// lanes.
export function insideLanes(kind: TetrominoKind, placement: Placement, lanes: Lanes): boolean {
  const { width } = pieceSize(kind, placement.rotation);
  return placement.col >= lanes.first && placement.col + width - 1 <= lanes.last;
}

// Turns a piece about its middle, kept inside the lanes. A turn that would
// poke out of them is nudged one lane back in (a Tetris-style wall kick); if
// it still doesn't fit, the turn fails and this returns null. Clockwise
// rounds the recentring one way and counter-clockwise the other, so turning
// and turning back returns the piece to its lane.
export function rotateInCorridor(
  kind: TetrominoKind,
  placement: Placement,
  turn: Turn,
  lanes: Lanes,
): Placement | null {
  const rotation = ((placement.rotation + turn + 4) % 4) as Rotation;
  const shift = (pieceSize(kind, placement.rotation).width - pieceSize(kind, rotation).width) / 2;
  const centred = placement.col + (turn === 1 ? Math.floor(shift) : Math.ceil(shift));
  if (insideLanes(kind, { col: centred, rotation }, lanes)) return { col: centred, rotation };
  const kicked = centred < lanes.first ? centred + 1 : centred - 1;
  return insideLanes(kind, { col: kicked, rotation }, lanes) ? { col: kicked, rotation } : null;
}
