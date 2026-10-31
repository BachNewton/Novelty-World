import { DataArrayTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter, NoColorSpace, RedFormat, RGBAFormat, RGFormat, type Texture, type WebGPURenderer } from "three/webgpu";
import type { WorldManifest } from "./tile";
import type { FarTile, Mips } from "./tile.worker";
import type { World, WorldTile } from "../sim/world";

/*
 * The tiles' images, each kind in one array texture with a layer per tile, so
 * one shader can draw any tile, and its neighbour in the next pixel, with no
 * draw call or material per tile. Each kind has a few layers, reused as the car
 * moves, so what this holds doesn't grow with the island: tiles past the far
 * images are the overview's. `slots` is a little map from a tile's place to its
 * layers, with a texel for every tile.
 *
 * A layer's mips arrive made, from the worker. They go to the GPU in slices over
 * several frames, because the copy is the one part of a tile that has to happen
 * on the main thread, and a layer goes live only when it's all there.
 */

/** The most tiles at full detail at once, and the two that can be landing as others leave. */
const NEAR_LAYERS = 6;
/** The most tiles the stream holds far data for: four each way, as a car crosses a corner. */
const FAR_LAYERS = 16;
const ANISOTROPY = 8;
/** At 60 fps this is a 2 m image in about half a second, and a few milliseconds' memcpy a frame. */
const UPLOAD_BYTES_A_FRAME = 2_000_000;

interface Slice {
  texture: Texture;
  layer: number;
  level: number;
  data: Uint8Array;
  size: number;
  channels: number;
  firstRow: number;
  done?: () => void;
}

// three has no way to write part of one layer's mip level, so this goes to the GPU texture it made.
interface TextureBackend {
  device: GPUDevice;
  get: (texture: Texture) => { texture: GPUTexture };
}

const levelCount = (size: number) => Math.floor(Math.log2(size)) + 1;

export class TileLayers {
  readonly shadeNear: DataArrayTexture;
  readonly shadeFar: DataArrayTexture;
  readonly mask: DataArrayTexture;
  readonly groundNear: DataArrayTexture;
  readonly groundFar: DataArrayTexture;
  readonly canopy: DataArrayTexture;
  readonly slots: DataTexture;
  /** The lattice place of the map's first texel, and how many tiles it spans. */
  readonly mapColumn: number;
  readonly mapRow: number;
  readonly mapColumns: number;
  readonly mapRows: number;
  private readonly slotBytes: Uint8Array;
  /** What every layer holds on the GPU, mips included: it's fixed, so memory can't grow with the drive. */
  readonly textureBytes: number;
  private readonly freeNear: number[];
  private readonly freeFar: number[];
  private readonly nearOf = new Map<string, number>();
  private readonly farOf = new Map<string, number>();
  private readonly backend: TextureBackend;
  private queue: Slice[] = [];

  constructor(renderer: WebGPURenderer, world: World) {
    const { manifest } = world;
    const tiles = [...world.all()];
    this.backend = renderer.backend as unknown as TextureBackend;
    const farLayers = Math.min(FAR_LAYERS, tiles.length);
    const held: [size: number, depth: number, channels: 1 | 4][] = [
      [manifest.shade.pixels, NEAR_LAYERS, 1],
      [manifest.far.shadePixels, farLayers, 1],
      [manifest.mask.pixels, farLayers, 4],
      [manifest.ground.pixels, NEAR_LAYERS, 4],
      [manifest.ground.farPixels, farLayers, 4],
      [manifest.canopy.pixels, farLayers, 1],
    ];
    [this.shadeNear, this.shadeFar, this.mask, this.groundNear, this.groundFar, this.canopy] = held.map(([size, depth, channels]) => this.layers(renderer, size, depth, channels));
    this.textureBytes = Math.round(held.reduce((sum, [size, depth, channels]) => sum + size * size * depth * channels, 0) * (4 / 3));
    this.freeNear = Array.from({ length: NEAR_LAYERS }, (_, layer) => layer);
    this.freeFar = Array.from({ length: farLayers }, (_, layer) => layer);

    this.mapColumn = Math.min(...tiles.map((tile) => tile.column));
    this.mapRow = Math.min(...tiles.map((tile) => tile.row));
    this.mapColumns = Math.max(...tiles.map((tile) => tile.column)) - this.mapColumn + 1;
    this.mapRows = Math.max(...tiles.map((tile) => tile.row)) - this.mapRow + 1;
    this.slotBytes = new Uint8Array(this.mapColumns * this.mapRows * 2);
    this.slots = new DataTexture(this.slotBytes, this.mapColumns, this.mapRows, RGFormat);
    this.slots.minFilter = this.slots.magFilter = NearestFilter;
    this.slots.needsUpdate = true;
  }

  private layers(renderer: WebGPURenderer, size: number, depth: number, channels: 1 | 4): DataArrayTexture {
    const texture = new DataArrayTexture(new Uint8Array(size * size * depth * channels), size, size, depth);
    texture.format = channels === 1 ? RedFormat : RGBAFormat;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = ANISOTROPY;
    texture.needsUpdate = true;
    renderer.initTexture(texture);
    texture.image.data = new Uint8Array(0);
    return texture;
  }

  private enqueue(texture: Texture, layer: number, mips: Mips, size: number, channels: number, done: () => void): void {
    if (mips.length !== levelCount(size)) throw new Error(`${mips.length} mips for an image of ${size} pixels`);
    mips.forEach((data, level) => {
      this.queue.push({ texture, layer, level, data, size: Math.max(1, size >> level), channels, firstRow: 0, done: level === mips.length - 1 ? done : undefined });
    });
  }

  private write(slice: Slice, rows: number): void {
    const { texture, layer, level, data, size, channels, firstRow } = slice;
    this.backend.device.queue.writeTexture(
      { texture: this.backend.get(texture).texture, mipLevel: level, origin: { x: 0, y: firstRow, z: layer } },
      data as Uint8Array<ArrayBuffer>,
      { offset: firstRow * size * channels, bytesPerRow: size * channels },
      { width: size, height: rows, depthOrArrayLayers: 1 },
    );
  }

  /** Copies a frame's share of what's waiting to the GPU. */
  uploadStep(budget = UPLOAD_BYTES_A_FRAME): void {
    let left = budget;
    while (left > 0 && this.queue.length > 0) {
      const slice = this.queue[0];
      const rowBytes = slice.size * slice.channels;
      const rows = Math.min(slice.size - slice.firstRow, Math.max(1, Math.floor(left / rowBytes)));
      this.write(slice, rows);
      left -= rows * rowBytes;
      slice.firstRow += rows;
      if (slice.firstRow === slice.size) {
        this.queue.shift();
        slice.done?.();
      }
    }
  }

  /** A tile's far images. */
  placeFar(tile: WorldTile, { shade, mask, ground, canopy }: Pick<FarTile, "shade" | "mask" | "ground" | "canopy">, manifest: WorldManifest, done: () => void): void {
    const layer = this.freeFar.pop();
    if (layer === undefined) throw new Error(`no free far layer for ${tile.name}: more tiles with far data than the stream allows`);
    this.farOf.set(tile.name, layer);
    let waiting = 4;
    const landed = () => {
      if (--waiting > 0) return;
      this.setSlot(tile, 0, layer + 1);
      done();
    };
    this.enqueue(this.shadeFar, layer, shade, manifest.far.shadePixels, 1, landed);
    this.enqueue(this.mask, layer, mask, manifest.mask.pixels, 4, landed);
    this.enqueue(this.groundFar, layer, ground, manifest.ground.farPixels, 4, landed);
    this.enqueue(this.canopy, layer, canopy, manifest.canopy.pixels, 1, landed);
  }

  releaseFar(tile: WorldTile): void {
    const layer = this.farOf.get(tile.name);
    if (layer === undefined) throw new Error(`${tile.name} holds no far layer`);
    this.farOf.delete(tile.name);
    this.freeFar.push(layer);
    this.setSlot(tile, 0, 0);
  }

  placeNear(tile: WorldTile, shade: Mips, ground: Mips, manifest: WorldManifest, done: () => void): void {
    const layer = this.freeNear.pop();
    if (layer === undefined) throw new Error(`no free layer for ${tile.name}: more tiles at full detail than the stream allows`);
    this.nearOf.set(tile.name, layer);
    this.enqueue(this.shadeNear, layer, shade, manifest.shade.pixels, 1, () => undefined);
    this.enqueue(this.groundNear, layer, ground, manifest.ground.pixels, 4, () => {
      this.setSlot(tile, 1, layer + 1);
      done();
    });
  }

  releaseNear(tile: WorldTile): void {
    const layer = this.nearOf.get(tile.name);
    if (layer === undefined) throw new Error(`${tile.name} holds no layer`);
    this.nearOf.delete(tile.name);
    this.freeNear.push(layer);
    this.setSlot(tile, 1, 0);
  }

  private setSlot(tile: WorldTile, channel: number, value: number): void {
    this.slotBytes[((tile.row - this.mapRow) * this.mapColumns + tile.column - this.mapColumn) * 2 + channel] = value;
    this.slots.needsUpdate = true;
  }

  dispose(): void {
    this.shadeNear.dispose();
    this.shadeFar.dispose();
    this.mask.dispose();
    this.groundNear.dispose();
    this.groundFar.dispose();
    this.canopy.dispose();
    this.slots.dispose();
  }
}
