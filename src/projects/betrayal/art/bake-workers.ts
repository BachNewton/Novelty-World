import type { Gathered, RoomLight } from "./bake";
import type { FinishWork } from "./bake-finish";
import type { Lane } from "./bake-schedule";
import type { BakeMessage } from "./bake.worker";

/** The arrays a finish can hand over rather than copy: the bounce's light, used once. The direct
 *  light is copied, as the room keeps it to add its bounce to; the room's layout always stays. */
function finishTransfers(work: FinishWork): Transferable[] {
  if (work.kind === "direct") return [];
  return [work.direct, work.coarse].flatMap(({ light, weights }) => [light.buffer, weights.buffer]);
}

/**
 * Workers in the pool, from the logical cores the browser reports. Throughput
 * stops rising at about three quarters of them (the physical cores and some
 * of their second threads), while every worker past that only takes time
 * from the page's own thread, the compositor and the GPU process: on a
 * 16-thread laptop, 11 workers baked the house as fast as 15 did, at 41
 * frames a second against 28. So it is three quarters, less one for the page.
 * Each worker holds its floor's scene and BVH, a few MB, so memory sets no
 * tighter bound.
 */
export function poolSize(): number {
  return Math.max(1, Math.floor(((navigator.hardwareConcurrency || 2) * 3) / 4) - 1);
}

/** One worker as a lane: it keeps the last scene it was sent, with its BVH,
 *  so a floor's casters cross over once per worker. */
function workerLane(): Lane {
  const worker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
  let sceneId = -1;
  let job: { resolve: (result: Gathered | RoomLight) => void; reject: (error: Error) => void } | null = null;
  worker.onmessage = ({ data }: MessageEvent<Gathered | RoomLight>) => {
    const current = job;
    job = null;
    current?.resolve(data);
  };
  worker.onerror = (event) => {
    const current = job;
    job = null;
    current?.reject(new Error(`A bake worker failed: ${event.message}`));
  };
  const send = (message: BakeMessage, transfer: Transferable[]) => {
    if (job) throw new Error("A bake lane was sent work while busy");
    return new Promise<Gathered | RoomLight>((resolve, reject) => {
      job = { resolve, reject };
      worker.postMessage(message, transfer);
    });
  };
  return {
    run: async ({ pass, scene, sceneId: id, samples }) => {
      const message: BakeMessage = { type: "gather", pass, sceneId: id, scene: sceneId === id ? null : scene, samples };
      sceneId = id;
      return (await send(message, [samples.position.buffer, samples.normal.buffer, samples.within.buffer])) as Gathered;
    },
    finish: async ({ work }) => (await send({ type: "finish", work }, finishTransfers(work))) as RoomLight,
    dispose: () => {
      worker.terminate();
    },
  };
}

/** The pool's lanes, so the page stays live while the house is lit and every core shares the work. */
export function workerLanes(count = poolSize()): Lane[] {
  return Array.from({ length: count }, workerLane);
}
