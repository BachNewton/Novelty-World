import { coopCourseById } from "./coop-courses";
import type { DesignedCourse, Pose } from "./coop-courses/design";
import { checkMedalTimes, type MedalTimes } from "./medals";
import { createRun, type RuleRow, type Run } from "./run";
import { rowSolids, type Row } from "./traffic";
import { TUNING, type Tuning } from "./tuning";
import type { TetrominoKind } from "./types";

// What a session plays: the road's width, each player's piece, the
// rows, each with its vehicles for drawing and its solids for the rules, and
// where the finish is. The seed lays out the world around the road.

// The seed every course's world is laid out from.
export const COURSE_SEED = 20260930;

export interface PlayRow extends RuleRow {
  vehicles: Row;
}

export interface Course {
  seed: number;
  lanes: number;
  // One piece per player, kept for the whole course: how many frogs the run
  // has.
  kinds: readonly TetrominoKind[];
  row: (index: number) => PlayRow;
  // Where the finish line is, in units down the road from the start.
  length: number;
  // The time to beat for each medal (see `medals.ts`).
  medals: MedalTimes;
}

// How many of a designed course's last rows go round again once all are met.
function repeatOf(course: Pick<DesignedCourse, "rows" | "repeat">): number {
  return course.repeat ?? course.rows.length;
}

// Which of a designed course's rows the run meets as its row `index`: each in
// order, then its last rows round again (every row, unless the course says
// fewer).
export function designedRowAt(course: Pick<DesignedCourse, "rows" | "repeat">, index: number): number {
  if (!Number.isInteger(index) || index < 0) throw new Error(`No row ${String(index)} in a course`);
  const { length } = course.rows;
  const repeat = repeatOf(course);
  if (repeat < 1 || repeat > length) throw new Error(`A course of ${String(length)} rows can't repeat its last ${String(repeat)}`);
  return index < length ? index : length - repeat + ((index - length) % repeat);
}

// A course designed by hand, as a session plays it.
export function designedCourse(course: DesignedCourse): Course {
  const rows = course.rows.map(({ vehicles, gap }) => ({ vehicles, gap, solids: rowSolids(vehicles) }));
  return {
    seed: COURSE_SEED,
    lanes: course.lanes,
    kinds: course.kinds,
    row: (index) => rows[designedRowAt(course, index)],
    length: course.length,
    medals: checkMedalTimes(course.medals),
  };
}

// The pose each frog is meant to pass the run's row `index` in.
export function designedAnswers(course: DesignedCourse): (index: number) => readonly Pose[] {
  return (index) => course.rows[designedRowAt(course, index)].answer;
}

// A course named as plain data: for a replay to say which course it plays,
// and for the online `start` to say which course both devices build. A
// co-op course is named by its id (`coop-courses/`).
export interface CourseSpec {
  kind: "coop";
  id: string;
}

// The designed course a spec names. Fails loudly on an id no course has.
export function designOf(spec: CourseSpec): DesignedCourse {
  return coopCourseById(spec.id);
}

export function courseOf(spec: CourseSpec): Course {
  return designedCourse(designOf(spec));
}

// A designed co-op course by id, as a session plays it.
export function coopCourse(id: string): Course {
  return designedCourse(coopCourseById(id));
}

// The run a course starts with: its frogs aboard the helicopter, its rows lined
// up, its finish where the course has it.
export function startRun(course: Course, tuning: Tuning = TUNING): Run {
  return createRun(course.row, tuning, { kinds: course.kinds, lanes: course.lanes, courseLength: course.length });
}
