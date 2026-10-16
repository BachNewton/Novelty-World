import { LONG_AND_SHORT } from "../coop-courses/long-and-short";
import { courseOf, startRun } from "../courses";
import { playTo, type TimedInput } from "../run";
import type { ReplayData } from "./replay-data";

// The perch, in its simplest form: Splash's O stands on Sprout's flat I. It
// is the solver's proof of Long and Short up to the row where Splash steps
// onto the plank, played with two jumps fewer before that row. The row then
// comes later than the plan's hop allows for, so Splash's hop runs out
// first, with the plank already under it: it can't land, so it stands on
// Sprout until the row arrives, and passes. A hop pressed early is forgiven
// whenever the partner is underneath.

export const PERCH_COURSE = LONG_AND_SHORT;
export const PERCH_ROW = PERCH_COURSE.rows.findIndex((row) => row.lesson === "Splash steps onto the plank");
// The frog that stands on its partner.
export const PERCHER = 1;

const JUMPS_FEWER = 2;
// How long the replay runs on after the perch row passes, in ticks.
const TAIL = 200;

export function perchReplay(proof: ReplayData): ReplayData {
  if (PERCH_ROW === -1) throw new Error(`${PERCH_COURSE.name} has no row where Splash steps onto the plank`);
  const course = courseOf(proof.course);
  // Ticks up to the moment the team has passed `rows` rows.
  const passed = (log: readonly TimedInput[], rows: number): number => {
    let run = startRun(course);
    while (run.passes < rows) {
      if (run.tick > proof.until) throw new Error(`The proof never passes ${String(rows)} rows`);
      run = playTo(run, run.tick + 1, log);
    }
    return run.tick;
  };
  const before = passed(proof.log, PERCH_ROW);
  const through = passed(proof.log, PERCH_ROW + 1);
  const jumps = proof.log.filter((input) => input.tick > before && input.tick <= through && input.input.kind === "act" && input.input.action === "forward");
  const dropped = new Set(jumps.slice(-JUMPS_FEWER));
  const log = proof.log.filter((input) => input.tick <= through && !dropped.has(input));
  return {
    description: "Local co-op: Splash hops early onto Sprout's plank and stands there until the row arrives, the perch in its simplest form.",
    course: proof.course,
    log,
    until: passed(log, PERCH_ROW + 1) + TAIL,
  };
}
