import type { WorldManifest } from "./tile";
import type { DetailTile, FarTile, OverviewData, TileReply, TileRequest } from "./tile.worker";
import type { RoadGraphData } from "../map/road-graph";
import type { TileDetail, World, WorldTile } from "../sim/world";

/*
 * Which tiles are loaded, in two steps: far data within a few kilometres of the
 * focus, the place the game cares about, and full detail nearer than that. Past
 * the far data is the overview, so ground with nothing loaded yet is only
 * coarser, never missing, and what's held doesn't grow with the island. Everything
 * here is driven by where the focus has got to and by a tile arriving, with no clock.
 *
 * How near is worked back from the top speed. Detail must be ready by the time
 * it is first seen, at DETAIL_SEEN_M, and a car at 55 m/s covers LOAD_LEAD_M in
 * 14 seconds: long enough for the two or three tiles that fall due together at
 * a corner to arrive, one after another, over a slow connection. At this reach
 * no more than four tiles are ever wanted at once.
 */

/** How far from the camera the detail images and ribbons are seen. */
export const DETAIL_SEEN_M = 1400;
const LOAD_LEAD_M = 800;
const LOAD_M = DETAIL_SEEN_M + LOAD_LEAD_M;
/** Beyond the load distance, so a car running along a tile's edge doesn't load and drop it over and over. */
const UNLOAD_M = LOAD_M + 600;
const MOST_LOADS_AT_ONCE = 2;
/** Far data is seen out to FAR_SEEN_M. At this reach a tile holds it from the moment it could be, and at most sixteen tiles do. */
export const FAR_LOAD_M = 6000;
const FAR_UNLOAD_M = 7500;

/** The shortest way from a point to a tile. */
export function distanceToTile(x: number, z: number, column: number, row: number, tileM: number): number {
  const west = column * tileM;
  const top = row * tileM;
  return Math.hypot(Math.max(west - x, 0, x - west - tileM), Math.max(top - z, 0, z - top - tileM));
}

/** A tile that should start loading, given a load distance and what's going on: nearest first. */
export function nextToLoad(tiles: Iterable<WorldTile>, x: number, z: number, tileM: number, busy: ReadonlySet<string>): WorldTile | null {
  let best: WorldTile | null = null;
  let bestDistance = LOAD_M;
  for (const tile of tiles) {
    if (tile.detail || busy.has(tile.name)) continue;
    const distance = distanceToTile(x, z, tile.column, tile.row, tileM);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

/** A tile with no far data that should get it. */
export function nextFarToLoad(tiles: Iterable<WorldTile>, x: number, z: number, tileM: number, busy: ReadonlySet<string>): WorldTile | null {
  let best: WorldTile | null = null;
  let bestDistance = FAR_LOAD_M;
  for (const tile of tiles) {
    if (tile.far || busy.has(`${tile.name}:far`)) continue;
    const distance = distanceToTile(x, z, tile.column, tile.row, tileM);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

export function isPastFarUnload(tile: WorldTile, x: number, z: number, tileM: number): boolean {
  return distanceToTile(x, z, tile.column, tile.row, tileM) > FAR_UNLOAD_M;
}

export function isPastUnload(tile: WorldTile, x: number, z: number, tileM: number): boolean {
  return distanceToTile(x, z, tile.column, tile.row, tileM) > UNLOAD_M;
}

/** The worker, as promises. */
export class TileFetcher {
  private readonly worker = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
  private readonly waiting = new Map<number, { resolve: (reply: TileReply) => void; reject: (error: Error) => void }>();
  private nextId = 0;

  constructor(
    private readonly base: string,
    private readonly world: WorldManifest,
  ) {
    this.worker.onmessage = ({ data }: MessageEvent<TileReply>) => {
      const waiter = this.waiting.get(data.id);
      if (!waiter) throw new Error(`a tile reply nobody asked for: ${data.id}`);
      this.waiting.delete(data.id);
      if ("error" in data) waiter.reject(new Error(data.error));
      else waiter.resolve(data);
    };
    this.worker.onerror = (event) => {
      for (const waiter of this.waiting.values()) waiter.reject(new Error(event.message));
      this.waiting.clear();
    };
  }

  private ask(kind: TileRequest["kind"], name: string): Promise<TileReply> {
    const tile = name === "" ? { name, west: 0, north: 0 } : this.world.tiles.find((entry) => entry.name === name);
    if (!tile) throw new Error(`no tile ${name} in this world`);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, kind, base: this.base, world: this.world, tile } satisfies TileRequest);
    });
  }

  async overview(): Promise<OverviewData> {
    const reply = await this.ask("overview", "");
    if (!("overview" in reply)) throw new Error("the overview: the wrong kind of reply");
    return reply.overview;
  }

  async roads(): Promise<RoadGraphData> {
    const reply = await this.ask("map", "");
    if (!("map" in reply)) throw new Error("the road map: the wrong kind of reply");
    return reply.map;
  }

  async far(name: string): Promise<FarTile> {
    const reply = await this.ask("far", name);
    if (!("far" in reply)) throw new Error(`${name}: the wrong kind of reply`);
    return reply.far;
  }

  async detail(name: string): Promise<DetailTile> {
    const reply = await this.ask("detail", name);
    if (!("detailed" in reply)) throw new Error(`${name}: the wrong kind of reply`);
    return reply.detailed;
  }

  dispose(): void {
    this.worker.terminate();
  }
}

export interface StreamStats {
  /** Tiles at full detail. */
  loaded: string[];
  loads: number;
  unloads: number;
  /** Fetching, decoding or going to the GPU. */
  loading: number;
  /** Compressed bytes read for detail and far data, from the network or the browser's cache. */
  bytes: number;
}

export interface StreamTarget {
  /** Takes a tile's detail to the GPU and calls back once it's all there, so a tile only counts as loaded when it can be drawn. */
  place(tile: DetailTile, done: () => void): void;
  /** The world is done with this tile. */
  release(detail: TileDetail): void;
  placeFar(tile: FarTile, done: () => void): void;
  releaseFar(tile: WorldTile): void;
}

export class TileStream {
  private readonly busy = new Set<string>();
  private loads = 0;
  private unloads = 0;
  private bytes = 0;
  private stopped = false;
  private focus: { x: number; z: number } | null = null;
  private waiters: (() => void)[] = [];
  /** Told each time a tile lands. */
  onLanded: () => void = () => undefined;

  constructor(
    private readonly world: World,
    private readonly fetcher: TileFetcher,
    private readonly target: StreamTarget,
    private readonly onFailure: (error: Error) => void,
  ) {}

  addBytes(bytes: number): void {
    this.bytes += bytes;
  }

  /** Called each frame with where the focus has got to, and again as each tile lands. */
  update(x: number, z: number): void {
    this.focus = { x, z };
    const { world } = this;
    for (const tile of world.all()) {
      if (!tile.detail || !isPastUnload(tile, x, z, world.tileM)) continue;
      this.target.release(tile.detail);
      world.removeDetail(tile.name);
      this.unloads++;
    }
    for (const tile of world.all()) {
      if (!tile.far || tile.detail || this.busy.has(tile.name) || !isPastFarUnload(tile, x, z, world.tileM)) continue;
      this.target.releaseFar(tile);
      world.removeFar(tile.name);
    }
    while (this.busy.size < MOST_LOADS_AT_ONCE) {
      const near = nextToLoad(world.all(), x, z, world.tileM, this.busy);
      if (near) {
        void this.load(near.name);
        continue;
      }
      const far = nextFarToLoad(world.all(), x, z, world.tileM, this.busy);
      if (!far) break;
      void this.loadFar(far.name);
    }
    if (this.busy.size === 0) {
      for (const done of this.waiters) done();
      this.waiters = [];
    }
  }

  /** How many tiles a focus here still needs, far data and detail. */
  wanted(x: number, z: number): number {
    let count = 0;
    for (const tile of this.world.all()) {
      const distance = distanceToTile(x, z, tile.column, tile.row, this.world.tileM);
      if (!tile.far && distance < FAR_LOAD_M) count++;
      if (!tile.detail && distance < LOAD_M) count++;
    }
    return count;
  }

  /** Resolves once nothing the focus wants is still on its way. */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** A tile's far data, and resolves once it can be drawn. */
  loadFar(name: string): Promise<void> {
    const key = `${name}:far`;
    this.busy.add(key);
    const landed = this.fetcher
      .far(name)
      .then(
        (tile) =>
          new Promise<void>((resolve) => {
            this.bytes += tile.bytes;
            if (this.stopped) {
              resolve();
              return;
            }
            this.target.placeFar(tile, () => {
              this.world.addFar(name, tile.grid);
              this.onLanded();
              resolve();
            });
          }),
      )
      .then(() => {
        this.busy.delete(key);
        if (this.focus && !this.stopped) this.update(this.focus.x, this.focus.z);
      });
    landed.catch((error: unknown) => {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return landed;
  }

  /** Loads a tile and resolves once it can be drawn and driven on. */
  load(name: string): Promise<void> {
    this.busy.add(name);
    const landed = this.fetcher
      .detail(name)
      .then(
        (tile) =>
          new Promise<void>((resolve) => {
            this.bytes += tile.bytes;
            if (this.stopped) {
              resolve();
              return;
            }
            this.target.place(tile, () => {
              this.world.addDetail(tile.detail);
              this.loads++;
              this.onLanded();
              resolve();
            });
          }),
      )
      .then(() => {
        this.busy.delete(name);
        if (this.focus && !this.stopped) this.update(this.focus.x, this.focus.z);
      });
    landed.catch((error: unknown) => {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return landed;
  }

  stats(): StreamStats {
    const loaded = [...this.world.all()].filter((tile) => tile.detail).map((tile) => tile.name);
    return { loaded, loads: this.loads, unloads: this.unloads, loading: this.busy.size, bytes: this.bytes };
  }

  dispose(): void {
    this.stopped = true;
  }
}
