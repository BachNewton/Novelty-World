import { COURSE_SEED } from "./course";
import type { RuleRow } from "./run";
import { rowStream } from "./stream";
import { rowSolids, type Row } from "./traffic";
import { TUNING, type Tuning } from "./tuning";
import type { TetrominoKind } from "./types";
import { PREVIEW_PIECES, PREVIEW_ROWS, type PreviewLanes } from "./world/preview-rows";

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

// Local co-op's placeholder course: the `?world` preview's hand-made co-op
// rows for the road's width, each passable by Sprout's L and Splash's J
// together, cycled for as long as the run goes on, at the stream's spacing.
// The row stream builds rows for one frog, so it can't serve two yet; this
// goes once the stream builds co-op rows.
export function coopPlaceholderCourse(lanes: PreviewLanes, tuning: Tuning = TUNING): Course {
  const rows = PREVIEW_ROWS.coop[lanes].map((vehicles) => ({ vehicles, gates: [], solids: rowSolids(vehicles) }));
  return {
    seed: COURSE_SEED,
    lanes,
    kinds: PREVIEW_PIECES.coop,
    row: (index) => {
      if (!Number.isInteger(index) || index < 0) throw new Error(`No row ${String(index)} in a course`);
      return { ...rows[index % rows.length], gap: index === 0 ? tuning.firstWallDepth : tuning.wallSpacing };
    },
  };
}
