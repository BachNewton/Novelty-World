// Builds the playground's tile (`playground/layout.ts`) in the files and formats the pipeline writes for a real one,
// into the site's public folder, where `?playground` reads it: the game drives it with nothing of its own changed.
// It is all made up, so it takes nothing from the pipeline and needs no data: flat land, the layout's roads laid on
// it, rock where the layout has it and forest round the edges. A few seconds on one core.
//
//   npx tsx src/projects/aland-drive/tools/playground.ts
//
// Run it after any change to the layout; the files it writes are committed.

// Every path written is the tool's own output folder and the file names below, never anything from outside.
/* eslint-disable security/detect-non-literal-fs-filename -- see above */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { PLAYGROUND_FOREST_FROM_M, PLAYGROUND_ROADS, PLAYGROUND_ROCK, PLAYGROUND_TILE, PLAYGROUND_TILE_M, type PlaygroundRoad } from "../playground/layout";
import { PLAYGROUND_FOLDER } from "../playground/place";
import type { RoadMapFile } from "../map/road-graph";
import type { TileManifest, WorldManifest } from "../render/tile";

const OUT = join("public", PLAYGROUND_FOLDER);
const TILE = PLAYGROUND_TILE.name;
const NODES = 1501;
const STEP_M = PLAYGROUND_TILE_M / (NODES - 1);
const FAR_NODES = 376;
const FAR_STEP_M = PLAYGROUND_TILE_M / (FAR_NODES - 1);
const UNIT_M = 0.01;
const GROUND_M = 10;
/** The carriageway stands this far over the land, its shoulder easing down to it, so no land shows through the road. */
const ROAD_OVER_M = 0.12;
const CROWN_M = 0.04;
const DRY_LEVEL_M = -300;
const SHADE_PIXELS = 3000;
const FAR_SHADE_PIXELS = 750;
const MASK_PIXELS = 1500;
const FIELD_PIXELS = 750;
const GROUND_PIXELS = 3000;
const FAR_GROUND_PIXELS = 750;
const CANOPY_PIXELS = 1500;
const CANOPY_UNIT_M = 0.25;
const STANDS_PIXELS = 125;
const SECTION_M = 4;
const OVERVIEW_STEP_M = 80;
const OVERVIEW_RIM_M = 6000;
const MAP_UNIT_M = 0.1;
/** Flat open ground in the baked shading: the photo shows as it was taken (`FLAT_LIGHT` in `render/tile.ts`). */
const FLAT_SHADE = Math.round(255 * 0.8 ** (1 / 2.2));
const FOREST_M = 18;
const SEA: readonly [number, number, number] = [44, 66, 82];

const west = PLAYGROUND_TILE.west;
const north = PLAYGROUND_TILE.north;
const middleEast = west + PLAYGROUND_TILE_M / 2;
const middleNorth = north - PLAYGROUND_TILE_M / 2;

/** East and north in the world from east and north of the middle. */
const world = ([x, y]: readonly [number, number]) => [middleEast + x, middleNorth + y] as const;

/** A closed loop rounded through its points, or an open line, as points every few metres. */
function lineOf(road: PlaygroundRoad): [number, number][] {
  const through = road.through.map(world);
  const fine: [number, number][] = [];
  if (!road.closed) {
    const [[ax, ay], [bx, by]] = through;
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / SECTION_M);
    for (let step = 0; step <= steps; step++) fine.push([ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps]);
    return fine;
  }
  // Catmull-Rom through the loop, finely, then resampled by distance.
  const count = through.length;
  const dense: [number, number][] = [];
  for (let segment = 0; segment < count; segment++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((offset) => through[(segment + offset + count) % count]);
    for (let step = 0; step < 200; step++) {
      const t = step / 200;
      const at = (axis: 0 | 1) => 0.5 * (2 * p1[axis] + (p2[axis] - p0[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t * t + (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t * t * t);
      dense.push([at(0), at(1)]);
    }
  }
  dense.push(dense[0]);
  let length = 0;
  const lengths = dense.map((point, at) => (length += at === 0 ? 0 : Math.hypot(point[0] - dense[at - 1][0], point[1] - dense[at - 1][1])));
  const steps = Math.round(length / SECTION_M);
  let cursor = 0;
  for (let step = 0; step < steps; step++) {
    const want = (step / steps) * length;
    while (lengths[cursor + 1] < want) cursor++;
    const share = (want - lengths[cursor]) / (lengths[cursor + 1] - lengths[cursor]);
    fine.push([dense[cursor][0] + share * (dense[cursor + 1][0] - dense[cursor][0]), dense[cursor][1] + share * (dense[cursor + 1][1] - dense[cursor][1])]);
  }
  fine.push(fine[0]);
  return fine;
}

const lines = PLAYGROUND_ROADS.map(lineOf);

/** Each section as five points across, from outer left to outer right, as the pipeline writes them. */
function ringsOf(road: PlaygroundRoad, line: [number, number][]): number[] {
  const floats: number[] = [];
  line.forEach(([x, y], at) => {
    const [ax, ay] = line[Math.max(at - 1, 0)];
    const [bx, by] = line[Math.min(at + 1, line.length - 1)];
    const ahead = road.closed && (at === 0 || at === line.length - 1) ? [line[1][0] - line[line.length - 2][0], line[1][1] - line[line.length - 2][1]] : [bx - ax, by - ay];
    const size = Math.hypot(ahead[0], ahead[1]);
    const [leftX, leftY] = [-ahead[1] / size, ahead[0] / size];
    const outer = road.halfWidthM + road.shoulderM;
    const top = GROUND_M + ROAD_OVER_M;
    for (const [across, height] of [[outer, GROUND_M], [road.halfWidthM, top], [0, top + CROWN_M], [-road.halfWidthM, top], [-outer, GROUND_M]] as const) {
      floats.push(x + leftX * across, y + leftY * across, height);
    }
  });
  return floats;
}

const gz = (bytes: Uint8Array) => gzipSync(bytes, { level: 9 });

/** Heights as the pipeline codes them: whole units, each row as differences along itself. */
function heightsFile(nodes: number, value: (column: number, row: number) => number): Buffer {
  const deltas = new Int16Array(nodes * nodes);
  for (let row = 0; row < nodes; row++) {
    let before = 0;
    for (let column = 0; column < nodes; column++) {
      const units = Math.round(value(column, row) / UNIT_M);
      deltas[row * nodes + column] = units - before;
      before = units;
    }
  }
  return gz(new Uint8Array(deltas.buffer));
}

/** A value per pixel of a square image over the tile, from the place at the pixel's middle: east and north of the playground's middle. */
function overTile(pixels: number, channels: number, value: (x: number, y: number) => readonly number[]): Uint8Array {
  const bytes = new Uint8Array(pixels * pixels * channels);
  const size = PLAYGROUND_TILE_M / pixels;
  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      const values = value(-PLAYGROUND_TILE_M / 2 + (column + 0.5) * size, PLAYGROUND_TILE_M / 2 - (row + 0.5) * size);
      bytes.set(values, (row * pixels + column) * channels);
    }
  }
  return bytes;
}

const inRock = (x: number, y: number) => PLAYGROUND_ROCK.some(([ax, ay, bx, by]) => x >= ax && x <= bx && y >= ay && y <= by);
const inForest = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y)) >= PLAYGROUND_FOREST_FROM_M;

/** Which road covers a place, as main or lesser: a few metres a cell, so the far terrain paints the roads where the ribbons have gone. */
const coverage = (() => {
  const cells = new Map<string, { main: boolean }>();
  const cellM = PLAYGROUND_TILE_M / MASK_PIXELS;
  PLAYGROUND_ROADS.forEach((road, index) => {
    for (const [ex, ny] of lines[index]) {
      const reach = Math.ceil(road.halfWidthM / cellM);
      const [cx, cy] = [Math.floor((ex - west) / cellM), Math.floor((north - ny) / cellM)];
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) cells.set(`${cx + dx},${cy + dy}`, { main: road.kind === "primary" });
    }
  });
  return (column: number, row: number) => cells.get(`${column},${row}`);
})();

/** A little noise, the same every build. */
const noise = (x: number, y: number) => {
  const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return hash - Math.floor(hash);
};

const webp = (pixels: Uint8Array, size: number, channels: 3 | 4, lossless = false) => sharp(pixels, { raw: { width: size, height: size, channels } }).webp(lossless ? { lossless: true } : { quality: 75 }).toBuffer();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, TILE), { recursive: true });
const write = (file: string, bytes: Uint8Array | string) => {
  writeFileSync(join(OUT, file), bytes);
};

const sections = lines.map((line) => line.length);
const rings = new Float32Array(PLAYGROUND_ROADS.flatMap((road, index) => ringsOf(road, lines[index])));
const tiers = Uint8Array.from(PLAYGROUND_ROADS.flatMap((road, index) => Array.from({ length: sections[index] }, () => (road.kind === "primary" ? 0 : 1))));
const surface = new Uint8Array(rings.byteLength + tiers.length);
surface.set(new Uint8Array(rings.buffer));
surface.set(tiers, rings.byteLength);
write(`${TILE}/road-surface.bin.gz`, gz(surface));

write(`${TILE}/heights.bin.gz`, heightsFile(NODES, () => GROUND_M));
write(`${TILE}/heights-far.bin.gz`, heightsFile(FAR_NODES, () => GROUND_M));
write(`${TILE}/water-levels.bin.gz`, heightsFile(NODES, () => DRY_LEVEL_M));
write(`${TILE}/water-levels-far.bin.gz`, heightsFile(FAR_NODES, () => DRY_LEVEL_M));
write(`${TILE}/shore.bin.gz`, heightsFile(NODES, () => DRY_LEVEL_M));
write(`${TILE}/shore-far.bin.gz`, heightsFile(FAR_NODES, () => DRY_LEVEL_M));
write(`${TILE}/solids.bin.gz`, gz(new Uint8Array(0)));

const shade = (pixels: number) => webp(new Uint8Array(pixels * pixels * 3).fill(FLAT_SHADE), pixels, 3, true);
write(`${TILE}/shade.webp`, await shade(SHADE_PIXELS));
write(`${TILE}/shade-far.webp`, await shade(FAR_SHADE_PIXELS));

const land = (x: number, y: number): readonly number[] => {
  const fine = noise(Math.floor(x / 8), Math.floor(y / 8)) * 10 - 5;
  const broad = (noise(Math.floor(x / 40), Math.floor(y / 40)) - 0.5) * 18;
  if (inRock(x, y)) return [158 + fine + broad, 150 + fine + broad, 142 + fine + broad, 255];
  if (inForest(x, y)) return [58 + fine, 72 + fine + broad, 44 + fine, 255];
  return [96 + fine + broad, 118 + fine + broad, 62 + fine, 255];
};
write(`${TILE}/ground.webp`, await webp(overTile(GROUND_PIXELS, 4, land), GROUND_PIXELS, 4));
write(`${TILE}/ground-far.webp`, await webp(overTile(FAR_GROUND_PIXELS, 4, land), FAR_GROUND_PIXELS, 4));

const mask = new Uint8Array(MASK_PIXELS * MASK_PIXELS * 4);
for (let row = 0; row < MASK_PIXELS; row++) {
  for (let column = 0; column < MASK_PIXELS; column++) {
    const road = coverage(column, row);
    mask.set([0, road?.main === true ? 255 : 0, road && !road.main ? 255 : 0, 255], (row * MASK_PIXELS + column) * 4);
  }
}
write(`${TILE}/mask.png`, await sharp(mask, { raw: { width: MASK_PIXELS, height: MASK_PIXELS, channels: 4 } }).png().toBuffer());

const canopy = overTile(CANOPY_PIXELS, 3, (x, y) => Array(3).fill(inForest(x, y) ? Math.round((FOREST_M * (0.8 + 0.4 * noise(Math.floor(x / 24), Math.floor(y / 24)))) / CANOPY_UNIT_M) : 0));
write(`${TILE}/canopy.webp`, await webp(canopy, CANOPY_PIXELS, 3, true));
// Pine, spruce and birch, the rest other broadleaf, then the share of places holding a tree.
write(`${TILE}/stands.bin.gz`, gz(overTile(STANDS_PIXELS, 4, (x, y) => (inForest(x, y) ? [110, 100, 35, 230] : [0, 0, 0, 0]))));
const rock = new Uint8Array(MASK_PIXELS * MASK_PIXELS + FIELD_PIXELS * FIELD_PIXELS);
rock.set(overTile(MASK_PIXELS, 1, (x, y) => [inRock(x, y) ? 255 : 0]));
write(`${TILE}/rock.bin.gz`, gz(rock));

const tileManifest: TileManifest = {
  tile: TILE,
  bounds: { west, south: north - PLAYGROUND_TILE_M, east: west + PLAYGROUND_TILE_M, north },
  roadSurface: { file: "road-surface.bin.gz", chains: PLAYGROUND_ROADS.map(({ name, kind, sealed }, index) => ({ sections: sections[index], kind, motor: true, sealed, name })) },
  solids: { file: "solids.bin.gz", unitM: 0.02, cells: [], walls: 0 },
};
write(`${TILE}/tile.json`, JSON.stringify(tileManifest));

// The overview: the tile, and sea all round it out to the rim.
const overviewWest = west - OVERVIEW_RIM_M;
const overviewNorth = north + OVERVIEW_RIM_M;
const overviewNodes = (PLAYGROUND_TILE_M + 2 * OVERVIEW_RIM_M) / OVERVIEW_STEP_M + 1;
const onTile = (column: number, row: number) => {
  const [x, y] = [overviewWest + column * OVERVIEW_STEP_M, overviewNorth - row * OVERVIEW_STEP_M];
  return x >= west && x <= west + PLAYGROUND_TILE_M && y <= north && y >= north - PLAYGROUND_TILE_M;
};
write("overview-heights.bin.gz", heightsFile(overviewNodes, (column, row) => (onTile(column, row) ? GROUND_M : -1)));
const overview = new Uint8Array(overviewNodes * overviewNodes * 4);
for (let row = 0; row < overviewNodes; row++) {
  for (let column = 0; column < overviewNodes; column++) {
    const [x, y] = [overviewWest + column * OVERVIEW_STEP_M - middleEast, overviewNorth - row * OVERVIEW_STEP_M - middleNorth];
    overview.set(onTile(column, row) ? land(x, y) : [...SEA, 255], (row * overviewNodes + column) * 4);
  }
}
write("overview.webp", await webp(overview, overviewNodes, 4, true));

// The road map, for the mini map, the world map and the GPS: each road one edge, a loop from its node back to it.
const nodes: number[] = [];
const map: RoadMapFile = { unitM: MAP_UNIT_M, names: PLAYGROUND_ROADS.map(({ name }) => name), kinds: ["primary", "unclassified"], nodes, from: [], to: [], kind: [], name: [], flags: [], counts: [], points: [] };
const units = ([x, y]: readonly [number, number]) => [Math.round(x / MAP_UNIT_M), Math.round(y / MAP_UNIT_M)];
PLAYGROUND_ROADS.forEach((road, index) => {
  const line = lines[index];
  const start = nodes.length / 2;
  nodes.push(...units(line[0]));
  const end = road.closed ? start : start + 1;
  if (!road.closed) nodes.push(...units(line[line.length - 1]));
  const between = line.slice(1, -1).filter((_, at) => at % 4 === 0);
  let [x, y] = units(line[0]);
  for (const point of between) {
    const [px, py] = units(point);
    map.points.push(px - x, py - y);
    [x, y] = [px, py];
  }
  map.from.push(start);
  map.to.push(end);
  map.kind.push(road.kind === "primary" ? 0 : 1);
  map.name.push(index);
  map.flags.push(2);
  map.counts.push(between.length);
});
write("map.json.gz", gz(new TextEncoder().encode(JSON.stringify(map))));

const version = createHash("sha256").update(rings).update(JSON.stringify(PLAYGROUND_ROCK)).update(String(PLAYGROUND_FOREST_FROM_M)).digest("hex").slice(0, 12);
const worldManifest: WorldManifest = {
  version,
  tileM: PLAYGROUND_TILE_M,
  worldOrigin: { east: 110000, north: 6690000 },
  tiles: [{ name: TILE, west, north }],
  start: { tile: TILE, chain: 0 },
  heights: { file: "heights.bin.gz", nodes: NODES, stepM: STEP_M, unitM: UNIT_M },
  far: { heightsFile: "heights-far.bin.gz", nodes: FAR_NODES, stepM: FAR_STEP_M, shadeFile: "shade-far.webp", shadePixels: FAR_SHADE_PIXELS },
  shade: { file: "shade.webp", pixels: SHADE_PIXELS, gamma: 2.2 },
  mask: { file: "mask.png", pixels: MASK_PIXELS },
  ground: { file: "ground.webp", pixels: GROUND_PIXELS, farFile: "ground-far.webp", farPixels: FAR_GROUND_PIXELS },
  canopy: { file: "canopy.webp", pixels: CANOPY_PIXELS, unitM: CANOPY_UNIT_M },
  stands: { file: "stands.bin.gz", pixels: STANDS_PIXELS },
  water: { levelsFile: "water-levels.bin.gz", farLevelsFile: "water-levels-far.bin.gz", shoreFile: "shore.bin.gz", farShoreFile: "shore-far.bin.gz", dryLevel: DRY_LEVEL_M },
  overview: { west: overviewWest, north: overviewNorth, columns: overviewNodes, rows: overviewNodes, stepM: OVERVIEW_STEP_M, unitM: UNIT_M, heightsFile: "overview-heights.bin.gz", imageFile: "overview.webp", imageWidth: overviewNodes, imageHeight: overviewNodes },
  map: { file: "map.json.gz" },
  sun: { azimuthDeg: 215, elevationDeg: 30 },
  attribution: [],
  rock: { file: "rock.bin.gz", pixels: MASK_PIXELS, fieldPixels: FIELD_PIXELS },
};
write("world.json", JSON.stringify(worldManifest));
console.log(`playground ${version}: ${PLAYGROUND_ROADS.length} roads, ${sections.reduce((sum, count) => sum + count, 0)} sections, into ${OUT}`);
