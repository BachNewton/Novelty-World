import type { TileKey } from "./streaming";
import { landTile, type LandTile } from "./tiles";
import { createWorld, type World } from "./world";

/*
 * Works out tiles of land off the main thread: the world is made once per
 * seed in the worker, and each tile asked for comes back as plain arrays,
 * handed over rather than copied.
 */

export interface LandTileRequest {
  seed: string;
  key: TileKey;
}

/** What the pool hears back: the tile, or why it couldn't be worked out. */
export type LandTileReply = { key: TileKey; tile: LandTile } | { key: TileKey; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LandTileRequest>) => void) | null;
  postMessage: (message: LandTileReply, transfer?: Transferable[]) => void;
};

let world: World | null = null;

scope.onmessage = ({ data: { seed, key } }) => {
  try {
    if (world?.seed !== seed) world = createWorld(seed);
    const tile = landTile(world, key);
    const arrays = [tile.heights, tile.parentHeights, tile.normals, tile.regions, tile.woodland, tile.water, tile.river, tile.wobble, tile.flow, tile.fall];
    scope.postMessage({ key, tile }, arrays.map((a) => a.buffer));
  } catch (error) {
    scope.postMessage({ key, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  }
};
