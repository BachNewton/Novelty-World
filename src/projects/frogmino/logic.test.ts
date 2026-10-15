import { describe, it, expect } from "vitest";
import { TETROMINOES, cellKey, frogCells, pieceCells, insideLanes, rectOpening as rect, turnWithKicks, type Placement } from "./logic";
import type { Cell, Frog, Lanes, Rotation, TetrominoKind } from "./types";

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

function sorted(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => a.col - b.col || a.row - b.row);
}

function frog(overrides: Partial<Frog> & Pick<Frog, "kind">): Frog {
  return { col: 0, rotation: 0, hop: 0, ...overrides };
}

describe("tetrominoes", () => {
  it.each(KINDS)("%s has four distinct cells resting on row 0 and column 0 in every rotation", (kind) => {
    for (const rotation of ROTATIONS) {
      const cells = pieceCells(kind, rotation);
      expect(cells).toHaveLength(4);
      expect(new Set(cells.map(cellKey)).size).toBe(4);
      expect(Math.min(...cells.map((c) => c.col))).toBe(0);
      expect(Math.min(...cells.map((c) => c.row))).toBe(0);
    }
  });

  it("rotation 0 is the spawn orientation", () => {
    for (const kind of KINDS) {
      expect(sorted(pieceCells(kind, 0))).toEqual(sorted(TETROMINOES[kind]));
    }
  });

  it("turns clockwise as seen from behind", () => {
    // The flat L's raised right end swings down: it stands as an upright L
    // with its foot pointing right.
    expect(sorted(pieceCells("L", 1))).toEqual(
      sorted([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }]),
    );
  });

  it("the I stands up after a quarter turn", () => {
    expect(sorted(pieceCells("I", 1))).toEqual(
      sorted([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }]),
    );
  });

  it("the O looks the same in every rotation", () => {
    for (const rotation of ROTATIONS) {
      expect(sorted(pieceCells("O", rotation))).toEqual(sorted(TETROMINOES.O));
    }
  });

  it("frog cells are the piece moved to the frog's column and hop height", () => {
    expect(sorted(frogCells(frog({ kind: "T", col: 3, hop: 1 })))).toEqual(
      sorted([{ col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }, { col: 4, row: 2 }]),
    );
  });
});

describe("rectOpening", () => {
  it("covers every cell of the rectangle", () => {
    expect(sorted(rect([1, 2], [0, 1]))).toEqual(
      sorted([{ col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 0 }, { col: 2, row: 1 }]),
    );
  });
});

const ROAD: Lanes = { first: 0, last: 6 };

// A turn that must stay inside the lanes, grounded, and out of the blocked
// cells: a vehicle's or a partner's, as the rules see them.
function turn(kind: TetrominoKind, placement: Placement, by: 1 | -1, lanes: Lanes = ROAD, blocked: readonly Cell[] = []): Placement | null {
  const solid = new Set(blocked.map(cellKey));
  return turnWithKicks(kind, placement, by, (p) =>
    insideLanes(kind, p, lanes) && frogCells({ kind, ...p, hop: 0 }).every((c) => !solid.has(cellKey(c))),
  );
}

describe("turning with kicks", () => {
  it("turns about the piece's middle, and turning back restores the column", () => {
    const start = { col: 3, rotation: 0 as Rotation };
    expect(turn("L", start, 1)).toEqual({ col: 3, rotation: 1 });
    expect(turn("L", { col: 3, rotation: 1 }, -1)).toEqual(start);
    expect(turn("L", start, -1)).toEqual({ col: 4, rotation: 3 });
  });

  it("kicks one column in at the left edge", () => {
    // Standing up two wide at column 0, a clockwise turn to three wide would
    // recentre to column -1.
    expect(turn("L", { col: 0, rotation: 1 }, 1)).toEqual({ col: 0, rotation: 2 });
  });

  it("kicks one column in at the right edge", () => {
    // Two wide against the right wall of a 7-wide corridor, turning to three wide.
    expect(turn("L", { col: 5, rotation: 1 }, -1)).toEqual({ col: 4, rotation: 0 });
  });

  it("kicks the I two columns in, the most any piece needs at an edge", () => {
    // Upright at the right edge, the counter-clockwise turn recentres the
    // flat I to columns 5 to 8.
    expect(turn("I", { col: 6, rotation: 1 }, -1)).toEqual({ col: 3, rotation: 0 });
    expect(turn("I", { col: 0, rotation: 1 }, 1)).toEqual({ col: 0, rotation: 2 });
  });

  it("kicks inside lanes that don't start at 0", () => {
    expect(turn("L", { col: -3, rotation: 1 }, 1, { first: -3, last: 6 })).toEqual({ col: -3, rotation: 2 });
    expect(turn("I", { col: -3, rotation: 1 }, 1, { first: -3, last: -1 })).toBeNull();
  });

  it("fails a turn that fits none of its kicks", () => {
    expect(turn("I", { col: 1, rotation: 1 }, 1, { first: 0, last: 2 })).toBeNull();
  });

  it("kicks off blocked cells, as off an edge: the nearest kick, the turn's own way first", () => {
    // The flat L at column 2 turns clockwise upright at column 2: a block at
    // the top of that column kicks it right, and one where the kicked foot
    // would go as well kicks it left.
    expect(turn("L", { col: 2, rotation: 0 }, 1, ROAD, [{ col: 2, row: 2 }])).toEqual({ col: 3, rotation: 1 });
    expect(turn("L", { col: 2, rotation: 0 }, 1, ROAD, [{ col: 2, row: 2 }, { col: 4, row: 0 }])).toEqual({ col: 1, rotation: 1 });
    // Counter-clockwise it turns upright at column 3, and kicks left first.
    expect(turn("L", { col: 2, rotation: 0 }, -1, ROAD, [{ col: 4, row: 2 }])).toEqual({ col: 2, rotation: 3 });
  });

  it("kicks two lanes when one either way is blocked, and no further", () => {
    // The flat I at column 3 turns clockwise upright at column 4.
    const roofed = [3, 4, 5, 6].map((col) => ({ col, row: 3 }));
    expect(turn("I", { col: 3, rotation: 0 }, 1, ROAD, roofed)).toEqual({ col: 2, rotation: 1 });
    const hemmed = [2, 3, 4, 5, 6].map((col) => ({ col, row: 3 }));
    expect(turn("I", { col: 3, rotation: 0 }, 1, ROAD, hemmed)).toBeNull();
  });
});
