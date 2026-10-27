import { isRecord, parseWorld } from "./parse";
import type { World } from "./types";

/** Where the world is kept between visits. Only the host reads or writes it. */
export interface SaveStore {
  load(): Promise<World | null>;
  save(world: World): Promise<void>;
}

/** Test/dev only: `?save=local` keeps the world in this browser instead of online. */
export const SAVE_PARAM = "save";

export const API_PATH = "/api/whisker-hollow";

export function onlineStore(worldId: string): SaveStore {
  return {
    async load() {
      const response = await fetch(`${API_PATH}?world=${encodeURIComponent(worldId)}`);
      if (!response.ok) throw new Error(`whisker hollow: loading the world failed (${response.status})`);
      const body: unknown = await response.json();
      if (!isRecord(body)) throw new Error("whisker hollow: the saved world came back malformed");
      if (body.world === null) return null;
      const world = parseWorld(body.world);
      if (world === null) throw new Error("whisker hollow: the saved world is malformed");
      return world;
    },
    async save(world) {
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: worldId, state: world }),
      });
      if (!response.ok) throw new Error(`whisker hollow: saving the world failed (${response.status})`);
    },
  };
}

export function localStore(worldId: string, storage: Storage): SaveStore {
  const key = `whisker-hollow:world:${worldId}`;
  return {
    load() {
      const raw = storage.getItem(key);
      if (raw === null) return Promise.resolve(null);
      const world = parseWorld(JSON.parse(raw));
      if (world === null) throw new Error("whisker hollow: the saved world is malformed");
      return Promise.resolve(world);
    },
    save(world) {
      storage.setItem(key, JSON.stringify(world));
      return Promise.resolve();
    },
  };
}

export function storeFromSearch(search: string, worldId: string): SaveStore {
  const mode = new URLSearchParams(search).get(SAVE_PARAM);
  if (mode === null) return onlineStore(worldId);
  if (mode === "local") return localStore(worldId, window.localStorage);
  throw new Error(`?${SAVE_PARAM}=${mode} is not "local"`);
}

/**
 * Writes the newest world, one write at a time: a change during a write
 * waits, and only the latest waiting change is written after it.
 */
export function createSaver(store: SaveStore, onError: (error: unknown) => void): (world: World) => void {
  let writing = false;
  let waiting: World | null = null;

  function write(world: World): void {
    writing = true;
    store.save(world).then(
      () => {
        writing = false;
        const next = waiting;
        waiting = null;
        if (next !== null) write(next);
      },
      (error: unknown) => {
        writing = false;
        onError(error);
      },
    );
  }

  return (world) => {
    if (writing) waiting = world;
    else write(world);
  };
}
