import { COOP_COURSE, type DesignedCourse, type Pose } from "./coop-course";
import { COURSE_SEED } from "./course";
import type { RuleRow } from "./run";
import { rowStream } from "./stream";
import { rowSolids, type Row } from "./traffic";
import { TUNING, type Tuning } from "./tuning";
import type { TetrominoKind } from "./types";

// What a session plays: the road's width, each player's starting piece, and
// the rows, each with its vehicles for drawing and its solids for the rules.
// The seed lays out the world around the road.

export interface PlayRow extends RuleRow {
  vehicles: Row;
}

export interface Course {
  seed: number;
  lanes: number;
  // One starting piece per player: how many frogs the run has.
  kinds: readonly TetrominoKind[];
  row: (index: number) => PlayRow;
}

// Solo: the row stream from the demo seed, on the road the stream is built
// for.
export function soloCourse(tuning: Tuning = TUNING): Course {
  const stream = rowStream(COURSE_SEED, tuning);
  return { seed: stream.seed, lanes: tuning.corridorCols, kinds: [stream.start], row: stream.row };
}

// Which of a designed course's rows the run meets as its row `index`: each in
// order, then its last `repeat` rows round again.
export function designedRowAt(course: DesignedCourse, index: number): number {
  if (!Number.isInteger(index) || index < 0) throw new Error(`No row ${String(index)} in a course`);
  const { length } = course.rows;
  if (course.repeat < 1 || course.repeat > length) throw new Error(`A course of ${String(length)} rows can't repeat its last ${String(course.repeat)}`);
  return index < length ? index : length - course.repeat + ((index - length) % course.repeat);
}

// A course designed by hand, as a session plays it.
export function designedCourse(course: DesignedCourse): Course {
  const rows = course.rows.map(({ vehicles, gap }) => ({ vehicles, gap, gates: [], solids: rowSolids(vehicles) }));
  return { seed: COURSE_SEED, lanes: course.lanes, kinds: course.kinds, row: (index) => rows[designedRowAt(course, index)] };
}

// The pose each frog is meant to pass the run's row `index` in.
export function designedAnswers(course: DesignedCourse): (index: number) => readonly Pose[] {
  return (index) => course.rows[designedRowAt(course, index)].answer;
}

// Local co-op's course: rows designed for Sprout and Splash (`coop-course.ts`).
export function coopCourse(): Course {
  return designedCourse(COOP_COURSE);
}

// A course named as plain data, for a replay to say which course it plays.
export type CourseSpec = { kind: "solo" } | { kind: "coop" };

export function courseOf(spec: CourseSpec, tuning: Tuning = TUNING): Course {
  return spec.kind === "solo" ? soloCourse(tuning) : coopCourse();
}
