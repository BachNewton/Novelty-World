import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeHeights, type TileManifest, type WorldManifest } from "../render/tile";
import { decodeSolids } from "../render/solids";
import { modelWalls, decodeModels, decodeRoadside, dockWalls, NO_ROADSIDE, type DocksFile, type ModelsFile, type RoadsideFile } from "../render/tile-models";
import { wallFaces, wallSections, withWalls, type WallsFile } from "../render/tile-walls";
import { decodeOverview, tileDetail, World } from "./world";

const inflated = (gzipped: Buffer) => {
  const bytes = gunzipSync(gzipped);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** The committed copy of one real tile: a world of its own, for tests. */
export const FIXTURE_TILES = "src/projects/aland-drive/fixture";

/** A tile and those touching it, for a tool that only drives there. */
export function tilesAround(folder: string, name: string): Set<string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
  const { tiles, tileM } = JSON.parse(readFileSync(join(folder, "world.json"), "utf8")) as WorldManifest;
  const middle = tiles.find((tile) => tile.name === name);
  if (!middle) throw new Error(`no tile ${name} in ${folder}`);
  return new Set(tiles.filter(({ west, north }) => Math.abs(west - middle.west) <= tileM && Math.abs(north - middle.north) <= tileM).map((tile) => tile.name));
}

/** Tiles read from a folder on disk with every tile at full detail, or only those named, for anything running outside a browser. */
export function readWorld(folder: string, only?: Set<string>): World {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
  const manifest = JSON.parse(readFileSync(join(folder, "world.json"), "utf8")) as WorldManifest;
  const world = new World(manifest);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
  world.addOverview(decodeOverview(new Int16Array(inflated(readFileSync(join(folder, manifest.overview.heightsFile)))), manifest.overview));
  for (const { name } of manifest.tiles) {
    if (only && !only.has(name)) continue;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const tile = JSON.parse(readFileSync(join(folder, name, "tile.json"), "utf8")) as TileManifest;
    const { west, north } = tile.bounds;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const read = (file: string) => inflated(readFileSync(join(folder, name, file)));
    const farFormat = { ...manifest.far, unitM: manifest.heights.unitM };
    world.addFar(name, decodeHeights(new Int16Array(read(manifest.far.heightsFile)), farFormat, { west, north }), decodeHeights(new Int16Array(read(manifest.water.farLevelsFile)), farFormat, { west, north }), decodeHeights(new Int16Array(read(manifest.water.farShoreFile)), farFormat, { west, north }));
    const grid = decodeHeights(new Int16Array(read(manifest.heights.file)), manifest.heights, { west, north });
    const levels = decodeHeights(new Int16Array(read(manifest.water.levelsFile)), manifest.heights, { west, north });
    const shore = decodeHeights(new Int16Array(read(manifest.water.shoreFile)), manifest.heights, { west, north });
    const { walls } = decodeSolids(read(tile.solids.file), tile.solids);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const stoneWalls = tile.walls ? wallSections(JSON.parse(readFileSync(join(folder, name, tile.walls.file), "utf8")) as WallsFile, grid) : new Float32Array(0);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const roadside = decodeRoadside(tile.roadside ? (JSON.parse(readFileSync(join(folder, name, tile.roadside.file), "utf8")) as RoadsideFile) : NO_ROADSIDE);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const models = tile.models ? decodeModels(JSON.parse(readFileSync(join(folder, name, tile.models.file), "utf8")) as ModelsFile) : {};
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const docks = tile.docks ? (JSON.parse(readFileSync(join(folder, name, tile.docks.file), "utf8")) as DocksFile) : null;
    const cut = tile.roadSurface.groundCut ? read(tile.roadSurface.groundCut.file) : undefined;
    world.addDetail(tileDetail(tile, grid, read(tile.roadSurface.file), levels, shore, manifest.tileM, withWalls(walls, wallFaces(stoneWalls), roadside.walls, modelWalls(models, tile.windmills), dockWalls(docks)), cut));
  }
  return world;
}
