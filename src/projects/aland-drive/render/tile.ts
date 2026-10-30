/*
 * Reading the pipeline's tiles (`pipeline/build.py` writes them; `tile.json`
 * describes the rest). Every position in a tile is metres east and north of the
 * world origin. In the scene, east is +x, up is +y and north is -z.
 */

export interface TileManifest {
  tile: string;
  worldOrigin: { east: number; north: number };
  bounds: { west: number; south: number; east: number; north: number };
  heights: { file: string; nodes: number; stepM: number; unitM: number };
  shade: { file: string; gamma: number };
  water: { file: string; nodesFile: string };
  roadSurface: { file: string; chains: RoadChain[] };
  sun: { azimuthDeg: number; elevationDeg: number };
  attribution: string[];
}

/** One continuous drive through the network, the greatest road first: chain 0 is the tile's main road. */
export interface RoadChain {
  sections: number;
  kind: string;
  ref?: string;
  name?: string;
  motor: boolean;
}

/** Cross-sections across a road, in rings of five points: outer left, edge left, centre, edge right, outer right. */
export const RING_POINTS = 5;
const RING_FLOATS = RING_POINTS * 3;

/** The baked road surface in scene space: every ribbon's rings end to end. */
export interface RoadSurface {
  rings: Float32Array;
  /** Each section's tier, an index into `ROAD_TIERS`. */
  tiers: Uint8Array;
  chains: (RoadChain & { first: number })[];
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

export function decodeHeights(deltas: Int16Array, manifest: TileManifest): HeightGrid {
  const { nodes, stepM, unitM } = manifest.heights;
  if (deltas.length !== nodes * nodes) throw new Error(`${manifest.tile}: expected ${nodes * nodes} heights, got ${deltas.length}`);
  const heights = new Float32Array(deltas.length);
  for (let row = 0; row < nodes; row++) {
    let units = 0;
    for (let column = 0; column < nodes; column++) {
      units += deltas[row * nodes + column];
      heights[row * nodes + column] = units * unitM;
    }
  }
  return { nodes, stepM, west: manifest.bounds.west, north: manifest.bounds.north, heights };
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

/** The pipeline writes (east, north, height); the scene is (east, up, -north). */
export function decodeRoadSurface(data: ArrayBuffer, manifest: TileManifest): RoadSurface {
  const sections = manifest.roadSurface.chains.reduce((sum, chain) => sum + chain.sections, 0);
  const floats = sections * RING_FLOATS;
  const baked = new Float32Array(data, 0, floats);
  if (data.byteLength !== floats * 4 + sections) throw new Error(`${manifest.tile}: expected ${sections} road sections, got ${data.byteLength} bytes`);
  const rings = new Float32Array(floats);
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
  return { rings, tiers: new Uint8Array(data, floats * 4), chains };
}

/** Everything about a tile the simulation needs, with no GPU in sight. */
export interface TileData {
  manifest: TileManifest;
  grid: HeightGrid;
  surface: RoadSurface;
  /** A byte per height node: 1 on a lake or the sea. */
  waterNodes: Uint8Array;
}

async function fetchInflated(url: string): Promise<ArrayBuffer> {
  const response = await fetchOk(url);
  if (!response.body) throw new Error(`${url}: empty response`);
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

export async function loadTile(base: string): Promise<TileData & { shade: ImageBitmap; water: ImageBitmap }> {
  const manifest = await fetchOk(`${base}/tile.json`).then((response) => response.json() as Promise<TileManifest>);
  const [heights, surface, waterNodes, shade, water] = await Promise.all([
    fetchInflated(`${base}/${manifest.heights.file}`),
    fetchInflated(`${base}/${manifest.roadSurface.file}`),
    fetchInflated(`${base}/${manifest.water.nodesFile}`),
    fetchBitmap(`${base}/${manifest.shade.file}`),
    fetchBitmap(`${base}/${manifest.water.file}`),
  ]);
  return {
    manifest,
    grid: decodeHeights(new Int16Array(heights), manifest),
    surface: decodeRoadSurface(surface, manifest),
    waterNodes: new Uint8Array(waterNodes),
    shade,
    water,
  };
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetchOk(url);
  return createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}
