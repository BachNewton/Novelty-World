import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURE_TILES, readWorld } from "../sim/read-tile";
import { decodeHeights, patchIndices, surfaceHeight, type TileManifest, type WorldManifest } from "./tile";

describe("the height grid", () => {
  // Rows north to south: the north-west corner is 1 m, the north-east 2, the south-west 3, the south-east 5.
  const grid = decodeHeights(Int16Array.from([100, 100, 300, 200]), { nodes: 2, stepM: 10, unitM: 0.01 }, { west: 100, north: 500 });

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
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the committed fixture
  const manifest = JSON.parse(readFileSync(`${FIXTURE_TILES}/L2343C/tile.json`, "utf8")) as TileManifest;

  it("keeps NLS sheet L2343C at its real place in the world", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the committed fixture
    const { worldOrigin } = JSON.parse(readFileSync(`${FIXTURE_TILES}/world.json`, "utf8")) as WorldManifest;
    const { bounds } = manifest;
    expect([bounds.west + worldOrigin.east, bounds.south + worldOrigin.north]).toEqual([98000, 6690000]);
    expect([bounds.east + worldOrigin.east, bounds.north + worldOrigin.north]).toEqual([104000, 6696000]);
  });

  it("has the heights it declares, at both details, and the far ones are the near ones' every fourth node", () => {
    const world = readWorld(FIXTURE_TILES);
    const { far, detail } = world.named("L2343C");
    if (!far || !detail) throw new Error("the fixture didn't load");
    expect(detail.grid.heights.length).toBe(1501 ** 2);
    for (const [row, column] of [[0, 0], [0, 375], [200, 100], [375, 375]]) {
      expect(far.heights[row * far.nodes + column]).toBe(detail.grid.heights[row * 4 * detail.grid.nodes + column * 4]);
    }
  });
});
