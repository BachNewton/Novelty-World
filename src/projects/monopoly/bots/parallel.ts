import os from "node:os";
import { Worker } from "node:worker_threads";

// ---------------------------------------------------------------------------
// CPU parallelism for the evaluation loop (see EVOLUTION.md "Measurement"). A
// simulated game is a PURE, deterministic function of (seed, seating) — see
// `simulate.ts` — so games are embarrassingly parallel: distribute them across a
// pool of worker threads and the result is bit-identical regardless of which
// worker ran which game. This is what turns the ~30-min single-core gauntlet into
// a ~2-min run and makes SPRT's game volume practical. The main thread owns the
// stream of games to play and the SPRT/Elo aggregation; the workers only run the
// pure `simulateGame` and hand back a compact outcome.
// ---------------------------------------------------------------------------

/** One game to play: a global `index` (so results map back regardless of which
 *  worker finished first), the RNG `seed` (fully determines the game), the
 *  per-seat version `labels`, and the turn cap. */
export interface GameSpec {
  index: number;
  seed: string;
  /** Version label per seat (e.g. ["fable-v2","claude-v2","fable-v2","claude-v2"]); repeats are fine —
   *  the worker resolves each through `versionBot`. */
  labels: readonly string[];
  maxTurns: number;
}

/** A worker's compact report for one game — everything the aggregators need, and
 *  nothing that would bloat the message channel (no event log, no full state). */
export interface GameResult {
  index: number;
  seed: string;
  labels: readonly string[];
  /** The winning seat's version label, or null for a capped (drawn) game. */
  winnerLabel: string | null;
  terminated: boolean;
  turns: number;
  trades: number;
  declines: number;
  bankruptcies: number;
  /** Set only when the game threw (a rejected intent / engine error) — excluded
   *  from every tally, surfaced as a red flag. */
  error?: string;
}

/** Default worker count: leave 1–2 logical cores for the main thread and OS on a
 *  16-core box (AMD Ryzen 7 7840U → 14 workers). Never below 1. */
export function defaultWorkerCount(): number {
  return Math.max(1, os.cpus().length - 2);
}

/** A reusable pool of worker threads. Spawn once, call `run` repeatedly (each
 *  call distributes a batch of games across all workers and resolves when they
 *  all complete), then `close`. Reusing one pool across many SPRT batches keeps
 *  the workers (and their imported engine) warm instead of paying spawn cost per
 *  round. One `run` at a time — the gauntlet drives it sequentially. */
export class WorkerPool {
  private readonly workers: Worker[];
  readonly size: number;

  constructor(size: number = defaultWorkerCount()) {
    this.size = Math.max(1, size);
    this.workers = Array.from(
      { length: this.size },
      () => new Worker(new URL("./worker.ts", import.meta.url)),
    );
  }

  /** Play every spec across the pool and resolve with all results, sorted by
   *  `index`. Specs are chunked so each worker pulls several chunks over the run
   *  (work-stealing), which load-balances when games vary wildly in length. */
  run(specs: readonly GameSpec[]): Promise<GameResult[]> {
    if (specs.length === 0) return Promise.resolve([]);
    // A few chunks per worker so a worker that draws short games comes back for
    // more rather than idling while one straggler finishes a long game.
    const chunksPerWorker = 4;
    const chunkSize = Math.max(1, Math.ceil(specs.length / (this.size * chunksPerWorker)));
    const chunks: GameSpec[][] = [];
    for (let i = 0; i < specs.length; i += chunkSize) {
      chunks.push(specs.slice(i, i + chunkSize));
    }

    const out: GameResult[] = [];
    let nextChunk = 0;
    let active = 0;

    return new Promise<GameResult[]>((resolve, reject) => {
      const assign = (w: Worker): void => {
        if (nextChunk >= chunks.length) return;
        const chunk = chunks[nextChunk++];
        active++;
        const onMessage = (msg: { results: GameResult[] }): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          out.push(...msg.results);
          active--;
          if (nextChunk < chunks.length) assign(w);
          else if (active === 0) {
            out.sort((p, q) => p.index - q.index);
            resolve(out);
          }
        };
        const onError = (err: Error): void => {
          w.off("message", onMessage);
          w.off("error", onError);
          reject(err);
        };
        w.on("message", onMessage);
        w.on("error", onError);
        w.postMessage({ specs: chunk });
      };
      for (const w of this.workers) assign(w);
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/** The six distinct ways to seat 2 of contender A among 4 seats (B takes the
 *  rest) — identical to `tournament.ts` so a parallel run reproduces the
 *  single-threaded head-to-head exactly. */
const A_SEATINGS: readonly (readonly number[])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/** Build the game stream for an A-vs-B pairing: game `from..from+count-1`, each
 *  seeded `${prefix}-${index+1}` with A's two seats cycled through `A_SEATINGS`.
 *  This matches `runHeadToHead`'s seed+seating scheme exactly (with prefix "vs"),
 *  which is what lets `sim:verify` confirm parallel == single-threaded. */
export function pairingSpecs(
  a: string,
  b: string,
  prefix: string,
  from: number,
  count: number,
  maxTurns: number,
): GameSpec[] {
  const specs: GameSpec[] = [];
  for (let k = 0; k < count; k++) {
    const index = from + k;
    const aSeats = new Set(A_SEATINGS[index % A_SEATINGS.length]);
    const labels = [0, 1, 2, 3].map((s) => (aSeats.has(s) ? a : b));
    specs.push({ index, seed: `${prefix}-${index + 1}`, labels, maxTurns });
  }
  return specs;
}
