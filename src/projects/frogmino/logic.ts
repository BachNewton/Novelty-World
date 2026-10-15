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

function turned(kind: TetrominoKind, rotation: Rotation): Cell[] {
  let cells: readonly Cell[] = TETROMINOES[kind];
  for (let turn = 0; turn < rotation; turn++) {
    cells = cells.map((c) => ({ col: c.row, row: -c.col }));
  }
  return normalize(cells);
}

// Every piece in every rotation, worked out once: the planner and the
// stacking rules ask for them in their innermost loops.
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const allTurns = (kind: TetrominoKind): readonly (readonly Cell[])[] => ROTATIONS.map((rotation) => turned(kind, rotation));
const PIECE_CELLS: Record<TetrominoKind, readonly (readonly Cell[])[]> = {
  I: allTurns("I"),
  O: allTurns("O"),
  T: allTurns("T"),
  S: allTurns("S"),
  Z: allTurns("Z"),
  J: allTurns("J"),
  L: allTurns("L"),
};
const sizes = (kind: TetrominoKind): readonly { width: number; height: number }[] => PIECE_CELLS[kind].map(sizeOf);
const PIECE_SIZES: Record<TetrominoKind, readonly { width: number; height: number }[]> = {
  I: sizes("I"),
  O: sizes("O"),
  T: sizes("T"),
  S: sizes("S"),
  Z: sizes("Z"),
  J: sizes("J"),
  L: sizes("L"),
};

// A piece's cells after `rotation` clockwise quarter turns, normalized so it
// still rests on row 0 from column 0.
export function pieceCells(kind: TetrominoKind, rotation: Rotation): Cell[] {
  return pieceShape(kind, rotation).map((c) => ({ ...c }));
}

// The same cells, shared rather than copied, for loops that only read them.
export function pieceShape(kind: TetrominoKind, rotation: Rotation): readonly Cell[] {
  return PIECE_CELLS[kind][rotation];
}

// The wall-face cells the frog covers.
export function frogCells(frog: Frog): Cell[] {
  return PIECE_CELLS[frog.kind][frog.rotation].map((c) => ({
    col: c.col + frog.col,
    row: c.row + frog.height,
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

// The width and height of a piece's bounding box in a rotation.
export function pieceSize(kind: TetrominoKind, rotation: Rotation): { width: number; height: number } {
  return PIECE_SIZES[kind][rotation];
}

function sizeOf(cells: readonly Cell[]): { width: number; height: number } {
  return { width: Math.max(...cells.map((c) => c.col)) + 1, height: Math.max(...cells.map((c) => c.row)) + 1 };
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

// The lane offsets a turn tries, in order, from where the turned piece is
// centred: Tetris-style kicks. Only sideways: a frog's height comes from its
// hops and what it stands on, so a kick never lifts or drops it. Two lanes is
// the most any piece needs to turn against the road's edge (the I, between
// four lanes wide and one). A clockwise turn tries right first and a
// counter-clockwise turn left first, so a turn and its mirror image kick
// mirror-image ways.
export function turnKicks(turn: Turn): readonly number[] {
  return turn === 1 ? [0, 1, -1, 2, -2] : [0, -1, 1, -2, 2];
}

// Turns a piece about its middle, to the first of its kicks where `fits`
// holds; null if none does, and the turn fails. Clockwise rounds the
// recentring one way and counter-clockwise the other, so turning and turning
// back in open space returns the piece to its lane.
export function turnWithKicks(
  kind: TetrominoKind,
  placement: Placement,
  turn: Turn,
  fits: (placement: Placement) => boolean,
): Placement | null {
  const rotation = ((placement.rotation + turn + 4) % 4) as Rotation;
  const shift = (pieceSize(kind, placement.rotation).width - pieceSize(kind, rotation).width) / 2;
  const centred = placement.col + (turn === 1 ? Math.floor(shift) : Math.ceil(shift));
  for (const kick of turnKicks(turn)) {
    const kicked = { col: centred + kick, rotation };
    if (fits(kicked)) return kicked;
  }
  return null;
}
