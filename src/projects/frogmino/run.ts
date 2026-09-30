import { createRng } from "@/shared/lib/seeded-random";
import { wallShift, type CourseWall } from "./course";
import { frogPasses, pieceSize, rotateInCorridor } from "./logic";
import type { Frog, HopHeight, Opening, Rotation, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state changes the instant an action is applied, the walls'
// depths are continuous, and `advance` moves time on.
//
// Depth is measured forward from the start zone's edge, at depth 0. A wall's
// depth is its front face, the one coming at the frog, and the wall fills
// from there back along the course; the frog's depth is its front face, and
// it fills from there toward the start. A wall overlaps the frog while their
// depth ranges intersect. The overlap begins when the wall's front face
// reaches the frog's, and that is where the wall is judged.
//
// Every wall the frog hasn't passed is ahead of it, and every wall it has
// passed is behind it. Each rule below keeps that true, so a wall is judged
// exactly once each time it reaches the frog. And the frog's cells are
// always inside the opening of any wall overlapping it: an action that would
// break that is refused. A frog that is up while a wall overlaps it rides the
// wall: it stays up until the wall has gone by.

// How deep the frog and a wall are along the course, in units. The scene
// draws them this deep too.
export const FROG_THICKNESS = 1;
export const WALL_THICKNESS = 1;

export interface Wall {
  opening: Opening;
  // Falls as the wall comes at the frog.
  depth: number;
  // Whether the frog is past this wall's front face, so the wall is between
  // it and the start or still around it. Only a judged crossing sets it; a
  // wall reappearing at the far end clears it.
  passed: boolean;
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
  heldJump: HeldJump | null;
  // The seeded stream that places walls reappearing at the far end.
  rngState: number;
}

export type FrogAction = "left" | "right" | "rotateCcw" | "rotateCw" | "hop" | "forward" | "back";

// A bonked frog must leave the wall's face, or the wall would bonk it again
// at once, forever, and a held jump must wait between repeats. Walls must be
// spaced far enough apart that a bonk never knocks the frog into a wall it
// has passed, which also means no two walls ever overlap the frog at once.
function checkTuning(tuning: Tuning): void {
  if (tuning.bonkKnockback <= 0) throw new Error("A bonk must knock the frog back");
  if (tuning.jumpRepeatInterval <= 0) throw new Error("A held jump must wait between repeats");
  const closestWalls = tuning.wallSpacing - 2 * tuning.wallJitter;
  const bonkReach = tuning.bonkKnockback * tuning.depthStep + FROG_THICKNESS + WALL_THICKNESS;
  if (closestWalls < bonkReach) {
    throw new Error(`Walls as close as ${String(closestWalls)} let a bonk reach ${String(bonkReach)} back into a passed wall`);
  }
}

export function createRun(course: readonly CourseWall[], tuning: Tuning, seed: number, kind: TetrominoKind = "L"): Run {
  checkTuning(tuning);
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
    walls: course.map((wall) => ({ opening: wall.opening, depth: wall.depth, passed: false })),
    lastBonk: null,
    heldJump: null,
    rngState: seed,
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

export function isDone(run: Run): boolean {
  return run.frog.depth >= run.tuning.courseLength;
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

// A wall the frog has passed overlaps it until the wall's back face goes by
// the frog's.
function overlapsFrog(wall: Wall, frogDepth: number): boolean {
  return wall.passed && wall.depth + WALL_THICKNESS > frogDepth - FROG_THICKNESS;
}

// Whether the frog could take this shape at its depth: inside the opening of
// every wall overlapping it.
function clearOfWalls(run: Run, shape: Frog): boolean {
  return run.walls.every((wall) => !overlapsFrog(wall, run.frog.depth) || frogPasses(shape, wall.opening));
}

function withFrog(run: Run, frog: Partial<RuleFrog>): Run {
  return { ...run, frog: { ...run.frog, ...frog } };
}

function withWall(run: Run, index: number, wall: Partial<Wall>): Run {
  return { ...run, walls: run.walls.map((w, i) => (i === index ? { ...w, ...wall } : w)) };
}

// The wall passes around the frog.
function pass(run: Run, index: number): Run {
  return withWall(run, index, { passed: true });
}

// The frog is knocked back from the wall's face, no further than the start
// zone. The wall stays solid and keeps coming, so it bonks the frog again
// when it arrives unless the frog fits by then or has got clear. A held jump
// key keeps repeating, a full repeat interval after the bonk.
function bonk(run: Run, index: number): Run {
  const { time, tuning, heldJump } = run;
  const face = run.walls[index].depth;
  const depth = Math.max(0, face - tuning.bonkKnockback * tuning.depthStep);
  return {
    ...withFrog(run, { depth }),
    heldJump: heldJump === null ? null : { ...heldJump, nextAt: time + tuning.jumpRepeatInterval },
    lastBonk: { time, depth: face },
  };
}

// Judges the next wall at the frog's face, now.
function meet(run: Run, index: number): Run {
  return frogPasses(frogShape(run.frog), run.walls[index].opening) ? pass(run, index) : bonk(run, index);
}

// Takes up a new placement if it stays inside the opening of any wall
// overlapping the frog; otherwise the action is refused, like a move off the
// corridor edge.
function reshape(run: Run, frog: Pick<RuleFrog, "col" | "rotation">): Run {
  return clearOfWalls(run, { ...frogShape(run.frog), ...frog }) ? withFrog(run, frog) : run;
}

function moveColumn(run: Run, by: number): Run {
  const col = run.frog.col + by;
  const { width } = pieceSize(run.frog.kind, run.frog.rotation);
  if (col < 0 || col + width > run.tuning.corridorCols) return run;
  return reshape(run, { col, rotation: run.frog.rotation });
}

function rotate(run: Run, turn: 1 | -1): Run {
  const placement = rotateInCorridor(run.frog.kind, run.frog, turn, run.tuning.corridorCols);
  return placement === null ? run : reshape(run, placement);
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

// Riding: a frog that is up while a wall overlaps it stays up, gliding across
// the wall's low parts, until the wall has gone by or a jump forward carries
// it off. So a hop's timing is forgiving: one pressed early, whose airtime
// would end mid-overlap, still carries the frog across.
export function isRiding(run: Run): boolean {
  return hopHeight(run.frog) === 1 && run.walls.some((wall) => overlapsFrog(wall, run.frog.depth));
}

// A hop whose airtime is over lands, unless the frog is riding.
function settle(run: Run): Run {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  if (run.time < hopping.startedAt + run.tuning.hopAirtime) return run;
  return isRiding(run) ? run : landNow(run);
}

// Each wall whose front face the jump reaches is judged at once, nearest
// first. A wall the frog doesn't fit bonks it and ends the jump. A jump
// forward never meets a passed wall: those are all behind the frog's front.
function jumpForward(run: Run): Run {
  const target = run.frog.depth + run.tuning.depthStep;
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= target; index = nextWall(next)) {
    next = meet(next, index);
    if (!next.walls[index].passed) return next;
  }
  return withFrog(next, { depth: target });
}

// A jump back that would leave the frog overlapping a wall it has passed is
// refused, like a move off the corridor edge: it would carry the frog back
// into the wall or through it. So a jump back is always refused while a
// wall overlaps the frog.
function jumpBack(run: Run): Run {
  const target = Math.max(0, run.frog.depth - run.tuning.depthStep);
  if (target === run.frog.depth) return run;
  const blocked = run.walls.some((wall) => overlapsFrog(wall, target));
  return blocked ? run : withFrog(run, { depth: target });
}

// A jump key pressed: one jump now, and more every repeat interval while it
// stays held, until it is released.
export function pressJump(run: Run, direction: JumpDirection): Run {
  if (isDone(run)) return run;
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

function act(run: Run, action: FrogAction): Run {
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
  }
}

// A jump forward can carry a riding frog off its wall, so it lands straight after.
export function applyAction(run: Run, action: FrogAction): Run {
  if (isDone(run)) return run;
  return settle(act(run, action));
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

// When the next wall reaches the frog, if it can. The start zone is safe: no
// wall reaches a frog standing in it.
function nextArrival(run: Run): RunEvent | null {
  const index = nextWall(run);
  if (index === null || run.frog.depth <= 0) return null;
  return {
    time: run.time + (run.walls[index].depth - run.frog.depth) / run.tuning.wallSpeed,
    happen: (at) => meet(at, index),
  };
}

// When a hopping frog comes down: at the end of its airtime or, if it is
// riding a wall then, once that wall has gone by. Only one wall can overlap
// the frog at a time (the tuning check spaces them), so the frog lands the
// moment that wall's back face passes its own.
function nextLanding(run: Run): RunEvent | null {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return null;
  const due = hopping.startedAt + run.tuning.hopAirtime;
  if (run.time < due) return { time: due, happen: settle };
  const frogBack = run.frog.depth - FROG_THICKNESS;
  const ridden = run.walls.find((wall) => overlapsFrog(wall, run.frog.depth));
  if (ridden === undefined) throw new Error("A frog is riding with no wall overlapping it");
  return {
    time: run.time + (ridden.depth + WALL_THICKNESS - frogBack) / run.tuning.wallSpeed,
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

// A wall that reaches the start zone's edge disappears there and reappears at
// the far end with the same opening: a spacing (with seeded jitter) behind the
// rearmost wall, or behind the frog if it has raced past every wall. So it is
// always ahead of the frog, beyond every wall already coming at it, and is
// judged afresh when it arrives.
function recycleAtStartEdge(run: Run): Run {
  const leaving = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => wall.depth <= 0)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = run;
  for (const { index } of leaving) {
    const rng = createRng(next.rngState);
    const shift = wallShift(next.tuning, rng.next);
    const rearmost = Math.max(next.frog.depth, ...next.walls.filter((_, i) => i !== index).map((w) => w.depth));
    next = { ...withWall(next, index, { depth: rearmost + next.tuning.wallSpacing + shift, passed: false }), rngState: rng.getState() };
  }
  return next;
}

// A wall leaving at the start edge can end a ride.
function moveOnTo(run: Run, time: number): Run {
  return settle(recycleAtStartEdge(moveWallsTo(run, time)));
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously toward the start zone, and everything
// that happens during the frame (a wall reaching the frog, a hop landing, a
// held jump repeating) happens in order, at its own instant: a long frame
// can't carry a wall past the frog unjudged or skip a repeat, a hop is read
// when the wall arrives rather than at the frame's end, and a wall that bonks
// the frog and arrives again within the frame is judged again.
export function advance(run: Run, elapsed: number): Run {
  const end = run.time + Math.min(elapsed, run.tuning.maxFrameDelta);
  let next = run;
  for (;;) {
    if (isDone(next)) return next;
    const event = nextEvent(next);
    if (event === null || event.time > end) return moveOnTo(next, end);
    next = event.happen(moveOnTo(next, event.time));
  }
}
