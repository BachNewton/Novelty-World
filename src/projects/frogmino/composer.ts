import { cellKey, frogCells, pieceCells, pieceSize } from "./logic";
import { shapeKey, VEHICLE_IDS } from "./fleet";
import { GATE_WIDTH, gateLanes, insideGate, lanesOf, rowOpening, vehicleCellsAt, vehicleWidth, type Row, type RowVehicle } from "./traffic";
import type { Cell, Frog, Gate, HopHeight, Opening, Rotation, TetrominoKind } from "./types";

// Composes rows of traffic answer-first: pick the pose the row is for (one
// per piece the row must let through), fill the lanes with vehicles that keep
// those poses' cells open, count how many poses of each piece the result lets
// through, and keep it only if each count suits the difficulty. Every row is
// passable by each of its pieces because their answers are. A row may hold a
// gate, two lanes no vehicle takes: the answers and the counts are all about
// the row's normal openings, the ways through that keep the frog's piece.

export type Difficulty = "easy" | "medium" | "hard";

interface DifficultyRule {
  // How many distinct poses may pass, inclusive.
  fits: readonly [number, number];
  // The chance the answer is raised, needing a hop.
  hopChance: number;
  // How strongly vehicles that close open cells beside the answer are
  // preferred: 0 is no preference.
  hug: number;
  // The chance of stopping after each vehicle placed; the lower, the fuller
  // the row.
  stop: number;
  // Whether no pose that passed the row before may pass this one, so the
  // frog must change something.
  demandChange: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyRule> = {
  easy: { fits: [4, 14], hopChance: 0.15, hug: 0, stop: 0.3, demandChange: false },
  medium: { fits: [2, 5], hopChance: 0.25, hug: 1, stop: 0.12, demandChange: false },
  hard: { fits: [1, 2], hopChance: 0.35, hug: 3, stop: 0.03, demandChange: true },
};

// How many tries a row gets before the composer gives up: the analysis
// needed about three on average.
const MAX_ATTEMPTS = 400;

export interface Face {
  cols: number;
  rows: number;
}

// Every distinct way the frog can stand in the face: a rotation, column and
// hop height, with rotations that give the same cells counted once.
export function poses(kind: TetrominoKind, face: Face): Frog[] {
  const seen = new Set<string>();
  const rotations: Rotation[] = [0, 1, 2, 3];
  return rotations.flatMap((rotation) => {
    const key = shapeKey(pieceCells(kind, rotation));
    if (seen.has(key)) return [];
    seen.add(key);
    const { width, height } = pieceSize(kind, rotation);
    const hops: HopHeight[] = [0, 1];
    return hops.flatMap((hop) =>
      height + hop > face.rows
        ? []
        : Array.from({ length: face.cols - width + 1 }, (_, col): Frog => ({ kind, col, rotation, hop })),
    );
  });
}

interface PoseCells {
  frog: Frog;
  cells: string[];
}

// Every pose of a piece with the keys of its cells, worked out once per
// piece and face: the composer tests poses against openings thousands of
// times a course.
const POSE_CELLS = new Map<string, PoseCells[]>();

function poseCells(kind: TetrominoKind, face: Face): PoseCells[] {
  const key = `${kind},${String(face.cols)},${String(face.rows)}`;
  const cached = POSE_CELLS.get(key);
  if (cached !== undefined) return cached;
  const computed = poses(kind, face).map((frog) => ({ frog, cells: frogCells(frog).map(cellKey) }));
  POSE_CELLS.set(key, computed);
  return computed;
}

// The poses whose every cell is open: `frogPasses` for every pose.
function passingIn(kind: TetrominoKind, face: Face, open: ReadonlySet<string>): Frog[] {
  return poseCells(kind, face)
    .filter((pose) => pose.cells.every((cell) => open.has(cell)))
    .map((pose) => pose.frog);
}

// The poses that pass an opening.
export function fits(kind: TetrominoKind, face: Face, opening: Opening): Frog[] {
  return passingIn(kind, face, new Set(opening.map(cellKey)));
}

// Where the frog stands, ignoring height: what a hard row forbids repeating.
export function placementKey(frog: Frog): string {
  return `${frog.kind},${String(frog.rotation)},${String(frog.col)}`;
}

// Which pieces a row is for.
export interface RowPieces {
  // Each must pass through a normal opening.
  pass: readonly TetrominoKind[];
  // None may pass through a normal opening.
  refuse: readonly TetrominoKind[];
  // The piece the row's gate sets; null for a row without one.
  gate: TetrominoKind | null;
}

export interface ComposedRow {
  vehicles: Row;
  gates: Gate[];
  opening: Opening;
  // The poses the row was built around, one per piece it must let through.
  answers: Frog[];
  // Every pose of those pieces that passes it through a normal opening, and
  // every pose of the gate's piece inside the gate: where the frog can be
  // once it is through.
  fits: Frog[];
}

function pick<T>(items: readonly T[], random: () => number): T {
  if (items.length === 0) throw new Error("Nothing to pick from");
  return items[Math.floor(random() * items.length)];
}

function weightedPick<T>(items: readonly T[], weight: (item: T) => number, random: () => number): T {
  const weights = items.map(weight);
  let left = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    left -= weights[i];
    if (left < 0) return items[i];
  }
  return items[items.length - 1];
}

const NEIGHBOURS: readonly Cell[] = [
  { col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 },
];

// Cells beside the answer's (inside the face) that it doesn't cover.
function besideAnswer(answer: readonly Cell[], face: Face): Set<string> {
  const covered = new Set(answer.map(cellKey));
  const beside = new Set<string>();
  for (const cell of answer) {
    for (const n of NEIGHBOURS) {
      const next = { col: cell.col + n.col, row: cell.row + n.row };
      const inside = next.col >= 0 && next.col < face.cols && next.row >= 0 && next.row < face.rows;
      if (inside && !covered.has(cellKey(next))) beside.add(cellKey(next));
    }
  }
  return beside;
}

interface RoadPlacement {
  placed: RowVehicle;
  lanes: number[];
  cells: string[];
}

// Every vehicle at every lane where it stays on the road, with the lanes it
// takes and the keys of its cells, worked out once per road width.
const ROAD_PLACEMENTS = new Map<number, RoadPlacement[]>();

function roadPlacements(face: Face): RoadPlacement[] {
  const cached = ROAD_PLACEMENTS.get(face.cols);
  if (cached !== undefined) return cached;
  const computed = VEHICLE_IDS.flatMap((id) =>
    Array.from({ length: face.cols - vehicleWidth(id) + 1 }, (_, lane) => {
      const placed = { id, lane };
      return { placed, lanes: lanesOf(placed), cells: vehicleCellsAt(placed).map(cellKey) };
    }),
  );
  ROAD_PLACEMENTS.set(face.cols, computed);
  return computed;
}

// Fills the lanes one vehicle at a time, never over the answers' cells and
// never in a lane already taken or kept open for a gate, until nothing fits
// or the row stops.
function fillLanes(answers: readonly Frog[], gateLaneSet: ReadonlySet<number>, rule: DifficultyRule, face: Face, random: () => number): RowVehicle[] {
  const answerCells = answers.flatMap(frogCells);
  const kept = new Set(answerCells.map(cellKey));
  const beside = besideAnswer(answerCells, face);
  // Every placement clear of the answers, with how strongly it is preferred.
  const clear = roadPlacements(face).flatMap(({ placed, lanes, cells }) => {
    if (cells.some((c) => kept.has(c))) return [];
    const hugs = cells.filter((c) => beside.has(c)).length;
    return [{ placed, lanes, weight: Math.exp(rule.hug * hugs) }];
  });
  const takenLanes = new Set(gateLaneSet);
  const row: RowVehicle[] = [];
  for (;;) {
    const options = clear.filter((option) => option.lanes.every((lane) => !takenLanes.has(lane)));
    if (options.length === 0) return row;
    const { placed, lanes } = weightedPick(options, (o) => o.weight, random);
    row.push(placed);
    lanes.forEach((lane) => takenLanes.add(lane));
    if (random() < rule.stop) return row;
  }
}

// A gate for `kind` in lanes the seed picks, anywhere across the road.
function placeGate(kind: TetrominoKind, face: Face, random: () => number): Gate {
  return { lane: Math.floor(random() * (face.cols - GATE_WIDTH + 1)), kind };
}

// The ways through an opening that keep the frog's piece: every passing
// pose not entirely inside one of the row's gates.
export function normalFits(kind: TetrominoKind, face: Face, opening: Opening, gates: readonly Gate[]): Frog[] {
  return passingIn(kind, face, new Set(opening.map(cellKey))).filter((p) => gates.every((gate) => !insideGate(frogCells(p), gate)));
}

// One row of traffic that every piece in `pieces.pass` passes through a
// normal opening and no piece in `pieces.refuse` does, with a gate for
// `pieces.gate` when it names one. `before` is where the frog could stand
// after the previous row; a hard row lets none of those through. Null if no
// acceptable row turns up: the vehicles can't build what the difficulty asks
// of those pieces, or can rarely.
export function findRow(
  pieces: RowPieces,
  difficulty: Difficulty,
  face: Face,
  before: readonly Frog[],
  random: () => number,
): ComposedRow | null {
  const rule = DIFFICULTIES[difficulty];
  const forbidden = new Set(rule.demandChange ? before.map(placementKey) : []);
  const [fewest, most] = rule.fits;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const gates = pieces.gate === null ? [] : [placeGate(pieces.gate, face, random)];
    const gateLaneSet = new Set(
      gates.flatMap((gate) => {
        const { first, last } = gateLanes(gate);
        return Array.from({ length: last - first + 1 }, (_, i) => first + i);
      }),
    );
    const hop: HopHeight = random() < rule.hopChance ? 1 : 0;
    // A gate can leave a piece no pose at that height beside it, such as a
    // raised I beside a gate in the middle of the road.
    const candidates = pieces.pass.map((kind) =>
      poses(kind, face).filter((p) => p.hop === hop && frogCells(p).every((cell) => !gateLaneSet.has(cell.col))),
    );
    if (candidates.some((each) => each.length === 0)) continue;
    const answers = candidates.map((each) => pick(each, random));
    const vehicles = fillLanes(answers, gateLaneSet, rule, face, random);
    const opening = rowOpening(vehicles, face.cols, face.rows, gates);
    const passing = pieces.pass.map((kind) => normalFits(kind, face, opening, gates));
    if (passing.some((each) => each.length < fewest || each.length > most)) continue;
    const all = passing.flat();
    // A raised answer must need its hop, or the row doesn't read as raised.
    if (hop === 1 && all.some((p) => p.hop === 0)) continue;
    if (all.some((p) => forbidden.has(placementKey(p)))) continue;
    if (pieces.refuse.some((kind) => normalFits(kind, face, opening, gates).length > 0)) continue;
    const open = new Set(opening.map(cellKey));
    const transformed = gates.flatMap((gate) => passingIn(gate.kind, face, open).filter((p) => insideGate(frogCells(p), gate)));
    return { vehicles, gates, opening, answers, fits: [...all, ...transformed] };
  }
  return null;
}
