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
  water: { file: string };
  roads: { file: string };
  attribution: string[];
}

export interface Road {
  kind: string;
  motor: boolean;
  line: [east: number, north: number][];
}

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

export async function loadTile(base: string): Promise<{ manifest: TileManifest; grid: HeightGrid; roads: Road[]; shade: ImageBitmap; water: ImageBitmap }> {
  const manifest = await fetchOk(`${base}/tile.json`).then((response) => response.json() as Promise<TileManifest>);
  const [grid, roads, shade, water] = await Promise.all([
    fetchOk(`${base}/${manifest.heights.file}`).then(async (response) => {
      if (!response.body) throw new Error(`${manifest.heights.file}: empty response`);
      const inflated = new Response(response.body.pipeThrough(new DecompressionStream("gzip")));
      return decodeHeights(new Int16Array(await inflated.arrayBuffer()), manifest);
    }),
    fetchOk(`${base}/${manifest.roads.file}`).then(async (response) => ((await response.json()) as { roads: Road[] }).roads),
    fetchBitmap(`${base}/${manifest.shade.file}`),
    fetchBitmap(`${base}/${manifest.water.file}`),
  ]);
  return { manifest, grid, roads, shade, water };
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
