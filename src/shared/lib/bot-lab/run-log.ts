import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import type { GameRunner, Indexed } from "./pool";

// A record of every measuring run (a gauntlet, a ratings ladder, a determinism
// check), appended to a committed log, so the timeline can later show how fast the
// bots, the engine and the tooling were, and on what machine. One JSON object a line.
//
// The run's own load is sampled once a second while it plays: the sampler is the
// measurement itself, not a wait for anything. A run stopped part way (Ctrl-C, a
// killed task) still writes its record, marked stopped, from the process's exit.

export interface RunDescription {
  /** The npm script or tool that ran, such as "risk:gauntlet". */
  tool: string;
  /** Its arguments as given. */
  args: readonly string[];
  /** The bots it seated. */
  bots: readonly string[];
  /** The tables it played, such as player counts or formats, in the game's own terms. */
  tables: readonly string[];
  /** The seed stream, such as "train" or "holdout". */
  seeds: string;
  workers: number;
}

export interface RunRecord extends RunDescription {
  /** When the run started, ISO 8601: the date is this log's point. */
  started: string;
  wallSeconds: number;
  /** Set when the run was stopped before it finished; its counts are what it played. */
  stopped?: true;
  commit: string;
  /** Whether the checkout had uncommitted changes, so the commit alone doesn't name the code. */
  dirty: boolean;
  games: number;
  decisions: number;
  gamesPerSecond: number;
  decisionsPerSecond: number;
  machine: { cpu: string; logicalCores: number; totalMemoryGiB: number; platform: string; node: string };
  /** This process's CPU (every worker thread included), as a share of the whole machine. */
  cpu: { mean: number; peak: number };
  /** The whole machine's CPU, so other load on the machine during the run shows. */
  machineCpu: { mean: number; peak: number };
  /** This process's peak resident memory, worker threads included. */
  peakMemoryMiB: number;
}

const SAMPLE_MS = 1000;

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function machineTimes(): { busy: number; total: number } {
  let busy = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    const all = times.user + times.nice + times.sys + times.irq + times.idle;
    total += all;
    busy += all - times.idle;
  }
  return { busy, total };
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** A run being recorded: count what it plays (`watch` does it for a game runner), then `finish`. */
export class RunLog {
  readonly startedAt = new Date();
  private readonly startNs = process.hrtime.bigint();
  private games = 0;
  private decisions = 0;
  private done = false;
  private readonly cpuShares: number[] = [];
  private readonly machineShares: number[] = [];
  private peakRss = process.memoryUsage().rss;
  private lastCpu = process.cpuUsage();
  private lastNs = process.hrtime.bigint();
  private lastMachine = machineTimes();
  private readonly sampler: NodeJS.Timeout;
  private readonly onExit = () => {
    if (!this.done) this.write(true);
  };

  constructor(
    private readonly path: string,
    readonly run: RunDescription,
  ) {
    this.sampler = setInterval(() => this.sample(), SAMPLE_MS);
    this.sampler.unref();
    process.on("exit", this.onExit);
  }

  private sample(): void {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage(this.lastCpu);
    const elapsedUs = Number(now - this.lastNs) / 1000;
    const machine = machineTimes();
    const cores = os.cpus().length;
    if (elapsedUs > 0) this.cpuShares.push((cpu.user + cpu.system) / (elapsedUs * cores));
    const total = machine.total - this.lastMachine.total;
    if (total > 0) this.machineShares.push((machine.busy - this.lastMachine.busy) / total);
    this.peakRss = Math.max(this.peakRss, process.memoryUsage().rss);
    this.lastCpu = process.cpuUsage();
    this.lastNs = now;
    this.lastMachine = machine;
  }

  /** Games played so far and the decisions in them. */
  counts(): { games: number; decisions: number } {
    return { games: this.games, decisions: this.decisions };
  }

  /** Counts games played and the decisions in them. */
  played(games: number, decisions: number): void {
    this.games += games;
    this.decisions += decisions;
  }

  /** `runner`, with every game it plays counted into this run. */
  watch<Spec extends Indexed, Result extends Indexed>(
    runner: GameRunner<Spec, Result>,
    decisionsOf: (result: Result) => number,
  ): GameRunner<Spec, Result> {
    return {
      size: runner.size,
      run: async (specs) => {
        const results = await runner.run(specs);
        this.played(results.length, results.reduce((s, r) => s + decisionsOf(r), 0));
        return results;
      },
      close: () => runner.close(),
    };
  }

  /** Appends the run's record to the log. */
  finish(): RunRecord {
    return this.write(false);
  }

  /** Appends the record of a run that ended before it finished, with what it played. */
  stop(): RunRecord {
    return this.write(true);
  }

  private write(stopped: boolean): RunRecord {
    this.done = true;
    clearInterval(this.sampler);
    process.off("exit", this.onExit);
    this.sample();
    const wallSeconds = Number(process.hrtime.bigint() - this.startNs) / 1e9;
    const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);
    const cpus = os.cpus();
    const record: RunRecord = {
      started: this.startedAt.toISOString(),
      ...this.run,
      args: [...this.run.args],
      bots: [...this.run.bots],
      tables: [...this.run.tables],
      wallSeconds: round(wallSeconds, 1),
      ...(stopped ? { stopped: true as const } : {}),
      commit: git(["rev-parse", "--short", "HEAD"]),
      dirty: git(["status", "--porcelain"]).length > 0,
      games: this.games,
      decisions: this.decisions,
      gamesPerSecond: round(this.games / wallSeconds, 2),
      decisionsPerSecond: Math.round(this.decisions / wallSeconds),
      machine: {
        cpu: cpus[0]?.model.trim() ?? "unknown",
        logicalCores: cpus.length,
        totalMemoryGiB: round(os.totalmem() / 2 ** 30, 1),
        platform: `${os.platform()} ${os.release()}`,
        node: process.version,
      },
      cpu: { mean: round(mean(this.cpuShares), 3), peak: round(Math.max(0, ...this.cpuShares), 3) },
      machineCpu: { mean: round(mean(this.machineShares), 3), peak: round(Math.max(0, ...this.machineShares), 3) },
      peakMemoryMiB: Math.round(this.peakRss / 2 ** 20),
    };
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run log a game's own CLI names beside its source, never external input
    appendFileSync(this.path, `${JSON.stringify(record)}\n`);
    return record;
  }
}

/** One line for a CLI to print at the end of its run. */
export function formatRunRecord(r: RunRecord): string {
  const pct = (x: number) => `${Math.round(100 * x).toString()}%`;
  return (
    `  ${r.games.toString()} games, ${r.decisions.toString()} decisions in ${r.wallSeconds.toFixed(1)}s` +
    ` (${r.gamesPerSecond.toFixed(1)} games/s, ${r.decisionsPerSecond.toString()} decisions/s) on ${r.workers.toString()} workers;` +
    ` CPU mean ${pct(r.cpu.mean)} peak ${pct(r.cpu.peak)} of the machine (machine ${pct(r.machineCpu.mean)}), peak ${r.peakMemoryMiB.toString()} MiB`
  );
}
