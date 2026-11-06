/*
 * Reading the pipeline's tiles (`pipeline/build.py` writes them; `tile.json`
 * describes the rest). Every position in a tile is metres east and north of the
 * world origin. In the scene, east is +x, up is +y and north is -z.
 */
import type { WindmillPlace } from "./tile-models";

/** Light on flat open ground in the baked shading: at this the photo shows as it was taken. */
export const FLAT_LIGHT = 0.8;
/** The photo already holds most of its own relief, so the baked shading only adds to it. */
export const SHADE_SHARE = 0.65;

/** A photo with its light in it, as the render draws it: RGBA in, sRGB bytes, and one shade byte for each pixel. */
export function litPhoto(ground: Uint8Array, shade: Uint8Array, gamma: number): Uint8ClampedArray<ArrayBuffer> {
  const brightness = Float32Array.from({ length: 256 }, (_, byte) => Math.max(1 + SHADE_SHARE * ((byte / 255) ** gamma / FLAT_LIGHT - 1), 0) ** (1 / 2.2));
  const lit = new Uint8ClampedArray(ground);
  for (let pixel = 0; pixel < shade.length; pixel++) {
    const by = brightness[shade[pixel]];
    for (let channel = 0; channel < 3; channel++) lit[pixel * 4 + channel] = ground[pixel * 4 + channel] * by;
  }
  return lit;
}

export interface TileManifest {
  tile: string;
  bounds: { west: number; south: number; east: number; north: number };
  roadSurface: {
    file: string;
    chains: RoadChain[];
    aprons?: { points: number; triangles: number; areaPoints?: number };
    /** The roads laid as one paved surface (`pipeline/paving.py`): the aprons are the whole drawn surface, and the chains' rings only say where each way runs. */
    paved?: boolean;
    /** The ground the paving cuts through, drawn in place of the grid's cells it lists. */
    groundCut?: { file: string; cells: number; points: number; triangles: number; walls: number };
  };
  solids: { file: string; unitM: number; cells: { x: number; z: number; vertices: number; indices: number }[]; walls: number };
  /** Boathouses and sheds drawn by the rural kit on real footprints. A tile built before them has none. */
  models?: { file: string };
  /** Jetties, piers, pontoons and boats from OSM's piers. A tile built before them has none. */
  docks?: { file: string };
  /** Dry-stone walls, as lines on the ground. A tile built before them has none. */
  walls?: { file: string };
  /** Lamps, poles, signs, rails, edge posts, mailboxes and shelters beside the roads. A tile built before them has none. */
  roadside?: { file: string };
  /** People, a file for each pipeline module that places them (`pipeline/people.py`). A tile with none has none. */
  people?: Record<string, { file: string }>;
  /** Cars parked in car parks and at kerbs. A tile built before them has none. */
  parked?: { file: string };
  /** The post mills standing in the tile (`pipeline/farm.py`). A tile with none has none. */
  windmills?: WindmillPlace[];
  /** The Västerhamn terminal and the fuel stations standing in the tile, drawn with its detail. A tile built before them has none. */
  nearSites?: LandmarkPlace[];
  /** The ground of town (`pipeline/town.py`): its surface image, and a class byte per road section. A tile built before it has none. */
  town?: { file: string; pixels: number; ribbons: string };
}

/** What `world.json` says about the whole of what's been built. */
export interface WorldManifest {
  version: string;
  tileM: number;
  worldOrigin: { east: number; north: number };
  tiles: WorldTileEntry[];
  /** Where the drive starts: this tile's chain. */
  start: { tile: string; chain: number };
  heights: HeightsFormat & { file: string };
  far: { nodes: number; stepM: number; heightsFile: string; shadeFile: string; shadePixels: number };
  shade: { file: string; pixels: number; gamma: number };
  mask: { file: string; pixels: number };
  /** The size of every tile's town image, which sizes its layers; absent while no tile has one. */
  town?: { pixels: number };
  ground: { file: string; pixels: number; farFile: string; farPixels: number };
  canopy: { file: string; pixels: number; unitM: number };
  stands: { file: string; pixels: number };
  /** Each 4 m pixel's share of rock, then each 8 m pixel's share of boulder field (`pipeline/rocks.py`), on every tile or none. */
  rock?: { file: string; pixels: number; fieldPixels: number };
  water: { levelsFile: string; farLevelsFile: string; shoreFile: string; farShoreFile: string; dryLevel: number };
  overview: OverviewFormat;
  map: { file: string };
  sun: { azimuthDeg: number; elevationDeg: number };
  attribution: string[];
}

/** The whole world, small: heights with the forest on them, and the land's colour with its light in it. */
export interface OverviewFormat {
  west: number;
  north: number;
  columns: number;
  rows: number;
  stepM: number;
  unitM: number;
  heightsFile: string;
  imageFile: string;
  imageWidth: number;
  imageHeight: number;
}

export interface WorldTileEntry {
  name: string;
  west: number;
  north: number;
  /** The churches and landmarks standing in the tile (`pipeline/landmarks.py`). A tile built before them has none. */
  landmarks?: LandmarkPlace[];
  /** The post mills standing in the tile, carried here so every mill on the island stands from the start. */
  windmills?: WindmillPlace[];
}

/** A site's model, and its origin in the scene: where its art's origin goes, and a turn about it that takes its +z to (sin yaw, cos yaw). */
export interface LandmarkPlace {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface HeightsFormat {
  nodes: number;
  stepM: number;
  unitM: number;
}

/** One continuous drive through the network, the greatest road first: chain 0 is the tile's main road. */
export interface RoadChain {
  sections: number;
  kind: string;
  ref?: string;
  name?: string;
  motor: boolean;
  /** Sealed or loose, where OSM's surface says: otherwise its class and how built up it is decide. */
  sealed?: boolean;
  /** The first and last section of each stretch held up over a gap. */
  spans?: [number, number][];
  /** Which of those spans run along a quay, a pier that carries the road: they're its decks, not bridges. */
  quays?: number[];
}

/** How many pixels across a tile's 8 m layer of boulder fields and reed clearing is: the rock's, or half the mask's where the world has no rock. */
export const fieldPixelsOf = (world: WorldManifest) => world.rock?.fieldPixels ?? world.mask.pixels / 2;

/** Cross-sections across a road, in rings of five points: outer left, edge left, centre, edge right, outer right. */
export const RING_POINTS = 5;
const RING_FLOATS = RING_POINTS * 3;
const APRON_POINT_FLOATS = 5;
/** The paving's numbers, as `pipeline/paving_file.py` writes them: places and heights in millimetres, across in 1024ths, along in centimetres. */
const MM = 1000;
const ACROSS_UNITS = 1024;
const ALONG_UNITS = 100;
/** A way's run is twice its angle, in steps of this, or none. */
const RUN_STEP = Math.PI / 32;
const NO_RUN = 255;
/** Bytes a point of paving takes: five int32 columns, across's int16 and three bytes. */
const PAVING_POINT_BYTES = 5 * 4 + 2 + 3;
/** A point of paving that's a car park's, not any way's. */
export const AREA_WAY = -2;

export interface RoadAprons {
  firstPoint: number;
  /** The points from here on are car parks and bus stations: paving of their own, not the road nearest them. */
  firstAreaPoint: number;
  /** Per point, as `RibbonMesh`'s. */
  across: Float32Array;
  tiers: Float32Array;
  /** Per point of paving: metres of paint along its way, and the way, an index into `chains` or `AREA_WAY`. Empty for aprons. */
  along: Float32Array;
  ways: Int32Array;
  /** Per point of paving: what its way's own tags pave it with, a class of `art/town-ground`'s `CLASS`. Empty for aprons. */
  classes: Uint8Array;
  /** Per point of paving, two floats: the cosine and sine of twice the angle its way runs at, in (east, north). Empty for aprons. */
  runs: Float32Array;
  indices: Uint32Array;
}

/** The baked road surface in scene space: every ribbon's rings end to end. */
export interface RoadSurface {
  rings: Float32Array;
  /** Each section's tier, an index into `ROAD_TIERS`. */
  tiers: Uint8Array;
  chains: (RoadChain & { first: number })[];
  /** The junction aprons, or the whole paving: their points follow the chains' in `rings`, and they number their triangles from there. */
  aprons: RoadAprons;
  /** Whether the aprons are the whole paving, and the chains' rings aren't drawn. */
  paved: boolean;
}

export const ROAD_TIERS = ["main", "minor", "track"] as const;
export type RoadTier = (typeof ROAD_TIERS)[number];

/** Heights on a square grid, rows from north to south. */
export interface HeightGrid {
  nodes: number;
  stepM: number;
  west: number;
  north: number;
  heights: Float32Array;
}

export function decodeHeights(deltas: Int16Array, format: HeightsFormat, tile: { west: number; north: number }): HeightGrid {
  const { nodes, stepM, unitM } = format;
  if (deltas.length !== nodes * nodes) throw new Error(`expected ${nodes * nodes} heights, got ${deltas.length}`);
  const heights = new Float32Array(deltas.length);
  for (let row = 0; row < nodes; row++) {
    let units = 0;
    for (let column = 0; column < nodes; column++) {
      units += deltas[row * nodes + column];
      heights[row * nodes + column] = units * unitM;
    }
  }
  return { nodes, stepM, west: tile.west, north: tile.north, heights };
}

/**
 * The height of the drawn surface at a point: on the same two triangles the
 * terrain mesh makes of each cell, so what sits on it never floats or sinks.
 */
export function surfaceHeight(grid: HeightGrid, east: number, north: number): number {
  const last = grid.nodes - 1;
  const columnAt = Math.min(Math.max((east - grid.west) / grid.stepM, 0), last);
  const rowAt = Math.min(Math.max((grid.north - north) / grid.stepM, 0), last);
  const column = Math.min(Math.floor(columnAt), last - 1);
  const row = Math.min(Math.floor(rowAt), last - 1);
  const across = columnAt - column;
  const down = rowAt - row;
  const at = (r: number, c: number) => grid.heights[r * grid.nodes + c];
  const northWest = at(row, column);
  const northEast = at(row, column + 1);
  const southWest = at(row + 1, column);
  const southEast = at(row + 1, column + 1);
  if (across + down <= 1) return northWest + across * (northEast - northWest) + down * (southWest - northWest);
  return southEast + (1 - across) * (southWest - southEast) + (1 - down) * (northEast - southEast);
}

/** Triangle indices for a square patch of nodes: each cell split from its north-east to its south-west corner. */
export function patchIndices(cells: number): Uint32Array {
  const across = cells + 1;
  const indices = new Uint32Array(cells * cells * 6);
  let next = 0;
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const northWest = row * across + column;
      const northEast = northWest + 1;
      const southWest = northWest + across;
      const southEast = southWest + 1;
      indices.set([northWest, southWest, northEast, northEast, southWest, southEast], next);
      next += 6;
    }
  }
  return indices;
}

/**
 * Points as `pipeline/paving_file.py` writes them, into scene space from `at`: millimetres east of the tile's west and
 * south of its north, each the difference from the last point's, and millimetres off the grid's drawn surface there.
 */
function placePoints(east: Int32Array, north: Int32Array, height: Int32Array, grid: HeightGrid, into: Float32Array, at: number): void {
  let [eastMm, southMm] = [0, 0];
  for (let point = 0; point < east.length; point++) {
    eastMm += east[point];
    southMm += north[point];
    const x = grid.west + eastMm / MM;
    const y = grid.north - southMm / MM;
    into[at + point * 3] = x;
    into[at + point * 3 + 1] = surfaceHeight(grid, x, y) + height[point] / MM;
    into[at + point * 3 + 2] = -y;
  }
}

/** Triangles listed from their least corner: that corner as the difference from the last one's, the other two from it. */
function triangleCorners(coded: Int32Array): Uint32Array {
  const corners = new Uint32Array(coded.length);
  let least = 0;
  for (let at = 0; at < coded.length; at += 3) {
    least += coded[at];
    corners[at] = least;
    corners[at + 1] = least + coded[at + 1];
    corners[at + 2] = least + coded[at + 2];
  }
  return corners;
}

/** The pipeline writes (east, north, height); the scene is (east, up, -north). A paved tile's heights are off its grid's. */
export function decodeRoadSurface(data: ArrayBuffer, manifest: TileManifest, grid: HeightGrid): RoadSurface {
  const sections = manifest.roadSurface.chains.reduce((sum, chain) => sum + chain.sections, 0);
  const floats = sections * RING_FLOATS;
  const { points, triangles, areaPoints = 0 } = manifest.roadSurface.aprons ?? { points: 0, triangles: 0 };
  const paving = manifest.roadSurface.paved === true;
  const baked = new Float32Array(data, 0, floats);
  const apronsAt = floats * 4 + sections;
  const apronBytes = points * (paving ? PAVING_POINT_BYTES : APRON_POINT_FLOATS * 4) + triangles * 12;
  if (data.byteLength !== apronsAt + apronBytes) throw new Error(`${manifest.tile}: expected ${sections} road sections and ${points} apron points, got ${data.byteLength} bytes`);
  const rings = new Float32Array(floats + points * 3);
  for (let at = 0; at < floats; at += 3) {
    rings[at] = baked[at];
    rings[at + 1] = baked[at + 2];
    rings[at + 2] = -baked[at + 1];
  }
  let first = 0;
  const chains = manifest.roadSurface.chains.map((chain) => {
    const placed = { ...chain, first };
    first += chain.sections;
    return placed;
  });
  const across = new Float32Array(points);
  const tiers = new Float32Array(points);
  const along = new Float32Array(paving ? points : 0);
  const ways = new Int32Array(paving ? points : 0);
  const classes = new Uint8Array(paving ? points : 0);
  const runs = new Float32Array(paving ? points * 2 : 0);
  // After a byte per section, so not on a boundary a typed array can view.
  const aprons = data.slice(apronsAt);
  let indices: Uint32Array;
  if (paving) {
    const words = new Int32Array(aprons, 0, 5 * points + 3 * triangles);
    const column = (index: number) => words.subarray(index * points, (index + 1) * points);
    placePoints(column(0), column(1), column(2), grid, rings, floats);
    const [alongCm, way] = [column(3), column(4)];
    indices = triangleCorners(words.subarray(5 * points));
    const across1024 = new Int16Array(aprons, words.byteLength, points);
    const bytes = new Uint8Array(aprons, words.byteLength + across1024.byteLength, 3 * points);
    for (let point = 0; point < points; point++) {
      across[point] = across1024[point] / ACROSS_UNITS;
      along[point] = alongCm[point] / ALONG_UNITS;
      ways[point] = way[point];
      tiers[point] = bytes[point];
      classes[point] = bytes[points + point];
      const run = bytes[2 * points + point];
      if (run !== NO_RUN) {
        runs[point * 2] = Math.cos(run * RUN_STEP);
        runs[point * 2 + 1] = Math.sin(run * RUN_STEP);
      }
    }
  } else {
    const apronPoints = new Float32Array(aprons, 0, points * APRON_POINT_FLOATS);
    for (let point = 0; point < points; point++) {
      const at = point * APRON_POINT_FLOATS;
      rings.set([apronPoints[at], apronPoints[at + 2], -apronPoints[at + 1]], floats + point * 3);
      across[point] = apronPoints[at + 3];
      tiers[point] = apronPoints[at + 4];
    }
    indices = new Uint32Array(aprons, apronPoints.byteLength, triangles * 3);
  }
  return {
    rings,
    tiers: new Uint8Array(data, floats * 4, sections),
    chains,
    aprons: { firstPoint: sections * RING_POINTS, firstAreaPoint: sections * RING_POINTS + points - areaPoints, across, tiers, along, ways, classes, runs, indices },
    paved: paving,
  };
}

/** The ground the paving cuts through: which of the height grid's cells it replaces, and its triangles in scene space. */
export interface GroundCut {
  /** Row * cells + column of each cell of the tile's height grid drawn and collided with as these triangles instead. */
  cells: Uint32Array;
  positions: Float32Array;
  indices: Uint32Array;
  /** How many of the last triangles are underpasses' walls, drawn as concrete. */
  walls: number;
}

export function decodeGroundCut(data: ArrayBuffer, manifest: TileManifest, grid: HeightGrid): GroundCut {
  const cut = manifest.roadSurface.groundCut;
  if (!cut) return { cells: new Uint32Array(0), positions: new Float32Array(0), indices: new Uint32Array(0), walls: 0 };
  if (data.byteLength !== cut.cells * 4 + cut.points * 12 + cut.triangles * 12) throw new Error(`${manifest.tile}: expected ${cut.cells} cut cells and ${cut.points} points, got ${data.byteLength} bytes`);
  const words = new Int32Array(data);
  const cells = new Uint32Array(cut.cells);
  let cell = 0;
  for (let at = 0; at < cut.cells; at++) {
    cell += words[at];
    cells[at] = cell;
  }
  const column = (index: number) => words.subarray(cut.cells + index * cut.points, cut.cells + (index + 1) * cut.points);
  const positions = new Float32Array(cut.points * 3);
  placePoints(column(0), column(1), column(2), grid, positions, 0);
  const trianglesAt = cut.cells + 3 * cut.points;
  const ground = cut.triangles - cut.walls;
  // The walls are listed on their own, after the ground: they're drawn as concrete.
  const indices = new Uint32Array(cut.triangles * 3);
  indices.set(triangleCorners(words.subarray(trianglesAt, trianglesAt + ground * 3)));
  indices.set(triangleCorners(words.subarray(trianglesAt + ground * 3)), ground * 3);
  return { cells, positions, indices, walls: cut.walls };
}
