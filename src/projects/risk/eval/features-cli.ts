import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { features, FEATURES } from "../bots/rule-v8/features";
import { positionBoard, positionBreakdown, type PositionRecord } from "./positions";

/** `npm run risk:features` — turns recorded positions (`risk:record`) into rule-v8's training
 *  set: every position of a decisive game read through v8's own feature function
 *  (`bots/rule-v8/features.ts`), so the trainer (`bots/rule-v8/train/train.py`) never computes a
 *  feature itself. Capped games are left out: they have no winner to learn.
 *
 *  Usage:
 *    npm run risk:features
 *    npm run risk:features -- --in src/projects/risk/eval/positions/actions-10k --out some/dir
 *
 *  Writes, in `--out` (default `eval/positions/features/`, never committed), one row per
 *  position: `x.f32` (the features, little-endian float32, row after row), `y.u8` (1 when the
 *  seat won), `game.i32` (the game's index), `rule.u8` (1 when a rule bot played the seat) and
 *  `turn.i32`, with `meta.json` saying how many rows and features, and `samples.jsonl`, a few
 *  held-out records whole with their row, for the trainer's golden values. */

const POSITIONS = fileURLToPath(new URL("./positions/", import.meta.url));

function parseArgs(argv: readonly string[]): { input: string; out: string } {
  const a = { input: path.join(POSITIONS, "actions-10k"), out: path.join(POSITIONS, "features") };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv.at(i + 1);
    if (value === undefined) throw new Error(`${argv[i]} needs a value`);
    if (argv[i] === "--in") a.input = value;
    else if (argv[i] === "--out") a.out = value;
    else throw new Error(`unknown flag "${argv[i]}". Example: npm run risk:features -- --in some/dir`);
  }
  return a;
}

/** A row of a held-out game kept whole, for the trainer's golden values. */
const SAMPLE = (r: PositionRecord) => r.game % 5 === 0 && r.turn % 37 === 0;
const SAMPLES = 8;

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the recording's directory the run is given
  const files = fs.readdirSync(input).filter((f) => f.endsWith(".jsonl.gz")).sort();
  if (files.length === 0) throw new Error(`no recorded positions (*.jsonl.gz) in ${input}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  fs.mkdirSync(out, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run's own files, in the directory it is given
  const open = (name: string) => fs.openSync(path.join(out, name), "w");
  const fx = open("x.f32");
  const fy = open("y.u8");
  const fg = open("game.i32");
  const fr = open("rule.u8");
  const ft = open("turn.i32");
  const samples: string[] = [];
  let rows = 0;
  let skipped = 0;
  const started = performance.now();
  for (const file of files) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a recording file in the directory the run is given
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(input, file)).pipe(createGunzip()), crlfDelay: Infinity });
    const x: Float32Array[] = [];
    const y: number[] = [];
    const g: number[] = [];
    const rule: number[] = [];
    const turn: number[] = [];
    for await (const line of lines) {
      if (line.length === 0) continue;
      const r = JSON.parse(line) as PositionRecord;
      if (r.capped) {
        skipped++;
        continue;
      }
      if (samples.length < SAMPLES && SAMPLE(r)) samples.push(JSON.stringify({ row: rows + x.length, record: r }));
      x.push(features(positionBoard(r), r.seat, positionBreakdown(r)));
      y.push(r.winner === r.seat ? 1 : 0);
      g.push(r.game);
      rule.push(r.labels[r.seat].startsWith("rule-") ? 1 : 0);
      turn.push(r.turn);
    }
    const block = new Float32Array(x.length * FEATURES);
    x.forEach((row, i) => block.set(row, i * FEATURES));
    fs.writeSync(fx, new Uint8Array(block.buffer));
    fs.writeSync(fy, Uint8Array.from(y));
    fs.writeSync(fg, new Uint8Array(Int32Array.from(g).buffer));
    fs.writeSync(fr, Uint8Array.from(rule));
    fs.writeSync(ft, new Uint8Array(Int32Array.from(turn).buffer));
    rows += x.length;
    console.log(`  ${file}: ${x.length.toString()} positions`);
  }
  for (const f of [fx, fy, fg, fr, ft]) fs.closeSync(f);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run's own file, in the directory it is given
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ rows, features: FEATURES, files }, null, 2));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run's own file, in the directory it is given
  fs.writeFileSync(path.join(out, "samples.jsonl"), samples.join("\n") + "\n");
  const seconds = (performance.now() - started) / 1000;
  console.log(`\n${rows.toString()} positions × ${FEATURES.toString()} features (${skipped.toString()} from capped games left out) in ${seconds.toFixed(0)}s → ${out}`);
}

void main();
