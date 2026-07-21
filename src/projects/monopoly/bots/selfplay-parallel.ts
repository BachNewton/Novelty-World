import os from "node:os";
import { Worker } from "node:worker_threads";
import type { PlayerCount } from "../types";
import type { TrainSample } from "./net";
import type { SelfPlayTask, EvalTask, EvalGameResult } from "./selfplay-worker";

// ---------------------------------------------------------------------------
// PARALLEL self-play generation — the throughput fix RL-DESIGN.md §8 calls the gate
// on everything. Self-play games are pure and independent, so a pool of worker
// threads plays them concurrently across cores. The trainer hands the pool a batch
// of seeds; each worker reloads the current net from the checkpoint dir, plays its
// share, and posts back the labelled training samples. Mirrors `parallel.ts` (the
// rule-bot evaluator pool) but each worker carries the net.
//
// Determinism is preserved: a game is a pure function of (net checkpoint, seed), so
// which worker plays which seed never changes the samples — only the wall-clock.
// ---------------------------------------------------------------------------

/** Leave 1–2 cores for the main thread (which also runs the GPU/CPU training step
 *  between batches) and the OS. */
export function defaultSelfPlayWorkers(): number {
  return Math.max(1, os.cpus().length - 2);
}

export interface ParallelSelfPlayOptions {
  netDir: string | null;
  seeds: string[];
  players: PlayerCount;
  maxTurns: number;
  sims: number;
}

/** Options for parallel eval games (net vs rule bot). Used by the SPRT-based
 *  strength gauge in train-cli.ts (RL-DESIGN.md §8 #2 — parallelize evaluate()). */
export interface EvalPoolOptions {
  netDir: string;
  rule: string;
  rlLabel: string;
  seeds: string[];
  players: PlayerCount;
  maxTurns: number;
  sims: number;
}

/** A reusable pool of self-play workers. Spawn once (tfjs loads per worker on first
 *  task), call `generate` each training iteration with that iteration's seeds, then
 *  `close`. Reusing the pool avoids paying tfjs's per-thread module-load cost every
 *  iteration. */
export class SelfPlayPool {
  private readonly workers: Worker[];
  readonly size: number;

  constructor(size: number = defaultSelfPlayWorkers()) {
    this.size = Math.max(1, size);
    // Spawn the PLAIN-ESM bootstrap shim (not the .ts worker directly): a worker
    // thread under tsx doesn't inherit tsx's ESM loader, so a .ts worker can't
    // resolve its imports. The .mjs shim loads with no loader, registers tsx, then
    // imports the real .ts worker. See selfplay-worker-boot.mjs.
    this.workers = Array.from(
      { length: this.size },
      () => new Worker(new URL("./selfplay-worker-boot.mjs", import.meta.url)),
    );
  }

  /** Play one game per seed across the pool; resolve with all samples concatenated.
   *  Seeds are split into one contiguous chunk per worker (games vary in length, but
   *  over a few games per worker it evens out — and a stuck game can't starve the
   *  others since each worker owns a fixed slice). */
  generate(opts: ParallelSelfPlayOptions): Promise<TrainSample[]> {
    const { seeds } = opts;
    if (seeds.length === 0) return Promise.resolve([]);
    const nChunks = Math.min(this.size, seeds.length);
    const per = Math.ceil(seeds.length / nChunks);
    const chunks: string[][] = [];
    for (let i = 0; i < seeds.length; i += per) chunks.push(seeds.slice(i, i + per));

    return new Promise<TrainSample[]>((resolve, reject) => {
      const out: TrainSample[] = [];
      let done = 0;
      chunks.forEach((chunk, ci) => {
        const w = this.workers[ci];
        const onMessage = (msg: { samples: TrainSample[]; error?: string }): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          if (msg.error !== undefined) {
            reject(new Error(`self-play worker failed: ${msg.error}`));
            return;
          }
          out.push(...msg.samples);
          done += 1;
          if (done === chunks.length) resolve(out);
        };
        const onError = (err: Error): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          reject(err);
        };
        w.on("message", onMessage);
        w.on("error", onError);
        const task: SelfPlayTask = {
          kind: "selfplay",
          netDir: opts.netDir,
          seeds: chunk,
          players: opts.players,
          maxTurns: opts.maxTurns,
          sims: opts.sims,
        };
        w.postMessage(task);
      });
    });
  }

  /** Play eval games (net vs rule bot) across the pool — the parallel replacement
   *  for train-cli's sequential `evaluate()`. Each worker plays its share of games
   *  and posts back per-game outcomes. The caller feeds these into the SPRT walker
   *  (`walkGauntletSprt`) for a statistically meaningful strength verdict. */
  evalGames(opts: EvalPoolOptions): Promise<EvalGameResult[]> {
    const { seeds } = opts;
    if (seeds.length === 0) return Promise.resolve([]);
    const nChunks = Math.min(this.size, seeds.length);
    const per = Math.ceil(seeds.length / nChunks);
    const chunks: string[][] = [];
    for (let i = 0; i < seeds.length; i += per) chunks.push(seeds.slice(i, i + per));

    return new Promise<EvalGameResult[]>((resolve, reject) => {
      const out: EvalGameResult[] = [];
      let done = 0;
      chunks.forEach((chunk, ci) => {
        const w = this.workers[ci];
        const onMessage = (msg: { results: EvalGameResult[]; error?: string }): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          if (msg.error !== undefined) {
            reject(new Error(`eval worker failed: ${msg.error}`));
            return;
          }
          out.push(...msg.results);
          done += 1;
          if (done === chunks.length) resolve(out);
        };
        const onError = (err: Error): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          reject(err);
        };
        w.on("message", onMessage);
        w.on("error", onError);
        const task: EvalTask = {
          kind: "eval",
          netDir: opts.netDir,
          rule: opts.rule,
          rlLabel: opts.rlLabel,
          seeds: chunk,
          players: opts.players,
          maxTurns: opts.maxTurns,
          sims: opts.sims,
        };
        w.postMessage(task);
      });
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
