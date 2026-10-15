import { describe, it, expect } from "vitest";
import { VEHICLE_IDS } from "./fleet";
import { cellKey } from "./logic";
import { keepsClear, lanesOf, rowOpening, rowSolids, vehicleCellsAt } from "./traffic";

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

describe("rowOpening", () => {
  it("opens every cell no vehicle fills", () => {
    // A flat L across lanes 0-2 and a tall I in lane 5.
    const opening = rowOpening([{ id: "L0", lane: 0 }, { id: "I1", lane: 5 }], 7, 4);
    const open = new Set(opening.map(cellKey));
    expect(opening).toHaveLength(28 - 8);
    for (const solid of ["0,0", "1,0", "2,0", "2,1", "5,0", "5,1", "5,2", "5,3"]) expect(open.has(solid)).toBe(false);
    expect(open.has("0,1")).toBe(true);
  });

  it("refuses vehicles sharing a lane or leaving the road", () => {
    expect(() => rowOpening([{ id: "O0", lane: 0 }, { id: "I1", lane: 1 }], 7, 4)).toThrow();
    expect(() => rowOpening([{ id: "I0", lane: 4 }], 7, 4)).toThrow();
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
