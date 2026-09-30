import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { wallShift, type CourseWall } from "./course";
import { cellKey, firstFit, frogCells, insideLanes, pieceSize, rotateInCorridor, type Placement } from "./logic";
import { pullOffLanes, withinStretch, type PullOff } from "./pull-off";
import { rowBack } from "./traffic";
import type { Frog, HopHeight, Lanes, Rotation, Solid, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state changes the instant an action is applied, the walls'
// depths are continuous, and `advance` moves time on.
//
// Depth is measured forward from the course's start, at depth 0, and the
// road runs on forever both ways. A wall is a row of vehicles whose fronts
// line up: its depth is that front, the face coming at the frog, and each
// vehicle fills from there back along the course its own length. The frog's
// depth is its front face, and it fills from there toward the start. A
// vehicle overlaps the frog while their depth ranges intersect: from when the
// row's front reaches the frog's front until the vehicle's own back goes by
// the frog's back. The row is judged once, as its front arrives, against all
// its vehicles; after that each vehicle is solid only while it overlaps the
// frog, so a shorter vehicle frees its lanes while a longer one still
// overlaps, and the opening only grows.
//
// Every wall the frog hasn't passed is ahead of it, and every wall it has
// passed is behind it. Each rule below keeps that true, so a wall is judged
// exactly once each time it reaches the frog. And the frog's cells are
// always inside the opening left by the vehicles overlapping it: an action
// that would break that is refused. A frog that is up while a vehicle
// overlaps it rides: it stays up until the last one has gone by.
//
// The frog starts out of play on the overpass above the start, and drops to
// the road with its first jump forward; there is no way back up. It is out
// of play again once it crosses the finish line, when it leaps up onto the
// finish gantry. Out of play, no row touches it: the traffic goes by beneath.
//
// Lanes run across the road from 0, and the walls fill the traffic lanes. A
// pull-off's lanes lie beyond them, and the frog may use them only while its
// depth range lies within the pull-off's stretch. No wall ever reaches into a
// pull-off, so the frog's cells in pull-off lanes never meet one: every rule
// that judges the frog against a wall judges only its cells in traffic lanes.

// How deep the frog is along the course, in units. The scene draws it this
// deep too.
export const FROG_THICKNESS = 1;

export interface Wall {
  // The row's vehicles, their fronts all at `depth`.
  solids: readonly Solid[];
  // Falls as the wall comes at the frog.
  depth: number;
  // Whether the frog is past this wall's front face, so the wall is between
  // it and the start or still around it. A crossing sets it; a wall
  // reappearing ahead clears it.
  passed: boolean;
  // Which of the course's rows this is: the traffic repeats the course's
  // rows in order, as many times as it takes to reach the traffic horizon.
  row: number;
}

export interface Hop {
  startedAt: number;
  // When the frog came down, in run time; null while it is up.
  landedAt: number | null;
}

export interface RuleFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Moves a jump or a bonk at a time.
  depth: number;
  // The latest hop; null if the frog never hopped.
  latestHop: Hop | null;
}

export interface Bonk {
  time: number;
  // Where the frog met the wall that bonked it.
  depth: number;
}

export type JumpDirection = "forward" | "back";

// A jump key held down, which jumps again every repeat interval.
export interface HeldJump {
  direction: JumpDirection;
  // When the next repeat jump happens, in run time.
  nextAt: number;
}

export interface Run {
  tuning: Tuning;
  // Seconds of play so far.
  time: number;
  frog: RuleFrog;
  walls: Wall[];
  lastBonk: Bonk | null;
  // How many times the frog has passed a row.
  passes: number;
  heldJump: HeldJump | null;
  // When the frog dropped from the overpass to the road; null while it is
  // still up there.
  droppedAt: number | null;
  // When the frog crossed the finish line; null until it does.
  finishedAt: number | null;
  // The seeded stream that places walls reappearing ahead.
  rngState: number;
  // They never move; only the piece waiting in each changes.
  pullOffs: PullOff[];
}

export type FrogAction = "left" | "right" | "rotateCcw" | "rotateCw" | "hop" | "forward" | "back" | "swap";

// A bonked frog must leave the wall's face, or the wall would bonk it again
// at once, forever, and a held jump must wait between repeats. Rows must be
// spaced far enough apart, back to front, that a bonk never knocks the frog
// into a wall it has passed, which also means no two walls ever overlap the
// frog at once. A row is recycled only once it is behind the frog, and
// reappears ahead of it.
function checkTuning(tuning: Tuning): void {
  if (tuning.bonkKnockback <= 0) throw new Error("A bonk must knock the frog back");
  if (tuning.jumpRepeatInterval <= 0) throw new Error("A held jump must wait between repeats");
  const closestGap = tuning.wallSpacing - tuning.wallJitter;
  const bonkReach = tuning.bonkKnockback * tuning.depthStep + FROG_THICKNESS;
  if (closestGap < bonkReach) {
    throw new Error(`Rows as close as ${String(closestGap)} let a bonk reach ${String(bonkReach)} back into a passed row`);
  }
  if (tuning.recycleBehind < 0) throw new Error("A row must be behind the frog to be recycled");
  if (tuning.trafficHorizon <= 0) throw new Error("A recycled row must reappear ahead of the frog");
}

// A pull-off must hold the frog wherever a jump from outside its stretch
// lands, and hold its waiting piece in some pose.
function checkPullOff(pullOff: PullOff, tuning: Tuning): void {
  if (pullOff.far - pullOff.near < FROG_THICKNESS + tuning.depthStep) {
    throw new Error(`A pull-off ${String(pullOff.far - pullOff.near)} deep can be jumped over`);
  }
  if (firstFit(pullOff.waiting, pullOffLanes(pullOff, tuning.corridorCols)) === null) {
    throw new Error(`A ${pullOff.waiting} doesn't fit a pull-off ${String(pullOff.width)} lanes wide`);
  }
}

export interface RunOptions {
  // The piece the frog starts as; an L unless the course says otherwise.
  kind?: TetrominoKind;
  pullOffs?: readonly PullOff[];
}

// The course's rows where it puts them, then its rows again in order, each
// the spacing (with seeded jitter) beyond the back of the one before, until
// the traffic reaches the traffic horizon from the start. So a row recycled
// behind the frontmost one comes back out of sight.
function lineUpTraffic(course: readonly CourseWall[], tuning: Tuning, rng: Rng): Wall[] {
  const walls = course.map((wall, row): Wall => ({ solids: wall.solids, depth: wall.depth, passed: false, row }));
  if (walls.length === 0) return walls;
  let back = Math.max(...walls.map(rowBack));
  while (back < tuning.trafficHorizon) {
    const row = walls.length % course.length;
    const wall: Wall = { solids: course[row].solids, depth: back + tuning.wallSpacing + wallShift(tuning, rng.next), passed: false, row };
    walls.push(wall);
    back = rowBack(wall);
  }
  return walls;
}

export function createRun(course: readonly CourseWall[], tuning: Tuning, seed: number, options: RunOptions = {}): Run {
  checkTuning(tuning);
  const { kind = "L", pullOffs = [] } = options;
  for (const pullOff of pullOffs) checkPullOff(pullOff, tuning);
  const rng = createRng(seed);
  const walls = lineUpTraffic(course, tuning, rng);
  return {
    tuning,
    time: 0,
    frog: {
      kind,
      col: Math.floor((tuning.corridorCols - pieceSize(kind, 0).width) / 2),
      rotation: 0,
      depth: 0,
      latestHop: null,
    },
    walls,
    lastBonk: null,
    passes: 0,
    heldJump: null,
    droppedAt: null,
    finishedAt: null,
    rngState: rng.getState(),
    pullOffs: pullOffs.map((pullOff) => ({
      side: pullOff.side,
      near: pullOff.near,
      far: pullOff.far,
      width: pullOff.width,
      waiting: pullOff.waiting,
    })),
  };
}

// A hopping frog is one cell up until it lands.
export function hopHeight(frog: RuleFrog): HopHeight {
  return frog.latestHop !== null && frog.latestHop.landedAt === null ? 1 : 0;
}

// The frog as the wall face sees it.
export function frogShape(frog: RuleFrog): Frog {
  return { kind: frog.kind, col: frog.col, rotation: frog.rotation, hop: hopHeight(frog) };
}

// Whether the frog is still up on the overpass, before its drop.
export function onOverpass(run: Run): boolean {
  return run.droppedAt === null;
}

// Whether the frog has crossed the finish line. The rules stop there.
export function crossedFinish(run: Run): boolean {
  return run.finishedAt !== null;
}

// Whether the frog is on the road among the traffic: dropped from the
// overpass and not yet over the finish line.
export function inPlay(run: Run): boolean {
  return !onOverpass(run) && !crossedFinish(run);
}

// Whether the run is over: the frog has crossed the finish line and its leap
// onto the finish gantry has landed. The rules' clock runs on after the
// crossing, and the traffic with it.
export function isDone(run: Run): boolean {
  return run.finishedAt !== null && run.time >= run.finishedAt + run.tuning.finishLeapDuration;
}

// The wall the frog meets next: the nearest one it hasn't passed. Null only
// when every wall is behind it.
export function nextWall(run: Run): number | null {
  let next: number | null = null;
  run.walls.forEach((wall, i) => {
    if (wall.passed) return;
    if (next === null || wall.depth < run.walls[next].depth) next = i;
  });
  return next;
}

function inTraffic(run: Run, col: number): boolean {
  return col >= 0 && col < run.tuning.corridorCols;
}

// The lanes the frog may use with its front face at `depth`: the traffic
// lanes, widened by any pull-off whose stretch holds the frog's whole depth.
export function lanesAt(run: Run, depth: number): Lanes {
  let lanes: Lanes = { first: 0, last: run.tuning.corridorCols - 1 };
  for (const pullOff of run.pullOffs) {
    if (!withinStretch(pullOff, depth - FROG_THICKNESS, depth)) continue;
    const beside = pullOffLanes(pullOff, run.tuning.corridorCols);
    lanes = { first: Math.min(lanes.first, beside.first), last: Math.max(lanes.last, beside.last) };
  }
  return lanes;
}

// The pull-off the frog is entirely inside, its depth within the stretch and
// every cell in the pull-off's lanes; null if none.
export function pullOffHoldingFrog(run: Run): number | null {
  const { frog, tuning } = run;
  const index = run.pullOffs.findIndex(
    (pullOff) =>
      withinStretch(pullOff, frog.depth - FROG_THICKNESS, frog.depth) &&
      insideLanes(frog.kind, frog, pullOffLanes(pullOff, tuning.corridorCols)),
  );
  return index === -1 ? null : index;
}

// The pass test on the frog's cells in traffic lanes, against some of a
// row's vehicles: each cell on the row's face and in none of their cells.
// Its cells in a pull-off's lanes never meet a vehicle.
function fitsAmong(run: Run, shape: Frog, solids: readonly Solid[]): boolean {
  if (solids.length === 0) return true;
  const solid = new Set(solids.flatMap((s) => s.cells.map(cellKey)));
  return frogCells(shape).every(
    (cell) => !inTraffic(run, cell.col) || (cell.row < run.tuning.wallRows && !solid.has(cellKey(cell))),
  );
}

// The vehicles of a wall the frog has passed that still overlap it, with its
// front face at `frogDepth`: those whose back hasn't yet gone by its back.
export function overlappingSolids(wall: Wall, frogDepth: number): readonly Solid[] {
  if (!wall.passed) return [];
  return wall.solids.filter((solid) => wall.depth + solid.length > frogDepth - FROG_THICKNESS);
}

// Whether the frog could take this shape with its front face at `depth`:
// inside the opening the overlapping vehicles leave.
function clearOfWallsAt(run: Run, shape: Frog, depth: number): boolean {
  return run.walls.every((wall) => fitsAmong(run, shape, overlappingSolids(wall, depth)));
}

// Out of play, no vehicle touches the frog.
function clearOfWalls(run: Run, shape: Frog): boolean {
  return !inPlay(run) || clearOfWallsAt(run, shape, run.frog.depth);
}

function withFrog(run: Run, frog: Partial<RuleFrog>): Run {
  return { ...run, frog: { ...run.frog, ...frog } };
}

function withWall(run: Run, index: number, wall: Partial<Wall>): Run {
  return { ...run, walls: run.walls.map((w, i) => (i === index ? { ...w, ...wall } : w)) };
}

// The wall passes around the frog.
function pass(run: Run, index: number): Run {
  return { ...withWall(run, index, { passed: true }), passes: run.passes + 1 };
}

// The wall goes by beneath a frog out of play, unjudged.
function goBy(run: Run, index: number): Run {
  return withWall(run, index, { passed: true });
}

// The frog is knocked back from the wall's face, however far that takes it,
// and onto the road: a frog straddling a pull-off's edge is shifted sideways
// just far enough that every cell is in traffic lanes, since the knock-back
// can carry it past the pull-off's stretch. The wall stays solid and keeps
// coming, so it bonks the frog again when it arrives unless the frog fits by
// then or has got clear. A held jump key keeps repeating, a full repeat
// interval after the bonk.
function bonk(run: Run, index: number): Run {
  const { time, tuning, heldJump, frog } = run;
  const face = run.walls[index].depth;
  const depth = face - tuning.bonkKnockback * tuning.depthStep;
  const { width } = pieceSize(frog.kind, frog.rotation);
  const col = Math.min(Math.max(frog.col, 0), tuning.corridorCols - width);
  return {
    ...withFrog(run, { depth, col }),
    heldJump: heldJump === null ? null : { ...heldJump, nextAt: time + tuning.jumpRepeatInterval },
    lastBonk: { time, depth: face },
  };
}

// Judges the next wall at the frog's face, now, against all its vehicles.
function meet(run: Run, index: number): Run {
  return fitsAmong(run, frogShape(run.frog), run.walls[index].solids) ? pass(run, index) : bonk(run, index);
}

// Takes up a new placement if it stays inside the opening the overlapping
// vehicles leave; otherwise the action is refused, like a move off the
// corridor edge.
function reshape(run: Run, frog: Placement): Run {
  return clearOfWalls(run, { ...frogShape(run.frog), ...frog }) ? withFrog(run, frog) : run;
}

// A slide is refused if it would put a cell outside the lanes the frog may
// use: off the road's edge, or into a pull-off's barrier.
function moveColumn(run: Run, by: number): Run {
  const placement = { col: run.frog.col + by, rotation: run.frog.rotation };
  if (!insideLanes(run.frog.kind, placement, lanesAt(run, run.frog.depth))) return run;
  return reshape(run, placement);
}

function rotate(run: Run, turn: 1 | -1): Run {
  const placement = rotateInCorridor(run.frog.kind, run.frog, turn, lanesAt(run, run.frog.depth));
  return placement === null ? run : reshape(run, placement);
}

// Whether the frog, as it stands, may be at `depth`: a frog with cells in a
// pull-off's lanes can't jump past the pull-off's barriers.
function mayStandAt(run: Run, depth: number): boolean {
  return insideLanes(run.frog.kind, run.frog, lanesAt(run, depth));
}

// The frog takes the piece waiting in the pull-off it is entirely inside, and
// leaves its own there in its place. The new piece keeps the frog's rotation
// and lane if they fit inside the pull-off; otherwise it takes the first
// rotation, then lane, that does. A swap anywhere else does nothing.
function swap(run: Run): Run {
  const index = pullOffHoldingFrog(run);
  if (index === null) return run;
  const pullOff = run.pullOffs[index];
  const lanes = pullOffLanes(pullOff, run.tuning.corridorCols);
  const kind = pullOff.waiting;
  const kept: Placement = { col: run.frog.col, rotation: run.frog.rotation };
  const placement = insideLanes(kind, kept, lanes) ? kept : firstFit(kind, lanes);
  if (placement === null) throw new Error(`A ${kind} doesn't fit the pull-off it waits in`);
  return {
    ...withFrog(run, { kind, ...placement }),
    pullOffs: run.pullOffs.map((p, i) => (i === index ? { ...p, waiting: run.frog.kind } : p)),
  };
}

function hop(run: Run): Run {
  if (hopHeight(run.frog) === 1) return run;
  if (!clearOfWalls(run, { ...frogShape(run.frog), hop: 1 })) return run;
  return withFrog(run, { latestHop: { startedAt: run.time, landedAt: null } });
}

function landNow(run: Run): Run {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  return withFrog(run, { latestHop: { ...hopping, landedAt: run.time } });
}

// Riding: a frog that is up while a vehicle overlaps it stays up, gliding
// across the vehicles' low parts, until the last of them has gone by or a
// jump forward carries it off. So a hop's timing is forgiving: one pressed
// early, whose airtime would end mid-overlap, still carries the frog across.
// A frog entirely in a pull-off is over no vehicle, so it doesn't ride.
export function isRiding(run: Run): boolean {
  return (
    inPlay(run) &&
    hopHeight(run.frog) === 1 &&
    frogCells(frogShape(run.frog)).some((cell) => inTraffic(run, cell.col)) &&
    run.walls.some((wall) => overlappingSolids(wall, run.frog.depth).length > 0)
  );
}

// A hop whose airtime is over lands, unless the frog is riding.
function settle(run: Run): Run {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  if (run.time < hopping.startedAt + run.tuning.hopAirtime) return run;
  return isRiding(run) ? run : landNow(run);
}

// The frog crosses the finish line: the rules stop, so no row judges it
// again, and a held jump lets go. It leaps onto the finish gantry, where the
// traffic goes by beneath it.
function finish(run: Run): Run {
  return { ...landNow(run), heldJump: null, finishedAt: run.time };
}

// Each wall whose front face the jump reaches is judged at once, nearest
// first. A wall the frog doesn't fit bonks it and ends the jump. A jump
// forward never meets a passed wall: those are all behind the frog's front.
// A jump that reaches the finish line ends the run.
function jumpForward(run: Run): Run {
  const target = run.frog.depth + run.tuning.depthStep;
  if (!mayStandAt(run, target)) return run;
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= target; index = nextWall(next)) {
    next = meet(next, index);
    if (!next.walls[index].passed) return next;
  }
  const moved = withFrog(next, { depth: target });
  return target >= run.tuning.courseLength ? finish(moved) : moved;
}

// A jump back that would leave the frog overlapping a vehicle of a wall it
// has passed is refused, like a move off the corridor edge: it would carry
// the frog back into the vehicle or through it. So a jump back is always
// refused while a vehicle overlaps the frog. Behind the start the road goes
// on, and so may the frog.
function jumpBack(run: Run): Run {
  const target = run.frog.depth - run.tuning.depthStep;
  if (!mayStandAt(run, target)) return run;
  const blocked = run.walls.some((wall) => overlappingSolids(wall, target).length > 0);
  return blocked ? run : withFrog(run, { depth: target });
}

// The first jump forward drops the frog from the overpass onto the road, a
// jump ahead of where it stood, and puts it in play. A drop that would land
// it in a vehicle going by beneath is refused, like a jump back; one onto a
// row's face is judged, like any jump forward.
function drop(run: Run): Run {
  const target = run.frog.depth + run.tuning.depthStep;
  if (!clearOfWallsAt(run, frogShape(run.frog), target)) return run;
  return jumpForward({ ...run, droppedAt: run.time });
}

// On the overpass the frog can line itself up and drop; nothing else.
function actOnOverpass(run: Run, action: FrogAction): Run {
  switch (action) {
    case "left":
      return moveColumn(run, -1);
    case "right":
      return moveColumn(run, 1);
    case "rotateCcw":
      return rotate(run, -1);
    case "rotateCw":
      return rotate(run, 1);
    case "forward":
      return drop(run);
    case "hop":
    case "back":
    case "swap":
      return run;
  }
}

function act(run: Run, action: FrogAction): Run {
  if (onOverpass(run)) return actOnOverpass(run, action);
  switch (action) {
    case "left":
      return moveColumn(run, -1);
    case "right":
      return moveColumn(run, 1);
    case "rotateCcw":
      return rotate(run, -1);
    case "rotateCw":
      return rotate(run, 1);
    case "hop":
      return hop(run);
    case "forward":
      return jumpForward(run);
    case "back":
      return jumpBack(run);
    case "swap":
      return swap(run);
  }
}

// A jump forward can carry a riding frog off its wall, so it lands straight after.
export function applyAction(run: Run, action: FrogAction): Run {
  if (crossedFinish(run)) return run;
  return settle(act(run, action));
}

// A jump key pressed: one jump now, and more every repeat interval while it
// stays held, until it is released.
export function pressJump(run: Run, direction: JumpDirection): Run {
  if (crossedFinish(run)) return run;
  const held = { direction, nextAt: run.time + run.tuning.jumpRepeatInterval };
  return applyAction({ ...run, heldJump: held }, direction);
}

// A jump key released; with no direction, every held jump is let go, as when
// the window loses focus and key releases can no longer be seen.
export function releaseJump(run: Run, direction?: JumpDirection): Run {
  if (run.heldJump === null) return run;
  if (direction !== undefined && run.heldJump.direction !== direction) return run;
  return { ...run, heldJump: null };
}

function repeatJump(run: Run, held: HeldJump): Run {
  return applyAction({ ...run, heldJump: { ...held, nextAt: held.nextAt + run.tuning.jumpRepeatInterval } }, held.direction);
}

// Moves the clock to `time`, carrying every wall toward the start.
function moveWallsTo(run: Run, time: number): Run {
  const travel = run.tuning.wallSpeed * (time - run.time);
  return { ...run, time, walls: run.walls.map((wall) => ({ ...wall, depth: wall.depth - travel })) };
}

interface RunEvent {
  time: number;
  happen: (run: Run) => Run;
}

// When the next wall reaches the frog. In play it is judged there; out of
// play it goes by beneath.
function nextArrival(run: Run): RunEvent | null {
  const index = nextWall(run);
  if (index === null) return null;
  return {
    time: run.time + (run.walls[index].depth - run.frog.depth) / run.tuning.wallSpeed,
    happen: (at) => (inPlay(at) ? meet(at, index) : goBy(at, index)),
  };
}

// When a hopping frog comes down: at the end of its airtime or, if it is
// riding then, once the last vehicle overlapping it has gone by. Only one
// wall can overlap the frog at a time (the tuning check spaces them).
function nextLanding(run: Run): RunEvent | null {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return null;
  const due = hopping.startedAt + run.tuning.hopAirtime;
  if (run.time < due) return { time: due, happen: settle };
  const backs = run.walls.flatMap((wall) => overlappingSolids(wall, run.frog.depth).map((solid) => wall.depth + solid.length));
  if (backs.length === 0) throw new Error("A frog is riding with no vehicle overlapping it");
  return {
    time: run.time + (Math.max(...backs) - (run.frog.depth - FROG_THICKNESS)) / run.tuning.wallSpeed,
    happen: landNow,
  };
}

function nextRepeat(run: Run): RunEvent | null {
  const held = run.heldJump;
  return held === null ? null : { time: held.nextAt, happen: (at) => repeatJump(at, held) };
}

// The soonest of a landing, the next wall arrival and the next repeat of a
// held jump. At the same instant, a landing comes first, then an arrival.
function nextEvent(run: Run): RunEvent | null {
  let soonest: RunEvent | null = null;
  for (const event of [nextLanding(run), nextArrival(run), nextRepeat(run)]) {
    if (event !== null && (soonest === null || event.time < soonest.time)) soonest = event;
  }
  return soonest;
}

// A wall whose back is the recycling distance behind the frog, out of the
// camera's view, reappears ahead of it with the same vehicles: the spacing
// (with seeded jitter) beyond the frontmost wall's back, and never nearer the
// frog than the traffic horizon, beyond the fog. So a wall never appears or
// vanishes on screen, and it is judged afresh when it arrives.
function recycle(run: Run): Run {
  const limit = run.frog.depth - run.tuning.recycleBehind;
  const leaving = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => rowBack(wall) < limit)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = run;
  for (const { index } of leaving) {
    const rng = createRng(next.rngState);
    const gap = next.tuning.wallSpacing + wallShift(next.tuning, rng.next);
    const frontmost = Math.max(...next.walls.filter((_, i) => i !== index).map(rowBack));
    const depth = Math.max(frontmost + gap, next.frog.depth + next.tuning.trafficHorizon);
    next = { ...withWall(next, index, { depth, passed: false }), rngState: rng.getState() };
  }
  return next;
}

// A wall going by can end a ride.
function moveOnTo(run: Run, time: number): Run {
  return settle(recycle(moveWallsTo(run, time)));
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously toward the start, and everything that
// happens during the frame (a wall reaching the frog, a hop landing, a held
// jump repeating) happens in order, at its own instant: a long frame can't
// carry a wall past the frog unjudged or skip a repeat, a hop is read when
// the wall arrives rather than at the frame's end, and a wall that bonks the
// frog and arrives again within the frame is judged again. After the finish
// the traffic keeps driving, beneath the frog on the gantry.
export function advance(run: Run, elapsed: number): Run {
  const end = run.time + Math.min(elapsed, run.tuning.maxFrameDelta);
  let next = run;
  for (;;) {
    const event = nextEvent(next);
    if (event === null || event.time > end) return moveOnTo(next, end);
    next = event.happen(moveOnTo(next, event.time));
  }
}
