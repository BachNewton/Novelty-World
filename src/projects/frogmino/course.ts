import { createRng } from "@/shared/lib/seeded-random";
import { composeRow, type Difficulty, type Face } from "./composer";
import { pieceSize } from "./logic";
import type { Row } from "./traffic";
import type { Frog, Opening, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

export const COURSE_SEED = 20260930;

// The course ramps up: a third easy, a third medium, a third hard.
export const COURSE_DIFFICULTIES: readonly Difficulty[] = [
  ...Array<Difficulty>(5).fill("easy"),
  ...Array<Difficulty>(5).fill("medium"),
  ...Array<Difficulty>(5).fill("hard"),
];

// What the run rules need of a row: the cells the frog may pass through, and
// where the row starts before it begins moving toward the start zone.
export interface CourseWall {
  opening: Opening;
  depth: number;
}

export interface CourseRow extends CourseWall {
  vehicles: Row;
  difficulty: Difficulty;
  // The pose the row was built around.
  answer: Frog;
}

// How far the seed shifts a row from even spacing, either way.
export function wallShift(tuning: Tuning, random: () => number): number {
  return (random() * 2 - 1) * tuning.wallJitter;
}

// A course of traffic rows from a seed: always the same rows for the same
// seed, every one passable, spread along the course.
export function generateCourse(seed: number, tuning: Tuning, kind: TetrominoKind = "L"): CourseRow[] {
  const random = createRng(seed).next;
  const face: Face = { cols: tuning.corridorCols, rows: tuning.wallRows };
  // Where the frog stands before the first row: where it starts.
  let before: Frog[] = [
    { kind, col: Math.floor((face.cols - pieceSize(kind, 0).width) / 2), rotation: 0, hop: 0 },
  ];
  return COURSE_DIFFICULTIES.map((difficulty, i) => {
    const row = composeRow(kind, difficulty, face, before, random);
    before = row.fits;
    return {
      vehicles: row.vehicles,
      opening: row.opening,
      difficulty,
      answer: row.answer,
      depth: tuning.firstWallDepth + i * tuning.wallSpacing + wallShift(tuning, random),
    };
  });
}
