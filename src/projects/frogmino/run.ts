import type { CourseWall } from "./course";
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

export interface Wall {
  opening: Opening;
  // Falls as the wall comes at the frog.
  depth: number;
  // Whether the frog is past this wall, so the wall is between it and the
  // start. Only a judged crossing changes it.
  passed: boolean;
  // Walls vanish when they reach the start zone's edge.
  gone: boolean;
}

export interface RuleFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Moves a jump at a time, or with the wall that is pushing the frog.
  depth: number;
  // When the latest hop began, in run time; null if the frog never hopped.
  hopStartedAt: number | null;
  // The wall pushing the frog back because it doesn't fit, if any.
  pinnedTo: number | null;
}

export interface Judgment {
  passed: boolean;
  time: number;
}

export interface Run {
  tuning: Tuning;
  // Seconds of play so far.
  time: number;
  frog: RuleFrog;
  walls: Wall[];
  lastJudgment: Judgment | null;
}

export type FrogAction = "left" | "right" | "rotateCcw" | "rotateCw" | "hop" | "forward" | "back";

export function createRun(course: readonly CourseWall[], tuning: Tuning, kind: TetrominoKind = "L"): Run {
  return {
    tuning,
    time: 0,
    frog: {
      kind,
      col: Math.floor((tuning.corridorCols - pieceSize(kind, 0).width) / 2),
      rotation: 0,
      depth: 0,
      hopStartedAt: null,
      pinnedTo: null,
    },
    walls: course.map((wall) => ({ opening: wall.opening, depth: wall.depth, passed: false, gone: false })),
    lastJudgment: null,
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

// The wall the frog meets next: the one pushing it, or else the nearest wall
// still ahead. Null once every wall is behind the frog or gone.
export function nextWall(run: Run): number | null {
  if (run.frog.pinnedTo !== null) return run.frog.pinnedTo;
  let next: number | null = null;
  run.walls.forEach((wall, i) => {
    if (wall.passed || wall.gone) return;
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

function judged(run: Run, passed: boolean, time: number): Run {
  return { ...run, lastJudgment: { passed, time } };
}

// The wall passes around the frog, which is then free.
function pass(run: Run, index: number, time: number): Run {
  return judged(withWall(withFrog(run, { pinnedTo: null }), index, { passed: true }), true, time);
}

// The frog meets a wall it doesn't fit and is held against its face.
function pin(run: Run, index: number, time: number): Run {
  return judged(withFrog(run, { pinnedTo: index, depth: run.walls[index].depth }), false, time);
}

// A pinned frog is checked again after anything that changes its fit.
function recheckPin(run: Run): Run {
  const index = run.frog.pinnedTo;
  if (index === null || !fits(run, run.walls[index], run.time)) return run;
  return pass(run, index, run.time);
}

function moveColumn(run: Run, by: number): Run {
  const col = run.frog.col + by;
  const { width } = pieceSize(run.frog.kind, run.frog.rotation);
  if (col < 0 || col + width > run.tuning.corridorCols) return run;
  return recheckPin(withFrog(run, { col }));
}

function rotate(run: Run, turn: 1 | -1): Run {
  const placement = rotateInCorridor(run.frog.kind, run.frog, turn, run.tuning.corridorCols);
  return placement === null ? run : recheckPin(withFrog(run, placement));
}

function hop(run: Run): Run {
  if (hopHeight(run, run.time) === 1) return run;
  return recheckPin(withFrog(run, { hopStartedAt: run.time }));
}

// Each wall plane the jump crosses is judged at once, nearest first. A wall
// the frog doesn't fit stops it against the wall's face.
function jumpForward(run: Run): Run {
  if (run.frog.pinnedTo !== null) return run;
  const target = run.frog.depth + run.tuning.depthStep;
  const crossed = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => !wall.passed && !wall.gone && wall.depth <= target)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = run;
  for (const { wall, index } of crossed) {
    if (!fits(next, wall, next.time)) return pin(next, index, next.time);
    next = pass(next, index, next.time);
  }
  return withFrog(next, { depth: target });
}

// Jumping back from a pin frees the frog. A wall behind that the frog
// doesn't fit stops it against the wall's back; one it does fit is ahead
// again, to be judged when it next reaches the frog.
function jumpBack(run: Run): Run {
  const target = Math.max(0, run.frog.depth - run.tuning.depthStep);
  if (target === run.frog.depth) return run;
  const crossed = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => wall.passed && !wall.gone && wall.depth >= target)
    .sort((a, b) => b.wall.depth - a.wall.depth);
  let next = withFrog(run, { pinnedTo: null });
  for (const { wall, index } of crossed) {
    if (!fits(next, wall, next.time)) return judged(withFrog(next, { depth: wall.depth }), false, next.time);
    next = withWall(next, index, { passed: false });
  }
  return withFrog(next, { depth: target });
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

// A pinned frog is carried with its wall. Its fit only changes during a frame
// when a hop lands, so that is the one moment it is checked again here.
function carryPinned(before: Run, after: Run): Run {
  const index = after.frog.pinnedTo;
  if (index === null) return after;
  const { hopStartedAt } = after.frog;
  const landedAt = hopStartedAt === null ? null : hopStartedAt + after.tuning.hopAirtime;
  const wall = after.walls[index];
  if (landedAt !== null && landedAt > before.time && landedAt <= after.time && fits(after, wall, landedAt)) {
    const depth = before.walls[index].depth - after.tuning.wallSpeed * (landedAt - before.time);
    return pass(withFrog(after, { depth }), index, landedAt);
  }
  return withFrog(after, { depth: wall.depth });
}

// Judges each wall whose plane reached the frog during the frame, nearest
// first, at the instant it arrived. Comparing depths before and after means a
// long frame can't carry a wall past the frog unjudged. The start zone is
// safe: walls vanish at its edge rather than reaching a frog standing there.
function judgeArrivals(before: Run, after: Run): Run {
  const arrived = after.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall, index }) => !wall.passed && !wall.gone && index !== after.frog.pinnedTo)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = after;
  for (const { wall, index } of arrived) {
    const frogDepth = next.frog.depth;
    if (frogDepth <= 0 || wall.depth > frogDepth) break;
    const time = before.time + (before.walls[index].depth - frogDepth) / next.tuning.wallSpeed;
    if (!fits(next, wall, time)) return pin(next, index, time);
    next = pass(next, index, time);
  }
  return next;
}

// A wall that reaches the start zone's edge disappears. A frog it was pushing
// is left standing at the start.
function clearStartEdge(run: Run): Run {
  let next = run;
  run.walls.forEach((wall, index) => {
    if (wall.gone || wall.depth > 0) return;
    next = withWall(next, index, { gone: true });
    if (next.frog.pinnedTo === index) next = withFrog(next, { pinnedTo: null, depth: 0 });
  });
  return next;
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously toward the start zone.
export function advance(run: Run, elapsed: number): Run {
  if (isDone(run)) return run;
  const dt = Math.min(elapsed, run.tuning.maxFrameDelta);
  const moved: Run = {
    ...run,
    time: run.time + dt,
    walls: run.walls.map((wall) => ({ ...wall, depth: wall.depth - run.tuning.wallSpeed * dt })),
  };
  return clearStartEdge(judgeArrivals(run, carryPinned(run, moved)));
}
