import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { FEATURES } from "../bots/rule-v8/features";
import { CANDIDATE_WIDTH } from "../bots/student-v1/candidates";
import { candidateRows, type DecisionRecord } from "./distill";

/** `npm run risk:features -- --teacher` — turns a teacher recording (`risk:record -- --teacher`)
 *  into the distilled student's training set (`ideas/distilled-v7.md`): every candidate of every
 *  recorded search, its success and failure boards read through rule-v8's own feature function
 *  (`bots/rule-v8/features.ts`), so the trainer (`bots/rule-v8/train/distill.py`) never computes a
 *  feature itself.
 *
 *  Usage:
 *    npm run risk:features -- --teacher
 *    npm run risk:features -- --teacher --in some/recording --out some/dir
 *
 *  Writes, in `--out` (default `eval/positions/distill-v7-features/`, never committed), one row
 *  per candidate, a decision's candidates in a row, candidate 0 (v6's own choice) first: `x.f32`
 *  (the success board's features, the failure board's, the success chance and v6's value for the
 *  plan, little-endian float32), `score.f32` (v7's mean score for it), `chosen.u8` (1 for v7's
 *  pick), `decision.i32` (the decision's number in the set), `game.i32` (the game's index),
 *  `turn.i32` and `replies.f32` (its score in each of v7's replies, NaN for a record made before
 *  the recorder kept them), with `meta.json` saying how many rows, decisions, features and
 *  replies. */

/** A record as read: recordings from before the replies' own scores were kept lack them. */
type Recorded = Omit<DecisionRecord, "replyScores"> & { replyScores?: number[][] };

/** The replies a recording's searches played: every record that keeps its replies' scores must
 *  have played as many. */
function repliesOf(r: Recorded, replies: number | null): number | null {
  const n = r.replyScores?.[0].length;
  if (n === undefined) return replies;
  if (replies !== null && n !== replies) throw new Error(`a search of ${n.toString()} replies among searches of ${replies.toString()}: one set is one teacher`);
  return n;
}

const POSITIONS = fileURLToPath(new URL("./positions/", import.meta.url));

function parseArgs(argv: readonly string[]): { input: string; out: string } {
  const a = { input: path.join(POSITIONS, "distill-v7"), out: path.join(POSITIONS, "distill-v7-features") };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv.at(i + 1);
    if (value === undefined) throw new Error(`${argv[i]} needs a value`);
    if (argv[i] === "--in") a.input = value;
    else if (argv[i] === "--out") a.out = value;
    else throw new Error(`unknown flag "${argv[i]}". Example: npm run risk:features -- --teacher --in some/dir`);
  }
  return a;
}

/** Writes the teacher training set, from the flags after `--teacher`. */
export async function writeTeacherFeatures(argv: readonly string[]): Promise<void> {
  const { input, out } = parseArgs(argv);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the recording's directory the run is given
  const files = fs.readdirSync(input).filter((f) => f.endsWith(".jsonl.gz")).sort();
  if (files.length === 0) throw new Error(`no recorded decisions (*.jsonl.gz) in ${input}`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory the run is told to write to
  fs.mkdirSync(out, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run's own files, in the directory it is given
  const open = (name: string) => fs.openSync(path.join(out, name), "w");
  // The replies' count, from the first record of each file, before any row is written.
  let replies: number | null = null;
  for (const file of files) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a recording file in the directory the run is given
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(input, file)).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (line.length === 0) continue;
      replies = repliesOf(JSON.parse(line) as Recorded, replies);
      break;
    }
    lines.close();
  }
  const R = replies ?? 0;
  const fx = open("x.f32");
  const fr = open("replies.f32");
  const fs32 = open("score.f32");
  const fc = open("chosen.u8");
  const fd = open("decision.i32");
  const fg = open("game.i32");
  const ft = open("turn.i32");
  let rows = 0;
  let decisions = 0;
  for (const file of files) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a recording file in the directory the run is given
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(input, file)).pipe(createGunzip()), crlfDelay: Infinity });
    const before = decisions;
    for await (const line of lines) {
      if (line.length === 0) continue;
      const r = JSON.parse(line) as Recorded;
      const n = r.candidates.length;
      replies = repliesOf(r, replies);
      const each = new Float32Array(n * R).fill(Number.NaN);
      r.replyScores?.forEach((scores, c) => each.set(scores, c * R));
      fs.writeSync(fr, new Uint8Array(each.buffer));
      fs.writeSync(fx, new Uint8Array(candidateRows(r).buffer));
      fs.writeSync(fs32, new Uint8Array(Float32Array.from(r.scores).buffer));
      fs.writeSync(fc, Uint8Array.from(r.candidates, (_, i) => (i === r.chosen ? 1 : 0)));
      fs.writeSync(fd, new Uint8Array(new Int32Array(n).fill(decisions).buffer));
      fs.writeSync(fg, new Uint8Array(new Int32Array(n).fill(r.game).buffer));
      fs.writeSync(ft, new Uint8Array(new Int32Array(n).fill(r.turn).buffer));
      rows += n;
      decisions++;
    }
    console.log(`  ${file}: ${(decisions - before).toString()} decisions`);
  }
  for (const f of [fx, fr, fs32, fc, fd, fg, ft]) fs.closeSync(f);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the run's own file, in the directory it is given
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ rows, decisions, features: FEATURES, width: CANDIDATE_WIDTH, replies: R, files }, null, 2));
  console.log(`\n${decisions.toString()} decisions, ${rows.toString()} candidates × ${CANDIDATE_WIDTH.toString()} → ${out}`);
}

