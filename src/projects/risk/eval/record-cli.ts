import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { defaultWorkerCount, WorkerPool } from "@/shared/lib/bot-lab/pool";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "./cli-args";
import { DEFAULT_FIELD, positionRecords, recordSpecs, shardRange, type PositionsResult } from "./positions";
import type { RiskGameSpec } from "./runner";

/** `npm run risk:record` — records positions for fitting an evaluation (`positions.ts`): mixed-
 *  field games, every seat's board at the end of each of its turns with rule-v6's evaluation of
 *  it and the game's outcome, one JSON line per position, gzipped. A shard plays a run of
 *  consecutive games of the recording, so machines can split one between them.
 *
 *  Usage:
 *    npm run risk:record -- --games 500
 *    npm run risk:record -- --games 10000 --shard 3/20
 *    npm run risk:record -- --games 20 --field rule-v6,greedy,gd-stacker --players 4 --out some/dir
 *
 *  Defaults: the field rule-v6, rule-v5, rule-v4 and GD's four personas, 5 players, seeds
 *  `hybrid-data-<n>`, the harness's turn cap, written to `eval/positions/` (never committed). */

const DEFAULT_OUT = fileURLToPath(new URL("./positions/", import.meta.url));

interface Args {
  games: number;
  shard: number;
  shards: number;
  field: string[];
  players: number;
  prefix: string;
  maxTurns: number;
  workers: number;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    games: 500,
    shard: 0,
    shards: 1,
    field: [...DEFAULT_FIELD],
    players: 5,
    prefix: "hybrid-data",
    maxTurns: DEFAULT_MAX_TURNS,
    workers: defaultWorkerCount(),
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    switch (flag) {
      case "--games":
        a.games = number(value, flag);
        break;
      case "--shard": {
        const [k, n] = value.split("/");
        a.shard = number(k, flag);
        a.shards = number(n, flag);
        break;
      }
      case "--field":
        a.field = list(value, flag);
        break;
      case "--players":
        a.players = number(value, flag);
        break;
      case "--prefix":
        a.prefix = value;
        break;
      case "--turns":
        a.maxTurns = number(value, flag);
        break;
      case "--workers":
        a.workers = number(value, flag);
        break;
      case "--out":
        a.out = value;
        break;
      default:
        throw new Error(`unknown flag "${flag}". Example: npm run risk:record -- --games 500`);
    }
  }
  if (!(Number.isInteger(a.players) && a.players >= 3 && a.players <= 6)) throw new Error(`Risk is for 3 to 6 players, not ${a.players.toString()}`);
  checkBots(a.field);
  return a;
}

/** Writes lines into a gzipped file, waiting for the stream to drain when it asks to. */
class GzipLines {
  private readonly gzip = createGzip();
  private readonly file: fs.WriteStream;
  rawBytes = 0;

  constructor(readonly target: string) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the recording's own file, in the directory the run is given
    this.file = fs.createWriteStream(target);
    this.gzip.pipe(this.file);
  }

  async write(text: string): Promise<void> {
    this.rawBytes += Buffer.byteLength(text);
    if (!this.gzip.write(text)) await once(this.gzip, "drain");
  }

  async close(): Promise<number> {
    this.gzip.end();
    await once(this.file, "close");
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the recording's own file, in the directory the run is given
    return fs.statSync(this.target).size;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { from, count } = shardRange(args.games, args.shard, args.shards);
  const specs = recordSpecs(args.field, args.players, args.prefix, from, count, args.maxTurns);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  fs.mkdirSync(args.out, { recursive: true });
  const target = path.join(args.out, `${args.prefix}-${args.players.toString()}p-${from.toString()}-${(from + count - 1).toString()}.jsonl.gz`);
  console.log(
    `\nRisk positions — games ${from.toString()} to ${(from + count - 1).toString()} of ${args.games.toString()}, ${args.players.toString()} players, field ${args.field.join(", ")}, ${args.workers.toString()} workers\n  → ${target}\n`,
  );

  const pool = new WorkerPool<RiskGameSpec, PositionsResult>(new URL("./positions-worker.ts", import.meta.url), args.workers);
  const out = new GzipLines(target);
  const started = performance.now();
  let games = 0;
  let records = 0;
  let capped = 0;
  const errors: string[] = [];
  try {
    // Batches go one ahead of the one being written, so the pool never waits on the writing,
    // and only two batches of positions are held at once.
    const size = pool.size * 8;
    const batches: RiskGameSpec[][] = [];
    for (let i = 0; i < specs.length; i += size) batches.push(specs.slice(i, i + size));
    let next = batches.length > 0 ? pool.run(batches[0]) : null;
    for (let k = 0; next !== null; k++) {
      const current = next;
      next = k + 1 < batches.length ? pool.run(batches[k + 1]) : null;
      for (const result of await current) {
        games++;
        if (result.error !== undefined) {
          errors.push(`${result.seed} (${result.labels.join(", ")}): ${result.error}`);
          continue;
        }
        if (result.winner === null) capped++;
        const lines = positionRecords(result).map((r) => JSON.stringify(r));
        records += lines.length;
        await out.write(lines.map((l) => `${l}\n`).join(""));
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(`  ${games.toString()}/${count.toString()} games, ${records.toString()} positions, ${(games / seconds).toFixed(2)} games/s`);
    }
  } finally {
    await pool.close();
  }
  const bytes = await out.close();
  const seconds = (performance.now() - started) / 1000;
  const written = games - errors.length;
  console.log(
    [
      "",
      `  ${written.toString()} games (${capped.toString()} capped) in ${seconds.toFixed(1)}s: ${(games / seconds).toFixed(2)} games/s`,
      `  ${records.toString()} positions, ${(records / Math.max(1, written)).toFixed(1)} a game`,
      `  ${bytes.toString()} bytes gzipped (${out.rawBytes.toString()} raw): ${(bytes / Math.max(1, records)).toFixed(1)} bytes a position (${(out.rawBytes / Math.max(1, records)).toFixed(0)} raw)`,
    ].join("\n"),
  );
  if (errors.length > 0) {
    console.log(`\n  ⚠ ${errors.length.toString()} games threw, a bot or engine bug, and were not written:`);
    for (const e of errors) console.log(`    ${e}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
