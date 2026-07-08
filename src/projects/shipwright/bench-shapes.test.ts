import { describe, expect, it } from "vitest";
import { BENCH_SHAPES, benchShapesForCount } from "./bench-shapes";
import { analyzeBuildVoids } from "./physics";

const enclosesAir = (cells: [number, number, number][]): boolean =>
  analyzeBuildVoids(cells).enclosed.some(Boolean);

describe("benchShapesForCount", () => {
  it("returns the full demo load unchanged for count <= 0 (the default)", () => {
    expect(benchShapesForCount(0)).toBe(BENCH_SHAPES);
    expect(benchShapesForCount(-5)).toBe(BENCH_SHAPES);
  });

  it("returns exactly `count` bodies", () => {
    for (const n of [1, 4, 8, 16, 32, 64]) {
      expect(benchShapesForCount(n)).toHaveLength(n);
    }
  });

  it("gives every body a unique name so nothing dedupes", () => {
    const names = benchShapesForCount(32).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("loads only buoyant hulls — every body encloses air (exercises the flood-fill)", () => {
    for (const shape of benchShapesForCount(40)) {
      expect(enclosesAir(shape.cells)).toBe(true);
    }
  });

  it("lays bodies on a non-overlapping grid (spawns are distinct and well-spaced)", () => {
    const spawns = benchShapesForCount(64).map((s) => s.spawnOverride);
    for (const s of spawns) expect(s).toBeDefined();
    const keys = spawns.map((s) => s?.join(","));
    expect(new Set(keys).size).toBe(keys.length); // no two bodies share a slot
    // Nearest-neighbour gap must clear the largest hull's extent (the ~6 m boat).
    let minGap = Infinity;
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const a = spawns[i];
        const b = spawns[j];
        if (!a || !b) continue;
        minGap = Math.min(minGap, Math.hypot(a[0] - b[0], a[2] - b[2]));
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(6);
  });
});
