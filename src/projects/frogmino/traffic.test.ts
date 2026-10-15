import { describe, it, expect } from "vitest";
import { VEHICLE_IDS } from "./fleet";
import { checkRow, keepsClear, lanesOf, rowSolids, vehicleCellsAt } from "./traffic";

describe("a vehicle in a row", () => {
  it("takes up its own lanes from where it is placed", () => {
    expect(lanesOf({ id: "I0", lane: 2 })).toEqual([2, 3, 4, 5]);
    expect(lanesOf({ id: "I1", lane: 6 })).toEqual([6]);
    for (const id of VEHICLE_IDS) {
      const lanes = new Set(vehicleCellsAt({ id, lane: 1 }).map((c) => c.col));
      expect([...lanes].sort()).toEqual(lanesOf({ id, lane: 1 }));
    }
  });
});

describe("checkRow", () => {
  it("takes vehicles side by side on the road", () => {
    expect(() => checkRow([{ id: "L0", lane: 0 }, { id: "I1", lane: 5 }], 7)).not.toThrow();
  });

  it("refuses vehicles sharing a lane or leaving the road", () => {
    expect(() => checkRow([{ id: "O0", lane: 0 }, { id: "I1", lane: 1 }], 7)).toThrow();
    expect(() => checkRow([{ id: "I0", lane: 4 }], 7)).toThrow();
  });
});

describe("a row's solids", () => {
  it("are its vehicles, each with its cells and length", () => {
    expect(rowSolids([{ id: "I1", lane: 0 }, { id: "O0", lane: 5 }])).toEqual([
      { cells: vehicleCellsAt({ id: "I1", lane: 0 }), length: 3 },
      { cells: vehicleCellsAt({ id: "O0", lane: 5 }), length: 2 },
    ]);
  });

  it("keep clear only cells in none of the vehicles", () => {
    const solids = rowSolids([{ id: "I1", lane: 0 }]);
    expect(keepsClear([{ col: 1, row: 0 }], solids)).toBe(true);
    expect(keepsClear([{ col: 1, row: 0 }, { col: 0, row: 3 }], solids)).toBe(false);
  });
});
