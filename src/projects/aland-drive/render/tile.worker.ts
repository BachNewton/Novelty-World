import { decodeHeights, decodeRoadSurface, fieldPixelsOf, litPhoto, type HeightGrid, type TileManifest, type WorldManifest, type WorldTileEntry } from "./tile";
import { tileAddOns, type TileAddOns } from "./tile-add-ons";
import { decodeParked, parkedWalls, type ParkedFile, type TileParked } from "./parked-places";
import { modelWalls, decodeModels, decodeRoadside, dockWalls, NO_ROADSIDE, type DocksFile, type ModelsFile, type RoadsideFile, type TileModels, type TileRoadside } from "./tile-models";
import { decodeSolids, type SolidsCell } from "./solids";
import { wallFaces, wallSections, withWalls, type WallSections, type WallsFile } from "./tile-walls";
import { decodeRoadGraph, graphTransfers, type RoadGraphData, type RoadMapFile } from "../map/road-graph";
import { decodeOverview, tileDetail, type Overview, type TileDetail } from "../sim/world";
import { crowdBuffers, type CrowdArrays } from "../art/people/crowd";
import { tileCrowd, type PeopleFile } from "./tile-people";
import { decodeLanes, laneTransfers, NO_LANES, type LanesFile, type TileLanes } from "../traffic/lane-map";

/*
 * Everything slow about a tile, off the main thread: fetching it, inflating it,
 * decoding its images into mipmapped pixels and turning its heights and roads
 * into the arrays the game uses. The page only copies the results to the GPU.
 */

/** Each mip level of an image, largest first, tightly packed. */
export type Mips = Uint8Array[];

export interface FarTile {
  name: string;
  grid: HeightGrid;
  waterLevels: HeightGrid;
  shore: HeightGrid;
  shade: Mips;
  mask: Mips;
  ground: Mips;
  /** In red the canopy, and in green the clearing round buildings. */
  canopy: Mips;
  stands: Mips;
  /** Each 8 m pixel's share of boulder field. */
  fields: Mips;
  /** The far photo with its light in it, for the mini map. */
  land: ImageBitmap;
  /** Compressed bytes this load read, whether from the network or the browser's cache. */
  bytes: number;
}

export interface DetailTile {
  detail: TileDetail;
  shade: Mips;
  ground: Mips;
  /** The town ground's image, or nothing for a tile without one, and each road section's class (zeros without). */
  town: Mips | null;
  townRibbons: Uint8Array;
  buildings: SolidsCell[];
  models: TileModels;
  docks: TileModels;
  stoneWalls: WallSections;
  roadside: TileRoadside;
  /** Everyone the tile's people files place, baked as one crowd, or nothing for a tile with no one. */
  people: CrowdArrays | null;
  parked: TileParked;
  /** What stands off the walls, and the terminal and fuel stations. */
  addOns: TileAddOns;
  lanes: TileLanes;
  bytes: number;
}

export interface OverviewData {
  heights: Overview;
  /** RGBA, north at the top. */
  image: Uint8Array;
  bytes: number;
}

export type TileRequest = { id: number; kind: "far" | "detail" | "overview" | "map"; base: string; world: WorldManifest; tile: WorldTileEntry };
export type TileReply = { id: number; far: FarTile } | { id: number; detailed: DetailTile } | { id: number; overview: OverviewData } | { id: number; map: RoadGraphData } | { id: number; error: string };

// The project's TypeScript sees the DOM's `self`, not a worker's.
const context = self as unknown as { onmessage: (event: MessageEvent<TileRequest>) => void; postMessage: (reply: TileReply, transfers?: Transferable[]) => void };

class Reader {
  bytes = 0;

  constructor(private readonly folder: string) {}

  private async raw(file: string): Promise<ArrayBuffer> {
    const url = `${this.folder}/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const data = await response.arrayBuffer();
    this.bytes += data.byteLength;
    return data;
  }

  async json<T>(file: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.raw(file))) as T;
  }

  async inflated(file: string): Promise<ArrayBuffer> {
    const stream = new Blob([await this.raw(file)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  }

  /** The image's first `channels` channels, unpremultiplied and unconverted. */
  async pixels(file: string, size: number, channels: 1 | 4, height = size): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(new Blob([await this.raw(file)]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const canvas = new OffscreenCanvas(size, height);
    const pen = canvas.getContext("2d", { willReadFrequently: true });
    if (!pen) throw new Error("no 2D canvas in this worker");
    pen.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = pen.getImageData(0, 0, size, height).data;
    if (channels === 4) return new Uint8Array(rgba.buffer);
    const one = new Uint8Array(size * height);
    for (let at = 0; at < one.length; at++) one[at] = rgba[at * 4];
    return one;
  }
}

/** Each level the mean of four pixels of the one before: the same chain of sizes the GPU's texture expects. */
export function mipChain(pixels: Uint8Array, size: number, channels: number): Mips {
  const mips = [pixels];
  let width = size;
  while (width > 1) {
    const from = mips[mips.length - 1];
    const half = Math.floor(width / 2);
    const to = new Uint8Array(half * half * channels);
    for (let row = 0; row < half; row++) {
      for (let column = 0; column < half; column++) {
        const here = (row * 2 * width + column * 2) * channels;
        const below = here + width * channels;
        for (let channel = 0; channel < channels; channel++) {
          to[(row * half + column) * channels + channel] = (from[here + channel] + from[here + channels + channel] + from[below + channel] + from[below + channels + channel] + 2) >> 2;
        }
      }
    }
    mips.push(to);
    width = half;
  }
  return mips;
}

/** The mask's alpha carries the rock: written here rather than in the image, whose alpha a canvas would premultiply into the other channels. */
function withRock(mask: Uint8Array, rock: Uint8Array | null): void {
  for (let at = 0; at * 4 < mask.length; at++) mask[at * 4 + 3] = rock?.[at] ?? 0;
}

/**
 * The 8 m layer: in red the boulder fields, which follow the rock in its file (none where the world has no rock), and
 * in green where reeds may grow, which the image's alpha brought before the rock took it: a 2 m pixel kept clear of
 * reeds keeps its whole 8 m pixel clear.
 */
function fieldsOf(mask: Uint8Array, maskPixels: number, rock: Uint8Array | null, fieldPixels: number): Uint8Array {
  const fields = new Uint8Array(fieldPixels * fieldPixels * 2);
  const ratio = maskPixels / fieldPixels;
  for (let row = 0; row < fieldPixels; row++) {
    for (let column = 0; column < fieldPixels; column++) {
      const at = row * fieldPixels + column;
      let open = 255;
      for (let down = 0; down < ratio; down++) for (let across = 0; across < ratio; across++) open = Math.min(open, mask[((row * ratio + down) * maskPixels + column * ratio + across) * 4 + 3]);
      fields[at * 2] = rock?.[maskPixels * maskPixels + at] ?? 0;
      fields[at * 2 + 1] = open;
    }
  }
  return fields;
}

function interleaved(red: Uint8Array, green: Uint8Array): Uint8Array {
  const both = new Uint8Array(red.length * 2);
  for (let at = 0; at < red.length; at++) {
    both[at * 2] = red[at];
    both[at * 2 + 1] = green[at];
  }
  return both;
}

/** The rock file's 4 m layer alone, for the simulation: what a tyre off the road is on. */
const rockShares = (file: ArrayBuffer | null, world: WorldManifest) => (file && world.rock ? new Uint8Array(file, 0, world.rock.pixels * world.rock.pixels).slice() : null);

async function far(base: string, world: WorldManifest, tile: WorldTileEntry): Promise<FarTile> {
  const reader = new Reader(`${base}/${tile.name}`);
  const { far: format, heights, mask, ground, canopy, clearing, stands, water, rock } = world;
  if (clearing && clearing.pixels !== canopy.pixels) throw new Error(`the clearing is ${clearing.pixels} pixels and the canopy ${canopy.pixels}: they share a layer`);
  const [farHeights, farLevels, farShore, shade, maskPixels, groundPixels, canopyPixels, clearingPixels, standPixels, rockPixels] = await Promise.all([
    reader.inflated(format.heightsFile),
    reader.inflated(water.farLevelsFile),
    reader.inflated(water.farShoreFile),
    reader.pixels(format.shadeFile, format.shadePixels, 1),
    reader.pixels(mask.file, mask.pixels, 4),
    reader.pixels(ground.farFile, ground.farPixels, 4),
    reader.pixels(canopy.file, canopy.pixels, 1),
    clearing ? reader.pixels(clearing.file, clearing.pixels, 1) : new Uint8Array(canopy.pixels * canopy.pixels).fill(255),
    reader.inflated(stands.file),
    rock ? reader.inflated(rock.file) : null,
  ]);
  const rockBytes = rockPixels === null ? null : new Uint8Array(rockPixels);
  const fields = fieldsOf(maskPixels, mask.pixels, rockBytes, fieldPixelsOf(world));
  withRock(maskPixels, rockBytes);
  const land = await createImageBitmap(new ImageData(litPhoto(groundPixels, shade, world.shade.gamma), ground.farPixels, ground.farPixels));
  return {
    name: tile.name,
    grid: decodeHeights(new Int16Array(farHeights), { nodes: format.nodes, stepM: format.stepM, unitM: heights.unitM }, tile),
    waterLevels: decodeHeights(new Int16Array(farLevels), { nodes: format.nodes, stepM: format.stepM, unitM: heights.unitM }, tile),
    shore: decodeHeights(new Int16Array(farShore), { nodes: format.nodes, stepM: format.stepM, unitM: heights.unitM }, tile),
    shade: mipChain(shade, format.shadePixels, 1),
    mask: mipChain(maskPixels, mask.pixels, 4),
    ground: mipChain(groundPixels, ground.farPixels, 4),
    canopy: mipChain(interleaved(canopyPixels, clearingPixels), canopy.pixels, 2),
    stands: mipChain(new Uint8Array(standPixels), stands.pixels, 4),
    fields: mipChain(fields, fieldPixelsOf(world), 2),
    land,
    bytes: reader.bytes,
  };
}

async function overview(base: string, world: WorldManifest): Promise<OverviewData> {
  const reader = new Reader(base);
  const format = world.overview;
  const [deltas, image] = await Promise.all([reader.inflated(format.heightsFile), reader.pixels(format.imageFile, format.imageWidth, 4, format.imageHeight)]);
  return { heights: decodeOverview(new Int16Array(deltas), format), image, bytes: reader.bytes };
}

async function roadMap(base: string, world: WorldManifest): Promise<RoadGraphData> {
  const reader = new Reader(base);
  const text = new TextDecoder().decode(await reader.inflated(world.map.file));
  return decodeRoadGraph(JSON.parse(text) as RoadMapFile, reader.bytes);
}

async function detailed(base: string, world: WorldManifest, tile: WorldTileEntry): Promise<DetailTile> {
  const reader = new Reader(`${base}/${tile.name}`);
  const manifest = await reader.json<TileManifest>("tile.json");
  const [heights, surface, waterLevels, shore, shade, ground, solids, models, docks, walls, roadsideFile, peopleFiles, parkedFile, rock, lanesFile] = await Promise.all([
    reader.inflated(world.heights.file),
    reader.inflated(manifest.roadSurface.file),
    reader.inflated(world.water.levelsFile),
    reader.inflated(world.water.shoreFile),
    reader.pixels(world.shade.file, world.shade.pixels, 1),
    reader.pixels(world.ground.file, world.ground.pixels, 4),
    reader.inflated(manifest.solids.file),
    manifest.models ? reader.json<ModelsFile>(manifest.models.file) : { models: {} },
    manifest.docks ? reader.json<DocksFile>(manifest.docks.file) : null,
    manifest.walls ? reader.json<WallsFile>(manifest.walls.file) : { walls: [] },
    manifest.roadside ? reader.json<RoadsideFile>(manifest.roadside.file) : NO_ROADSIDE,
    Promise.all(Object.values(manifest.people ?? {}).map(({ file }) => reader.json<PeopleFile>(file))),
    manifest.parked ? reader.json<ParkedFile>(manifest.parked.file) : null,
    world.rock ? reader.inflated(world.rock.file) : null,
    manifest.lanes ? reader.inflated(manifest.lanes.file) : null,
  ]);
  const [town, townRibbons] = await townOf(reader, manifest, world);
  const parked = decodeParked(parkedFile);
  const roadside = decodeRoadside(roadsideFile);
  const grid = decodeHeights(new Int16Array(heights), world.heights, tile);
  const { cells, walls: outlines } = decodeSolids(solids, manifest.solids);
  const stoneWalls = wallSections(walls, grid);
  const placed = decodeModels(models);
  const { walls: addOnWalls, ...addOns } = tileAddOns(cells, decodeRoadSurface(surface, manifest), manifest.nearSites);
  const detail = tileDetail(manifest, grid, surface, decodeHeights(new Int16Array(waterLevels), world.heights, tile), decodeHeights(new Int16Array(shore), world.heights, tile), world.tileM, withWalls(outlines, wallFaces(stoneWalls), roadside.walls, modelWalls(placed, manifest.windmills), dockWalls(docks), parkedWalls(parked), addOnWalls), rockShares(rock, world));
  return { detail, shade: mipChain(shade, world.shade.pixels, 1), ground: mipChain(ground, world.ground.pixels, 4), town, townRibbons: townRibbons ?? new Uint8Array(detail.surface.tiers.length), buildings: cells, models: placed, docks: decodeModels(docks ?? { models: {} }), stoneWalls, roadside, people: tileCrowd(peopleFiles), parked, addOns, lanes: lanesFile ? decodeLanes(JSON.parse(new TextDecoder().decode(lanesFile)) as LanesFile) : NO_LANES, bytes: reader.bytes };
}

const transfersOf = ({ grid, waterLevels, shore, shade, mask, ground, canopy, stands, fields, land }: FarTile): Transferable[] => [land, grid.heights.buffer as ArrayBuffer, waterLevels.heights.buffer as ArrayBuffer, shore.heights.buffer as ArrayBuffer, ...[...shade, ...mask, ...ground, ...canopy, ...stands, ...fields].map((mip) => mip.buffer as ArrayBuffer)];

/** A tile's town image with its mips, and its sections' classes, or nothing for a tile built before the town ground. */
async function townOf(reader: Reader, manifest: TileManifest, world: WorldManifest): Promise<[Mips | null, Uint8Array | null]> {
  if (!manifest.town || !world.town) return [null, null];
  if (manifest.town.pixels !== world.town.pixels) throw new Error(`${manifest.tile}: a town image of ${manifest.town.pixels} pixels in a world of ${world.town.pixels}`);
  const [image, ribbons] = await Promise.all([reader.inflated(manifest.town.file), reader.inflated(manifest.town.ribbons)]);
  return [mipChain(new Uint8Array(image), world.town.pixels, 4), new Uint8Array(ribbons)];
}

function detailTransfers({ detail, shade, ground, town, townRibbons, buildings, models, docks, stoneWalls, roadside, people, parked, lanes }: DetailTile): Transferable[] {
  const { ribbon, surface, dress, ribbonSurfaces, rock, roads, blockRoads, grid, waterLevels, shore, bridges, walls, blockWalls } = detail;
  const arrays = [
    grid.heights,
    waterLevels.heights,
    shore.heights,
    surface.rings,
    surface.tiers,
    ribbon.across,
    ribbon.along,
    ribbon.tiers,
    ribbon.indices,
    dress.surface,
    dress.mark,
    ribbonSurfaces,
    ...(rock ? [rock] : []),
    ...ribbon.cells.map((cell) => cell.indices),
    roads.points,
    roads.lengths,
    roads.chainFirst,
    roads.paved,
    roads.chainPoints,
    roads.cellFirst,
    roads.cellSegments,
    blockRoads.first,
    blockRoads.triangles,
    bridges.positions,
    bridges.parts,
    bridges.rails,
    walls,
    blockWalls.first,
    blockWalls.items,
    ...shade,
    ...ground,
    ...(town ?? []),
    townRibbons,
    ...buildings.flatMap((cell) => [cell.positions, cell.facades, cell.tints, cell.indices]),
    ...Object.values(models),
    ...Object.values(docks),
    stoneWalls,
    ...Object.values(roadside.models),
    ...Object.values(roadside.signs),
    roadside.wires,
    parked,
  ];
  return [...new Set([...arrays.map((array) => array.buffer as ArrayBuffer), ...(people ? crowdBuffers(people) : []), ...(lanes === NO_LANES ? [] : laneTransfers(lanes))])];
}

context.onmessage = (event: MessageEvent<TileRequest>) => {
  const { id, kind, base, world, tile } = event.data;
  void (async () => {
    try {
      if (kind === "overview") {
        const result = await overview(base, world);
        context.postMessage({ id, overview: result } satisfies TileReply, [result.heights.heights.buffer as ArrayBuffer, result.image.buffer as ArrayBuffer]);
      } else if (kind === "map") {
        const result = await roadMap(base, world);
        context.postMessage({ id, map: result } satisfies TileReply, graphTransfers(result));
      } else if (kind === "far") {
        const result = await far(base, world, tile);
        context.postMessage({ id, far: result } satisfies TileReply, transfersOf(result));
      } else {
        const result = await detailed(base, world, tile);
        context.postMessage({ id, detailed: result } satisfies TileReply, detailTransfers(result));
      }
    } catch (error) {
      context.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies TileReply);
    }
  })();
};
