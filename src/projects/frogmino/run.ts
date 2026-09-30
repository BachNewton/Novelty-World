import { createRng } from "@/shared/lib/seeded-random";
import { wallShift, type CourseWall } from "./course";
import { frogPasses, pieceSize, rotateInCorridor } from "./logic";
import type { HopHeight, Opening, Rotation, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state changes the instant an action is applied, the walls'
// depths are continuous, and `advance` moves time on.
//
// Depth is measured forward from the start zone's edge, at depth 0. A wall's
// depth is its near face; the frog's is its front face. They touch when the
// two are equal, and that contact is where a wall is judged.
//
// Every wall the frog hasn't passed is ahead of it, and every wall it has
// passed is behind it. Each rule below keeps that true, so a wall is judged
// exactly once each time it reaches the frog.

// The frog and every wall are one cube deep: a wall at depth d fills d to
// d + 1, and the frog at depth f fills f - 1 to f.
const BODY_DEPTH = 1;

export interface Wall {
  opening: Opening;
  // Falls as the wall comes at the frog.
  depth: number;
  // Whether the frog is past this wall, so the wall is between it and the
  // start. Only a judged crossing sets it; a wall reappearing at the far end
  // clears it.
  passed: boolean;
}

export interface RuleFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Moves a jump or a bonk at a time.
  depth: number;
  // When the latest hop began, in run time; null if the frog never hopped.
  hopStartedAt: number | null;
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
// at once, forever, and a held jump must wait between repeats. And walls must be spaced far enough apart that a bonk
// never knocks the frog into a wall it has passed.
function checkTuning(tuning: Tuning): void {
  if (tuning.bonkKnockback <= 0) throw new Error("A bonk must knock the frog back");
  if (tuning.jumpRepeatInterval <= 0) throw new Error("A held jump must wait between repeats");
  const closestWalls = tuning.wallSpacing - 2 * tuning.wallJitter;
  const bonkReach = tuning.bonkKnockback * tuning.depthStep + 2 * BODY_DEPTH;
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
      hopStartedAt: null,
    },
    walls: course.map((wall) => ({ opening: wall.opening, depth: wall.depth, passed: false })),
    lastBonk: null,
    heldJump: null,
    rngState: seed,
  };
}

// A hop is a window: for the airtime after it starts, the frog is one cell up.
export function hopHeight(run: Run, time: number): HopHeight {
  const { hopStartedAt } = run.frog;
  if (hopStartedAt === null) return 0;
  const airborne = time >= hopStartedAt && time - hopStartedAt < run.tuning.hopAirtime;
  return airborne ? 1 : 0;
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

function fits(run: Run, wall: Wall, time: number): boolean {
  return frogPasses({ ...run.frog, hop: hopHeight(run, time) }, wall.opening);
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
// when it arrives unless the frog fits by then or has got clear. A bonk also
// stops a held jump key repeating, so holding a jump into a wall doesn't bonk
// the frog again and again: the key must be pressed afresh.
function bonk(run: Run, index: number, time: number): Run {
  const face = run.walls[index].depth;
  const depth = Math.max(0, face - run.tuning.bonkKnockback * run.tuning.depthStep);
  return { ...withFrog(run, { depth }), heldJump: null, lastBonk: { time, depth: face } };
}

// Judges the next wall at the frog's face, now.
function meet(run: Run, index: number): Run {
  return fits(run, run.walls[index], run.time) ? pass(run, index) : bonk(run, index, run.time);
}

function moveColumn(run: Run, by: number): Run {
  const col = run.frog.col + by;
  const { width } = pieceSize(run.frog.kind, run.frog.rotation);
  if (col < 0 || col + width > run.tuning.corridorCols) return run;
  return withFrog(run, { col });
}

function rotate(run: Run, turn: 1 | -1): Run {
  const placement = rotateInCorridor(run.frog.kind, run.frog, turn, run.tuning.corridorCols);
  return placement === null ? run : withFrog(run, placement);
}

function hop(run: Run): Run {
  if (hopHeight(run, run.time) === 1) return run;
  return withFrog(run, { hopStartedAt: run.time });
}

// Each wall whose face the jump reaches is judged at once, nearest first. A
// wall the frog doesn't fit bonks it and ends the jump.
function jumpForward(run: Run): Run {
  const target = run.frog.depth + run.tuning.depthStep;
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= target; index = nextWall(next)) {
    next = meet(next, index);
    if (!next.walls[index].passed) return next;
  }
  return withFrog(next, { depth: target });
}

// A jump back that would carry the frog into or through a wall it has passed
// is refused, like a move off the corridor edge.
function jumpBack(run: Run): Run {
  const target = Math.max(0, run.frog.depth - run.tuning.depthStep);
  if (target === run.frog.depth) return run;
  const frogBack = target - BODY_DEPTH;
  const blocked = run.walls.some((wall) => wall.passed && wall.depth + BODY_DEPTH > frogBack);
  return blocked ? run : withFrog(run, { depth: target });
}

// A jump key pressed: one jump now, and more every repeat interval while it
// stays held, until it is released or the frog is bonked.
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

export function applyAction(run: Run, action: FrogAction): Run {
  if (isDone(run)) return run;
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

// The sooner of the next wall arrival and the next repeat of a held jump. An
// arrival at the same instant as a repeat comes first.
function nextEvent(run: Run): RunEvent | null {
  const arrival = nextArrival(run);
  const held = run.heldJump;
  if (held === null || (arrival !== null && arrival.time <= held.nextAt)) return arrival;
  return { time: held.nextAt, happen: (at) => repeatJump(at, held) };
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

function moveOnTo(run: Run, time: number): Run {
  return recycleAtStartEdge(moveWallsTo(run, time));
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously toward the start zone, and everything
// that happens during the frame (a wall reaching the frog, a held jump
// repeating) happens in order, at its own instant: a long frame can't carry a
// wall past the frog unjudged or skip a repeat, a hop is read when the wall
// arrives rather than at the frame's end, and a wall that bonks the frog and
// arrives again within the frame is judged again.
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
