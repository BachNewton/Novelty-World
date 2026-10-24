import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "./cli-args";
import { recordGame, writeRecords, type GpuGameRecord } from "./gpu-record";

/** `npm run risk:gpu-fixtures` (and `risk:native-fixtures`, the same tool) — records reference
 *  games as game records (`ideas/gpu-engine.md`) for the GPU engine's and the native port's
 *  lockstep tests: games `<prefix>-0` to `<prefix>-<games − 1>`, a bot per
 *  seat, every move with the hash of the options before it and the state after it.
 *
 *  Usage:
 *    npm run risk:gpu-fixtures -- --bots greedy,greedy,greedy --games 20 --out greedy-3p.jsonl.gz
 *    npm run risk:gpu-fixtures -- --bots random,random,random --games 2 --turns 40 --prefix fx --out random-3p.jsonl.gz
 *    npm run risk:native-fixtures -- --bots greedy --players 4 --games 30 --prefix g4 --out greedy-4p.jsonl.gz
 *
 *  `--dump` also writes every state and every set of options in full as int32s, a debugging aid
 *  for the GPU side, never for committed fixtures. `--players n` seats the one bot `--bots` names
 *  at every seat, as does `--bot <label>`, which takes a tuned label whole. Defaults: 20 games, prefix `fx`, the harness's
 *  turn cap. */

interface Args {
  bots: string[];
  games: number;
  prefix: string;
  maxTurns: number;
  out: string;
  dump: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Partial<Args> & Omit<Args, "bots" | "out"> = { games: 20, prefix: "fx", maxTurns: DEFAULT_MAX_TURNS, dump: false };
  let players: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dump") {
      a.dump = true;
      continue;
    }
    const value = argv[++i];
    switch (flag) {
      case "--bots":
        a.bots = list(value, flag);
        break;
      // One label, taken whole: a tuned label carries commas.
      case "--bot":
        a.bots = [value];
        break;
      case "--players":
        players = number(value, flag);
        break;
      case "--games":
        a.games = number(value, flag);
        break;
      case "--prefix":
        a.prefix = value;
        break;
      case "--turns":
        a.maxTurns = number(value, flag);
        break;
      case "--out":
        a.out = value;
        break;
      default:
        throw new Error(`unknown flag "${flag}". Example: npm run risk:gpu-fixtures -- --bots greedy,greedy,greedy --games 20 --out greedy-3p.jsonl.gz`);
    }
  }
  if (a.bots === undefined || a.out === undefined) throw new Error("--bots and --out are required");
  if (players !== undefined) {
    if (a.bots.length !== 1) throw new Error("--players seats one bot at every seat: name a single bot with it");
    const [only] = a.bots;
    a.bots = Array.from({ length: players }, () => only);
  }
  if (a.bots.length < 3 || a.bots.length > 6) throw new Error(`Risk is for 3 to 6 players, not ${a.bots.length.toString()}`);
  checkBots(a.bots);
  return { ...a, bots: a.bots, out: a.out };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const records: GpuGameRecord[] = [];
  for (let i = 0; i < args.games; i++) {
    records.push(recordGame({ seed: `${args.prefix}-${i.toString()}`, bots: args.bots, maxTurns: args.maxTurns, dump: args.dump }));
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const bytes = writeRecords(args.out, records);
  const moves = records.reduce((n, r) => n + r.moves.length, 0);
  const capped = records.filter((r) => r.result.capped).length;
  console.log(
    `${records.length.toString()} games (${capped.toString()} capped), ${moves.toString()} moves, ${bytes.toString()} bytes → ${args.out} in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}

main();
