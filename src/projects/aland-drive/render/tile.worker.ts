import { decodeHeights, type HeightGrid, type TileManifest, type WorldManifest, type WorldTileEntry } from "./tile";
import { tileDetail, type TileDetail } from "../sim/world";

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
  shade: Mips;
  mask: Mips;
  /** Compressed bytes this load read, whether from the network or the browser's cache. */
  bytes: number;
}

export interface DetailTile {
  detail: TileDetail;
  shade: Mips;
  bytes: number;
}

export type TileRequest = { id: number; kind: "far" | "detail"; base: string; world: WorldManifest; tile: WorldTileEntry };
export type TileReply = { id: number; far: FarTile } | { id: number; detailed: DetailTile } | { id: number; error: string };

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
  async pixels(file: string, size: number, channels: 1 | 4): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(new Blob([await this.raw(file)]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const canvas = new OffscreenCanvas(size, size);
    const pen = canvas.getContext("2d", { willReadFrequently: true });
    if (!pen) throw new Error("no 2D canvas in this worker");
    pen.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = pen.getImageData(0, 0, size, size).data;
    if (channels === 4) return new Uint8Array(rgba.buffer);
    const one = new Uint8Array(size * size);
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

async function far(base: string, world: WorldManifest, tile: WorldTileEntry): Promise<FarTile> {
  const reader = new Reader(`${base}/${tile.name}`);
  const { far: format, heights, mask } = world;
  const [farHeights, shade, maskPixels] = await Promise.all([reader.inflated(format.heightsFile), reader.pixels(format.shadeFile, format.shadePixels, 1), reader.pixels(mask.file, mask.pixels, 4)]);
  return {
    name: tile.name,
    grid: decodeHeights(new Int16Array(farHeights), { nodes: format.nodes, stepM: format.stepM, unitM: heights.unitM }, tile),
    shade: mipChain(shade, format.shadePixels, 1),
    mask: mipChain(maskPixels, mask.pixels, 4),
    bytes: reader.bytes,
  };
}

async function detailed(base: string, world: WorldManifest, tile: WorldTileEntry): Promise<DetailTile> {
  const reader = new Reader(`${base}/${tile.name}`);
  const manifest = await reader.json<TileManifest>("tile.json");
  const [heights, surface, waterNodes, shade] = await Promise.all([
    reader.inflated(world.heights.file),
    reader.inflated(manifest.roadSurface.file),
    reader.inflated(world.water.nodesFile),
    reader.pixels(world.shade.file, world.shade.pixels, 1),
  ]);
  const grid = decodeHeights(new Int16Array(heights), world.heights, tile);
  return { detail: tileDetail(manifest, grid, surface, new Uint8Array(waterNodes), world.tileM), shade: mipChain(shade, world.shade.pixels, 1), bytes: reader.bytes };
}

const transfersOf = ({ grid, shade, mask }: FarTile): Transferable[] => [grid.heights.buffer as ArrayBuffer, ...[...shade, ...mask].map((mip) => mip.buffer as ArrayBuffer)];

function detailTransfers({ detail, shade }: DetailTile): Transferable[] {
  const { ribbon, surface, roads, blockRoads, grid, waterNodes } = detail;
  const arrays = [
    grid.heights,
    waterNodes,
    surface.rings,
    surface.tiers,
    ribbon.across,
    ribbon.along,
    ribbon.tiers,
    ribbon.indices,
    ...ribbon.cells.map((cell) => cell.indices),
    roads.points,
    roads.lengths,
    roads.chainFirst,
    roads.chainPoints,
    roads.cellFirst,
    roads.cellSegments,
    blockRoads.first,
    blockRoads.triangles,
    ...shade,
  ];
  return [...new Set(arrays.map((array) => array.buffer as ArrayBuffer))];
}

context.onmessage = (event: MessageEvent<TileRequest>) => {
  const { id, kind, base, world, tile } = event.data;
  void (async () => {
    try {
      if (kind === "far") {
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
