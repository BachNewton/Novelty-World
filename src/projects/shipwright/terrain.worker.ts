// Web Worker that runs terrain generation (~3 M noise evaluations per 600 m window,
// ~0.7–1.6 s) off the main thread. Bundled by Next.js via `new Worker(new URL(...))` —
// the same pattern as family-tree's layout.worker.ts.
//
// The worker stays dumb: it generates the chunk it is handed and posts the buffers
// back, TRANSFERRED (zero-copy — after postMessage the worker-side arrays are
// neutered). Staleness checks and cancellation live in the client
// (terrain-stream.ts); the worker itself is a pure compute pipe. It imports only
// `terrain-gen.ts`, which is deliberately dependency-free, so this bundle carries
// no three.js.

import { generateChunk, payloadTransferables, type ChunkPayload, type ChunkRequest } from "./terrain-gen";

export interface TerrainWorkRequest {
  id: number;
  req: ChunkRequest;
}

export type TerrainWorkResponse =
  | { id: number; ok: true; payload: ChunkPayload }
  | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<TerrainWorkRequest>) => void) | null;
  postMessage: (msg: TerrainWorkResponse, transfer?: Transferable[]) => void;
}

// `self` inside a Worker is a DedicatedWorkerGlobalScope, which isn't in our
// tsconfig lib (we only ship "dom"). Cast to a minimal local shape instead of
// pulling in the whole webworker lib.
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    const payload = generateChunk(req);
    ctx.postMessage({ id, ok: true, payload }, payloadTransferables(payload));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ id, ok: false, error: message });
  }
};
