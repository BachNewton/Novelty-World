// Counts the trees that stand on or beside a drawn road or in a building, across built tiles, with the placement the
// shader uses: every lattice place's jitter, rolled height and bilinear read of the canopy and clearing images, against
// the road surface's real polygons and the buildings' real shapes (`solids.bin.gz`'s triangles seen from above and its
// walls, and the rural kit's sheds, boathouses and windmills), the neighbouring tiles' included. A tree's crown is in a
// building when the building comes nearer its foot than its crown can reach (`CROWN_REACH`). The town dressing's lindens
// are counted against the buildings too, by each crown's own spread.
// `shortened` counts the trees the clearing made shorter, `shortenedByHalf` those it more than halved.
//
// Usage: npx tsx src/projects/aland-drive/tools/tree-check.ts [--folder=<tiles>] [--tile=<name>] [--ungated] [--uncleared]
// --ungated leaves out the road mask, and --uncleared the clearing round buildings, to see what the canopy image alone would do.
// --worst=<n> lists the n trees whose crowns reach furthest into a building, to look at.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { NEAR_STEP_M, ROAD_COVERAGE, ROAD_LOOK_M, ROAD_MASK_MIP, SHORTEST_M, readImage, roadLevel, tallestClear, treeHeight, treePlace, treeStands } from "../render/tree-place";
import { CROWN_REACH, WIDEST_CROWN } from "../render/tree-shapes";
import { decodeSolids } from "../render/solids";
import { spreadOf } from "../render/planting";
import { buildLinden, LINDEN_SEEDS } from "../art/street/linden";
import type { TileManifest, WorldManifest } from "../render/tile";
import type { ModelsFile, RoadsideFile } from "../render/tile-models";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("tile", "");
const GATED = !process.argv.includes("--ungated");
const CLEARED = !process.argv.includes("--uncleared");
const WORST = Number(option("worst", "0"));
const worst: { tile: string; x: number; z: number; height: number; into: number; clearance: number }[] = [];
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

function distanceToOutline(x: number, z: number, outline: number[]): number {
  let inside = false;
  let best = Infinity;
  const corners = outline.length / 2;
  for (let at = 0; at < corners; at++) {
    const [ax, az, bx, bz] = [outline[at * 2], outline[at * 2 + 1], outline[((at + 1) % corners) * 2], outline[((at + 1) % corners) * 2 + 1]];
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

/** Buildings seen from above: triangles and boxes as outlines, walls as lines, each in the buckets its bounds touch. */
interface Shape {
  outline: number[];
  line: boolean;
}

const BUILDING_MODELS = ["shed-", "boathouse-"];
const LINDEN_SPREAD = new Map(LINDEN_SEEDS.map((seed) => [`linden-${seed}`, spreadOf(buildLinden(seed).near)]));
const shapeBuckets = new Map<string, Shape[]>();

function addShape(outline: number[], line: boolean): void {
  const xs = outline.filter((_, at) => at % 2 === 0);
  const zs = outline.filter((_, at) => at % 2 === 1);
  for (let bx = Math.floor(Math.min(...xs) / BUCKET_M); bx <= Math.floor(Math.max(...xs) / BUCKET_M); bx++) {
    for (let bz = Math.floor(Math.min(...zs) / BUCKET_M); bz <= Math.floor(Math.max(...zs) / BUCKET_M); bz++) {
      const key = `${bx},${bz}`;
      const list = shapeBuckets.get(key);
      if (list) list.push({ outline, line });
      else shapeBuckets.set(key, [{ outline, line }]);
    }
  }
}

function addBox(x: number, z: number, yaw: number, wide: number, long: number): void {
  // A model's own x lies along (cos yaw, -sin yaw) in the scene, and its z along (sin yaw, cos yaw).
  const [ax, az] = [(Math.cos(yaw) * wide) / 2, (-Math.sin(yaw) * wide) / 2];
  const [lx, lz] = [(Math.sin(yaw) * long) / 2, (Math.cos(yaw) * long) / 2];
  addShape([x + ax + lx, z + az + lz, x + lx - ax, z + lz - az, x - ax - lx, z - az - lz, x + ax - lx, z + az - lz], false);
}

function addBuildings(name: string): void {
  const tile = JSON.parse(readFileSync(join(FOLDER, name, "tile.json"), "utf8")) as TileManifest & { windmills?: number[][] };
  const data = gunzipSync(readFileSync(join(FOLDER, name, tile.solids.file)));
  const { cells, walls } = decodeSolids(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), tile.solids);
  for (const { positions, indices } of cells) {
    for (let at = 0; at < indices.length; at += 3) {
      const outline = [0, 1, 2].flatMap((corner) => [positions[indices[at + corner] * 3], positions[indices[at + corner] * 3 + 2]]);
      // A wall's triangles stand on edge: from above they're its line, which the walls hold.
      if (Math.abs((outline[2] - outline[0]) * (outline[5] - outline[1]) - (outline[4] - outline[0]) * (outline[3] - outline[1])) > 1e-3) addShape(outline, false);
    }
  }
  for (let at = 0; at < walls.length; at += 4) addShape(Array.from(walls.subarray(at, at + 4)), true);
  const models = tile.models ? (JSON.parse(readFileSync(join(FOLDER, name, tile.models.file), "utf8")) as ModelsFile).models : {};
  const places = Object.entries(models).flatMap(([model, listed]) => (BUILDING_MODELS.some((prefix) => model.startsWith(prefix)) ? listed : []));
  for (const [x, , z, yaw, wide, long] of [...places, ...(tile.windmills ?? [])]) addBox(x, z, yaw, wide, long);
}

function distanceToSegment(x: number, z: number, [ax, az, bx, bz]: number[]): number {
  const [dx, dz] = [bx - ax, bz - az];
  const along = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - along * dx, z - az - along * dz);
}

/** How far a point is from the nearest building, 0 inside one, or `reach` if none is nearer. */
function distanceToBuildings(x: number, z: number, reach: number): number {
  let best = reach;
  const seen = new Set<Shape>();
  for (let bx = Math.floor((x - reach) / BUCKET_M); bx <= Math.floor((x + reach) / BUCKET_M); bx++) {
    for (let bz = Math.floor((z - reach) / BUCKET_M); bz <= Math.floor((z + reach) / BUCKET_M); bz++) {
      for (const shape of shapeBuckets.get(`${bx},${bz}`) ?? []) {
        if (seen.has(shape)) continue;
        seen.add(shape);
        best = Math.min(best, shape.line ? distanceToSegment(x, z, shape.outline) : distanceToOutline(x, z, shape.outline));
        if (best === 0) return 0;
      }
    }
  }
  return best;
}

const counts = { trees: 0, onCarriageway: 0, onRibbon: 0, withinMetre: 0, crownOverCarriageway: 0, shortened: 0, shortenedByHalf: 0, trunkInBuilding: 0, crownInBuilding: 0, lindens: 0, lindenCrownInBuilding: 0 };
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
  shapeBuckets.clear();
  for (const near of manifest.tiles) {
    if (Math.abs(near.west - west) <= manifest.tileM && Math.abs(near.north - north) <= manifest.tileM) {
      addRoads(near.name);
      addBuildings(near.name);
    }
  }
  const tile = JSON.parse(readFileSync(join(FOLDER, name, "tile.json"), "utf8")) as TileManifest;
  const canopy = await decoded(join(FOLDER, name, manifest.canopy.file));
  if (!manifest.clearing) throw new Error("these tiles have no clearing round buildings: run pipeline/clearing.py over them");
  const clearing = await decoded(join(FOLDER, name, manifest.clearing.file));
  const clearingTexelM = manifest.tileM / manifest.clearing.pixels;
  const stands = gunzipSync(readFileSync(join(FOLDER, name, manifest.stands.file)));
  const top = -north;
  for (let row = Math.floor(top / NEAR_STEP_M) - 1; row <= Math.ceil((top + manifest.tileM) / NEAR_STEP_M) + 1; row++) {
    for (let column = Math.floor(west / NEAR_STEP_M) - 1; column <= Math.ceil((west + manifest.tileM) / NEAR_STEP_M) + 1; column++) {
      const [x, z] = treePlace(column, row);
      const [localX, localZ] = [x - west, z - top];
      if (localX < 0 || localZ < 0 || localX >= manifest.tileM || localZ >= manifest.tileM) continue;
      const canopyM = readImage(canopy.data, pixels, canopy.stride, 0, texelM, localX, localZ) * manifest.canopy.unitM;
      const clearanceM = (readImage(clearing.data, manifest.clearing.pixels, clearing.stride, 0, clearingTexelM, localX, localZ) - manifest.clearing.zero) * manifest.clearing.unitM;
      const rolled = treeHeight(column, row, canopyM);
      const height = CLEARED ? Math.min(rolled, tallestClear(clearanceM)) : rolled;
      if (height < SHORTEST_M) continue;
      if (!treeStands(column, row, readImage(stands, manifest.stands.pixels, 4, 3, manifest.tileM / manifest.stands.pixels, localX, localZ) / 255)) continue;
      if (GATED && Math.max(await roadsAt(x, z), await roadsAt(x + lookOver(x), z + lookOver(z))) > ROAD_COVERAGE) continue;
      counts.trees++;
      if (height < rolled) counts.shortened++;
      if (height < rolled / 2) counts.shortenedByHalf++;
      const reach = height * CROWN_REACH;
      const fromBuildings = distanceToBuildings(x, z, reach);
      if (fromBuildings === 0) counts.trunkInBuilding++;
      if (fromBuildings < reach) {
        counts.crownInBuilding++;
        if (WORST > 0) worst.push({ tile: name, x, z, height, into: reach - fromBuildings, clearance: clearanceM });
      }
      const list = buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(z / BUCKET_M)}`);
      if (!list) continue;
      let ribbon = Infinity;
      let carriage = Infinity;
      let tier = 0;
      for (const quad of list) {
        const here = distanceToOutline(x, z, quad.ribbon);
        if (here < ribbon) {
          ribbon = here;
          tier = quad.tier;
        }
        carriage = Math.min(carriage, distanceToOutline(x, z, quad.carriage));
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
  const roadside = tile.roadside ? (JSON.parse(readFileSync(join(FOLDER, name, tile.roadside.file), "utf8")) as RoadsideFile) : null;
  for (const [model, spread] of LINDEN_SPREAD) {
    const scales = roadside?.scales?.[model] ?? [];
    (roadside?.models[model] ?? []).forEach(([x, , z], at) => {
      counts.lindens++;
      const reach = scales[at] * spread;
      if (distanceToBuildings(x, z, reach) < reach) counts.lindenCrownInBuilding++;
    });
  }
}
console.log(JSON.stringify({ tiles: tiles.length, ...counts, onRibbonByTier: byTier }));
for (const tree of worst.sort((a, b) => b.into - a.into).slice(0, WORST)) console.log(JSON.stringify(tree));
