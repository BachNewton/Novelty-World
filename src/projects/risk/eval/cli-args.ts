import process from "node:process";
import { fileURLToPath } from "node:url";
import { defaultWorkerCount, type GameRunner } from "@/shared/lib/bot-lab/pool";
import { LiveReporter } from "@/shared/lib/bot-lab/live";
import { liveSinkFromEnv } from "@/shared/lib/bot-lab/live-supabase";
import { RunLog, type RemotePlay, type RunDescription } from "@/shared/lib/bot-lab/run-log";
import { checkNative, riskBotAsync } from "./native/bot";
import { checkParity, nativeRunner, parityRunner } from "./native/runner";
import { FORMATS, riskPool, type Format } from "./parallel";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// The flags Risk's measurement CLIs share.
//
// Native bots (`native/`, `ideas/native-port.md`): a label the crate has and TypeScript doesn't
// seats the native bot, and `<label>@native` forces a bot both sides have onto the native path
// (`gd-stacker@native`), so a mixed table plays on the TypeScript pool with the native seats
// answered by the crate. `--native` plays every table wholly in the crate instead (every seat
// must be native), and `--parity N` with it plays every N-th seed group of each batch in
// TypeScript too, failing the run on any game that differs (for bots exact on both sides).

export interface CommonArgs {
  players: number[];
  maxTurns: number;
  workers: number;
  prefix: string;
  /** Play every table wholly in the crate. */
  native: boolean;
  /** With `native`, check every this-many-th seed group against TypeScript; 0 checks none. */
  parity: number;
}

/** Player-turns before a game is stopped as a draw. Bot-vs-bot games between
 *  bots with a plan end in 30 to 200 turns; only a stalled table reaches this. */
export const DEFAULT_MAX_TURNS = 600;

export function commonDefaults(prefix: string): CommonArgs {
  return { players: [3, 4, 5, 6], maxTurns: DEFAULT_MAX_TURNS, workers: defaultWorkerCount(), prefix, native: false, parity: 0 };
}

export function number(value: string | undefined, flag: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n)) throw new Error(`${flag} needs a number`);
  return n;
}

export function list(value: string | undefined, flag: string): string[] {
  if (value === undefined) throw new Error(`${flag} needs a comma-separated list`);
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Reads one of the shared flags at `argv[i]`; returns how many entries it used,
 *  0 when the flag isn't a shared one. */
export function commonFlag(args: CommonArgs, argv: readonly string[], i: number): number {
  switch (argv[i]) {
    case "--players":
      args.players = list(argv[i + 1], "--players").map((p) => number(p, "--players"));
      for (const n of args.players) {
        if (!(Number.isInteger(n) && n >= 3 && n <= 6)) throw new Error(`Risk is for 3 to 6 players, not ${n}`);
      }
      return 2;
    case "--turns":
      args.maxTurns = number(argv[i + 1], "--turns");
      return 2;
    case "--workers":
      args.workers = number(argv[i + 1], "--workers");
      return 2;
    case "--prefix":
      args.prefix = argv[i + 1];
      return 2;
    case "--native":
      args.native = true;
      return 1;
    case "--parity":
      args.parity = number(argv[i + 1], "--parity");
      if (!(Number.isInteger(args.parity) && args.parity >= 1)) throw new Error(`--parity takes a whole number of seed groups, 1 or more`);
      return 2;
    default:
      return 0;
  }
}

export function formats(value: string | undefined): Format[] {
  const chosen = list(value, "--formats");
  for (const f of chosen) {
    if (!(FORMATS as readonly string[]).includes(f)) throw new Error(`unknown format "${f}" (known: ${FORMATS.join(", ")})`);
  }
  return chosen as Format[];
}

/** Fails on a label nothing can seat: the registry's own bots, tuned ones (`rule-v1~{...}`),
 *  and native ones. */
export function checkBots(labels: readonly string[]): void {
  for (const l of labels) riskBotAsync(l);
}

/** `--native` plays on this machine's build of the crate, which a remote run's machines don't have. */
export function checkLocal(args: CommonArgs, gamesFrom: string | undefined): void {
  if (args.native && gamesFrom !== undefined) throw new Error("--native plays on this machine's native build: it can't read a remote run's games");
}

/** The runner a CLI plays `labels`' games on: the TypeScript worker pool, or with `--native`
 *  the crate, checked against the pool with `--parity`. Fails before any game on a table it
 *  can't play. */
export function riskRunner(args: CommonArgs, labels: readonly string[]): GameRunner<RiskGameSpec, RiskGameResult> {
  if (!args.native) {
    if (args.parity !== 0) throw new Error("--parity checks the native runner against TypeScript: it needs --native");
    return riskPool(args.workers);
  }
  checkNative(labels);
  if (args.parity === 0) return nativeRunner(args.workers);
  checkParity(labels);
  return parityRunner(nativeRunner(args.workers), riskPool(args.workers), args.parity);
}

// Where a run's games come from, when other machines play them (`remote.ts`, and the
// project's docs on running on GitHub Actions). The CLIs take the same arguments either way.

export interface RemoteArgs {
  /** The directory of shards played so far: every game is answered from them. */
  gamesFrom?: string;
  /** With `gamesFrom`, write the next round's plan here instead of reporting. */
  plan?: string;
  /** The most machines a round is split across. */
  shards: number;
  /** The fewest games a gauntlet pairing plays in a round; 0 (the default) sizes every round
   *  from the evidence (`planSprtRound`). */
  minRound: number;
}

const REMOTE_FLAGS = ["--games-from", "--plan", "--shards", "--min-round"];

/** `argv` without the remote flags: the arguments the run would take played here. */
export function withoutRemoteFlags(argv: readonly string[]): string[] {
  return argv.filter((_, i) => !REMOTE_FLAGS.includes(argv[i]) && !REMOTE_FLAGS.includes(argv[i - 1]));
}

export function remoteDefaults(): RemoteArgs {
  return { shards: 20, minRound: 0 };
}

/** Reads one of the remote flags at `argv[i]`; returns how many entries it used, 0 when it isn't one. */
export function remoteFlag(args: RemoteArgs, argv: readonly string[], i: number): number {
  switch (argv[i]) {
    case "--games-from":
      args.gamesFrom = argv[i + 1];
      return 2;
    case "--plan":
      args.plan = argv[i + 1];
      return 2;
    case "--shards":
      args.shards = number(argv[i + 1], "--shards");
      return 2;
    case "--min-round":
      args.minRound = number(argv[i + 1], "--min-round");
      return 2;
    default:
      return 0;
  }
}

/** Every measuring run's record (`run-log.ts`): what ran, how fast, on what machine. */
const RUN_LOG = fileURLToPath(new URL("./runs.jsonl", import.meta.url));

/** The checkout's keys, for publishing a run to the live page. */
const ENV_FILE = fileURLToPath(new URL("../../../../.env.local", import.meta.url));

/** Where a run's games were played, when other machines played them (`remote.ts`). */
export interface RemoteOrigin {
  id: string;
  play: RemotePlay;
}

/** Starts a run of one of Risk's CLIs: recorded into the committed run log, and
 *  published live to the Bot Lab page (`live.ts`). A run over games other machines
 *  played (`remote`) is recorded as theirs, under the remote run's live row. */
export function riskRun(run: Omit<RunDescription, "args">, remote?: RemoteOrigin): LiveReporter {
  const argv = process.argv.slice(2);
  const log = new RunLog(RUN_LOG, { ...run, args: remote === undefined ? argv : withoutRemoteFlags(argv) }, remote?.play);
  return new LiveReporter(liveSinkFromEnv(ENV_FILE), log, "risk", remote?.id);
}

/** The live page's sink, for a tool that writes its rows itself (a remote shard). */
export function riskLiveSink(): ReturnType<typeof liveSinkFromEnv> {
  return liveSinkFromEnv(ENV_FILE);
}
