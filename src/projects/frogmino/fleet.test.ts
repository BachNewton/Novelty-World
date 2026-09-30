import { describe, it, expect } from "vitest";
import { cellKey, pieceCells, TETROMINOES } from "./logic";
import { fixedTetrominoes, shapeKey, VEHICLE_IDS, vehicleCells, vehiclePiece, type VehicleId } from "./fleet";
import type { Cell, Rotation, TetrominoKind } from "./types";

// A shape drawn as the frog sees it, top row first, '#' for a cell.
function drawn(...rows: string[]): Cell[] {
  return rows.flatMap((line, i) =>
    [...line].flatMap((mark, col) => (mark === "#" ? [{ col, row: rows.length - 1 - i }] : [])),
  );
}

const EXPECTED: Record<VehicleId, Cell[]> = {
  I0: drawn("####"),
  I1: drawn("#", "#", "#", "#"),
  O0: drawn("##", "##"),
  S0: drawn(".##", "##."),
  S1: drawn("#.", "##", ".#"),
  Z0: drawn("##.", ".##"),
  Z1: drawn(".#", "##", "#."),
  T0: drawn(".#.", "###"),
  T1: drawn("#.", "##", "#."),
  T2: drawn("###", ".#."),
  T3: drawn(".#", "##", ".#"),
  J0: drawn("#..", "###"),
  J1: drawn("##", "#.", "#."),
  J2: drawn("###", "..#"),
  J3: drawn(".#", ".#", "##"),
  L0: drawn("..#", "###"),
  L1: drawn("#.", "#.", "##"),
  L2: drawn("###", "#.."),
  L3: drawn("##", ".#", ".#"),
};

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

describe("the fleet", () => {
  it("has 19 distinct ids: I 2, O 1, S 2, Z 2, T 4, J 4, L 4", () => {
    expect(new Set(VEHICLE_IDS).size).toBe(19);
    const perKind = Object.fromEntries(KINDS.map((kind) => [kind, VEHICLE_IDS.filter((id) => id[0] === kind).length]));
    expect(perKind).toEqual({ I: 2, O: 1, S: 2, Z: 2, T: 4, J: 4, L: 4 });
  });

  it.each(VEHICLE_IDS)("%s has the right four cells, resting on row 0 from lane 0", (id) => {
    const cells = vehicleCells(id);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(cellKey)).size).toBe(4);
    expect(Math.min(...cells.map((c) => c.row))).toBe(0);
    expect(Math.min(...cells.map((c) => c.col))).toBe(0);
    expect(shapeKey(cells)).toBe(shapeKey(EXPECTED[id]));
  });

  it("gives every vehicle a different shape", () => {
    expect(new Set(VEHICLE_IDS.map((id) => shapeKey(vehicleCells(id)))).size).toBe(19);
  });

  it("is exactly every rotation of the seven pieces, duplicates removed", () => {
    const all = new Set(KINDS.flatMap((kind) => ROTATIONS.map((rotation) => shapeKey(pieceCells(kind, rotation)))));
    const fleet = new Set(VEHICLE_IDS.map((id) => shapeKey(vehicleCells(id))));
    expect(fleet).toEqual(all);
  });

  it("names each vehicle after its piece and the first rotation giving its shape", () => {
    const ids = fixedTetrominoes().map(({ kind, rotation }) => `${kind}${String(rotation)}`);
    expect([...ids].sort()).toEqual([...VEHICLE_IDS].sort());
    for (const id of VEHICLE_IDS) {
      const { kind, rotation } = vehiclePiece(id);
      expect(vehicleCells(id)).toEqual(pieceCells(kind, rotation));
    }
  });
});
