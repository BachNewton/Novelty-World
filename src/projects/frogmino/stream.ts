import { createRng } from "@/shared/lib/seeded-random";
import { findRow, type Difficulty, type Face, type RowPieces } from "./composer";
import type { CourseRow } from "./course";
import { VEHICLE_LENGTHS } from "./fleet";
import { pieceSize, TETROMINOES } from "./logic";
import { rowSolids } from "./traffic";
import type { Frog, Opening, Solid, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// The row stream: every row of traffic the frog will meet, in the order it
// meets them, however many that is. Row n is a function of the seed and n
// alone, never of the player, so co-op partners and replays see the same
// traffic. It begins with the designed ramp, easy to medium to hard, and
// goes on in waves composed the same way.
//
// The stream tracks the pieces the frog could be holding as it meets each
// row: the start piece, and each gate adds its own. Every row lets every one
// of them through a normal opening, except a needs-gate row, which lets
// through only the latest gate's piece and so brings the pieces back down to
// that one. Builder rules keep the pieces few: a gate only ever offers a
// piece the frog can't already hold, and one met holding either of two
// pieces is needed by the very next row, so no row is ever built for more
// than two pieces.

// A needs-gate row comes at most this many rows after its gate, so a frog
// that skipped the gate never has far to go back for it.
export const NEEDS_GATE_REACH = 2;

// A few rows composed together.
export interface Beat {
  difficulties: readonly Difficulty[];
  // Whether its first row holds a gate.
  gate: boolean;
  // Which of its rows only the gate's piece passes; null if none.
  needsAt: number | null;
}

// The designed ramp, fifteen rows: five easy, five medium, five hard. The
// first gate is optional: nothing after it needs its piece. The second is
// needed by the next row, the third by the row after next.
export const RAMP: readonly Beat[] = [
  { difficulties: ["easy", "easy", "easy"], gate: false, needsAt: null },
  { difficulties: ["easy", "easy", "medium", "medium", "medium", "medium"], gate: true, needsAt: null },
  { difficulties: ["medium", "hard"], gate: true, needsAt: 1 },
  { difficulties: ["hard"], gate: false, needsAt: null },
  { difficulties: ["hard", "hard", "hard"], gate: true, needsAt: 2 },
];

// After the ramp, the stream goes on in waves of five rows: a medium row,
// then a gate in another medium row, two hard rows and an easy one to
// breathe. The seed picks
// whether the gate is needed, by the next row or the one after, or not at
// all; a frog that could already hold either of two pieces needs it at once.
const WAVE_ROWS: readonly Difficulty[] = ["medium", "hard", "hard", "easy"];
const WAVE_NEEDS: readonly (number | null)[] = [1, 2, null];

function waveBeats(holding: number, random: () => number): Beat[] {
  const needsAt = holding > 1 ? 1 : WAVE_NEEDS[Math.floor(random() * WAVE_NEEDS.length)];
  return [
    { difficulties: ["medium"], gate: false, needsAt: null },
    { difficulties: WAVE_ROWS, gate: true, needsAt },
  ];
}

// A row of the stream, with what the builder knows of it.
export interface StreamRow extends CourseRow {
  index: number;
  // Its vehicles as the rules see them, and the cells none of them fills.
  solids: readonly Solid[];
  opening: Opening;
  // The pieces the frog could be holding as it meets the row.
  holding: readonly TetrominoKind[];
  // The pose each piece that passes through a normal opening was built
  // around.
  answers: readonly Frog[];
}

export interface RowStream {
  seed: number;
  // The piece the frog starts as.
  start: TetrominoKind;
  row: (index: number) => StreamRow;
}

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];

// How many times a beat goes through every piece its gate could offer before
// the builder gives up: a beat's rows are composed at random, so one that
// failed with a piece may well succeed with it on another round.
const BEAT_ROUNDS = 4;

// How far the seed shifts a gap between rows from the spacing, either way.
function shift(tuning: Tuning, random: () => number): number {
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

// The farthest a needs-gate row's front can be from its gate row's back:
// the gaps and rows between them, at their longest.
export function gateReach(tuning: Tuning): number {
  const longest = Math.max(...Object.values(VEHICLE_LENGTHS));
  return NEEDS_GATE_REACH * (tuning.wallSpacing + tuning.wallJitter) + (NEEDS_GATE_REACH - 1) * longest;
}

// A frog knocked back by a needs-gate row is never further ahead of the
// needed gate's row than the gate reach, so that row must not be recycled
// until it is further behind than that.
function checkRecovery(tuning: Tuning): void {
  if (tuning.recycleBehind < gateReach(tuning)) {
    throw new Error(`Rows recycled ${String(tuning.recycleBehind)} behind the frog can take a needed gate ${String(gateReach(tuning))} back`);
  }
}

// The builder's rules for a beat, which keep the pieces the frog could hold
// few and a needed gate near.
function checkBeat(beat: Beat, holding: readonly TetrominoKind[]): void {
  if (beat.needsAt === null) {
    if (beat.gate && holding.length > 1) throw new Error("A frog that could hold two pieces meets a gate nothing needs");
    return;
  }
  if (!beat.gate) throw new Error("A row needs a gate its beat doesn't have");
  if (beat.needsAt < 1 || beat.needsAt > NEEDS_GATE_REACH || beat.needsAt >= beat.difficulties.length) {
    throw new Error(`A needs-gate row ${String(beat.needsAt)} rows after its gate`);
  }
  if (holding.length > 1 && beat.needsAt !== 1) throw new Error("A row between a gate and its need would be built for three pieces");
}

interface Tracked {
  holding: TetrominoKind[];
  // Where the frog could stand after the last row.
  before: Frog[];
}

// A stream of rows for `seed`, built lazily as far as it is asked for. The
// same seed and index always give the same row, however far along the
// stream it is asked for and in whatever order. Fails loudly if a row can't
// be composed.
export function rowStream(seed: number, tuning: Tuning, start: TetrominoKind = "L"): RowStream {
  checkRecovery(tuning);
  const face: Face = { cols: tuning.corridorCols, rows: tuning.wallRows };
  const rows: StreamRow[] = [];
  const startPose: Frog = { kind: start, col: Math.floor((face.cols - pieceSize(start, 0).width) / 2), rotation: 0, hop: 0 };
  let tracked: Tracked = { holding: [start], before: [startPose] };
  let beatIndex = 0;
  let pending: Beat[] = [...RAMP];

  // Composes the beat's rows with its gate (if any) offering `gate`; null if
  // one can't be built.
  function tryBeat(beat: Beat, gate: TetrominoKind | null, gaps: readonly number[], random: () => number): { built: StreamRow[]; after: Tracked } | null {
    const built: StreamRow[] = [];
    let { holding, before } = tracked;
    for (let i = 0; i < beat.difficulties.length; i++) {
      const needsGate = i === beat.needsAt;
      const pieces: RowPieces =
        gate !== null && needsGate
          ? { pass: [gate], refuse: holding.filter((kind) => kind !== gate), gate: null }
          : { pass: holding, refuse: [], gate: i === 0 ? gate : null };
      const difficulty = beat.difficulties[i];
      const composed = findRow(pieces, difficulty, face, before, random);
      if (composed === null) return null;
      built.push({
        index: rows.length + i,
        vehicles: composed.vehicles,
        gates: composed.gates,
        gap: gaps[i],
        needsGate,
        difficulty,
        solids: rowSolids(composed.vehicles),
        opening: composed.opening,
        holding,
        answers: composed.answers,
      });
      before = composed.fits;
      if (gate !== null && i === 0) holding = [...holding, gate];
      if (gate !== null && needsGate) holding = [gate];
    }
    return { built, after: { holding, before } };
  }

  function buildNextBeat(): void {
    if (pending.length === 0) pending = waveBeats(tracked.holding.length, createRng(`frogmino-stream:${String(seed)}:wave:${String(beatIndex)}`).next);
    const beat = pending[0];
    checkBeat(beat, tracked.holding);
    const random = createRng(`frogmino-stream:${String(seed)}:beat:${String(beatIndex)}`).next;
    const gaps = beat.difficulties.map((_, i) =>
      (rows.length === 0 && i === 0 ? tuning.firstWallDepth : tuning.wallSpacing) + shift(tuning, random),
    );
    const offers = beat.gate ? shuffled(KINDS.filter((kind) => !tracked.holding.includes(kind)), random) : [null];
    for (let round = 0; round < BEAT_ROUNDS; round++) {
      for (const gate of offers) {
        const result = tryBeat(beat, gate, gaps, random);
        if (result === null) continue;
        rows.push(...result.built);
        tracked = result.after;
        pending = pending.slice(1);
        beatIndex++;
        return;
      }
    }
    throw new Error(`Seed ${String(seed)}'s stream can't compose beat ${String(beatIndex)} for a frog holding ${tracked.holding.join(" or ")}`);
  }

  return {
    seed,
    start,
    row: (index) => {
      if (!Number.isInteger(index) || index < 0) throw new Error(`No row ${String(index)} in a stream`);
      while (rows.length <= index) buildNextBeat();
      return rows[index];
    },
  };
}
