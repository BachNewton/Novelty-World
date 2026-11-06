import { describe, expect, it } from "vitest";
import { BRANCHES, CLUMP_REACH, CLUMPS, clumpReach, ROWS_A_VERTEX } from "./bare-tree";
import { NEAR_RINGS } from "./tree-shapes";

const ringsOf = (table: Float32Array) => Array.from({ length: table.length / (ROWS_A_VERTEX * 4) }, (_, at) => table[at * ROWS_A_VERTEX * 4 + 1]);

describe("bare broadleaves", () => {
  // A clump poking out of the leafy crown would show as the crown starts to break up, and the shader reads a ring past the table's last as another tree's row.
  it("keeps every clump inside the leafy crown's outline", () => {
    expect(clumpReach(CLUMPS)).toBeLessThanOrEqual(CLUMP_REACH);
  });

  it("lays every point within the outline table's rings", () => {
    for (const model of [BRANCHES, CLUMPS]) {
      for (const ring of ringsOf(model.table)) {
        expect(ring).toBeGreaterThanOrEqual(0);
        expect(ring).toBeLessThanOrEqual(NEAR_RINGS - 1);
      }
    }
  });
});
