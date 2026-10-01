import type { Difficulty } from "./composer";
import type { Row } from "./traffic";
import type { Gate } from "./types";

// The course format: rows as plain data, in the order they reach the frog.
// Every source of rows (the seeded row stream in `stream.ts` today; courses
// Claude or a person designs, later: see `ideas/course-authoring.md`) makes
// this same data, so every course is checked and played the same way.

export const COURSE_SEED = 20260930;

export interface CourseRow {
  // Which vehicles, in which lanes.
  vehicles: Row;
  // Each a gap two lanes wide and the face's full height, setting the frog's
  // piece as it passes through.
  gates: readonly Gate[];
  // From the back of the row before (its longest vehicle's) to this row's
  // front, in units; for the first row, where its front starts.
  gap: number;
  // Whether only the latest gate's piece passes it, so a frog that skipped
  // that gate must go back for it.
  needsGate: boolean;
  difficulty: Difficulty;
}
