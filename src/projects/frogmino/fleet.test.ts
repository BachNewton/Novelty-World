import { describe, it, expect } from "vitest";
import { pieceCells, TETROMINOES } from "./logic";
import { fixedTetrominoes, shapeKey, VEHICLE_IDS, vehicleCells, vehiclePiece } from "./fleet";
import type { Rotation, TetrominoKind } from "./types";

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

describe("the fleet", () => {
  it("is exactly every rotation of the seven pieces, each shape once", () => {
    const all = new Set(KINDS.flatMap((kind) => ROTATIONS.map((rotation) => shapeKey(pieceCells(kind, rotation)))));
    const fleet = new Set(VEHICLE_IDS.map((id) => shapeKey(vehicleCells(id))));
    expect(fleet).toEqual(all);
    expect(VEHICLE_IDS).toHaveLength(all.size);
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
