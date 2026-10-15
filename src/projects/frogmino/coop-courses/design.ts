import type { MedalTimes } from "../medals";
import type { Row } from "../traffic";
import type { Frog, TetrominoKind } from "../types";

// The format of a co-op course designed by hand: plain data, one course per
// file in this folder, gathered in `index.ts`. See "Adding a co-op course" in
// the project's CLAUDE.md.

// How hard a course is, for the picker: easiest first.
export const COURSE_TIERS = ["easy", "medium", "hard"] as const;
export type CourseTier = (typeof COURSE_TIERS)[number];

// A frog's pose on the row's face; its piece is the course's.
export type Pose = Omit<Frog, "kind">;

export interface DesignedRow {
  // What the row teaches, in a few words: the prove CLI prints it.
  lesson: string;
  vehicles: Row;
  // The pose each frog is meant to pass in, one per player: the answer the
  // row was designed around, which the proof plays. Others may pass too.
  answer: readonly Pose[];
  // From the back of the row before to this row's front, in units; for the
  // first row, where its front starts. Early rows get more reading room.
  gap: number;
}

export interface DesignedCourse {
  // Names the course in a course spec, a replay and the URL: lower-case
  // words joined by hyphens, unique among the courses.
  id: string;
  // What the picker calls it.
  name: string;
  tier: CourseTier;
  // A line for the picker: what the course is about.
  description: string;
  // The road's width in lanes.
  lanes: number;
  // One starting piece per player, Sprout's first: any two pieces, the same
  // one twice included, that each fit their half of the road.
  kinds: readonly TetrominoKind[];
  // Where the finish line is, in units down the road from the start: just
  // past where the rows end, so a team jumping flat out still meets them all.
  length: number;
  // The time to beat for each medal, in seconds (see `medals.ts`).
  medals: MedalTimes;
  rows: readonly DesignedRow[];
  // How many of the last rows go round again, in order, once every row has
  // been met, for a slow team still short of the finish. Every row unless
  // the course says fewer.
  repeat?: number;
}

// A frog's pose: its leftmost lane, its rotation and how many cells above the
// road it is.
export function pose(col: number, rotation: Pose["rotation"], height = 0): Pose {
  return { col, rotation, height };
}

// Reading room, the gap before a row: the most generous first, then less as
// a course goes on. A course may use any gap; these are the usual ones.
export const READ_SLOW = 18;
export const READ = 16;
export const PACE = 13;
