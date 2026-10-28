import type { LandTileReply, LandTileRequest } from "../engine/land-tile.worker";
import { tileId, type TileKey } from "../engine/streaming";
import type { LandTile } from "../engine/tiles";

/*
 * A few workers that work out tiles of land for the main thread, each tile
 * sent to whichever worker has the fewest waiting. A tile that can't be
 * worked out is an error in the world's code, so it is thrown, not skipped.
 */

export interface LandWorkers {
  /** Asks for a tile; `onTile` hears it when it is ready. */
  request: (key: TileKey) => void;
  /** How many tiles are asked for and not yet back. */
  waiting: () => number;
  dispose: () => void;
}

export function landWorkers(seed: string, onTile: (tile: LandTile) => void): LandWorkers {
  const count = Math.max(1, Math.min(4, Math.floor(navigator.hardwareConcurrency / 2) - 1));
  const loads = new Array<number>(count).fill(0);
  const workers = Array.from({ length: count }, (_, w) => {
    const worker = new Worker(new URL("../engine/land-tile.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<LandTileReply>) => {
      loads[w]--;
      if ("error" in data) throw new Error(`Tile ${tileId(data.key)} failed in its worker:\n${data.error}`);
      onTile(data.tile);
    };
    worker.onerror = (event) => {
      throw new Error(`A land worker failed: ${event.message}`);
    };
    return worker;
  });
  return {
    request(key) {
      const w = loads.indexOf(Math.min(...loads));
      loads[w]++;
      workers[w].postMessage({ seed, key } satisfies LandTileRequest);
    },
    waiting: () => loads.reduce((sum, n) => sum + n, 0),
    dispose() {
      for (const worker of workers) worker.terminate();
    },
  };
}
