import type { DesignedCourse, Pose } from "../coop-courses/design";
import { fitsRow, startPlacements } from "../run";
import { cellKey, frogCells } from "../logic";
import { rowSolids } from "../traffic";
import type { Tuning } from "../tuning";
import type { Cell, Solid } from "../types";
import { applyPoseAction, endSlot, planShape, type PlanFrog, type PoseAction, type TeamPose } from "./team-plan";

// How hard a row is for a team, and how much it needs both frogs, read off
// the planner's pose space (`team-plan.ts`): every team pose the team can
// reach between rows, counted once per shape. A frog up counts once, however
// much of its airtime is left. Poses the team can't reach don't count, so
// neither does an answer that needs the frogs to pass through each other.
//
// For a co-op row, beside the pose count:
//
// - **Coupling** says how far the frogs' ways through depend on each other.
//   A frog's solo passes are the poses it passes the row in alone, its
//   partner absent. For a lane line across the road, the free pairings are
//   every solo pass of Sprout's wholly left of the line with every one of
//   Splash's wholly right of it: ways each frog can choose without looking at
//   the other. The row's in-order passes are its team passes with Sprout's
//   leftmost lane no further right than Splash's (the rest have the frogs
//   swapped, and count as crossed). A line's coupling is the share of the
//   in-order passes and free pairings together that aren't free pairings
//   passing as a team; the row's is its best line's. 0 is parallel solo: a
//   line splits the road so that each frog picks any of its own ways and the
//   team passes, and nothing else passes. 1: every way through has the frogs
//   sharing a lane, so where one goes decides where the other can.
// - **Selfish decoys:** a frog's solo passes with which the team has no way
//   through: the frog fits, but its partner then fits nowhere.
// - **Coordination kinds** of a pose the team passes in, from the pose it
//   started the row in: a perch (a frog up with a cell right above one of
//   its partner's, standing on it once its hop runs out), both up (every frog
//   up and none on a partner, so the hops must be timed together), an
//   interlock (the frogs' cells touching side to side or top to bottom),
//   order (a frog can't reach its place while its partner stays where it
//   started: the partner must move first) and crossing (the frogs swap
//   sides).
//
// Why the pairings test against the frogs alone rather than each frog's own
// side: alone, each frog can reach every shape on the road, and the team can
// reach every pair of shapes that don't overlap, so the team's passes are
// exactly the non-overlapping pairs of solo passes. What a row asks of the
// pair is how those choices collide, and a line between the frogs is what
// lets each choose on its own.

const ACTIONS: readonly PoseAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop"];

// A team pose by the cells each frog covers, so turns that look the same (an
// O's, or an I's half turn) count once.
function shapeKey(pose: TeamPose): string {
  return pose
    .map((frog) =>
      frogCells(planShape(frog))
        .map(cellKey)
        .sort()
        .join(" "),
    )
    .join("|");
}

function stateKey(pose: TeamPose): string {
  return pose.map((f) => `${String(f.col)}.${String(f.rotation)}.${f.air === null ? "-" : String(f.air)}`).join("|");
}

// Every distinct team pose a row arriving in some slot could judge, reachable
// from `start` by the planner's moves of the `players` who act (all of them
// unless told; the others hold still, though their hops still land). Between
// rows nothing but the road's edges and the partners is in the way, so it is
// the same for every row.
export function reachablePoses(start: TeamPose, lanes: number, airSlots: number, players: readonly number[] = start.map((_, i) => i)): TeamPose[] {
  const poses = new Map<string, TeamPose>([[shapeKey(start), start]]);
  const seen = new Set([stateKey(start)]);
  const queue: TeamPose[] = [start];
  for (let pose = queue.pop(); pose !== undefined; pose = queue.pop()) {
    const from = pose;
    const nexts = [from, ...players.flatMap((player) => ACTIONS.map((action) => applyPoseAction(from, lanes, player, action, airSlots)))];
    for (const next of nexts) {
      const key = shapeKey(next);
      if (!poses.has(key)) poses.set(key, next);
      const after = endSlot(next);
      const state = stateKey(after);
      if (seen.has(state)) continue;
      seen.add(state);
      queue.push(after);
    }
  }
  return [...poses.values()];
}

// The reachable poses that pass a row of `solids`.
export function passingPoses(reachable: readonly TeamPose[], solids: readonly Solid[], wallRows: number): TeamPose[] {
  return reachable.filter((pose) => pose.every((frog) => fitsRow(planShape(frog), solids, wallRows)));
}

// The team as a course starts it: each frog on the overpass, on the road.
export function startPose(kinds: DesignedCourse["kinds"], lanes: number): TeamPose {
  return startPlacements(kinds, lanes).map((placement, i) => ({ kind: kinds[i], ...placement, air: null }));
}

// The team in a designed answer, each frog up whose answer hops.
export function answerPose(kinds: DesignedCourse["kinds"], answer: readonly Pose[]): TeamPose {
  return answer.map((pose, i) => ({ kind: kinds[i], col: pose.col, rotation: pose.rotation, air: pose.hop === 1 ? 0 : null }));
}

// The team once a row has gone by and every hop's airtime is over: each frog
// up lands, unless it stands on a partner.
export function settledPose(pose: TeamPose): TeamPose {
  return endSlot(pose.map((frog) => (frog.air === null ? frog : { ...frog, air: 0 })));
}

// Each frog's shapes alone on the road, its partners absent, from where it
// starts.
export function soloReachable(start: TeamPose, lanes: number, airSlots: number): PlanFrog[][] {
  return start.map((frog) => reachablePoses([frog], lanes, airSlots).map((pose) => pose[0]));
}

function frogKey(frog: PlanFrog): string {
  return shapeKey([frog]);
}

function cellsOf(frog: PlanFrog): Cell[] {
  return frogCells(planShape(frog));
}

function laneSpan(frog: PlanFrog): { first: number; last: number } {
  const cols = cellsOf(frog).map((cell) => cell.col);
  return { first: Math.min(...cols), last: Math.max(...cols) };
}

export type CouplingLabel = "parallel solo" | "partly coupled" | "fully coupled";

// Where the labels split the coupling: judgement, not measurement, so a
// designer reads the number too.
const PARALLEL_BELOW = 0.2;
const FULLY_FROM = 0.8;

export interface RowCoupling {
  // Team passes: in order, Sprout no further right than Splash, and crossed.
  inOrder: number;
  crossed: number;
  // Each frog's solo passes.
  solo: readonly number[];
  // The lane line the coupling is read at (the left edge of lane `line`),
  // with the solo passes wholly on each side of it, and how many of their
  // pairings pass as a team; null on a road with no line to read.
  line: { at: number; left: number; right: number; free: number } | null;
  coupling: number;
  label: CouplingLabel;
  // Each frog's selfish decoys.
  decoys: readonly number[];
}

function teamKey(pose: TeamPose): string {
  return shapeKey(pose);
}

// Coupling and decoys for a co-op row of two frogs, from the team's
// reachable poses and each frog's solo shapes (see the top of this file).
export function rowCoupling(
  reachable: readonly TeamPose[],
  solo: readonly (readonly PlanFrog[])[],
  solids: readonly Solid[],
  lanes: number,
  wallRows: number,
): RowCoupling {
  if (solo.length !== 2) throw new Error(`Coupling is for a pair of frogs, not ${String(solo.length)}`);
  const passes = passingPoses(reachable, solids, wallRows);
  const team = new Set(passes.map(teamKey));
  const inOrder = passes.filter((pose) => laneSpan(pose[0]).first <= laneSpan(pose[1]).first).length;
  const own = solo.map((shapes) => shapes.filter((frog) => fitsRow(planShape(frog), solids, wallRows)));
  const [sprout, splash] = own;

  let line: RowCoupling["line"] = null;
  let coupling = 1;
  for (let at = 1; at < lanes; at++) {
    const left = sprout.filter((frog) => laneSpan(frog).last < at);
    const right = splash.filter((frog) => laneSpan(frog).first >= at);
    let free = 0;
    for (const a of left) for (const b of right) if (team.has(teamKey([a, b]))) free++;
    const ways = inOrder + left.length * right.length - free;
    const here = ways === 0 ? 1 : 1 - free / ways;
    if (line === null || here < coupling) {
      line = { at, left: left.length, right: right.length, free };
      coupling = here;
    }
  }

  const usedBy = [0, 1].map((player) => new Set(passes.map((pose) => frogKey(pose[player]))));
  const decoys = own.map((shapes, player) => shapes.filter((frog) => !usedBy[player].has(frogKey(frog))).length);
  const label: CouplingLabel =
    coupling >= FULLY_FROM ? "fully coupled" : coupling < PARALLEL_BELOW && decoys.every((d) => d === 0) ? "parallel solo" : "partly coupled";
  return { inOrder, crossed: passes.length - inOrder, solo: own.map((shapes) => shapes.length), line, coupling, label, decoys };
}

export type CoordinationKind = "perch" | "both up" | "interlock" | "order" | "crossing";

function touches(a: readonly Cell[], b: readonly Cell[]): boolean {
  return a.some((p) => b.some((q) => Math.abs(p.col - q.col) + Math.abs(p.row - q.row) === 1));
}

// Whether a frog up has a cell right above one of a partner's.
function standsOnPartner(pose: TeamPose, player: number): boolean {
  const frog = pose[player];
  if (frog.air === null) return false;
  const under = new Set(cellsOf(frog).map((cell) => cellKey({ col: cell.col, row: cell.row - 1 })));
  return pose.some((other, i) => i !== player && cellsOf(other).some((cell) => under.has(cellKey(cell))));
}

// Which side of each other the frogs are on: -1 with Sprout left, 1 with
// Sprout right, 0 when neither is.
function sides(pose: TeamPose): number {
  const [a, b] = pose.map(laneSpan);
  if (a.first < b.first && a.last < b.last) return -1;
  if (a.first > b.first && a.last > b.last) return 1;
  return 0;
}

// The coordination a pair of frogs needs to go from `start` to `end`, the
// pose they pass a row in (see the top of this file).
export function coordinationKinds(start: TeamPose, end: TeamPose, lanes: number, airSlots: number): CoordinationKind[] {
  if (end.length !== 2) throw new Error(`Coordination is for a pair of frogs, not ${String(end.length)}`);
  const kinds: CoordinationKind[] = [];
  const perched = end.some((_, player) => standsOnPartner(end, player));
  if (perched) kinds.push("perch");
  if (!perched && end.every((frog) => frog.air !== null)) kinds.push("both up");
  if (touches(cellsOf(end[0]), cellsOf(end[1]))) kinds.push("interlock");
  const needsPartner = end.some((frog, player) => {
    const target = frogKey(frog);
    return !reachablePoses(start, lanes, airSlots, [player]).some((pose) => frogKey(pose[player]) === target);
  });
  if (needsPartner) kinds.push("order");
  if (sides(start) * sides(end) === -1) kinds.push("crossing");
  return kinds;
}

export interface RowAnalysis {
  index: number;
  lesson: string;
  gap: number;
  // Every team pass, counted once per shape.
  passes: number;
  coupling: RowCoupling;
  // The designed answer's coordination, from the team in the previous row's
  // answer (the course's start, for the first row), every hop landed.
  answer: CoordinationKind[];
  // Whether the team can reach the designed answer at all.
  answerReachable: boolean;
}

// Every row of a designed co-op course, analysed from its data alone.
export function analyseCoopCourse(course: DesignedCourse, tuning: Tuning, airSlots: number): RowAnalysis[] {
  const start = startPose(course.kinds, course.lanes);
  const reachable = reachablePoses(start, course.lanes, airSlots);
  const reachableKeys = new Set(reachable.map(teamKey));
  const solo = soloReachable(start, course.lanes, airSlots);
  let before = start;
  return course.rows.map((row, index) => {
    const solids = rowSolids(row.vehicles);
    const end = answerPose(course.kinds, row.answer);
    const analysis: RowAnalysis = {
      index,
      lesson: row.lesson,
      gap: row.gap,
      passes: passingPoses(reachable, solids, tuning.wallRows).length,
      coupling: rowCoupling(reachable, solo, solids, course.lanes, tuning.wallRows),
      answer: coordinationKinds(before, end, course.lanes, airSlots),
      answerReachable: reachableKeys.has(teamKey(end)),
    };
    before = settledPose(end);
    return analysis;
  });
}
