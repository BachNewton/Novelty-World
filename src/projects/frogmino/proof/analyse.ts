import type { DesignedCourse, Pose } from "../coop-courses/design";
import { fitsRow, startPlacements } from "../run";
import { frogCells, pieceShape } from "../logic";
import { rowSolids } from "../traffic";
import type { Cell, Rotation, Solid, TetrominoKind } from "../types";
import { standsOn } from "../team";
import { applyPoseAction, endSlot, planShape, poseCode, type PlanFrog, type PoseAction, type StackMove, type TeamPose } from "./team-plan";

// How hard a row is for a team, and how much it needs both frogs, read off
// the planner's pose space (`team-plan.ts`): every team pose the team can
// reach between rows, counted once per shape. A frog up counts once, however
// much of its airtime is left. Poses the team can't reach don't count, so
// neither does an answer that needs the frogs to pass through each other.
//
// For a co-op row, beside the pose count:
//
// - **Coupling** says how far the frogs' ways through depend on each other,
//   side by side. A frog's solo passes are the poses it passes the row in
//   alone, its partner absent: on the road, or up a hop. For a lane line
//   across the road, the free pairings are every solo pass of Sprout's
//   wholly left of the line with every one of Splash's wholly right of it:
//   ways each frog can choose without looking at the other. The row's side
//   by side passes are its team passes with neither frog standing on the
//   other and each no higher than its own hop lifts it, so each frog in a
//   place it could take alone; the rest are stacked: a frog on its partner,
//   or higher than its own hop reaches. The side by side passes are in order, with Sprout's
//   leftmost lane no further right than Splash's, or crossed. A line's
//   coupling is the share of the in-order side by side passes and free
//   pairings together that aren't free pairings passing as a team; the
//   row's is its best line's. 0 is parallel solo: a line splits the road so
//   that each frog picks any of its own ways and the team passes, and
//   nothing else passes side by side. 1: every way through side by side has
//   the frogs sharing a lane, or there is none and only a stack passes.
//   Stacked ways are left out because stacks share lanes and vastly
//   outnumber the ways side by side whenever the pieces can stack, so they
//   would read every row fully coupled; the stacked count and the
//   coordination kinds (perch, stack, double jump, carry) say what a row
//   asks of a stack.
// - **Selfish decoys:** a frog's solo passes with which the team has no way
//   through: the frog fits, but its partner then fits nowhere.
// - **Coordination kinds** of a pose the team passes in, from the pose it
//   started the row in: a perch (a frog standing on its partner one cell
//   up, where a hop off the road leaves it), a stack (a frog standing on its
//   partner higher than that), both up (every frog up and none on a
//   partner, so the hops must be timed together), an interlock (the frogs'
//   cells touching side to side or top to bottom), order (a frog can't
//   reach its place while its partner stays where it started: the partner
//   must move first) and crossing (the frogs swap sides). Beside those, the
//   stacking moves the pose needs: a carry, a hop off or a double jump (see
//   `team-plan.ts`) is needed when the team can't reach the pose at all
//   without one. A route adds every stacking move its steps made, and a
//   perch or a stack wherever one stood along the way (see `report.ts`).
//
// Why the pairings test against the frogs alone rather than each frog's own
// side: alone, each frog can reach every shape on the road, and the team can
// reach every pair of shapes that don't overlap, so the team's passes are
// exactly the non-overlapping pairs of solo passes. What a row asks of the
// pair is how those choices collide, and a line between the frogs is what
// lets each choose on its own.

const ACTIONS: readonly PoseAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop"];

// The first rotation of a piece that covers the same cells as `rotation`:
// an O's turns are all one shape, and an I's half turn is the same as none.
function firstSameShape(kind: TetrominoKind, rotation: Rotation): Rotation {
  const cells = pieceShape(kind, rotation);
  const same = (other: readonly Cell[]): boolean => other.every((cell) => cells.some((c) => c.col === cell.col && c.row === cell.row));
  return ROTATIONS.find((r) => same(pieceShape(kind, r))) ?? rotation;
}

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const KINDS: readonly TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
// Worked out once: the reachable search asks it for every pose it meets.
const SAME_SHAPE = new Map(KINDS.flatMap((kind) => ROTATIONS.map((rotation) => [`${kind}${String(rotation)}`, firstSameShape(kind, rotation)] as const)));

function sameShape(kind: TetrominoKind, rotation: Rotation): Rotation {
  return SAME_SHAPE.get(`${kind}${String(rotation)}`) ?? rotation;
}

// A team pose by the cells each frog covers, so turns that look the same
// count once: a frog's cells are its piece's shape where it stands, so its
// pose with the first rotation of the same shape and no airtime.
function shapeKey(pose: TeamPose): number {
  return poseCode(
    pose.map((frog) => ({ ...frog, rotation: sameShape(frog.kind, frog.rotation), air: 0 })),
    0,
  );
}

function stateKey(pose: TeamPose): number {
  return poseCode(pose, Infinity);
}

// Every distinct team pose a row arriving in some slot could judge, reachable
// from `start` by the planner's moves of the `players` who act (all of them
// unless told; the others hold still, though their hops still land), without
// the `refused` stacking moves. Between
// rows nothing but the road's edges and the partners is in the way, so it is
// the same for every row.
export function reachablePoses(
  start: TeamPose,
  lanes: number,
  airSlots: number,
  players: readonly number[] = start.map((_, i) => i),
  refused: readonly StackMove[] = [],
): TeamPose[] {
  const poses = new Map<number, TeamPose>([[shapeKey(start), start]]);
  const seen = new Set([stateKey(start)]);
  const queue: TeamPose[] = [start];
  for (let pose = queue.pop(); pose !== undefined; pose = queue.pop()) {
    const from = pose;
    const acted = players.flatMap((player) => ACTIONS.map((action) => applyPoseAction(from, lanes, player, action, airSlots, refused)));
    // A refused action is a wait.
    for (const next of [from, ...acted.filter((next) => next !== from)]) {
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
export function passingPoses(reachable: readonly TeamPose[], solids: readonly Solid[]): TeamPose[] {
  return reachable.filter((pose) => pose.every((frog) => fitsRow(planShape(frog), solids)));
}

// The team as a course starts it: each frog aboard the helicopter, as on the road.
export function startPose(kinds: DesignedCourse["kinds"], lanes: number): TeamPose {
  return startPlacements(kinds, lanes).map((placement, i) => ({ kind: kinds[i], ...placement, height: 0, air: 0 }));
}

// The team in a designed answer, each frog at its answer's height.
export function answerPose(kinds: DesignedCourse["kinds"], answer: readonly Pose[]): TeamPose {
  return answer.map((pose, i) => ({ kind: kinds[i], col: pose.col, rotation: pose.rotation, height: pose.height, air: 0 }));
}

// The team once a row has gone by and every hop's airtime is over: each frog
// with nothing under it falls to its support.
export function settledPose(pose: TeamPose): TeamPose {
  return endSlot(pose.map((frog) => ({ ...frog, air: 0 })));
}

// Each frog's shapes alone on the road, its partners absent, from where it
// starts.
export function soloReachable(start: TeamPose, lanes: number, airSlots: number): PlanFrog[][] {
  return start.map((frog) => reachablePoses([frog], lanes, airSlots).map((pose) => pose[0]));
}

function frogKey(frog: PlanFrog): number {
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
  // Team passes side by side: in order, Sprout no further right than
  // Splash, and crossed.
  inOrder: number;
  crossed: number;
  // Team passes with a frog standing on its partner, or higher than its
  // own hop lifts it.
  stacked: number;
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

function teamKey(pose: TeamPose): number {
  return shapeKey(pose);
}

// How high a frog's own hop lifts it off the road.
const SOLO_HEIGHT = 1;

// Whether each frog of a pose is where it could be alone: standing on no
// partner, and no higher than its own hop lifts it.
function apart(pose: TeamPose): boolean {
  return pose.every((frog, player) => frog.height <= SOLO_HEIGHT && !pose.some((other, i) => i !== player && standsOn(planShape(frog), planShape(other))));
}

// Coupling and decoys for a co-op row of two frogs, from the team's
// reachable poses and each frog's solo shapes (see the top of this file).
export function rowCoupling(reachable: readonly TeamPose[], solo: readonly (readonly PlanFrog[])[], solids: readonly Solid[], lanes: number): RowCoupling {
  if (solo.length !== 2) throw new Error(`Coupling is for a pair of frogs, not ${String(solo.length)}`);
  const passes = passingPoses(reachable, solids);
  const team = new Set(passes.map(teamKey));
  const sideBySide = passes.filter(apart);
  const inOrder = sideBySide.filter((pose) => laneSpan(pose[0]).first <= laneSpan(pose[1]).first).length;
  const own = solo.map((shapes) => shapes.filter((frog) => fitsRow(planShape(frog), solids)));
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
  return {
    inOrder,
    crossed: sideBySide.length - inOrder,
    stacked: passes.length - sideBySide.length,
    solo: own.map((shapes) => shapes.length),
    line,
    coupling,
    label,
    decoys,
  };
}

// Every coordination kind, in the order a report lists them.
export const COORDINATION_KINDS = ["perch", "stack", "carry", "hop off", "double jump", "both up", "interlock", "order", "crossing"] as const;
export type CoordinationKind = (typeof COORDINATION_KINDS)[number];

const STACK_MOVES: readonly StackMove[] = ["carry", "hop off", "double jump"];

function touches(a: readonly Cell[], b: readonly Cell[]): boolean {
  return a.some((p) => b.some((q) => Math.abs(p.col - q.col) + Math.abs(p.row - q.row) === 1));
}

// What a frog up off the road and standing on its partner makes of the pose:
// a perch one cell up, where a hop off the road leaves it, and a stack any
// higher, which only stacking reaches; null for a frog on the road or not
// standing on its partner.
function standing(pose: TeamPose, player: number): "perch" | "stack" | null {
  const frog = pose[player];
  if (frog.height === 0 || !pose.some((other, i) => i !== player && standsOn(frog, other))) return null;
  return frog.height === 1 ? "perch" : "stack";
}

// The kinds a pose shows on its own: a perch and a stack.
export function poseKinds(pose: TeamPose): CoordinationKind[] {
  const shown: CoordinationKind[] = pose.flatMap((_, player) => standing(pose, player) ?? []);
  return COORDINATION_KINDS.filter((kind) => shown.includes(kind));
}

// What the team reaches without each stacking move, by shape, to tell which
// moves a pose needs.
export type ReachWithout = ReadonlyMap<StackMove, ReadonlySet<number>>;

export function reachWithout(start: TeamPose, lanes: number, airSlots: number): ReachWithout {
  const players = start.map((_, i) => i);
  return new Map(STACK_MOVES.map((move) => [move, new Set(reachablePoses(start, lanes, airSlots, players, [move]).map(teamKey))]));
}

// The stacking moves without which the team can't reach a pose at all.
export function movesNeeded(pose: TeamPose, without: ReachWithout): StackMove[] {
  const key = teamKey(pose);
  return STACK_MOVES.filter((move) => without.get(move)?.has(key) === false);
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
// pose they pass a row in, with the stacking moves `end` needs (see the top
// of this file).
export function coordinationKinds(start: TeamPose, end: TeamPose, lanes: number, airSlots: number, needed: readonly StackMove[] = []): CoordinationKind[] {
  if (end.length !== 2) throw new Error(`Coordination is for a pair of frogs, not ${String(end.length)}`);
  const kinds: CoordinationKind[] = [...poseKinds(end), ...needed];
  const onPartner = end.some((_, player) => standing(end, player) !== null);
  if (!onPartner && end.every((frog) => frog.height > 0)) kinds.push("both up");
  if (touches(cellsOf(end[0]), cellsOf(end[1]))) kinds.push("interlock");
  const needsPartner = end.some((frog, player) => {
    const target = frogKey(frog);
    return !reachablePoses(start, lanes, airSlots, [player]).some((pose) => frogKey(pose[player]) === target);
  });
  if (needsPartner) kinds.push("order");
  if (sides(start) * sides(end) === -1) kinds.push("crossing");
  return COORDINATION_KINDS.filter((kind) => kinds.includes(kind));
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

// The rows of a designed course whose answer the team can't reach, by
// index: the cheap part of the analysis, for the course checks' tests.
export function unreachableAnswers(course: DesignedCourse, airSlots: number): number[] {
  const reachable = new Set(reachablePoses(startPose(course.kinds, course.lanes), course.lanes, airSlots).map(teamKey));
  return course.rows.flatMap((row, index) => (reachable.has(teamKey(answerPose(course.kinds, row.answer))) ? [] : [index]));
}

// Every row of a designed co-op course, analysed from its data alone.
export function analyseCoopCourse(course: DesignedCourse, airSlots: number): RowAnalysis[] {
  const start = startPose(course.kinds, course.lanes);
  const reachable = reachablePoses(start, course.lanes, airSlots);
  const reachableKeys = new Set(reachable.map(teamKey));
  const solo = soloReachable(start, course.lanes, airSlots);
  const without = reachWithout(start, course.lanes, airSlots);
  let before = start;
  return course.rows.map((row, index) => {
    const solids = rowSolids(row.vehicles);
    const end = answerPose(course.kinds, row.answer);
    const analysis: RowAnalysis = {
      index,
      lesson: row.lesson,
      gap: row.gap,
      passes: passingPoses(reachable, solids).length,
      coupling: rowCoupling(reachable, solo, solids, course.lanes),
      answer: coordinationKinds(before, end, course.lanes, airSlots, movesNeeded(end, without)),
      answerReachable: reachableKeys.has(teamKey(end)),
    };
    before = settledPose(end);
    return analysis;
  });
}
