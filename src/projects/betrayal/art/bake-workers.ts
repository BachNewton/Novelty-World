import type { Baker, BakeScene, Gathered, Samples } from "./bake";
import type { BakeJob } from "./bake.worker";

/** Samples per chunk at least: below this, posting costs more than baking. */
const LEAST_CHUNK = 4096;

interface Pending {
  scene: BakeScene;
  sceneId: number;
  samples: Samples;
  resolve: (gathered: Gathered) => void;
  reject: (error: Error) => void;
}

/**
 * Bakes on a pool of workers, so the page stays live while the house is lit
 * and a phone's cores share the work. Each bake is cut into chunks that go to
 * whichever worker is free; a worker keeps the last scene it was sent, with
 * its BVH, so a floor's casters cross over once per worker.
 */
export function workerBaker(): Baker & { dispose: () => void } {
  const size = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1));
  const pool = Array.from({ length: size }, () => ({
    worker: new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" }),
    sceneId: -1,
    job: null as Pending | null,
  }));
  const queue: Pending[] = [];

  const pump = () => {
    for (const slot of pool) {
      if (slot.job) continue;
      const job = queue.shift();
      if (!job) return;
      slot.job = job;
      const message: BakeJob = { sceneId: job.sceneId, scene: slot.sceneId === job.sceneId ? null : job.scene, ...job.samples };
      slot.sceneId = job.sceneId;
      slot.worker.postMessage(message, [job.samples.position.buffer, job.samples.normal.buffer]);
    }
  };
  for (const slot of pool) {
    slot.worker.onmessage = ({ data }: MessageEvent<Gathered>) => {
      const job = slot.job;
      slot.job = null;
      job?.resolve(data);
      pump();
    };
    slot.worker.onerror = (event) => {
      const job = slot.job;
      slot.job = null;
      job?.reject(new Error(`A bake worker failed: ${event.message}`));
    };
  }

  const bake: Baker = async (scene, sceneId, samples) => {
    const count = samples.position.length / 3;
    const chunk = Math.max(LEAST_CHUNK, Math.ceil(count / (size * 2)));
    const parts: Promise<Gathered>[] = [];
    for (let start = 0; start < count; start += chunk) {
      const end = Math.min(count, start + chunk);
      const part = { position: samples.position.slice(start * 3, end * 3), normal: samples.normal.slice(start * 3, end * 3) };
      parts.push(new Promise((resolve, reject) => queue.push({ scene, sceneId, samples: part, resolve, reject })));
    }
    pump();
    const done = await Promise.all(parts);
    const light = new Float32Array(count * 3);
    const weights = new Float32Array(done.reduce((sum, part) => sum + part.weights.length, 0));
    let at = 0;
    let weightAt = 0;
    for (const part of done) {
      light.set(part.light, at);
      weights.set(part.weights, weightAt);
      at += part.light.length;
      weightAt += part.weights.length;
    }
    return { light, weights };
  };
  return Object.assign(bake, {
    dispose: () => {
      for (const { worker } of pool) worker.terminate();
    },
  });
}
