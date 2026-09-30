import { cellKey, frogCells, frogPasses, pieceCells, pieceSize } from "./logic";
import { shapeKey, VEHICLE_IDS } from "./fleet";
import { lanesOf, rowOpening, vehicleCellsAt, vehicleWidth, type Row, type RowVehicle } from "./traffic";
import type { Cell, Frog, HopHeight, Opening, Rotation, TetrominoKind } from "./types";

// Composes rows of traffic answer-first: pick the pose the row is for, fill
// the lanes with vehicles that keep that pose's cells open, count how many
// poses the result lets through, and keep it only if that count suits the
// difficulty. Every row is passable because its answer is.

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

// The poses that pass an opening.
export function fits(kind: TetrominoKind, face: Face, opening: Opening): Frog[] {
  return poses(kind, face).filter((frog) => frogPasses(frog, opening));
}

// Where the frog stands, ignoring height: what a hard row forbids repeating.
function placementKey(frog: Frog): string {
  return `${String(frog.rotation)},${String(frog.col)}`;
}

export interface ComposedRow {
  vehicles: Row;
  opening: Opening;
  // The pose the row was built around.
  answer: Frog;
  // Every pose that passes it.
  fits: Frog[];
}

function pick<T>(items: readonly T[], random: () => number): T {
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

// Every vehicle at every lane where it stays on the road.
function roadPlacements(face: Face): RowVehicle[] {
  return VEHICLE_IDS.flatMap((id) => Array.from({ length: face.cols - vehicleWidth(id) + 1 }, (_, lane) => ({ id, lane })));
}

// Fills the lanes one vehicle at a time, never over the answer's cells and
// never in a lane already taken, until nothing fits or the row stops.
function fillLanes(answer: Frog, rule: DifficultyRule, face: Face, random: () => number): RowVehicle[] {
  const answerCells = frogCells(answer);
  const kept = new Set(answerCells.map(cellKey));
  const beside = besideAnswer(answerCells, face);
  const hugs = (placed: RowVehicle): number => vehicleCellsAt(placed).filter((c) => beside.has(cellKey(c))).length;
  const takenLanes = new Set<number>();
  const row: RowVehicle[] = [];
  for (;;) {
    const options = roadPlacements(face).filter(
      (placed) =>
        lanesOf(placed).every((lane) => !takenLanes.has(lane)) &&
        vehicleCellsAt(placed).every((c) => !kept.has(cellKey(c))),
    );
    if (options.length === 0) return row;
    const placed = weightedPick(options, (o) => Math.exp(rule.hug * hugs(o)), random);
    row.push(placed);
    lanesOf(placed).forEach((lane) => takenLanes.add(lane));
    if (random() < rule.stop) return row;
  }
}

// One row of traffic for the frog's piece. `before` is where the frog could
// stand after the previous row; a hard row lets none of those through. Throws
// if no acceptable row turns up, which would mean the difficulty asks for
// something the vehicles can't build.
export function composeRow(
  kind: TetrominoKind,
  difficulty: Difficulty,
  face: Face,
  before: readonly Frog[],
  random: () => number,
): ComposedRow {
  const rule = DIFFICULTIES[difficulty];
  const forbidden = new Set(rule.demandChange ? before.map(placementKey) : []);
  const allPoses = poses(kind, face);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const hop: HopHeight = random() < rule.hopChance ? 1 : 0;
    const answer = pick(
      allPoses.filter((p) => p.hop === hop),
      random,
    );
    const vehicles = fillLanes(answer, rule, face, random);
    const opening = rowOpening(vehicles, face.cols, face.rows);
    const passing = fits(kind, face, opening);
    const [fewest, most] = rule.fits;
    if (passing.length < fewest || passing.length > most) continue;
    // A raised answer must need its hop, or the row doesn't read as raised.
    if (hop === 1 && passing.some((p) => p.hop === 0)) continue;
    if (passing.some((p) => forbidden.has(placementKey(p)))) continue;
    return { vehicles, opening, answer, fits: passing };
  }
  throw new Error(`No ${difficulty} row for a ${kind} in ${String(MAX_ATTEMPTS)} attempts`);
}

