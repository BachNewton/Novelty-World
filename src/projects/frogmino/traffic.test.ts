import { describe, it, expect } from "vitest";
import { VEHICLE_IDS } from "./fleet";
import { cellKey } from "./logic";
import { acrossGate, gateLanes, insideGate, keepsClear, lanesOf, rowOpening, rowSolids, vehicleCellsAt } from "./traffic";

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

  it("keeps a gate's two lanes open, and refuses a gate off the road or with a vehicle in it", () => {
    const opening = rowOpening([{ id: "I1", lane: 0 }], 7, 4, [{ lane: 3, kind: "T" }]);
    expect(opening).toHaveLength(28 - 4);
    expect(() => rowOpening([{ id: "O0", lane: 2 }], 7, 4, [{ lane: 3, kind: "T" }])).toThrow();
    expect(() => rowOpening([], 7, 4, [{ lane: 6, kind: "T" }])).toThrow();
    expect(() => rowOpening([], 7, 4, [{ lane: 1, kind: "T" }, { lane: 2, kind: "O" }])).toThrow();
  });
});

describe("a gate", () => {
  it("spans two lanes, and holds only cells that are all in them", () => {
    expect(gateLanes({ lane: 3 })).toEqual({ first: 3, last: 4 });
    expect(insideGate([{ col: 3, row: 0 }, { col: 4, row: 3 }], { lane: 3 })).toBe(true);
    expect(insideGate([{ col: 3, row: 0 }, { col: 5, row: 0 }], { lane: 3 })).toBe(false);
  });
});

describe("a gate's frame", () => {
  it("stands a post on the lane line either side of the gate, solid for the row's whole length", () => {
    const solids = rowSolids([{ id: "I1", lane: 0 }, { id: "O0", lane: 5 }], [{ lane: 2, kind: "T" }]);
    expect(solids.filter((solid) => "post" in solid)).toEqual([
      { post: 2, length: 3 },
      { post: 4, length: 3 },
    ]);
    expect(rowSolids([{ id: "I1", lane: 0 }])).toHaveLength(1);
  });

  it("holds cells wholly in the gate or wholly out of it, never across a post", () => {
    const gate = { lane: 3 };
    expect(acrossGate([{ col: 3, row: 0 }, { col: 4, row: 0 }], gate)).toBe(false);
    expect(acrossGate([{ col: 1, row: 0 }, { col: 2, row: 0 }], gate)).toBe(false);
    expect(acrossGate([{ col: 2, row: 0 }, { col: 3, row: 0 }], gate)).toBe(true);
    expect(acrossGate([{ col: 4, row: 0 }, { col: 5, row: 0 }], gate)).toBe(true);
  });

  it("is solid: nothing stands across a post, or moves across one, though a post fills no cell", () => {
    const solids = rowSolids([{ id: "I1", lane: 0 }], [{ lane: 3, kind: "T" }]);
    const at = (col: number) => [{ col, row: 0 }];
    // Staying put either side of a post, or moving beside it.
    expect(keepsClear(at(2), at(2), solids)).toBe(true);
    expect(keepsClear(at(3), at(4), solids)).toBe(true);
    // Standing across a post, or stepping through one.
    expect(keepsClear([...at(2), ...at(3)], [...at(2), ...at(3)], solids)).toBe(false);
    expect(keepsClear(at(2), at(3), solids)).toBe(false);
    expect(keepsClear(at(4), at(5), solids)).toBe(false);
    // And into a vehicle, as ever.
    expect(keepsClear(at(1), at(0), solids)).toBe(false);
  });
});
