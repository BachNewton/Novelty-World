import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { defaultWorkerCount, WorkerPool } from "@/shared/lib/bot-lab/pool";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "./cli-args";
import { DEFAULT_TEACHER_FIELD, decisionRecords, teacherParams, teacherSpecs, type TeacherGameResult } from "./distill";
import { DEFAULT_FIELD, positionRecords, recordSpecs, shardRange, type PositionsResult } from "./positions";
import type { RiskGameResult, RiskGameSpec } from "./runner";

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
 *  `hybrid-data-<n>`, the harness's turn cap, written to `eval/positions/` (never committed).
 *
 *  With `--teacher` it records a teacher instead (`distill.ts`, `ideas/distilled-v7.md`): games
 *  with rule-v7 in `--teachers` seats (1 by default) among a field (rule-v6, rule-v5, GD's
 *  Stacker and Aggressive by default), one JSON line per search v7 ran over more than one
 *  candidate, with seeds `distill-v7-<n>`, written to `eval/positions/distill-v7/`.
 *
 *    npm run risk:record -- --teacher rule-v7 --games 500
 *    npm run risk:record -- --teacher 'rule-v7~{"replies":32}' --teachers 2 --games 5000 --shard 3/20 */

const DEFAULT_OUT = fileURLToPath(new URL("./positions/", import.meta.url));
const TEACHER_OUT = fileURLToPath(new URL("./positions/distill-v7/", import.meta.url));

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
  teacher: string | null;
  teachers: number;
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
    teacher: null,
    teachers: 1,
  };
  const given = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    given.add(flag);
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
      case "--teacher":
        teacherParams(value);
        a.teacher = value;
        break;
      case "--teachers":
        a.teachers = number(value, flag);
        break;
      default:
        throw new Error(`unknown flag "${flag}". Example: npm run risk:record -- --games 500`);
    }
  }
  if (!(Number.isInteger(a.players) && a.players >= 3 && a.players <= 6)) throw new Error(`Risk is for 3 to 6 players, not ${a.players.toString()}`);
  if (a.teacher !== null) {
    if (!given.has("--field")) a.field = [...DEFAULT_TEACHER_FIELD];
    if (!given.has("--prefix")) a.prefix = "distill-v7";
    if (!given.has("--out")) a.out = TEACHER_OUT;
  } else if (given.has("--teachers")) throw new Error("--teachers counts the seats of a --teacher");
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
  const teacher = args.teacher;
  const specs =
    teacher === null
      ? recordSpecs(args.field, args.players, args.prefix, from, count, args.maxTurns)
      : teacherSpecs(teacher, args.teachers, args.field, args.players, args.prefix, from, count, args.maxTurns);
  const lines = (result: RiskGameResult): unknown[] =>
    teacher === null ? positionRecords(result as PositionsResult) : decisionRecords(result as TeacherGameResult);
  const what = teacher === null ? "positions" : "decisions";
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  fs.mkdirSync(args.out, { recursive: true });
  const target = path.join(args.out, `${args.prefix}-${args.players.toString()}p-${from.toString()}-${(from + count - 1).toString()}.jsonl.gz`);
  console.log(
    `\nRisk ${teacher === null ? "positions" : `teacher ${teacher}, ${args.teachers.toString()} a game,`} — games ${from.toString()} to ${(from + count - 1).toString()} of ${args.games.toString()}, ${args.players.toString()} players, field ${args.field.join(", ")}, ${args.workers.toString()} workers\n  → ${target}\n`,
  );

  const worker = teacher === null ? "./positions-worker.ts" : "./distill-worker.ts";
  const pool = new WorkerPool<RiskGameSpec, RiskGameResult>(new URL(worker, import.meta.url), args.workers);
  const out = new GzipLines(target);
  const started = performance.now();
  let games = 0;
  let records = 0;
  let capped = 0;
  const errors: string[] = [];
  try {
    // Batches go one ahead of the one being written, so the pool never waits on the writing,
    // and only two batches of records are held at once.
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
        const written = lines(result).map((r) => JSON.stringify(r));
        records += written.length;
        await out.write(written.map((l) => `${l}\n`).join(""));
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(`  ${games.toString()}/${count.toString()} games, ${records.toString()} ${what}, ${(games / seconds).toFixed(2)} games/s`);
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
      `  ${records.toString()} ${what}, ${(records / Math.max(1, written)).toFixed(1)} a game`,
      `  ${bytes.toString()} bytes gzipped (${out.rawBytes.toString()} raw): ${(bytes / Math.max(1, records)).toFixed(1)} bytes a record (${(out.rawBytes / Math.max(1, records)).toFixed(0)} raw)`,
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
