import RAPIER from "@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeGroundCut, decodeHeights, decodeRoadSurface, surfaceHeight, type HeightGrid, type TileManifest, type WorldManifest } from "../render/tile";
import { Drive, initPhysics } from "./drive";
import { RoadLine } from "./road-net";
import { World, tileDetail } from "./world";

/*
 * A small paved tile the pipeline laid on made-up land (`pipeline/test_paving_file.py` writes it), with what it was laid
 * from beside it: a main road over a cycle underpass, a street crossing it with its sidewalk, and a path.
 */

const FOLDER = "src/projects/aland-drive/fixture/paved";
// Heights come back to the millimetre (half of one either way), and places to float32's step a kilometre out.
const HEIGHT_M = 0.0005 + 1e-5;
const PLACE_M = 1.3e-4;
const ACROSS = 0.5 / 1024 + 1e-6;
const ALONG_M = 0.005 + 1e-4;
const DRY_LEVEL_M = -300;

const read = (file: string) => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixture's own files
  const bytes = gunzipSync(readFileSync(join(FOLDER, file)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const tile = JSON.parse(readFileSync(join(FOLDER, "tile.json"), "utf8")) as TileManifest & { heights: { file: string; nodes: number; stepM: number; unitM: number } };
const grid = decodeHeights(new Int16Array(read(tile.heights.file)), tile.heights, tile.bounds);
const surface = decodeRoadSurface(read(tile.roadSurface.file), tile, grid);
const cut = decodeGroundCut(read(tile.roadSurface.groundCut?.file ?? ""), tile, grid);

/** What the tile was laid from, float64, in the order `laid.json` lists. */
const laid = (() => {
  const layout = JSON.parse(readFileSync(join(FOLDER, "laid.json"), "utf8")) as Record<string, [string, number[]]>;
  const data = read("laid.bin.gz");
  const found: Record<string, Float64Array | Uint32Array> = {};
  let at = 0;
  for (const [name, [kind, shape]] of Object.entries(layout)) {
    const count = shape.reduce((product, size) => product * size, 1);
    found[name] = kind === "<f8" ? new Float64Array(data, at, count) : new Uint32Array(data, at, count);
    at += found[name].byteLength;
  }
  return found;
})();

/** Each triangle from its least corner, keeping its winding, as one sorted list however it was ordered. */
const turned = (indices: ArrayLike<number>, from = 0, to = indices.length / 3) => {
  const triangles: string[] = [];
  for (let triangle = from; triangle < to; triangle++) {
    const corners = [indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]];
    const least = corners.indexOf(Math.min(...corners));
    triangles.push([0, 1, 2].map((corner) => corners[(least + corner) % 3]).join(","));
  }
  return triangles.sort();
};

describe("a paved tile's files", () => {
  it("give back the paving as it was laid, to within the format's rounding", () => {
    const points = laid.paving.length / 10;
    const { aprons, rings } = surface;
    expect(points).toBeGreaterThan(500);
    let worst = { place: 0, height: 0, across: 0, along: 0, run: 0 };
    for (let point = 0; point < points; point++) {
      const want = laid.paving.subarray(point * 10, point * 10 + 10);
      const at = (aprons.firstPoint + point) * 3;
      worst = {
        place: Math.max(worst.place, Math.abs(rings[at] - want[0]), Math.abs(-rings[at + 2] - want[1])),
        height: Math.max(worst.height, Math.abs(rings[at + 1] - want[2])),
        across: Math.max(worst.across, Math.abs(aprons.across[point] - want[3])),
        along: Math.max(worst.along, Math.abs(aprons.along[point] - want[5])),
        run: Math.max(worst.run, Math.abs(aprons.runs[point * 2] - want[8]), Math.abs(aprons.runs[point * 2 + 1] - want[9])),
      };
      expect([aprons.tiers[point], aprons.ways[point], aprons.classes[point]]).toEqual([want[4], want[6], want[7]]);
    }
    expect(worst.place).toBeLessThan(PLACE_M);
    expect(worst.height).toBeLessThan(HEIGHT_M);
    expect(worst.across).toBeLessThan(ACROSS);
    expect(worst.along).toBeLessThan(ALONG_M);
    expect(worst.run).toBeLessThan(1e-6);
    expect(turned(aprons.indices)).toEqual(turned(laid.triangles));
  });

  it("give back the cut ground as it was laid, its walls last, and a point on a node at the node's own height", () => {
    expect(Array.from(cut.cells)).toEqual(Array.from(laid.cells));
    const cutPoints = laid.cutPoints;
    let [place, height, onNodes] = [0, 0, 0];
    for (let point = 0; point < cutPoints.length / 3; point++) {
      const [x, y, z] = [cut.positions[point * 3], cut.positions[point * 3 + 1], -cut.positions[point * 3 + 2]];
      place = Math.max(place, Math.abs(x - cutPoints[point * 3]), Math.abs(z - cutPoints[point * 3 + 1]));
      height = Math.max(height, Math.abs(y - cutPoints[point * 3 + 2]));
      const [column, row] = [(x - grid.west) / grid.stepM, (grid.north - z) / grid.stepM];
      const node = Math.round(row) * grid.nodes + Math.round(column);
      if (Math.abs(column - Math.round(column)) < 1e-6 && Math.abs(row - Math.round(row)) < 1e-6 && Math.abs(cutPoints[point * 3 + 2] - grid.heights[node]) < 1e-6) {
        expect(y).toBe(grid.heights[node]);
        onNodes++;
      }
    }
    expect(onNodes).toBeGreaterThan(100);
    expect(place).toBeLessThan(PLACE_M);
    expect(height).toBeLessThan(HEIGHT_M);
    const ground = cut.indices.length / 3 - cut.walls;
    expect(cut.walls).toBeGreaterThan(0);
    expect(turned(cut.indices, 0, ground)).toEqual(turned(laid.cutTriangles, 0, ground));
    expect(turned(cut.indices, ground)).toEqual(turned(laid.cutTriangles, ground));
  });
});

beforeAll(initPhysics);

describe("a paved tile's ground", () => {
  const nodes = grid.nodes;
  const tileM = (nodes - 1) * grid.stepM;
  const farStride = 4;
  const farNodes = (nodes - 1) / farStride + 1;
  const strided = (stride: number, fill?: number): HeightGrid => {
    const count = (nodes - 1) / stride + 1;
    const heights = new Float32Array(count * count);
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) heights[row * count + column] = fill ?? grid.heights[row * stride * nodes + column * stride];
    }
    return { nodes: count, stepM: grid.stepM * stride, west: grid.west, north: grid.north, heights };
  };
  const manifest = {
    version: "test",
    tileM,
    worldOrigin: { east: 0, north: 0 },
    tiles: [{ name: tile.tile, west: grid.west, north: grid.north }],
    start: { tile: tile.tile, chain: 0 },
    heights: { file: "", nodes, stepM: grid.stepM, unitM: 0.01 },
    far: { heightsFile: "", nodes: farNodes, stepM: grid.stepM * farStride, shadeFile: "", shadePixels: 150 },
    shade: { file: "", pixels: 600, gamma: 2.2 },
    mask: { file: "", pixels: 300 },
    ground: { file: "", pixels: 600, farFile: "", farPixels: 150 },
    canopy: { file: "", pixels: 300, unitM: 0.25 },
    stands: { file: "", pixels: 25 },
    water: { levelsFile: "", farLevelsFile: "", shoreFile: "", farShoreFile: "", dryLevel: DRY_LEVEL_M },
    overview: { west: grid.west, north: grid.north, columns: 1, rows: 1, stepM: 80, unitM: 0.01, heightsFile: "", imageFile: "", imageWidth: 1, imageHeight: 1 },
    map: { file: "" },
    sun: { azimuthDeg: 215, elevationDeg: 30 },
    attribution: [],
  } satisfies WorldManifest;

  const isCut = (x: number, z: number, detail: ReturnType<typeof tileDetail>) => detail.cutCells[Math.floor((grid.north + z) / grid.stepM) * (nodes - 1) + Math.floor((x - grid.west) / grid.stepM)] === 1;

  /** The highest drawn surface at a place: the paving, else the cut ground in a cut cell, else the grid. */
  const drawnAt = (x: number, z: number, detail: ReturnType<typeof tileDetail>): number => {
    const top = (positions: Float32Array, indices: Uint32Array, triangles: number): number | null => {
      let found: number | null = null;
      for (let triangle = 0; triangle < triangles; triangle++) {
        const [a, b, c] = [indices[triangle * 3] * 3, indices[triangle * 3 + 1] * 3, indices[triangle * 3 + 2] * 3];
        const denominator = (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) + (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]);
        if (Math.abs(denominator) < 1e-12) continue;
        const u = ((positions[b + 2] - positions[c + 2]) * (x - positions[c]) + (positions[c] - positions[b]) * (z - positions[c + 2])) / denominator;
        const v = ((positions[c + 2] - positions[a + 2]) * (x - positions[c]) + (positions[a] - positions[c]) * (z - positions[c + 2])) / denominator;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const height = u * positions[a + 1] + v * positions[b + 1] + (1 - u - v) * positions[c + 1];
        found = found === null ? height : Math.max(found, height);
      }
      return found;
    };
    // A cell all paving has no cut ground of its own.
    const ground = isCut(x, z, detail) ? (top(cut.positions, cut.indices, cut.indices.length / 3 - cut.walls) ?? -Infinity) : surfaceHeight(grid, x, -z);
    return Math.max(ground, top(detail.ribbon.positions, detail.ribbon.indices, detail.ribbon.indices.length / 3) ?? -Infinity);
  };

  it("is collided with where it's drawn: on the paving, over the underpass and on the cut ground round it", () => {
    const world = new World(manifest);
    world.addFar(tile.tile, strided(farStride), strided(farStride, DRY_LEVEL_M), strided(farStride, DRY_LEVEL_M));
    const dry = strided(1, DRY_LEVEL_M);
    const detail = tileDetail(tile, grid, read(tile.roadSurface.file), dry, dry, tileM, new Float32Array(0), read(tile.roadSurface.groundCut?.file ?? ""));
    world.addDetail(detail);
    const start = new RoadLine(Float32Array.of(200, surfaceHeight(grid, 200, 900), -900, 210, surfaceHeight(grid, 210, 900), -900)).at(0);
    const drive = new Drive(world, start);
    // Across the ways and the cut cells round them, off any grid line, so no ray runs down an upright face.
    const places: [number, number][] = [];
    for (let step = 0; step < 400; step++) places.push([590.137 + (step % 20) * 1.013, -(588.271 + Math.floor(step / 20) * 1.209)]);
    for (let step = 0; step < 400; step++) places.push([280.113 + (step % 40) * 1.017, -(400.319 + Math.floor(step / 40) * 37.21)]);
    let cutCellsHit = 0;
    for (const [x, z] of places) {
      drive.ground.around([{ x, z }]);
      drive.rapier.step();
      const hit = drive.rapier.castRay(new RAPIER.Ray({ x, y: 300, z }, { x: 0, y: -1, z: 0 }), 600, true);
      if (!hit) throw new Error(`nothing to collide with at ${x}, ${z}`);
      expect(Math.abs(300 - hit.timeOfImpact - drawnAt(x, z, detail))).toBeLessThan(0.002);
      if (isCut(x, z, detail)) cutCellsHit++;
    }
    expect(cutCellsHit).toBeGreaterThan(100);
    drive.dispose();
  });
});
