import { isMeshed, partsOf, unpackParts, type FigureParts } from "./figure-parts";
import type { MeshReply } from "./figure-mesh.worker";
import type { ExplorerBuilder } from "./stage";

/*
 * Figures meshed off the page's thread. A figure's parts are pure formulas,
 * meshed once a session; meshing them is the slow step of building one, so
 * workers do it and hand the meshes over (`figure-parts.ts`), and the
 * builder then builds at once. A portrait or the house asks `meshFigure` and
 * builds when it resolves.
 */

/** How a house gets its figures meshed. */
export interface FigureMesher {
  /** Whether a builder can build now without meshing. */
  isMeshed: (build: ExplorerBuilder) => boolean;
  /** Resolves once a builder's parts are meshed: at once if they are. */
  meshed: (build: ExplorerBuilder) => Promise<void>;
}

/** Meshes on this thread, as each builder first builds: for tests and tools. */
export const meshOnBuild: FigureMesher = { isMeshed: () => true, meshed: () => Promise.resolve() };

/**
 * Workers for meshing, from the logical cores the browser reports: the bake's
 * pool takes about three quarters of them and leaves the rest to the page, so
 * meshing, a short burst at load, takes that last quarter.
 */
function poolSize(): number {
  return Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 4));
}

interface Job {
  parts: FigureParts<unknown>;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** Each set of parts on its way, by id, so none is meshed twice. */
const coming = new Map<string, Promise<void>>();
const queue: Job[] = [];
const workers: { worker: Worker; job: Job | null }[] = [];

function finish(slot: { worker: Worker; job: Job | null }) {
  slot.job = null;
  pump();
  // Nothing left to mesh: the workers go, and come back if a figure new to the session needs them.
  if (queue.length === 0 && workers.every((each) => each.job === null)) {
    for (const each of workers) each.worker.terminate();
    workers.length = 0;
  }
}

function spawn() {
  const slot: { worker: Worker; job: Job | null } = { worker: new Worker(new URL("./figure-mesh.worker.ts", import.meta.url), { type: "module" }), job: null };
  slot.worker.onmessage = ({ data }: MessageEvent<MeshReply>) => {
    const job = slot.job;
    if (job?.parts.id !== data.id) throw new Error(`A figure worker answered for "${data.id}", not the parts it was given`);
    if ("error" in data) job.reject(new Error(`Meshing ${data.id} failed in a worker: ${data.error}`));
    else {
      job.parts.prime(unpackParts(data.packed, data.id));
      job.resolve();
    }
    finish(slot);
  };
  slot.worker.onerror = (event) => {
    const job = slot.job;
    job?.reject(new Error(`A figure worker failed: ${event.message}`));
    finish(slot);
  };
  workers.push(slot);
  return slot;
}

function pump() {
  while (queue.length > 0) {
    const slot = workers.find((each) => each.job === null) ?? (workers.length < poolSize() ? spawn() : null);
    if (!slot) return;
    const job = queue.shift();
    if (!job) return;
    slot.job = job;
    slot.worker.postMessage(job.parts.id);
  }
}

function meshParts(parts: FigureParts<unknown>): Promise<void> {
  if (parts.ready()) return Promise.resolve();
  const known = coming.get(parts.id);
  if (known) return known;
  const promise = new Promise<void>((resolve, reject) => {
    queue.push({ parts, resolve, reject });
  });
  coming.set(parts.id, promise);
  pump();
  return promise;
}

/** Resolves once a builder's parts are meshed, in workers: at once if they already are. Then it builds without meshing. */
export function meshFigure(build: ExplorerBuilder): Promise<void> {
  return Promise.all(partsOf(build).map(meshParts)).then(() => undefined);
}

/** Meshes in workers, for the house in a page. */
export const meshInWorkers: FigureMesher = { isMeshed, meshed: meshFigure };
