import { writeFileSync } from "node:fs";
import { COOP_COURSE } from "../coop-course";
import { courseOf, designedAnswers, designedRowAt, type CourseSpec } from "../courses";
import { tickTiming } from "../ticks";
import { TUNING, type Tuning } from "../tuning";
import { passingPoses, reachablePoses } from "./analyse";
import type { ReplayData } from "./replay-data";
import { describeProof, describeStep, summary } from "./route";
import { SAVED_REPLAYS } from "./saved-replays";
import { courseRun, DEFAULT_SLOT, proveCourse, type ProofResult } from "./solver";
import { endSlot, type TeamPose } from "./team-plan";

// Proves courses can be beaten: finds an input log through every row and over
// the finish, replays it in the real rules, and prints the route per row.
//
//   npm run frogmino:prove -- coop             local co-op's course
//   npm run frogmino:prove -- solo             solo's row stream, to the finish
//   npm run frogmino:prove -- all              both
//
// Options: --rows N stops after N rows; --length U puts the finish U units
// down the road, for a longer stretch of the course; --brief prints a line
// per row instead of the faces; --save NAME (or bare --save, as
// proof-<course>) keeps the proof as a replay, watched at ?replay=NAME.
//
// Each row's line says how many team poses the team can reach that pass it
// (`analyse.ts`): one is a single answer, dozens a row with room to spare.

const USAGE = "usage: frogmino:prove -- coop | solo | all [--rows N] [--length U] [--brief] [--save [NAME]]";

interface Job {
  spec: CourseSpec;
  label: string;
}

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

function parse(args: readonly string[]) {
  const jobs: Job[] = [];
  const options: { rows?: number; length?: number; brief: boolean; save: string | null | undefined } = { brief: false, save: undefined };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "coop") jobs.push({ spec: { kind: "coop" }, label: "coop" });
    else if (arg === "solo") jobs.push({ spec: { kind: "solo" }, label: "solo" });
    else if (arg === "all") jobs.push({ spec: { kind: "coop" }, label: "coop" }, { spec: { kind: "solo" }, label: "solo" });
    else if (arg === "--rows") options.rows = parseNumber(args[++i], "--rows");
    else if (arg === "--length") options.length = parseNumber(args[++i], "--length");
    else if (arg === "--brief") options.brief = true;
    else if (arg === "--save") {
      const name = args[i + 1] as string | undefined;
      options.save = name === undefined || name.startsWith("-") || ["coop", "solo", "all"].includes(name) ? null : name;
      if (options.save !== null) i++;
    } else fail(`unknown argument ${arg}`);
  }
  if (jobs.length === 0) fail("which course?");
  if (options.save !== undefined && options.length !== undefined) fail("a replay plays the course as the game does: --save can't take --length");
  if (typeof options.save === "string" && jobs.length > 1) fail("--save NAME names one proof; with several courses use a bare --save");
  return { jobs, options };
}

// What a row of the proof is: its lesson, for a designed course.
function lessonOf(spec: CourseSpec, index: number): string {
  return spec.kind === "coop" ? ` "${COOP_COURSE.rows[designedRowAt(COOP_COURSE, index)].lesson}"` : "";
}

function brief(result: ProofResult, spec: CourseSpec, reachable: readonly TeamPose[], wallRows: number): string {
  const rows = result.ok ? result.proof.rows : result.rows;
  const lines = rows.map((row, i) => {
    let before = row.start;
    const steps = row.steps.map((step) => {
      const said = describeStep(before, step);
      before = endSlot(step.pose);
      return said;
    });
    const gates = row.gates.some((gate) => gate !== null) ? " [through the gate]" : "";
    const poses = passingPoses(reachable, row.wall.solids, wallRows).length;
    return `  row ${String(i + 1)} (course row ${String(row.index)}${lessonOf(spec, row.index)}, ${String(poses)} passing poses): ${String(row.jumps)} jumps, ${steps.length === 0 ? "no steps" : steps.join(" -> ")}${gates}`;
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

function main(): void {
  const { jobs, options } = parse(process.argv.slice(2));
  const tuning: Tuning = options.length === undefined ? TUNING : { ...TUNING, courseLength: options.length };
  const saved: Record<string, ReplayData> = { ...SAVED_REPLAYS };
  let stuck = false;
  for (const { spec, label } of jobs) {
    const course = courseOf(spec, tuning);
    const started = performance.now();
    // A designed course is proved as designed: every row in its answer.
    const answers = spec.kind === "coop" ? designedAnswers(COOP_COURSE) : undefined;
    const result = proveCourse(course, { rows: options.rows, answers }, tuning);
    const took = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ${label}: ${String(course.lanes)} lanes, ${course.kinds.join(" and ")} (${took} s) ===`);
    const start = courseRun(course, tuning).frogs.map((frog) => ({ kind: frog.kind, col: frog.col, rotation: frog.rotation, air: null }));
    const reachable = reachablePoses(start, course.lanes, tickTiming(tuning).hopAirtime / DEFAULT_SLOT);
    console.log(options.brief ? brief(result, spec, reachable, tuning.wallRows) : describeProof(result, course.lanes, tuning.wallRows));
    if (!result.ok) {
      stuck = true;
      continue;
    }
    if (options.save !== undefined) {
      const name = options.save ?? `proof-${label}`;
      const { proof } = result;
      saved[name] = {
        description: `The solver's proof of ${label === "solo" ? "solo's row stream" : "local co-op's course, every row in its designed answer"}: ${String(proof.rows.length)} rows with no bonk${proof.finished ? ", over the finish" : ""}.`,
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
