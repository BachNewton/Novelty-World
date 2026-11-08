import { expect, it } from "vitest";
import { MOST_DETAIL_TILES, MOST_FAR_TILES, TileStream, type StreamTarget, type TileFetcher } from "./stream";
import type { DetailTile, FarTile } from "./tile.worker";
import type { World, WorldTile } from "../sim/world";

/*
 * A focus that jumps, as the map's does, with tiles landing after it has moved on: the GPU's layers throw if they're
 * overrun. And a tile that can't be fetched fails loudly, never leaving a hole in the world.
 */

const TILE_M = 6000;
const SIDE = 14;

function setUp(fetchFails: string | null = null, onFailure: (error: Error) => void = (error) => {
  throw error;
}) {
  const tiles = Array.from({ length: SIDE * SIDE }, (_, index) => ({ name: `T${index}`, column: index % SIDE, row: Math.floor(index / SIDE), far: null, detail: null })) as unknown as WorldTile[];
  const named = (name: string) => tiles.find((tile) => tile.name === name) as unknown as { far: unknown; detail: unknown };
  const world = {
    tileM: TILE_M,
    all: () => tiles,
    addFar: (name: string, grid: unknown) => (named(name).far = grid),
    removeFar: (name: string) => (named(name).far = null),
    addDetail: (detail: { name: string }) => (named(detail.name).detail = detail),
    removeDetail: (name: string) => (named(name).detail = null),
  } as unknown as World;
  const failed = () => Promise.reject(new Error(`${fetchFails}: 404`));
  const fetcher = {
    far: () => (fetchFails === "far" ? failed() : Promise.resolve({ bytes: 1, grid: {} } as unknown as FarTile)),
    detail: (name: string) => (fetchFails === "detail" ? failed() : Promise.resolve({ bytes: 1, detail: { name } } as unknown as DetailTile)),
  } as unknown as TileFetcher;
  const held = { far: 0, detail: 0, mostFar: 0, mostDetail: 0 };
  const target: StreamTarget = {
    placeFar: (_, done) => {
      held.mostFar = Math.max(held.mostFar, ++held.far);
      done();
    },
    releaseFar: () => held.far--,
    place: (_, done) => {
      held.mostDetail = Math.max(held.mostDetail, ++held.detail);
      done();
    },
    release: () => held.detail--,
  };
  return { stream: new TileStream(world, fetcher, target, onFailure), held, tiles };
}

const landings = () => new Promise((resolve) => setTimeout(resolve));

it("never holds more tiles than the GPU has layers, however the focus jumps", async () => {
  const { stream, held } = setUp();
  for (let step = 0; step < 300; step++) {
    stream.update(((step * 7) % SIDE) * TILE_M + 900, ((step * 5) % SIDE) * TILE_M + 2100);
    if (step % 3 === 0) await landings();
  }
  expect(held.mostFar).toBeLessThanOrEqual(MOST_FAR_TILES);
  expect(held.mostDetail).toBeLessThanOrEqual(MOST_DETAIL_TILES);
});

it("fetches no detail for a focus that only wants far data", async () => {
  const { stream, tiles } = setUp();
  for (let step = 0; step < 30; step++) {
    stream.update(21000, 21000, false);
    await landings();
  }
  expect(tiles.some((tile) => tile.far)).toBe(true);
  expect(tiles.some((tile) => tile.detail)).toBe(false);
});

it("hands a tile that can't be fetched, far or in detail, to its failure with why", async () => {
  for (const kind of ["far", "detail"]) {
    const failures: string[] = [];
    const { stream } = setUp(kind, (error) => failures.push(error.message));
    stream.update(21000, 21000);
    await landings();
    expect(failures.length, kind).toBeGreaterThan(0);
    expect(failures.every((message) => message === `${kind}: 404`)).toBe(true);
  }
});
