import { COOP_COURSE } from "../coop-course";
import { courseOf } from "../courses";
import { createRun, playTo, type TimedInput } from "../run";
import { TUNING } from "../tuning";
import type { ReplayData } from "./replay-data";

// The perch, in its simplest form: Sprout stands on Splash. It is the
// solver's proof of local co-op's course up to the row where Sprout goes up,
// its foot on Splash's foot, played with two jumps fewer before that row. The
// row then comes later than the plan's hop allows for, so Sprout's hop runs
// out first, with Splash's foot already under it: it can't land, so it
// stands on Splash until the row arrives, and passes. A hop pressed early is
// forgiven whenever the partner is underneath.

export const PERCH_ROW = COOP_COURSE.rows.findIndex((row) => row.lesson === "Sprout goes up");

const JUMPS_FEWER = 2;
// How long the replay runs on after the perch row passes, in ticks.
const TAIL = 200;

export function perchReplay(proof: ReplayData): ReplayData {
  if (PERCH_ROW === -1) throw new Error("The co-op course has no row where Sprout goes up");
  const course = courseOf(proof.course);
  // Ticks up to the moment the team has passed `rows` rows.
  const passed = (log: readonly TimedInput[], rows: number): number => {
    let run = createRun(course.row, TUNING, { kinds: course.kinds, lanes: course.lanes });
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
    description: "Local co-op: Sprout hops early onto Splash's foot and stands there until the row arrives, the perch in its simplest form.",
    course: proof.course,
    log,
    until: passed(log, PERCH_ROW + 1) + TAIL,
  };
}
