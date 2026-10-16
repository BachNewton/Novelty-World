import { defaultWorkerCount } from "@/shared/lib/bot-lab/pool";
import { RISK_BOTS } from "../bots";
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

export function checkBots(labels: readonly string[]): void {
  for (const l of labels) {
    if (!Object.hasOwn(RISK_BOTS, l)) throw new Error(`unknown bot "${l}" (known: ${Object.keys(RISK_BOTS).join(", ")})`);
  }
}
