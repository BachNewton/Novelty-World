import { decodeRoadSurface, surfaceHeight, type HeightGrid, type RoadSurface, type TileManifest, type WorldManifest } from "../render/tile";
import { bridgeKit, type BridgeKit } from "../render/bridges";
import { ribbonMesh, type RibbonMesh } from "../render/roads";
import { RoadNet, tileRoads, type TileRoads } from "./road-net";

/*
 * Everything known about the land, for the simulation and the terrain mesh
 * alike, with no GPU in it. An overview of the whole world comes first; tiles
 * near the car have their far heights, and those nearer still their detail.
 * Asking about ground gets the best answer loaded there, so there's never a
 * hole: only a coarser surface, the same for what's drawn and what's driven on.
 */

/** Below the mirror's own sea, a little under where any tile's water sits. */
export const SEA_HEIGHT_M = -1;
/** A physics block. Divides a tile exactly, so tile edges are block edges. */
export const BLOCK_M = 120;
const BLOCK_RIM = 1;
/** x and z at both ends, then the height a wall stands from at each, or NaN where it stands on the ground. */
export const WALL_FLOATS = 6;
const SOLID_WALL_FLOATS = 4;

/** For each block of a tile and a rim of one beyond it, the ribbon triangles crossing it. */
export interface BlockRoads {
  /** Where each block's list starts in `triangles`. */
  first: Int32Array;
  /** Offsets into the ribbon's indices. */
  triangles: Int32Array;
  blocksAcross: number;
}

/** One tile at full detail, all of it plain data so a worker can build it. */
export interface TileDetail {
  name: string;
  column: number;
  row: number;
  manifest: TileManifest;
  grid: HeightGrid;
  surface: RoadSurface;
  /** A byte per height node: 1 on a lake or the sea. */
  waterNodes: Uint8Array;
  ribbon: RibbonMesh;
  roads: TileRoads;
  blockRoads: BlockRoads;
  /** The tile's bridges as drawn. */
  bridges: BridgeKit;
  /** What the car can't pass, `WALL_FLOATS` to a wall: the outlines of the tile's buildings and the sides of its bridges. */
  walls: Float32Array;
  blockWalls: BlockList;
}

/** The whole world's heights, coarse, from the start. */
export interface Overview {
  west: number;
  north: number;
  columns: number;
  rows: number;
  stepM: number;
  heights: Float32Array;
}

export function decodeOverview(deltas: Int16Array, format: Omit<Overview, "heights"> & { unitM: number }): Overview {
  const { columns, rows, unitM } = format;
  if (deltas.length !== columns * rows) throw new Error(`expected ${columns * rows} overview heights, got ${deltas.length}`);
  const heights = new Float32Array(deltas.length);
  for (let row = 0; row < rows; row++) {
    let units = 0;
    for (let column = 0; column < columns; column++) {
      units += deltas[row * columns + column];
      heights[row * columns + column] = units * unitM;
    }
  }
  return { west: format.west, north: format.north, columns, rows, stepM: format.stepM, heights };
}

/** Building outlines and bridge sides as one list of walls. */
function allWalls(solid: Float32Array, rails: Float32Array): Float32Array {
  const count = solid.length / SOLID_WALL_FLOATS;
  const walls = new Float32Array(count * WALL_FLOATS + rails.length).fill(Number.NaN);
  for (let wall = 0; wall < count; wall++) walls.set(solid.subarray(wall * SOLID_WALL_FLOATS, (wall + 1) * SOLID_WALL_FLOATS), wall * WALL_FLOATS);
  walls.set(rails, count * WALL_FLOATS);
  return walls;
}

/** For each block of a tile and a rim of one beyond it, the things crossing it. */
export interface BlockList {
  /** Where each block's list starts in `items`. */
  first: Int32Array;
  items: Int32Array;
  blocksAcross: number;
}

function blockWalls(walls: Float32Array, west: number, north: number, tileM: number): BlockList {
  const blocks = Math.round(tileM / BLOCK_M);
  const blocksAcross = blocks + 2 * BLOCK_RIM;
  const lists = Array.from({ length: blocksAcross * blocksAcross }, (): number[] => []);
  const clamp = (block: number) => Math.max(0, Math.min(blocksAcross - 1, block + BLOCK_RIM));
  for (let wall = 0; wall < walls.length; wall += WALL_FLOATS) {
    const [firstColumn, lastColumn] = [walls[wall], walls[wall + 2]].map((x) => clamp(Math.floor((x - west) / BLOCK_M))).sort((a, b) => a - b);
    const [firstRow, lastRow] = [walls[wall + 1], walls[wall + 3]].map((z) => clamp(Math.floor((z + north) / BLOCK_M))).sort((a, b) => a - b);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) lists[row * blocksAcross + column].push(wall);
    }
  }
  const first = new Int32Array(lists.length + 1);
  lists.forEach((list, block) => {
    first[block + 1] = first[block] + list.length;
  });
  const items = new Int32Array(first[lists.length]);
  lists.forEach((list, block) => {
    items.set(list, first[block]);
  });
  return { first, items, blocksAcross };
}

function blockRoads(ribbon: RibbonMesh, west: number, north: number, tileM: number): BlockRoads {
  const blocks = Math.round(tileM / BLOCK_M);
  const blocksAcross = blocks + 2 * BLOCK_RIM;
  const lists = Array.from({ length: blocksAcross * blocksAcross }, (): number[] => []);
  const { positions, indices } = ribbon;
  const clamp = (block: number) => Math.max(0, Math.min(blocksAcross - 1, block + BLOCK_RIM));
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    let least = Infinity;
    let most = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let corner = 0; corner < 3; corner++) {
      const at = indices[triangle + corner] * 3;
      least = Math.min(least, positions[at]);
      most = Math.max(most, positions[at]);
      top = Math.min(top, positions[at + 2]);
      bottom = Math.max(bottom, positions[at + 2]);
    }
    const [firstColumn, lastColumn] = [clamp(Math.floor((least - west) / BLOCK_M)), clamp(Math.floor((most - west) / BLOCK_M))];
    const [firstRow, lastRow] = [clamp(Math.floor((top + north) / BLOCK_M)), clamp(Math.floor((bottom + north) / BLOCK_M))];
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) lists[row * blocksAcross + column].push(triangle);
    }
  }
  const first = new Int32Array(lists.length + 1);
  lists.forEach((list, block) => {
    first[block + 1] = first[block] + list.length;
  });
  const triangles = new Int32Array(first[lists.length]);
  lists.forEach((list, block) => {
    triangles.set(list, first[block]);
  });
  return { first, triangles, blocksAcross };
}

export function tileDetail(manifest: TileManifest, grid: HeightGrid, surfaceBytes: ArrayBuffer, waterNodes: Uint8Array, tileM: number, walls: Float32Array = new Float32Array(0)): TileDetail {
  const surface = decodeRoadSurface(surfaceBytes, manifest);
  const ribbon = ribbonMesh(surface, manifest.bounds);
  const bridges = bridgeKit(surface, grid);
  const allWallsHere = allWalls(walls, bridges.rails);
  const column = Math.round(manifest.bounds.west / tileM);
  const row = Math.round(-manifest.bounds.north / tileM);
  return {
    name: manifest.tile,
    column,
    row,
    manifest,
    grid,
    surface,
    waterNodes,
    ribbon,
    roads: tileRoads(surface, column, row, tileM),
    blockRoads: blockRoads(ribbon, manifest.bounds.west, manifest.bounds.north, tileM),
    bridges,
    walls: allWallsHere,
    blockWalls: blockWalls(allWallsHere, manifest.bounds.west, manifest.bounds.north, tileM),
  };
}

export interface WorldTile {
  name: string;
  column: number;
  row: number;
  far: HeightGrid | null;
  detail: TileDetail | null;
  /** Grows whenever its data comes or goes. */
  revision: number;
}

const tileKey = (column: number, row: number) => column * 4096 + row;

/** A place on the lattice of height nodes, 4 m apart, from the world's origin: x over the step, z over the step. */
export class World {
  readonly roads: RoadNet;
  readonly tileM: number;
  /** How many of the height grid's cells make one tile. */
  private readonly tileCells: number;
  private readonly stepM: number;
  private readonly tiles = new Map<number, WorldTile>();
  private lastTile: WorldTile | undefined;
  private overview: Overview | null = null;
  /** Grows whenever detail comes or goes, so whatever copied heights knows to copy again. */
  revision = 0;
  /** Grows whenever far heights come or go. */
  farRevision = 0;

  constructor(readonly manifest: WorldManifest) {
    this.tileM = manifest.tileM;
    this.stepM = manifest.heights.stepM;
    this.tileCells = Math.round(this.tileM / this.stepM);
    this.roads = new RoadNet(this.tileM);
    for (const { name, west, north } of manifest.tiles) {
      const column = Math.round(west / this.tileM);
      const row = Math.round(-north / this.tileM);
      this.tiles.set(tileKey(column, row), { name, column, row, far: null, detail: null, revision: 0 });
    }
  }

  all(): Iterable<WorldTile> {
    return this.tiles.values();
  }

  named(name: string): WorldTile {
    for (const tile of this.tiles.values()) if (tile.name === name) return tile;
    throw new Error(`no tile ${name} in this world`);
  }

  has(column: number, row: number): boolean {
    return this.tiles.has(tileKey(column, row));
  }

  tileAt(x: number, z: number): WorldTile | undefined {
    return this.tiles.get(tileKey(Math.floor(x / this.tileM), Math.floor(z / this.tileM)));
  }

  addOverview(overview: Overview): void {
    this.overview = overview;
    this.farRevision++;
  }

  addFar(name: string, grid: HeightGrid): void {
    const tile = this.named(name);
    tile.far = grid;
    tile.revision++;
    this.revision++;
    this.farRevision++;
  }

  removeFar(name: string): void {
    const tile = this.named(name);
    tile.far = null;
    tile.revision++;
    this.revision++;
    this.farRevision++;
  }

  /** The overview's height at a point in the scene. */
  private overviewHeight(x: number, z: number): number {
    const { overview } = this;
    if (!overview) return SEA_HEIGHT_M;
    const { heights, columns, rows, stepM, west, north } = overview;
    const columnAt = (x - west) / stepM;
    const rowAt = (z + north) / stepM;
    if (columnAt < 0 || rowAt < 0 || columnAt >= columns - 1 || rowAt >= rows - 1) return SEA_HEIGHT_M;
    const column = Math.floor(columnAt);
    const row = Math.floor(rowAt);
    const across = columnAt - column;
    const at = row * columns + column;
    const top = heights[at] + across * (heights[at + 1] - heights[at]);
    const bottom = heights[at + columns] + across * (heights[at + columns + 1] - heights[at + columns]);
    return top + (rowAt - row) * (bottom - top);
  }

  addDetail(detail: TileDetail): void {
    const tile = this.named(detail.name);
    tile.detail = detail;
    tile.revision++;
    this.roads.add(detail.roads);
    this.revision++;
  }

  removeDetail(name: string): void {
    const tile = this.named(name);
    tile.detail = null;
    tile.revision++;
    this.roads.remove(tile.column, tile.row);
    this.revision++;
  }

  /** The height of a node on the world's 4 m lattice: its own where the tile's detail is here, else read off the far grid. */
  node(column: number, row: number): number {
    const cells = this.tileCells;
    let tileColumn = Math.floor(column / cells);
    let tileRow = Math.floor(row / cells);
    // Whole rings of nodes are read at a time, nearly all from the tile the last one came from.
    let tile = this.lastTile !== undefined && this.lastTile.column === tileColumn && this.lastTile.row === tileRow ? this.lastTile : this.tiles.get(tileKey(tileColumn, tileRow));
    this.lastTile = tile;
    // A shared edge is in both tiles' grids, but the world's outer east and south edges only in the tile before them.
    if (!tile && column === tileColumn * cells) tile = this.tiles.get(tileKey(--tileColumn, tileRow));
    if (!tile && row === tileRow * cells) tile = this.tiles.get(tileKey(tileColumn, --tileRow));
    if (!tile && column === (tileColumn + 1) * cells) tile = this.tiles.get(tileKey(++tileColumn, tileRow));
    if (!tile) return this.overviewHeight(column * this.stepM, row * this.stepM);
    const cellColumn = column - tileColumn * cells;
    const cellRow = row - tileRow * cells;
    if (tile.detail) {
      const { heights, nodes } = tile.detail.grid;
      return heights[cellRow * nodes + cellColumn];
    }
    if (!tile.far) return this.overviewHeight(column * this.stepM, row * this.stepM);
    const { heights, nodes, stepM } = tile.far;
    const scale = this.stepM / stepM;
    const farColumn = Math.min(Math.floor(cellColumn * scale), nodes - 2);
    const farRow = Math.min(Math.floor(cellRow * scale), nodes - 2);
    const across = cellColumn * scale - farColumn;
    const down = cellRow * scale - farRow;
    const at = farRow * nodes + farColumn;
    const north = heights[at] + across * (heights[at + 1] - heights[at]);
    const south = heights[at + nodes] + across * (heights[at + nodes + 1] - heights[at + nodes]);
    return north + down * (south - north);
  }

  /** The height of the drawn ground at a point, at the best detail loaded there. */
  height(x: number, z: number): number {
    const tile = this.tileAt(x, z);
    const grid = tile?.detail?.grid ?? tile?.far;
    return grid ? surfaceHeight(grid, x, -z) : this.overviewHeight(x, z);
  }

  /** A lake or the sea at a point. Ground with no detail loaded yet counts as land. */
  isWater(x: number, z: number): boolean {
    const detail = this.tileAt(x, z)?.detail;
    if (!detail) return false;
    const { grid, waterNodes } = detail;
    const column = Math.round((x - grid.west) / grid.stepM);
    const row = Math.round((grid.north + z) / grid.stepM);
    return waterNodes[row * grid.nodes + column] !== 0;
  }

  /** Every loaded tile's ribbon triangles crossing a block on the world's lattice of blocks. */
  forRoadsInBlock(blockColumn: number, blockRow: number, visit: (ribbon: RibbonMesh, triangle: number) => void): void {
    const blocks = Math.round(this.tileM / BLOCK_M);
    for (const { detail } of this.tiles.values()) {
      if (!detail) continue;
      const { first, triangles, blocksAcross } = detail.blockRoads;
      const column = blockColumn - detail.column * blocks + BLOCK_RIM;
      const row = blockRow - detail.row * blocks + BLOCK_RIM;
      if (column < 0 || row < 0 || column >= blocksAcross || row >= blocksAcross) continue;
      const block = row * blocksAcross + column;
      for (let entry = first[block]; entry < first[block + 1]; entry++) visit(detail.ribbon, triangles[entry]);
    }
  }

  /** Every loaded tile's building walls crossing a block. */
  forWallsInBlock(blockColumn: number, blockRow: number, visit: (walls: Float32Array, wall: number) => void): void {
    const blocks = Math.round(this.tileM / BLOCK_M);
    for (const { detail } of this.tiles.values()) {
      if (!detail) continue;
      const { first, items, blocksAcross } = detail.blockWalls;
      const column = blockColumn - detail.column * blocks + BLOCK_RIM;
      const row = blockRow - detail.row * blocks + BLOCK_RIM;
      if (column < 0 || row < 0 || column >= blocksAcross || row >= blocksAcross) continue;
      const block = row * blocksAcross + column;
      for (let entry = first[block]; entry < first[block + 1]; entry++) visit(detail.walls, items[entry]);
    }
  }
}
