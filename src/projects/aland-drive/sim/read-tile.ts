import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeHeights, type TileManifest, type WorldManifest } from "../render/tile";
import { decodeSolids } from "../render/solids";
import { tileDetail, World } from "./world";

const inflated = (gzipped: Buffer) => {
  const bytes = gunzipSync(gzipped);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** The committed copy of one real tile: a world of its own, for tests. */
export const FIXTURE_TILES = "src/projects/aland-drive/fixture";

/** Tiles read from a folder on disk with every tile at full detail, for anything running outside a browser. */
export function readWorld(folder: string): World {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
  const manifest = JSON.parse(readFileSync(join(folder, "world.json"), "utf8")) as WorldManifest;
  const world = new World(manifest);
  for (const { name } of manifest.tiles) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const tile = JSON.parse(readFileSync(join(folder, name, "tile.json"), "utf8")) as TileManifest;
    const { west, north } = tile.bounds;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder a tool or test named
    const read = (file: string) => inflated(readFileSync(join(folder, name, file)));
    world.addFar(name, decodeHeights(new Int16Array(read(manifest.far.heightsFile)), { ...manifest.far, unitM: manifest.heights.unitM }, { west, north }));
    const grid = decodeHeights(new Int16Array(read(manifest.heights.file)), manifest.heights, { west, north });
    const { walls } = decodeSolids(read(tile.solids.file), tile.solids);
    world.addDetail(tileDetail(tile, grid, read(tile.roadSurface.file), new Uint8Array(read(manifest.water.nodesFile)), manifest.tileM, walls));
  }
  return world;
}
