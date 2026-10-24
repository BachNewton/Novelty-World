import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "../cli-args";
import { recordGame, writeRecords, type RecordedGame } from "./record";

/** `npm run risk:native-fixtures` — play games on the TypeScript runner and write them as game
 *  records, the fixtures the Rust port is held to move for move (`ideas/native-port.md`).
 *
 *  Usage:
 *    npm run risk:native-fixtures -- --bots greedy --players 4 --seeds g4 --count 30 --out greedy-4p.jsonl.gz
 *    npm run risk:native-fixtures -- --bots greedy,gd-stacker,gd-defensive --seeds mix --count 20 --out mix.jsonl
 *    npm run risk:native-fixtures -- --bots random --players 6 --seeds r6 --count 20 --out random-6p.jsonl.gz */

interface Args {
  bots: string[];
  prefix: string;
  count: number;
  maxTurns: number;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  let bots: string[] | undefined;
  let players: number | undefined;
  let prefix: string | undefined;
  let count: number | undefined;
  let maxTurns = DEFAULT_MAX_TURNS;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--bots":
        bots = list(value, "--bots");
        break;
      case "--players":
        players = number(value, "--players");
        break;
      case "--seeds":
        prefix = value;
        break;
      case "--count":
        count = number(value, "--count");
        break;
      case "--turns":
        maxTurns = number(value, "--turns");
        break;
      case "--out":
        out = value;
        break;
      default:
        throw new Error(`unknown argument "${argv[i]}"`);
    }
    i++;
  }
  if (bots === undefined || prefix === undefined || count === undefined || out === undefined) {
    throw new Error("name --bots, --seeds, --count and --out. Example: npm run risk:native-fixtures -- --bots greedy --players 4 --seeds g4 --count 30 --out greedy-4p.jsonl.gz");
  }
  if (players !== undefined && bots.length !== 1) throw new Error("--players seats one bot at every seat: name a single bot with it");
  const seated = players === undefined ? bots : Array.from({ length: players }, () => bots[0]);
  if (!(seated.length >= 3 && seated.length <= 6)) throw new Error(`Risk is for 3 to 6 players, not ${seated.length.toString()} (one --bots label with --players, or a label per seat)`);
  checkBots(seated);
  return { bots: seated, prefix, count, maxTurns, out };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const games: RecordedGame[] = [];
  for (let n = 1; n <= args.count; n++) {
    games.push(recordGame({ seed: `${args.prefix}-${n.toString()}`, bots: args.bots, maxTurns: args.maxTurns }));
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  mkdirSync(dirname(args.out), { recursive: true });
  const bytes = writeRecords(args.out, games);
  const turns = games.reduce((s, g) => s + g.result.turns, 0) / games.length;
  const capped = games.filter((g) => g.result.capped).length;
  const decisions = games.reduce((s, g) => s + g.decisions, 0);
  console.log(
    `${args.out}: ${games.length.toString()} games [${args.bots.join(",")}], mean ${turns.toFixed(1)} turns, ${capped.toString()} capped, ${decisions.toString()} decisions, ${(bytes / 1024).toFixed(0)} KB`,
  );
}

main();
