import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { decodeHeights, decodeRoadSurface, type TileData, type TileManifest } from "../render/tile";

const inflated = (gzipped: Buffer) => {
  const bytes = gunzipSync(gzipped);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** The committed tile read from disk, for tests outside a browser. */
export function readTile(): TileData {
  const manifest = JSON.parse(readFileSync("public/aland-drive/tiles/L2343C/tile.json", "utf8")) as TileManifest;
  return {
    manifest,
    grid: decodeHeights(new Int16Array(inflated(readFileSync("public/aland-drive/tiles/L2343C/heights.bin.gz"))), manifest),
    surface: decodeRoadSurface(inflated(readFileSync("public/aland-drive/tiles/L2343C/road-surface.bin.gz")), manifest),
    waterNodes: new Uint8Array(inflated(readFileSync("public/aland-drive/tiles/L2343C/water-nodes.bin.gz"))),
  };
}
