import { decodeGroundCut, decodeRoadSurface, surfaceHeight, type GroundCut, type HeightGrid, type RoadSurface, type TileManifest, type WorldManifest } from "../render/tile";
import { bridgeKit, type BridgeKit } from "../render/bridges";
import { ribbonMesh, type RibbonMesh } from "../render/roads";
import { roadAttributes, type RoadAttributes } from "../art/surfaces/road-attributes";
import { RoadNet, tileRoads, type TileRoads } from "./road-net";
import { NO_SEASONAL_WALLS, WALL_SEASONS, type SeasonalWalls } from "../render/tile-models";
import { isOutAt, type InSeasonDial } from "../climate/placed-season";
import { exposureAt, type ExposureGrid } from "./sea-ice";
import { roadGrip, ribbonClasses } from "./road-grip";
import type { Condition, Surface } from "./surfaces";

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
/** A pixel with more than this share of rock is rock to a tyre. */
const ROCK_SHARE = 128;

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
  /** The drawn water surface at each height node, `dryLevel` where no water is near. */
  waterLevels: HeightGrid;
  /** Metres from the shore at each height node, out into the water, below zero on land. */
  shore: HeightGrid;
  ribbon: RibbonMesh;
  /** What the road's shader reads per ribbon vertex, sealed or loose among it. */
  dress: RoadAttributes;
  /** A byte per ribbon triangle, in the order of its indices: what a tyre on it is on, as an index into `SURFACES`. */
  ribbonSurfaces: Uint8Array;
  /** Each 4 m pixel's share of rock, 0 to 255, rows north to south, or nothing where the world has no rock layer. */
  rock: Uint8Array | null;
  roads: TileRoads;
  blockRoads: BlockRoads;
  /** The ground the paving cuts through, and which of the height grid's cells it replaces, 1 for each: none on a tile laid before the paving. */
  cut: GroundCut;
  cutCells: Uint8Array;
  blockCut: BlockRoads;
  /** The tile's bridges as drawn. */
  bridges: BridgeKit;
  /** What the car can't pass, `WALL_FLOATS` to a wall: the outlines of the tile's buildings and the sides of its bridges. */
  walls: Float32Array;
  blockWalls: BlockList;
  /** The walls of what's out only in its season (cows and bales), `WALL_FLOATS` to a wall, and three to a wall of `seasons`: its kind and its prop's place. */
  seasonalWalls: Float32Array;
  wallSeasons: Float32Array;
  blockSeasonalWalls: BlockList;
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

function blockRoads(ribbon: { positions: Float32Array; indices: Uint32Array }, west: number, north: number, tileM: number): BlockRoads {
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

/** What a tyre is on, and the condition of it there. */
export interface Ground {
  surface: Surface;
  condition: Condition;
}

/** Sea ice that bears a car: hard and smooth as a road, and icy whatever the weather. */
export const ON_SEA_ICE: Ground = { surface: "asphalt", condition: "ice" };
/** The drivable reach is kept to this step, so the ground under the car is built again only when the ice has grown or shrunk by it. */
const ICE_STEP = 0.005;
/** The season's shares of placed things are kept to this step, so the walls are built again only when they've moved by it. */
const SHARE_STEP = 0.002;

export function tileDetail(
  manifest: TileManifest,
  grid: HeightGrid,
  surfaceBytes: ArrayBuffer,
  waterLevels: HeightGrid,
  shore: HeightGrid,
  tileM: number,
  walls: Float32Array = new Float32Array(0),
  cutBytes: ArrayBuffer = new ArrayBuffer(0),
  rock: Uint8Array | null = null,
  seasonal: SeasonalWalls = NO_SEASONAL_WALLS,
): TileDetail {
  const surface = decodeRoadSurface(surfaceBytes, manifest, grid);
  const cut = decodeGroundCut(cutBytes, manifest, grid);
  const cutCells = new Uint8Array((grid.nodes - 1) * (grid.nodes - 1));
  for (const cell of cut.cells) cutCells[cell] = 1;
  const ribbon = ribbonMesh(surface, manifest.bounds);
  const dress = roadAttributes(surface, manifest.solids.cells);
  const bridges = bridgeKit(surface, grid);
  const allWallsHere = allWalls(walls, bridges.rails);
  const seasonalWalls = allWalls(seasonal.walls, new Float32Array(0));
  const column = Math.round(manifest.bounds.west / tileM);
  const row = Math.round(-manifest.bounds.north / tileM);
  return {
    name: manifest.tile,
    column,
    row,
    manifest,
    grid,
    surface,
    waterLevels,
    shore,
    ribbon,
    dress,
    ribbonSurfaces: roadGrip(ribbon, dress, ribbonClasses(ribbon.across.length, surface.aprons)),
    rock,
    roads: tileRoads(surface, column, row, tileM),
    blockRoads: blockRoads(ribbon, manifest.bounds.west, manifest.bounds.north, tileM),
    cut,
    cutCells,
    blockCut: blockRoads(cut, manifest.bounds.west, manifest.bounds.north, tileM),
    bridges,
    walls: allWallsHere,
    blockWalls: blockWalls(allWallsHere, manifest.bounds.west, manifest.bounds.north, tileM),
    seasonalWalls,
    wallSeasons: seasonal.seasons,
    blockSeasonalWalls: blockWalls(seasonalWalls, manifest.bounds.west, manifest.bounds.north, tileM),
  };
}

export interface WorldTile {
  name: string;
  column: number;
  row: number;
  far: HeightGrid | null;
  /** The far grid's water levels and distances from the shore, on its nodes. */
  farLevels: HeightGrid | null;
  farShore: HeightGrid | null;
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
  /** How exposed each place on the water is, for the sea ice: none until the game has worked it out, so no water freezes. */
  private iceExposure: ExposureGrid | null = null;
  /** How far out the ice bears a car, as an exposure (`climate/season.ts`), in steps of `ICE_STEP`. */
  private iceDrivable = 0;
  /** Grows whenever the ice that bears a car grows or shrinks. */
  iceRevision = 0;
  /** The season's shares of placed things out, in steps of `SHARE_STEP`: what's out stops the car, and what isn't doesn't. All out until the game says. */
  private placedShares: Record<InSeasonDial, number> = { terraces: 1, grazing: 1, boatsAfloat: 1, bales: 1 };
  /** Grows whenever those shares change. */
  placedRevision = 0;

  constructor(readonly manifest: WorldManifest) {
    this.tileM = manifest.tileM;
    this.stepM = manifest.heights.stepM;
    this.tileCells = Math.round(this.tileM / this.stepM);
    this.roads = new RoadNet(this.tileM);
    for (const { name, west, north } of manifest.tiles) {
      const column = Math.round(west / this.tileM);
      const row = Math.round(-north / this.tileM);
      this.tiles.set(tileKey(column, row), { name, column, row, far: null, farLevels: null, farShore: null, detail: null, revision: 0 });
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

  addFar(name: string, grid: HeightGrid, levels: HeightGrid, shore: HeightGrid): void {
    const tile = this.named(name);
    tile.far = grid;
    tile.farLevels = levels;
    tile.farShore = shore;
    tile.revision++;
    this.revision++;
    this.farRevision++;
  }

  removeFar(name: string): void {
    const tile = this.named(name);
    tile.far = null;
    tile.farLevels = null;
    tile.farShore = null;
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

  /** The tile holding a node on the world's 4 m lattice, if any. */
  private tileOfNode(column: number, row: number): WorldTile | undefined {
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
    return tile;
  }

  /** The height of a node on the world's 4 m lattice: its own where the tile's detail is here, else read off the far grid. */
  node(column: number, row: number): number {
    const tile = this.tileOfNode(column, row);
    if (!tile) return this.overviewHeight(column * this.stepM, row * this.stepM);
    const cells = this.tileCells;
    const cellColumn = column - tile.column * cells;
    const cellRow = row - tile.row * cells;
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

  /** Whether a cell of the 4 m lattice, named by its north-west node, is drawn and collided with as the paving's cut ground rather than the grid's two triangles. */
  isCut(column: number, row: number): boolean {
    const tile = this.tiles.get(tileKey(Math.floor(column / this.tileCells), Math.floor(row / this.tileCells)));
    if (!tile?.detail) return false;
    return tile.detail.cutCells[(row - tile.row * this.tileCells) * this.tileCells + column - tile.column * this.tileCells] === 1;
  }

  /** The drawn water surface at a node of the 4 m lattice, from the best detail loaded there, or `dryLevel` where there's none. */
  waterLevel(column: number, row: number): number {
    const tile = this.tileOfNode(column, row);
    return this.nearestOn(tile, tile?.detail?.waterLevels ?? tile?.farLevels, column, row) ?? this.manifest.water.dryLevel;
  }

  /** Metres from the shore at a node of the 4 m lattice, out into the water and below zero on land, or `dryLevel` where nothing's loaded. */
  shore(column: number, row: number): number {
    const tile = this.tileOfNode(column, row);
    return this.nearestOn(tile, tile?.detail?.shore ?? tile?.farShore, column, row) ?? this.manifest.water.dryLevel;
  }

  /** A grid's value at the node nearest a node of the 4 m lattice. */
  private nearestOn(tile: WorldTile | undefined, grid: HeightGrid | null | undefined, column: number, row: number): number | null {
    if (!tile || !grid) return null;
    const scale = this.stepM / grid.stepM;
    const gridColumn = Math.round((column - tile.column * this.tileCells) * scale);
    const gridRow = Math.round((row - tile.row * this.tileCells) * scale);
    return grid.heights[gridRow * grid.nodes + gridColumn];
  }

  /** How exposed each place on the water is (`sim/sea-ice.ts`), which the sea ice reads. */
  setIceExposure(grid: ExposureGrid): void {
    this.iceExposure = grid;
    this.iceRevision++;
  }

  /** How far out the ice bears a car: the season's `iceDrivable`. */
  setIceDrivable(drivable: number): void {
    const stepped = Math.round(drivable / ICE_STEP) * ICE_STEP;
    if (stepped === this.iceDrivable) return;
    this.iceDrivable = stepped;
    this.iceRevision++;
  }

  /** The season's shares of placed things out (`climate/placed-season.ts`), for the walls of what's out only in its season. */
  setPlacedSeason(shares: Readonly<Record<InSeasonDial, number>>): void {
    const stepped = { terraces: 0, grazing: 0, boatsAfloat: 0, bales: 0 };
    for (const dial of Object.keys(stepped) as InSeasonDial[]) stepped[dial] = Math.round(shares[dial] / SHARE_STEP) * SHARE_STEP;
    if ((Object.keys(stepped) as InSeasonDial[]).every((dial) => stepped[dial] === this.placedShares[dial])) return;
    this.placedShares = stepped;
    this.placedRevision++;
  }

  /** Whether the water at a place is frozen thick enough to bear a car, wherever the water is. */
  private iceBearsAt(x: number, z: number): boolean {
    return this.iceExposure !== null && this.iceDrivable > 0 && exposureAt(this.iceExposure, x, z) < this.iceDrivable;
  }

  /** Whether a point is on sea ice that bears a car: past the shore, and frozen thick enough there. */
  bearsCar(x: number, z: number): boolean {
    return this.iceDrivable > 0 && this.isWater(x, z) && this.iceBearsAt(x, z);
  }

  /** A node's height as the car meets it: the ground's, or the water's surface where ice that bears a car lies on it. */
  drivenNode(column: number, row: number): number {
    const ground = this.node(column, row);
    if (this.iceDrivable <= 0) return ground;
    const level = this.waterLevel(column, row);
    return level > ground && this.iceBearsAt(column * this.stepM, row * this.stepM) ? level : ground;
  }

  /** The height of the drawn ground at a point, at the best detail loaded there. */
  height(x: number, z: number): number {
    const tile = this.tileAt(x, z);
    const grid = tile?.detail?.grid ?? tile?.far;
    return grid ? surfaceHeight(grid, x, -z) : this.overviewHeight(x, z);
  }

  /** How many walls cross the block a place is in: how built up it is there. */
  wallsAt(x: number, z: number): number {
    const detail = this.tileAt(x, z)?.detail;
    if (!detail) return 0;
    const { blockWalls: { first, blocksAcross }, manifest: { bounds } } = detail;
    const block = (Math.floor((z + bounds.north) / BLOCK_M) + BLOCK_RIM) * blocksAcross + Math.floor((x - bounds.west) / BLOCK_M) + BLOCK_RIM;
    return first[block + 1] - first[block];
  }

  /** Whether a point is past the shore, in the water as it's drawn. Ground with no detail loaded yet counts as land. */
  isWater(x: number, z: number): boolean {
    const shore = this.tileAt(x, z)?.detail?.shore;
    return shore !== undefined && surfaceHeight(shore, x, -z) > 0;
  }

  /** What a tyre on the ground itself is on, and in what condition: sea ice that bears a car, or the ground's own surface in the weather's. */
  groundUnder(x: number, z: number, condition: Condition): Ground {
    return this.bearsCar(x, z) ? ON_SEA_ICE : { surface: this.groundSurface(x, z), condition };
  }

  /** What a tyre on the ground itself is on: rock where the map has it, grass everywhere else. */
  groundSurface(x: number, z: number): Surface {
    const detail = this.tileAt(x, z)?.detail;
    const rock = detail?.rock;
    const pixels = this.manifest.rock?.pixels;
    if (!detail || !rock || pixels === undefined) return "grass";
    const { bounds } = detail.manifest;
    const pixelM = this.tileM / pixels;
    const column = Math.min(Math.floor((x - bounds.west) / pixelM), pixels - 1);
    const row = Math.min(Math.floor((z + bounds.north) / pixelM), pixels - 1);
    return rock[row * pixels + column] > ROCK_SHARE ? "rock" : "grass";
  }

  /** Every loaded tile's ribbon triangles crossing a block on the world's lattice of blocks, with the surface each is. */
  forRoadsInBlock(blockColumn: number, blockRow: number, visit: (ribbon: RibbonMesh, triangle: number, surface: number) => void): void {
    const blocks = Math.round(this.tileM / BLOCK_M);
    for (const { detail } of this.tiles.values()) {
      if (!detail) continue;
      const { first, triangles, blocksAcross } = detail.blockRoads;
      const column = blockColumn - detail.column * blocks + BLOCK_RIM;
      const row = blockRow - detail.row * blocks + BLOCK_RIM;
      if (column < 0 || row < 0 || column >= blocksAcross || row >= blocksAcross) continue;
      const block = row * blocksAcross + column;
      for (let entry = first[block]; entry < first[block + 1]; entry++) visit(detail.ribbon, triangles[entry], detail.ribbonSurfaces[triangles[entry] / 3]);
    }
  }

  /** Every loaded tile's cut ground triangles crossing a block. */
  forCutInBlock(blockColumn: number, blockRow: number, visit: (cut: GroundCut, triangle: number) => void): void {
    const blocks = Math.round(this.tileM / BLOCK_M);
    for (const { detail } of this.tiles.values()) {
      if (!detail) continue;
      const { first, triangles, blocksAcross } = detail.blockCut;
      const column = blockColumn - detail.column * blocks + BLOCK_RIM;
      const row = blockRow - detail.row * blocks + BLOCK_RIM;
      if (column < 0 || row < 0 || column >= blocksAcross || row >= blocksAcross) continue;
      const block = row * blocksAcross + column;
      for (let entry = first[block]; entry < first[block + 1]; entry++) visit(detail.cut, triangles[entry]);
    }
  }

  /** Every loaded tile's walls crossing a block: its buildings' and the rest that stop the car, and those of what's out only in its season while it's out. */
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
      const seasonal = detail.blockSeasonalWalls;
      const { wallSeasons } = detail;
      for (let entry = seasonal.first[block]; entry < seasonal.first[block + 1]; entry++) {
        const at = (seasonal.items[entry] / WALL_FLOATS) * 3;
        if (isOutAt(this.placedShares, wallSeasons[at + 1], wallSeasons[at + 2], WALL_SEASONS[wallSeasons[at] - 1])) visit(detail.seasonalWalls, seasonal.items[entry]);
      }
    }
  }
}
