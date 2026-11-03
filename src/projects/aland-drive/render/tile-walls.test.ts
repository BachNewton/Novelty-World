import { describe, expect, it } from "vitest";
import { buildStoneWall } from "../art/rural";
import { SECTION_FLOATS, SECTION_M, STONE_WALL_HALF_WIDE_M, wallSections } from "./tile-walls";
import { surfaceHeight, type HeightGrid } from "./tile";

const NODES = 101;
const STEP_M = 4;
const rolling = (x: number, z: number) => 10 + 3 * Math.sin(x / 23) + 2 * Math.cos(z / 17);
const grid: HeightGrid = {
  nodes: NODES,
  stepM: STEP_M,
  west: 0,
  north: 400,
  heights: Float32Array.from({ length: NODES * NODES }, (_, at) => rolling((at % NODES) * STEP_M, -400 + Math.floor(at / NODES) * STEP_M)),
};

describe("a wall's sections", () => {
  const line: [number, number][] = [[40, -360], [130, -300], [131, -200], [250, -120]];
  const sections = wallSections({ walls: [line] }, grid);
  const count = sections.length / SECTION_FLOATS;
  const end = (section: number, which: 0 | 1) => sections.subarray(section * SECTION_FLOATS + which * 3, section * SECTION_FLOATS + which * 3 + 3);

  it("run end to end along the whole line, from its first point to its last", () => {
    expect(Array.from(end(0, 0))).toEqual([40, expect.closeTo(surfaceHeight(grid, 40, 360), 4), -360]);
    expect(end(count - 1, 1)[0]).toBeCloseTo(250, 3);
    expect(end(count - 1, 1)[2]).toBeCloseTo(-120, 3);
    for (let section = 1; section < count; section++) expect(Array.from(end(section, 0))).toEqual(Array.from(end(section - 1, 1)));
  });

  it("are each near the kit's length, so the stones keep their size", () => {
    for (let section = 0; section < count; section++) {
      const [x1, , z1] = end(section, 0);
      const [x2, , z2] = end(section, 1);
      expect(Math.hypot(x2 - x1, z2 - z1)).toBeGreaterThan(SECTION_M * 0.8);
      expect(Math.hypot(x2 - x1, z2 - z1)).toBeLessThan(SECTION_M * 1.2);
    }
  });

  // The section is a straight chord between its ends, so it can only follow the ground if both ends stand on it.
  it("stand both ends on the drawn ground, so a wall never floats over a dip or cuts through a rise", () => {
    for (let section = 0; section < count; section++) {
      for (const which of [0, 1] as const) {
        const [x, y, z] = end(section, which);
        expect(y).toBeCloseTo(surfaceHeight(grid, x, -z), 4);
      }
    }
  });
});

describe("the wall the car hits", () => {
  // Wider than the stones, the car stops short of a wall it should touch; much narrower, it drives into the stones.
  it("is the kit's wall: as wide as its stones", () => {
    const position = buildStoneWall(1).near.getAttribute("position");
    let side = 0;
    for (let at = 0; at < position.count; at++) side = Math.max(side, Math.abs(position.getZ(at)));
    expect(STONE_WALL_HALF_WIDE_M).toBeLessThanOrEqual(side);
    expect(STONE_WALL_HALF_WIDE_M).toBeGreaterThan(side * 0.5);
  });
});
