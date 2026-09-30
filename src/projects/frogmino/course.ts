import { createRng } from "@/shared/lib/seeded-random";
import { findRow, type Difficulty, type Face, type RowPieces } from "./composer";
import { firstFit, pieceSize, TETROMINOES } from "./logic";
import { BARRIER_DEPTH, pullOffLanes, type PullOff, type Side } from "./pull-off";
import type { Row } from "./traffic";
import type { Frog, Opening, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

export const COURSE_SEED = 20260930;

// The first row after each pull-off, in course order: the level design's
// choice of where they come. The second is forced (see `generateCourse`), and
// sits among the hard rows because only a tight row can shut a piece out: an
// easy or medium row that lets the waiting piece through several ways almost
// always lets another piece through too.
export const PULL_OFF_ROWS: readonly number[] = [4, 10, 12];

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
  // The pieces it lets through, and those it must not.
  pieces: RowPieces;
  // The poses it was built around, one per piece it lets through.
  answers: Frog[];
}

export interface CoursePullOff extends PullOff {
  // The first row of the stretch after it: the rows from there up to the next
  // pull-off's first row are the traffic it leads to.
  firstRow: number;
  // Whether that traffic needs the waiting piece: none of the pieces the frog
  // may arrive with passes it.
  forced: boolean;
  // The pieces the frog may be holding when it arrives.
  arriving: TetrominoKind[];
}

export interface Course {
  // The piece the frog starts with.
  start: TetrominoKind;
  rows: CourseRow[];
  pullOffs: CoursePullOff[];
}

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];

// How far the seed shifts a row from even spacing, either way.
export function wallShift(tuning: Tuning, random: () => number): number {
  return (random() * 2 - 1) * tuning.wallJitter;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Where a frog advancing at the tuning's pull-off pace meets a row that
// starts at `depth`: the row comes at the frog as the frog goes to it.
function meetingDepth(depth: number, tuning: Tuning): number {
  return (depth * tuning.pullOffPace) / (tuning.pullOffPace + tuning.wallSpeed);
}

interface Stretch {
  rows: CourseRow[];
  // The poses that passed its last row.
  after: Frog[];
}

// The rows from `from` up to `to`, all for the same pieces. Null if the
// vehicles can't build one of them for those pieces.
function composeStretch(
  from: number,
  to: number,
  pieces: RowPieces,
  depths: readonly number[],
  face: Face,
  before: readonly Frog[],
  random: () => number,
): Stretch | null {
  const rows: CourseRow[] = [];
  let after = [...before];
  for (let i = from; i < to; i++) {
    const difficulty = COURSE_DIFFICULTIES[i];
    const row = findRow(pieces, difficulty, face, after, random);
    if (row === null) return null;
    rows.push({ vehicles: row.vehicles, opening: row.opening, difficulty, pieces, answers: row.answers, depth: depths[i] });
    after = row.fits;
  }
  return { rows, after };
}

// The course builder's promises about a pull-off, checked as it is built:
// every piece that may be swapped there fits inside it in some pose, and it
// lies on the road, clear of the pull-off before it. The run rules check its
// stretch is deep enough to land in.
function checkPullOff(pullOff: CoursePullOff, before: CoursePullOff | undefined, tuning: Tuning): void {
  const lanes = pullOffLanes(pullOff, tuning.corridorCols);
  for (const kind of [...pullOff.arriving, pullOff.waiting]) {
    if (firstFit(kind, lanes) === null) throw new Error(`A ${kind} doesn't fit a pull-off ${String(pullOff.width)} lanes wide`);
  }
  if (pullOff.near - BARRIER_DEPTH <= 0 || pullOff.far + BARRIER_DEPTH >= tuning.courseLength) {
    throw new Error(`A pull-off at ${String(pullOff.near)} leaves the road`);
  }
  if (before !== undefined && before.far + BARRIER_DEPTH >= pullOff.near - BARRIER_DEPTH) {
    throw new Error(`Pull-offs at ${String(before.near)} and ${String(pullOff.near)} overlap`);
  }
}

// A course of traffic rows and pull-offs from a seed: always the same for the
// same seed, every row passable, spread along the course.
//
// Rows are composed for the pieces the frog could be holding when it meets
// them, tracked through the course. Before the first pull-off that is the
// start piece. At each pull-off the frog may keep its piece or swap for the
// waiting one, so the rows after it must let through both, unless the frog
// could already be holding either of two pieces: then the pull-off forces,
// and its rows let through only the waiting piece and none of those the frog
// may arrive with. A forced stretch leaves the frog holding one piece again.
// After it, the next pull-off hands back the start piece, so every row
// outside a forced stretch lets the start piece through. Any other pull-off's
// waiting piece is the first of the pieces the frog can't be holding, in an
// order the seed shuffles, whose rows the vehicles can build.
export function generateCourse(seed: number, tuning: Tuning, start: TetrominoKind = "L"): Course {
  const random = createRng(seed).next;
  const face: Face = { cols: tuning.corridorCols, rows: tuning.wallRows };
  const depths = COURSE_DIFFICULTIES.map((_, i) => tuning.firstWallDepth + i * tuning.wallSpacing + wallShift(tuning, random));
  const sides = PULL_OFF_ROWS.map((): Side => (random() < 0.5 ? "left" : "right"));

  // Where each stretch of rows begins and ends: before the first pull-off,
  // then after each.
  const bounds = [0, ...PULL_OFF_ROWS, COURSE_DIFFICULTIES.length];

  // Where the frog stands before the first row: where it starts.
  const startPose: Frog = { kind: start, col: Math.floor((face.cols - pieceSize(start, 0).width) / 2), rotation: 0, hop: 0 };
  const first = composeStretch(0, bounds[1], { pass: [start], refuse: [] }, depths, face, [startPose], random);
  if (first === null) throw new Error(`No first stretch of rows for a ${start}`);
  const rows = [...first.rows];
  let before = first.after;
  let holding: TetrominoKind[] = [start];
  const pullOffs: CoursePullOff[] = [];

  PULL_OFF_ROWS.forEach((firstRow, k) => {
    const forced = holding.length > 1;
    const offers = holding.includes(start) ? shuffled(KINDS.filter((kind) => !holding.includes(kind)), random) : [start];
    for (const waiting of offers) {
      const pieces: RowPieces = forced ? { pass: [waiting], refuse: holding } : { pass: [...holding, waiting], refuse: [] };
      const stretch = composeStretch(firstRow, bounds[k + 2], pieces, depths, face, before, random);
      if (stretch === null) continue;
      const centre = meetingDepth((depths[firstRow - 1] + depths[firstRow]) / 2, tuning);
      const pullOff: CoursePullOff = {
        side: sides[k],
        near: centre - tuning.pullOffLength / 2,
        far: centre + tuning.pullOffLength / 2,
        width: tuning.pullOffWidth,
        waiting,
        firstRow,
        forced,
        arriving: holding,
      };
      checkPullOff(pullOff, pullOffs.at(-1), tuning);
      pullOffs.push(pullOff);
      rows.push(...stretch.rows);
      before = stretch.after;
      holding = [...pieces.pass];
      return;
    }
    throw new Error(`No piece to wait in pull-off ${String(k)} for a frog holding ${holding.join(" or ")}`);
  });
  return { start, rows, pullOffs };
}
