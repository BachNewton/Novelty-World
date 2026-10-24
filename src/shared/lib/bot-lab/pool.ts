import os from "node:os";
import process from "node:process";
import { Worker } from "node:worker_threads";

// ---------------------------------------------------------------------------
// CPU parallelism for bot measurement. A simulated game is a PURE, deterministic
// function of its spec (seed, seating, bots), so games are embarrassingly
// parallel: distribute them across a pool of worker threads and the result is
// bit-identical regardless of which worker ran which game. The main thread owns
// the stream of games to play and the SPRT/Elo aggregation; the workers only run
// the game's pure runner and hand back a compact result.
//
// The pool is generic over a game: each game supplies a worker module (built with
// `serveGames`) and its own spec/result types. A spec and its result carry a
// global `index`, so results map back regardless of which worker finished first.
// ---------------------------------------------------------------------------

export interface Indexed {
  index: number;
}

/** Something that plays a batch of games and resolves with their results, sorted
 *  by `index`: the worker pool, or the same runner inline on this thread (the
 *  single-threaded reference a parallel run is checked against). Several calls
 *  may be in flight at once, each resolving with its own results. */
export interface GameRunner<Spec extends Indexed, Result extends Indexed> {
  readonly size: number;
  run(specs: readonly Spec[]): Promise<Result[]>;
  close(): Promise<void>;
}

/** Default worker count: leave 1–2 logical cores for the main thread and OS on a
 *  16-core box (AMD Ryzen 7 7840U → 14 workers). Never below 1. */
export function defaultWorkerCount(): number {
  return Math.max(1, os.cpus().length - 2);
}

/** The signals that stop a run: Ctrl-C, a kill, and Windows' Ctrl-Break and console close. */
const STOP_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

const stopHooks = new Set<() => Promise<void>>();
let stopping = false;

/** Runs `hook` when a run is told to stop, after its workers are gone and before
 *  it exits: the last word of something that must be told asynchronously, such as
 *  the live page. Returns the unregistering function. */
export function onRunStop(hook: () => Promise<void>): () => void {
  stopHooks.add(hook);
  return () => stopHooks.delete(hook);
}

/** One `run` call in flight: its results so far and the chunks still out. */
interface Job<Result> {
  results: Result[];
  pending: number;
  resolve: (results: Result[]) => void;
  reject: (error: Error) => void;
}

/** A chunk of one job's games, queued for or played by a worker. */
interface Chunk<Spec, Result> {
  job: Job<Result>;
  specs: Spec[];
}

/** A reusable pool of worker threads, each running `workerModule` (a module that
 *  calls `serveGames`). Spawn once, call `run` as often as wanted, then `close`.
 *  Reusing one pool keeps the workers (and their imported engine) warm instead of
 *  paying spawn cost per round. Any number of `run` calls may be in flight at once:
 *  every call's games are cut into small chunks on one queue, and a worker that
 *  finishes a chunk takes the next one, whichever call it belongs to, so no worker
 *  idles while one call waits on its slowest game. */
export class WorkerPool<Spec extends Indexed, Result extends Indexed>
  implements GameRunner<Spec, Result>
{
  private readonly workers: Worker[];
  readonly size: number;
  private readonly queue: Chunk<Spec, Result>[] = [];
  private readonly idle: Worker[];
  private readonly playing = new Map<Worker, Chunk<Spec, Result>>();
  private failure: Error | null = null;

  constructor(workerModule: URL, size: number = defaultWorkerCount()) {
    this.size = Math.max(1, size);
    this.workers = Array.from({ length: this.size }, () => new Worker(workerModule));
    this.idle = [...this.workers];
    for (const w of this.workers) {
      w.on("message", (msg: { results: Result[] }) => this.onResults(w, msg.results));
      w.on("error", (err) => this.fail(err));
    }
    for (const signal of STOP_SIGNALS) process.on(signal, this.onSignal);
  }

  private readonly onSignal = (signal: NodeJS.Signals): void => {
    this.stop(128 + os.constants.signals[signal]);
  };

  /** A run told to stop ends its workers at once, rather than playing games
   *  nobody will read, lets its stop hooks have their last word, and exits. Exiting,
   *  not a signal's default, so the process's `exit` handlers run (the run log's
   *  among them). Told twice, it exits without waiting for the hooks. A run killed
   *  outright gets no signal: see the root CLAUDE.md's Bot measurement on launching
   *  long runs. */
  private stop(code: number): void {
    if (stopping) process.exit(code);
    stopping = true;
    for (const w of this.workers) void w.terminate();
    void Promise.allSettled([...stopHooks].map((hook) => hook())).then(() => process.exit(code));
  }

  /** Play every spec across the pool and resolve with all results, sorted by
   *  `index`. The specs are chunked so each worker pulls several chunks of a call
   *  (work-stealing), which load-balances when games vary wildly in length. */
  run(specs: readonly Spec[]): Promise<Result[]> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (specs.length === 0) return Promise.resolve([]);
    // A few chunks per worker, so a worker that draws short games comes back for
    // more rather than idling while another finishes a long one.
    const chunksPerWorker = 4;
    const chunkSize = Math.max(1, Math.ceil(specs.length / (this.size * chunksPerWorker)));
    return new Promise<Result[]>((resolve, reject) => {
      const job: Job<Result> = { results: [], pending: 0, resolve, reject };
      for (let i = 0; i < specs.length; i += chunkSize) {
        this.queue.push({ job, specs: specs.slice(i, i + chunkSize) });
        job.pending++;
      }
      for (const w of this.idle.splice(0)) this.feed(w);
    });
  }

  /** Gives worker `w` the oldest queued chunk, or sets it idle when there is none. */
  private feed(w: Worker): void {
    const chunk = this.queue.shift();
    if (chunk === undefined) {
      this.idle.push(w);
      return;
    }
    this.playing.set(w, chunk);
    w.postMessage({ specs: chunk.specs });
  }

  private onResults(w: Worker, results: Result[]): void {
    const chunk = this.playing.get(w);
    if (chunk === undefined) throw new Error("a worker sent results it was never asked for");
    this.playing.delete(w);
    const { job } = chunk;
    job.results.push(...results);
    if (--job.pending === 0) job.resolve(job.results.sort((p, q) => p.index - q.index));
    this.feed(w);
  }

  /** A worker that throws has died with its chunk, so every call in flight would
   *  wait forever: they all fail with its error, and so does every later call. */
  private fail(err: Error): void {
    this.failure ??= err;
    const jobs = new Set([...this.queue, ...this.playing.values()].map((c) => c.job));
    this.queue.length = 0;
    this.playing.clear();
    for (const job of jobs) job.reject(err);
  }

  async close(): Promise<void> {
    for (const signal of STOP_SIGNALS) process.off(signal, this.onSignal);
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/** The same game runner on this thread, one game after another: the
 *  single-threaded reference for a determinism check, and a pool for tests. It
 *  gives the event loop a turn after every game, so what runs beside it (the run
 *  log's sampler, the live page's heartbeat, a stop signal) isn't held off for the
 *  length of a whole batch. */
export function inlineRunner<Spec extends Indexed, Result extends Indexed>(
  runOne: (spec: Spec) => Result | Promise<Result>,
): GameRunner<Spec, Result> {
  return {
    size: 1,
    run: async (specs) => {
      const results: Result[] = [];
      for (const spec of specs) {
        results.push(await runOne(spec));
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      return results.sort((p, q) => p.index - q.index);
    },
    close: () => Promise.resolve(),
  };
}
