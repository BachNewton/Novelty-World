import { describe, expect, it } from "vitest";
import { buildLodGrid, snapToLattice, type LodGrid } from "./ocean-lod";

// The shipped defaults (scene.ts): base quad ≈ 4.88 m, dense patch ~512 m,
// whole grid ~16 km — plus a small config so exhaustive checks stay fast.
const SHIPPED = { baseQuad: 10000 / 2048, nearExtent: 512, extent: 16384 };
const SMALL = { baseQuad: 2, nearExtent: 16, extent: 64 };

/** Undirected edge map: edgeKey → number of triangles sharing it. */
const edgeCounts = (grid: LodGrid) => {
  const counts = new Map<string, number>();
  for (let t = 0; t < grid.index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = grid.index[t + e];
      const b = grid.index[t + ((e + 1) % 3)];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
};

const vertexXZ = (grid: LodGrid, i: number): [number, number] => [
  grid.positions[i * 3],
  grid.positions[i * 3 + 2],
];

describe("buildLodGrid", () => {
  it("is watertight: every edge is shared by exactly 2 triangles, or lies on the outer boundary", () => {
    for (const opts of [SMALL, SHIPPED]) {
      const grid = buildLodGrid(opts);
      const half = grid.extent / 2;
      for (const [key, count] of edgeCounts(grid)) {
        // ≥3 would be an overlap; 1 anywhere but the outer boundary would be a
        // crack or a T-junction (vertices are welded by exact lattice position,
        // so an unmatched interior edge cannot hide behind a duplicate vertex).
        expect(count).toBeLessThanOrEqual(2);
        if (count === 1) {
          const [a, b] = key.split(":").map(Number);
          for (const i of [a, b]) {
            const [x, z] = vertexXZ(grid, i);
            expect(Math.max(Math.abs(x), Math.abs(z))).toBeCloseTo(half, 6);
          }
        }
      }
    }
  });

  it("covers the full extent exactly once (triangle areas sum to extent², all wound front-face)", () => {
    for (const opts of [SMALL, SHIPPED]) {
      const grid = buildLodGrid(opts);
      let area = 0;
      for (let t = 0; t < grid.index.length; t += 3) {
        const [ax, az] = vertexXZ(grid, grid.index[t]);
        const [bx, bz] = vertexXZ(grid, grid.index[t + 1]);
        const [cx, cz] = vertexXZ(grid, grid.index[t + 2]);
        const area2 = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        // Front faces (+y up, matching the rotateX(-π/2) plane) have negative
        // signed area in xz. A positive value is a back-facing triangle; zero
        // is degenerate. Combined with the watertight test, a correct total
        // area means full coverage with no overlaps.
        expect(area2).toBeLessThan(0);
        area += -area2 / 2;
      }
      expect(area).toBeCloseTo(grid.extent * grid.extent, 3);
    }
  });

  it("keeps every vertex on the base-quad integer lattice (the snap-stability invariant)", () => {
    const grid = buildLodGrid(SHIPPED);
    for (let i = 0; i < grid.vertexCount; i++) {
      const [x, z] = vertexXZ(grid, i);
      expect(x / SHIPPED.baseQuad).toBeCloseTo(Math.round(x / SHIPPED.baseQuad), 6);
      expect(z / SHIPPED.baseQuad).toBeCloseTo(Math.round(z / SHIPPED.baseQuad), 6);
    }
  });

  it("reports consistent metadata", () => {
    const grid = buildLodGrid(SHIPPED);
    expect(grid.vertexCount).toBe(grid.positions.length / 3);
    expect(grid.triangleCount).toBe(grid.index.length / 3);
    expect(grid.coarsestQuad).toBeCloseTo(SHIPPED.baseQuad * 2 ** grid.levels, 10);
    expect(grid.extent).toBeCloseTo(grid.nearExtent * 2 ** grid.levels, 6);
    for (const i of grid.index) expect(i).toBeLessThan(grid.vertexCount);
  });

  it("lands near the designed vertex budget at the shipped defaults (~52k, not ~1M)", () => {
    const grid = buildLodGrid(SHIPPED);
    expect(grid.levels).toBe(5);
    expect(grid.vertexCount).toBeGreaterThan(35_000);
    expect(grid.vertexCount).toBeLessThan(75_000);
  });

  it("degenerates to a uniform patch when extent ≈ nearExtent (no rings, full perimeter)", () => {
    const grid = buildLodGrid({ baseQuad: 2, nearExtent: 16, extent: 16 });
    expect(grid.levels).toBe(0);
    expect(grid.coarsestQuad).toBe(2);
    // 8×8 cells → 9×9 vertices, 128 triangles.
    expect(grid.vertexCount).toBe(81);
    expect(grid.triangleCount).toBe(128);
  });
});

describe("snapToLattice", () => {
  it("quantises to the nearest step multiple", () => {
    expect(snapToLattice(0, 156.25)).toBe(0);
    expect(snapToLattice(80, 156.25)).toBe(156.25);
    expect(snapToLattice(-80, 156.25)).toBe(-156.25);
    expect(snapToLattice(77, 156.25)).toBe(0);
  });
});
