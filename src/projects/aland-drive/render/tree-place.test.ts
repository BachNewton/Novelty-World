import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { HEIGHT_RANGE, ROAD_COVERAGE, ROAD_MASK_MIP, SHORTEST_M, readImage, roadLevel } from "./tree-place";
import type { TileManifest, WorldManifest } from "./tile";
import { FIXTURE_TILES } from "../sim/read-tile";

/* eslint-disable security/detect-non-literal-fs-filename -- the committed fixture */
const STEP_M = 1;
const BESIDE_M = 1;

describe("trees and roads", () => {
  it("can't stand on a drawn road or within a metre of one, at any place jitter could put them", async () => {
    const world = JSON.parse(readFileSync(join(FIXTURE_TILES, "world.json"), "utf8")) as WorldManifest;
    const { name } = world.tiles[0];
    const folder = join(FIXTURE_TILES, name);
    const tile = JSON.parse(readFileSync(join(folder, "tile.json"), "utf8")) as TileManifest;
    const canopy = await sharp(join(folder, world.canopy.file)).raw().toBuffer({ resolveWithObject: true });
    const mask = await sharp(join(folder, world.mask.file)).raw().toBuffer({ resolveWithObject: true });
    const pixels = world.canopy.pixels;
    const texelM = world.tileM / pixels;
    const roads = roadLevel(mask.data, pixels, mask.info.channels);
    const { west, north } = tile.bounds;
    const canGrow = (x: number, z: number) => {
      const [localX, localZ] = [x - west, z + north];
      if (localX < 0 || localZ < 0 || localX >= world.tileM || localZ >= world.tileM) return false;
      const tallest = readImage(canopy.data, pixels, canopy.info.channels, 0, texelM, localX, localZ) * world.canopy.unitM * HEIGHT_RANGE[1];
      return tallest >= SHORTEST_M && readImage(roads, pixels >> ROAD_MASK_MIP, 1, 0, texelM * 2 ** ROAD_MASK_MIP, localX, localZ) <= ROAD_COVERAGE;
    };

    const bytes = gunzipSync(readFileSync(join(folder, tile.roadSurface.file)));
    const sections = tile.roadSurface.chains.reduce((sum, chain) => sum + chain.sections, 0);
    const rings = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + sections * 60));
    const ringPoint = (section: number, across: number) => [rings[(section * 5 + across) * 3], -rings[(section * 5 + across) * 3 + 1]];
    let tested = 0;
    let growing = 0;
    let first = 0;
    for (const { sections: count } of tile.roadSurface.chains) {
      for (let section = first; section < first + count - 1; section++) {
        const [leftA, rightA, leftB, rightB] = [ringPoint(section, 0), ringPoint(section, 4), ringPoint(section + 1, 0), ringPoint(section + 1, 4)];
        const length = Math.hypot(leftB[0] - leftA[0], leftB[1] - leftA[1]);
        const along = Math.max(1, Math.ceil(length / STEP_M));
        for (let step = 0; step <= along; step++) {
          const share = step / along;
          const left = [leftA[0] + (leftB[0] - leftA[0]) * share, leftA[1] + (leftB[1] - leftA[1]) * share];
          const right = [rightA[0] + (rightB[0] - rightA[0]) * share, rightA[1] + (rightB[1] - rightA[1]) * share];
          const width = Math.hypot(right[0] - left[0], right[1] - left[1]);
          const [wayX, wayZ] = [(right[0] - left[0]) / width, (right[1] - left[1]) / width];
          for (let offset = -BESIDE_M; offset <= width + BESIDE_M; offset += STEP_M) {
            tested++;
            if (canGrow(left[0] + wayX * offset, left[1] + wayZ * offset)) growing++;
          }
        }
      }
      first += count;
    }
    expect(tested).toBeGreaterThan(100_000);
    expect(growing).toBe(0);
  });
});
