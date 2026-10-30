import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeHeights, patchIndices, surfaceHeight, type TileManifest } from "./tile";

const manifestFor = (nodes: number, stepM: number): TileManifest =>
  ({ tile: "TEST", heights: { nodes, stepM, unitM: 0.01 }, bounds: { west: 100, north: 500 } }) as unknown as TileManifest;

describe("the height grid", () => {
  // Rows north to south: the north-west corner is 1 m, the north-east 2, the south-west 3, the south-east 5.
  const grid = decodeHeights(Int16Array.from([100, 100, 300, 200]), manifestFor(2, 10));

  it("undoes the differences along each row, without carrying a row into the next", () => {
    expect([...grid.heights]).toEqual([1, 2, 3, 5]);
  });

  it("puts each corner at its own compass corner: a flipped axis fails here first", () => {
    expect(surfaceHeight(grid, 100, 500)).toBeCloseTo(1);
    expect(surfaceHeight(grid, 110, 500)).toBeCloseTo(2);
    expect(surfaceHeight(grid, 100, 490)).toBeCloseTo(3);
    expect(surfaceHeight(grid, 110, 490)).toBeCloseTo(5);
  });

  it("agrees with the mesh's own triangles on both sides of the cell's split", () => {
    // patchIndices splits north-east to south-west, so the middle lies on that edge: (2 + 3) / 2, not the four corners' mean.
    expect(surfaceHeight(grid, 105, 495)).toBeCloseTo(2.5);
    expect([...patchIndices(1)]).toEqual([0, 2, 1, 1, 2, 3]);
    expect(surfaceHeight(grid, 102, 498)).toBeCloseTo(1 + 0.2 * 1 + 0.2 * 2);
    expect(surfaceHeight(grid, 108, 492)).toBeCloseTo(5 - 0.2 * 2 - 0.2 * 3);
  });
});

describe("the built tile", () => {
  const manifest = JSON.parse(readFileSync("public/aland-drive/tiles/L2343C/tile.json", "utf8")) as TileManifest;

  it("keeps NLS sheet L2343C at its real place in the world", () => {
    const { bounds, worldOrigin } = manifest;
    expect([bounds.west + worldOrigin.east, bounds.south + worldOrigin.north]).toEqual([98000, 6690000]);
    expect([bounds.east + worldOrigin.east, bounds.north + worldOrigin.north]).toEqual([104000, 6696000]);
  });

  it("has the heights it declares, and its roads in the terrain's own space", () => {
    const raw = gunzipSync(readFileSync("public/aland-drive/tiles/L2343C/heights.bin.gz"));
    expect(raw.length).toBe(manifest.heights.nodes ** 2 * 2);
    const { roads } = JSON.parse(readFileSync("public/aland-drive/tiles/L2343C/roads.json", "utf8")) as { roads: { line: [number, number][] }[] };
    expect(roads.length).toBeGreaterThan(0);
    for (const point of roads.flatMap((road) => road.line)) {
      expect(point[0]).toBeGreaterThanOrEqual(manifest.bounds.west);
      expect(point[0]).toBeLessThanOrEqual(manifest.bounds.east);
      expect(point[1]).toBeGreaterThanOrEqual(manifest.bounds.south);
      expect(point[1]).toBeLessThanOrEqual(manifest.bounds.north);
    }
  });
});
