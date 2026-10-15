import { writeFileSync } from "node:fs";
import { COOP_COURSES } from "../coop-courses";
import type { DesignedCourse } from "../coop-courses/design";
import { courseOf, designedAnswers, designedRowAt, designOf, type Course, type CourseSpec } from "../courses";
import { heldJumpTicks } from "../medals";
import { replay, runTime } from "../run";
import { tickTiming } from "../ticks";
import { TUNING, type Tuning } from "../tuning";
import { analyseCoopCourse, type RowAnalysis } from "./analyse";
import type { ReplayData } from "./replay-data";
import { courseHeading, courseSummary, kindsText, routeKinds, rowNumbers, timingText } from "./report";
import { describeProof, describeStep, summary } from "./route";
import { SAVED_REPLAYS } from "./saved-replays";
import { courseRun, DEFAULT_SLOT, proveCourse, type Proof, type ProofResult } from "./solver";
import { endSlot } from "./team-plan";

// Proves courses can be beaten: finds an input log through every row and over
// the finish, replays it in the real rules, and prints the route per row and
// the course's summary for a designer.
//
//   npm run frogmino:prove -- <course id>      one co-op course, by its id
//   npm run frogmino:prove -- all              every co-op course
//
// Options: --rows N stops after N rows; --length U puts the finish U units
// down the road, for a longer stretch of the course; --brief prints a line
// per row instead of the faces; --save NAME (or bare --save, as
// proof-<course>) keeps the proof as a replay, watched at ?replay=NAME.
//
// Each row's line says how coupled it is, its selfish decoys and the
// coordination its answer needs (`analyse.ts`).

const USAGE = [
  "usage: frogmino:prove -- <course id> | all [--rows N] [--length U] [--brief] [--save [NAME]]",
  `co-op courses: ${COOP_COURSES.map((course) => course.id).join(", ")}`,
].join("\n");

interface Job {
  spec: CourseSpec;
  label: string;
}

const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseNumber(text: string | undefined, what: string): number {
  const value = Number(text);
  if (text === undefined || !Number.isFinite(value) || value <= 0) fail(`${what} needs a positive number`);
  return value;
}

const COOP_JOBS: Job[] = COOP_COURSES.map((course) => ({ spec: { kind: "coop", id: course.id }, label: course.id }));
const COURSE_ARGS = new Set(["all", ...COOP_JOBS.map((job) => job.label)]);

function parse(args: readonly string[]) {
  const jobs: Job[] = [];
  const options: { rows?: number; length?: number; brief: boolean; save: string | null | undefined } = { brief: false, save: undefined };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const coop = COOP_JOBS.find((job) => job.label === arg);
    if (coop !== undefined) jobs.push(coop);
    else if (arg === "all") jobs.push(...COOP_JOBS);
    else if (arg === "--rows") options.rows = parseNumber(args[++i], "--rows");
    else if (arg === "--length") options.length = parseNumber(args[++i], "--length");
    else if (arg === "--brief") options.brief = true;
    else if (arg === "--save") {
      const name = args[i + 1] as string | undefined;
      options.save = name === undefined || name.startsWith("-") || COURSE_ARGS.has(name) ? null : name;
      if (options.save !== null) i++;
    } else fail(`unknown argument ${arg}`);
  }
  if (jobs.length === 0) fail("which course?");
  if (options.save !== undefined && options.length !== undefined) fail("a replay plays the course as the game does: --save can't take --length");
  if (typeof options.save === "string" && jobs.length > 1) fail("--save NAME names one proof; with several courses use a bare --save");
  return { jobs, options };
}

// A proof row's place in its course: its row and lesson.
function rowName(design: DesignedCourse, index: number): string {
  const row = designedRowAt(design, index);
  return `course row ${String(row)} "${design.rows[row].lesson}"`;
}

interface Analysed {
  design: DesignedCourse;
  analysis: readonly RowAnalysis[];
  lanes: number;
}

function brief(result: ProofResult, { design, analysis, lanes }: Analysed): string {
  const rows = result.ok ? result.proof.rows : result.rows;
  const lines = rows.map((row, i) => {
    let before = row.start;
    const steps = row.steps.map((step) => {
      const said = describeStep(before, step);
      before = endSlot(step.pose);
      return said;
    });
    const numbers = `${rowNumbers(analysis[designedRowAt(design, row.index)])}; route: ${kindsText(routeKinds(row, lanes, AIR_SLOTS))}`;
    const route = `${String(row.jumps)} jumps, ${steps.length === 0 ? "no steps" : steps.join(" -> ")}`;
    return `  row ${String(i + 1)} (${rowName(design, row.index)}): ${numbers}\n    ${route}`;
  });
  const end = result.ok ? summary(result.proof) : `STUCK at course row ${String(result.stuck.index)}: ${result.stuck.reason}.`;
  return [...lines, end].join("\n");
}

function savedFile(replays: Readonly<Record<string, ReplayData>>): string {
  const entries = Object.entries(replays)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, replay]) =>
      [
        `  ${JSON.stringify(name)}: {`,
        `    description: ${JSON.stringify(replay.description)},`,
        `    course: ${JSON.stringify(replay.course)},`,
        `    until: ${String(replay.until)},`,
        "    log: [",
        ...replay.log.map((input) => `      ${JSON.stringify(input)},`),
        "    ],",
        "  },",
      ].join("\n"),
    );
  return [
    'import type { ReplayData } from "./replay-data";',
    "",
    "// Written by the prove CLI (`npm run frogmino:prove -- ... --save <name>`):",
    "// the solver's proofs, each a replay to watch at `?replay=<name>`.",
    `export const SAVED_REPLAYS: Readonly<Record<string, ReplayData>> = {${entries.length === 0 ? "" : `\n${entries.join("\n")}\n`}};`,
    "",
  ].join("\n");
}

// The proof's time, from the drop to the finish line, beside the course's
// medal times and the floor a held jump sets with nothing in its way: the
// reference points the medal times are set from.
function timing(course: Course, proof: Proof, tuning: Tuning): string {
  const time = runTime(replay(courseRun(course, tuning), proof.log, proof.until));
  return timingText(time, course.medals, heldJumpTicks(tuning, course.length));
}

function main(): void {
  const { jobs, options } = parse(process.argv.slice(2));
  const tuning = TUNING;
  // A saved proof of a co-op course that no longer exists can't be played,
  // so it is dropped as the file is written again.
  const saved: Record<string, ReplayData> = Object.fromEntries(
    Object.entries(SAVED_REPLAYS).filter(([name, { course: spec }]) => {
      const gone = !COOP_COURSES.some((course) => course.id === spec.id);
      if (gone && options.save !== undefined) console.log(`dropped ?replay=${name}: its course is gone`);
      return !gone;
    }),
  );
  let stuck = false;
  for (const { spec, label } of jobs) {
    const design = designOf(spec);
    const played = courseOf(spec);
    const course: Course = options.length === undefined ? played : { ...played, length: options.length };
    const started = performance.now();
    // A designed course is proved as designed: every row in its answer.
    const result = proveCourse(course, { rows: options.rows, answers: designedAnswers(design) }, tuning);
    const took = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ${label}: ${courseHeading(design)} (proved in ${took} s) ===`);
    const analysed: Analysed = { design, analysis: analyseCoopCourse(design, tuning, AIR_SLOTS), lanes: course.lanes };
    console.log(options.brief ? brief(result, analysed) : describeProof(result, course.lanes, tuning.wallRows));
    // Medal times are for the course as the game plays it, not a longer stretch.
    const proved = result.ok && result.proof.finished && options.length === undefined ? timing(course, result.proof, tuning) : null;
    console.log(`\n${courseSummary(design, analysed.analysis, proved)}`);
    if (!result.ok) {
      stuck = true;
      continue;
    }
    if (options.save !== undefined) {
      const name = options.save ?? `proof-${label}`;
      const { proof } = result;
      saved[name] = {
        description: `The solver's proof of the co-op course ${design.name}, every row in its designed answer: ${String(proof.rows.length)} rows with no bonk${proof.finished ? ", over the finish" : ""}.`,
        course: spec,
        log: proof.log,
        until: proof.until,
      };
      console.log(`saved as ?replay=${name}`);
    }
  }
  if (options.save !== undefined) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the fixed saved-replays.ts beside this file
    writeFileSync(new URL("./saved-replays.ts", import.meta.url), savedFile(saved));
  }
  if (stuck) process.exit(1);
}

main();
