import process from "node:process";
import { fileURLToPath } from "node:url";
import { defaultWorkerCount } from "@/shared/lib/bot-lab/pool";
import { LiveReporter } from "@/shared/lib/bot-lab/live";
import { liveSinkFromEnv } from "@/shared/lib/bot-lab/live-supabase";
import { RunLog, type RemotePlay, type RunDescription } from "@/shared/lib/bot-lab/run-log";
import { riskBot } from "../bots";
import { FORMATS, type Format } from "./parallel";

// The flags Risk's measurement CLIs share.

export interface CommonArgs {
  players: number[];
  maxTurns: number;
  workers: number;
  prefix: string;
}

/** Player-turns before a game is stopped as a draw. Bot-vs-bot games between
 *  bots with a plan end in 30 to 200 turns; only a stalled table reaches this. */
export const DEFAULT_MAX_TURNS = 600;

export function commonDefaults(prefix: string): CommonArgs {
  return { players: [3, 4, 6], maxTurns: DEFAULT_MAX_TURNS, workers: defaultWorkerCount(), prefix };
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

/** Fails on a label the registry can't seat: a bot's own, or a tuned one (`rule-v1~{...}`). */
export function checkBots(labels: readonly string[]): void {
  for (const l of labels) riskBot(l);
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
  /** The fewest games a gauntlet pairing plays in a round. */
  minRound: number;
}

const REMOTE_FLAGS = ["--games-from", "--plan", "--shards", "--min-round"];

/** `argv` without the remote flags: the arguments the run would take played here. */
export function withoutRemoteFlags(argv: readonly string[]): string[] {
  return argv.filter((_, i) => !REMOTE_FLAGS.includes(argv[i]) && !REMOTE_FLAGS.includes(argv[i - 1]));
}

export function remoteDefaults(): RemoteArgs {
  return { shards: 20, minRound: 600 };
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
