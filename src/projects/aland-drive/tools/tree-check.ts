// Counts the trees that stand on or beside a drawn road, across built tiles, with the placement the shader uses: every
// lattice place's jitter, rolled height and bilinear read of the canopy image, against the road surface's real polygons,
// the neighbouring tiles' included.
//
// Usage: npx tsx src/projects/aland-drive/tools/tree-check.ts [--folder=<tiles>] [--tile=<name>] [--ungated]
// --ungated leaves out the road mask, to see what the canopy image alone would do.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { NEAR_STEP_M, ROAD_COVERAGE, ROAD_LOOK_M, ROAD_MASK_MIP, SHORTEST_M, WIDEST_CROWN, readImage, roadLevel, treeHeight, treePlace } from "../render/tree-place";
import type { TileManifest, WorldManifest } from "../render/tile";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("tile", "");
const GATED = !process.argv.includes("--ungated");
const BUCKET_M = 16;
const REACH_M = 9;

/* eslint-disable security/detect-non-literal-fs-filename -- a tile folder this tool was told to read */
const manifest = JSON.parse(readFileSync(join(FOLDER, "world.json"), "utf8")) as WorldManifest;

interface Quad {
  ribbon: number[];
  carriage: number[];
  tier: number;
}

const buckets = new Map<string, Quad[]>();

function addRoads(name: string): void {
  const tile = JSON.parse(readFileSync(join(FOLDER, name, "tile.json"), "utf8")) as TileManifest;
  const bytes = gunzipSync(readFileSync(join(FOLDER, name, tile.roadSurface.file)));
  const sections = tile.roadSurface.chains.reduce((sum, chain) => sum + chain.sections, 0);
  const rings = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + sections * 60));
  const tiers = bytes.subarray(sections * 60);
  let first = 0;
  for (const { sections: count } of tile.roadSurface.chains) {
    for (let section = first; section < first + count - 1; section++) {
      const point = (index: number, across: number) => [rings[(index * 5 + across) * 3], -rings[(index * 5 + across) * 3 + 1]];
      const quad: Quad = {
        ribbon: [...point(section, 0), ...point(section, 4), ...point(section + 1, 4), ...point(section + 1, 0)],
        carriage: [...point(section, 1), ...point(section, 3), ...point(section + 1, 3), ...point(section + 1, 1)],
        tier: tiers[section],
      };
      const xs = [quad.ribbon[0], quad.ribbon[2], quad.ribbon[4], quad.ribbon[6]];
      const zs = [quad.ribbon[1], quad.ribbon[3], quad.ribbon[5], quad.ribbon[7]];
      for (let bx = Math.floor((Math.min(...xs) - REACH_M) / BUCKET_M); bx <= Math.floor((Math.max(...xs) + REACH_M) / BUCKET_M); bx++) {
        for (let bz = Math.floor((Math.min(...zs) - REACH_M) / BUCKET_M); bz <= Math.floor((Math.max(...zs) + REACH_M) / BUCKET_M); bz++) {
          const key = `${bx},${bz}`;
          const list = buckets.get(key);
          if (list) list.push(quad);
          else buckets.set(key, [quad]);
        }
      }
    }
    first += count;
  }
}

function distanceToQuad(x: number, z: number, outline: number[]): number {
  let inside = false;
  let best = Infinity;
  for (let at = 0; at < 4; at++) {
    const [ax, az, bx, bz] = [outline[at * 2], outline[at * 2 + 1], outline[((at + 1) % 4) * 2], outline[((at + 1) % 4) * 2 + 1]];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const [dx, dz] = [bx - ax, bz - az];
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - along * dx, z - az - along * dz));
  }
  return inside ? 0 : best;
}

interface Image {
  data: Uint8Array;
  stride: number;
}

const decoded = async (file: string): Promise<Image> => {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, stride: info.channels };
};

const counts = { trees: 0, onCarriageway: 0, onRibbon: 0, withinMetre: 0, crownOverCarriageway: 0 };
const byTier = [0, 0, 0];

const tiles = manifest.tiles.filter(({ name }) => !ONLY || name === ONLY);
const pixels = manifest.canopy.pixels;
const texelM = manifest.tileM / pixels;
const halves = new Map<string, Float32Array | null>();
const entry = new Map(manifest.tiles.map((tile) => [`${tile.west / manifest.tileM},${-tile.north / manifest.tileM}`, tile]));
const ROAD_TEXEL_M = texelM * 2 ** ROAD_MASK_MIP;

async function roadsOfTile(key: string): Promise<Float32Array | null> {
  const known = halves.get(key);
  if (known !== undefined) return known;
  const tile = entry.get(key);
  const mask = tile ? await decoded(join(FOLDER, tile.name, manifest.mask.file)) : null;
  const roads = mask ? roadLevel(mask.data, pixels, mask.stride) : null;
  halves.set(key, roads);
  return roads;
}

async function roadsAt(x: number, z: number): Promise<number> {
  const [column, row] = [Math.floor(x / manifest.tileM), Math.floor(z / manifest.tileM)];
  const roads = await roadsOfTile(`${column},${row}`);
  return roads ? readImage(roads, pixels >> ROAD_MASK_MIP, 1, 0, ROAD_TEXEL_M, x - column * manifest.tileM, z - row * manifest.tileM) : 0;
}

const lookOver = (spot: number) => {
  const local = spot - Math.floor(spot / manifest.tileM) * manifest.tileM;
  return local < ROAD_LOOK_M ? -ROAD_LOOK_M : local > manifest.tileM - ROAD_LOOK_M ? ROAD_LOOK_M : 0;
};

for (const { name, west, north } of tiles) {
  buckets.clear();
  for (const near of manifest.tiles) {
    if (Math.abs(near.west - west) <= manifest.tileM && Math.abs(near.north - north) <= manifest.tileM) addRoads(near.name);
  }
  const canopy = await decoded(join(FOLDER, name, manifest.canopy.file));
  const top = -north;
  for (let row = Math.floor(top / NEAR_STEP_M) - 1; row <= Math.ceil((top + manifest.tileM) / NEAR_STEP_M) + 1; row++) {
    for (let column = Math.floor(west / NEAR_STEP_M) - 1; column <= Math.ceil((west + manifest.tileM) / NEAR_STEP_M) + 1; column++) {
      const [x, z] = treePlace(column, row);
      const [localX, localZ] = [x - west, z - top];
      if (localX < 0 || localZ < 0 || localX >= manifest.tileM || localZ >= manifest.tileM) continue;
      const canopyM = readImage(canopy.data, pixels, canopy.stride, 0, texelM, localX, localZ) * manifest.canopy.unitM;
      const height = treeHeight(column, row, canopyM);
      if (height < SHORTEST_M) continue;
      if (GATED && Math.max(await roadsAt(x, z), await roadsAt(x + lookOver(x), z + lookOver(z))) > ROAD_COVERAGE) continue;
      counts.trees++;
      const list = buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(z / BUCKET_M)}`);
      if (!list) continue;
      let ribbon = Infinity;
      let carriage = Infinity;
      let tier = 0;
      for (const quad of list) {
        const here = distanceToQuad(x, z, quad.ribbon);
        if (here < ribbon) {
          ribbon = here;
          tier = quad.tier;
        }
        carriage = Math.min(carriage, distanceToQuad(x, z, quad.carriage));
      }
      if (ribbon === 0) {
        counts.onRibbon++;
        byTier[tier]++;
      }
      if (carriage === 0) counts.onCarriageway++;
      if (ribbon <= 1) counts.withinMetre++;
      if (carriage <= height * WIDEST_CROWN) counts.crownOverCarriageway++;
    }
  }
}
console.log(JSON.stringify({ tiles: tiles.length, ...counts, onRibbonByTier: byTier }));
