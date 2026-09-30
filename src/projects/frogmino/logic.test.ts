import { describe, it, expect } from "vitest";
import { TETROMINOES, cellKey, frogCells, frogPasses, pieceCells, rectOpening as rect } from "./logic";
import type { Cell, Frog, Opening, Rotation, TetrominoKind } from "./types";

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

describe("frogPasses", () => {
  it("passes when every cell is inside a larger opening", () => {
    expect(frogPasses(frog({ kind: "T", col: 2 }), rect([1, 5], [0, 2]))).toBe(true);
  });

  it("passes an opening exactly the frog's shape", () => {
    const piece = frog({ kind: "S", col: 4 });
    expect(frogPasses(piece, frogCells(piece))).toBe(true);
  });

  it("bonks when any cell meets the wall", () => {
    // One column too far right: the T's right end hits the wall.
    expect(frogPasses(frog({ kind: "T", col: 4 }), rect([1, 5], [0, 2]))).toBe(false);
  });

  it("bonks a piece that is too wide for the opening", () => {
    expect(frogPasses(frog({ kind: "I", col: 2 }), rect([2, 4], [0, 3]))).toBe(false);
  });

  it("rectOpening covers every cell of the rectangle", () => {
    expect(sorted(rect([1, 2], [0, 1]))).toEqual(
      sorted([{ col: 1, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 0 }, { col: 2, row: 1 }]),
    );
  });

  it("bonks with no opening at all", () => {
    expect(frogPasses(frog({ kind: "O" }), [])).toBe(false);
  });

  it("passes a tall slot only when rotated to fit", () => {
    const slot = rect([3, 3], [0, 3]);
    expect(frogPasses(frog({ kind: "I", col: 3, rotation: 0 }), slot)).toBe(false);
    expect(frogPasses(frog({ kind: "I", col: 3, rotation: 1 }), slot)).toBe(true);
    expect(frogPasses(frog({ kind: "I", col: 3, rotation: 3 }), slot)).toBe(true);
  });

  it("a notch only lets through the rotation that matches it", () => {
    // An upside-down T shaped hole: three wide on top, one cell below.
    const notch: Opening = [
      { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 3, row: 0 },
    ];
    expect(frogPasses(frog({ kind: "T", col: 2, rotation: 2 }), notch)).toBe(true);
    expect(frogPasses(frog({ kind: "T", col: 2, rotation: 0 }), notch)).toBe(false);
  });

  it("a raised opening needs a hop", () => {
    const raised = rect([1, 3], [1, 2]);
    expect(frogPasses(frog({ kind: "O", col: 1, hop: 0 }), raised)).toBe(false);
    expect(frogPasses(frog({ kind: "O", col: 1, hop: 1 }), raised)).toBe(true);
  });

  it("hopping at a floor-level opening with no headroom bonks", () => {
    const floor = rect([1, 2], [0, 1]);
    expect(frogPasses(frog({ kind: "O", col: 1, hop: 0 }), floor)).toBe(true);
    expect(frogPasses(frog({ kind: "O", col: 1, hop: 1 }), floor)).toBe(false);
  });
});
