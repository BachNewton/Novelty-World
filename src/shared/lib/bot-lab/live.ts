import { randomUUID } from "node:crypto";
import { HEARTBEAT_MS, estimateFinish, type LiveResult, type LiveRowWrite, type LiveStep, type RunStatus } from "./live-row";
import { onRunStop, type GameRunner, type Indexed } from "./pool";
import type { RunLog, RunRecord } from "./run-log";

// A measuring run, published live for the Bot Lab page as it plays: a heartbeat
// every few seconds (the liveness the page reads; a run killed outright stops
// beating and shows as lost), every change to its steps soon after it happens, and
// its end with the result. Where the row goes is a sink, so tests keep it in memory.

/** Where a run's row is written: the whole row each time, inserted or overwritten. */
export interface LiveSink {
  write(row: LiveRowWrite): Promise<void>;
}

/** The least time between two writes a change makes: a pairing's rounds can come many a second. */
export const THROTTLE_MS = 1000;

/** A sink that keeps every row written, for tests. */
export function memorySink(): LiveSink & { rows: LiveRowWrite[] } {
  const rows: LiveRowWrite[] = [];
  return {
    rows,
    write: (row) => {
      rows.push(structuredClone(row));
      return Promise.resolve();
    },
  };
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** A run being recorded (its `RunLog`) and published to `sink`, or only recorded when there is no sink. */
export class LiveReporter {
  readonly id = randomUUID();
  private readonly steps: LiveStep[] = [];
  private fraction: () => number | null = () => null;
  private status: RunStatus = "running";
  private result: LiveResult | null = null;
  private lastWrite = -Infinity;
  private pending: NodeJS.Timeout | null = null;
  private readonly heartbeat: NodeJS.Timeout | null = null;
  private writes: Promise<void> = Promise.resolve();
  private failing = false;
  private readonly unhookStop: () => void;

  constructor(
    private readonly sink: LiveSink | null,
    private readonly log: RunLog,
    private readonly game: string,
  ) {
    this.unhookStop = onRunStop(() => this.end("stopped", {}, this.log.stop()));
    if (sink === null) return;
    this.heartbeat = setInterval(() => this.flush(), HEARTBEAT_MS);
    this.heartbeat.unref();
    this.flush();
  }

  /** `runner`, with every game it plays counted into the run. */
  watch<Spec extends Indexed, Result extends Indexed>(
    runner: GameRunner<Spec, Result>,
    decisionsOf: (result: Result) => number,
  ): GameRunner<Spec, Result> {
    return this.log.watch(runner, decisionsOf);
  }

  /** Games played so far and the decisions in them. */
  counts(): { games: number; decisions: number } {
    return this.log.counts();
  }

  /** How far through its known work the run is, 0 to 1, read at every write. */
  setProgress(fraction: () => number | null): void {
    this.fraction = fraction;
  }

  /** Sets step `index` of the run, published soon after. */
  step(index: number, step: LiveStep): void {
    this.steps[index] = step;
    this.changed();
  }

  /** Ends the run with its result: records it in the run log and publishes it. */
  async finish(result: Omit<LiveResult, "record">): Promise<RunRecord> {
    if (this.status !== "running") throw new Error(`the run has already ended (${this.status})`);
    const record = this.log.finish();
    await this.end("done", result, record);
    return record;
  }

  /** Ends a run that threw; nothing for one that has already ended. */
  async fail(error: unknown): Promise<void> {
    if (this.status !== "running") return;
    await this.end("failed", { error: error instanceof Error ? error.message : String(error) }, this.log.stop());
  }

  private async end(status: Exclude<RunStatus, "running">, result: Omit<LiveResult, "record">, record: RunRecord): Promise<void> {
    if (this.status !== "running") return;
    this.status = status;
    this.result = { ...result, record };
    this.unhookStop();
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.flush();
    await this.writes;
  }

  private changed(): void {
    if (this.sink === null || this.pending !== null || this.status !== "running") return;
    this.pending = setTimeout(() => this.flush(), Math.max(0, this.lastWrite + THROTTLE_MS - Date.now()));
  }

  private flush(): void {
    const sink = this.sink;
    if (sink === null) return;
    if (this.pending !== null) clearTimeout(this.pending);
    this.pending = null;
    this.lastWrite = Date.now();
    const row = this.row();
    // One write at a time, in order, so an older row never lands over a newer one.
    this.writes = this.writes.then(
      () =>
        sink.write(row).then(
          () => {
            if (this.failing) console.error("  Live page: writing again.");
            this.failing = false;
          },
          (e: unknown) => {
            if (!this.failing) console.error(`  Live page: a write failed (${(e as Error).message}); the run plays on.`);
            this.failing = true;
          },
        ),
    );
  }

  private row(): LiveRowWrite {
    const now = Date.now();
    const started = this.log.startedAt.getTime();
    const { games, decisions } = this.log.counts();
    const fraction = this.status === "done" ? 1 : this.fraction();
    const elapsed = (now - started) / 1000;
    const eta = this.status === "running" ? estimateFinish(started, now, fraction) : null;
    const run = this.log.run;
    return {
      id: this.id,
      game: this.game,
      tool: run.tool,
      bots: [...run.bots],
      args: [...run.args],
      seeds: run.seeds,
      workers: run.workers,
      status: this.status,
      started_at: this.log.startedAt.toISOString(),
      progress: {
        games,
        decisions,
        gamesPerSecond: elapsed > 0 ? round(games / elapsed, 2) : 0,
        fraction: fraction === null ? null : round(fraction, 4),
        eta: eta === null ? null : new Date(eta).toISOString(),
        steps: [...this.steps],
      },
      result: this.result,
    };
  }
}
