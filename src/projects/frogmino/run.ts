import { frogPasses, pieceSize, rotateInCorridor } from "./logic";
import type { HopHeight, Opening, Rotation, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state is discrete and changes the instant an action is
// applied, the walls' depths are continuous, and `advance` moves time on.
// Depth is measured in world units forward from the corridor start.

export type WallResult = "pending" | "passed" | "bonked";

export interface Wall {
  opening: Opening;
  // Distance from the corridor start. Falls as the wall comes at the frog.
  depth: number;
  // A wall is judged once, when its plane crosses the frog, and is then
  // resolved for good.
  result: WallResult;
}

export interface RuleFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // Which depth step the frog stands on, counted from the corridor start.
  step: number;
  // When the latest hop began, in run time; null if the frog never hopped.
  hopStartedAt: number | null;
}

export interface Judgment {
  wall: number;
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

// The first wall starts at the far end of the corridor, the rest follow at
// the wall spacing.
export function createRun(openings: readonly Opening[], tuning: Tuning, kind: TetrominoKind = "L"): Run {
  const firstDepth = tuning.corridorSteps * tuning.depthStep;
  return {
    tuning,
    time: 0,
    frog: {
      kind,
      col: Math.floor((tuning.corridorCols - pieceSize(kind, 0).width) / 2),
      rotation: 0,
      step: tuning.startStep,
      hopStartedAt: null,
    },
    walls: openings.map((opening, i) => ({
      opening,
      depth: firstDepth + i * tuning.wallSpacing,
      result: "pending",
    })),
    lastJudgment: null,
  };
}

export function frogDepth(run: Run): number {
  return run.frog.step * run.tuning.depthStep;
}

// A hop is a window: for the airtime after it starts, the frog is one cell up.
export function hopHeight(run: Run, time: number): HopHeight {
  const { hopStartedAt } = run.frog;
  if (hopStartedAt === null) return 0;
  const airborne = time >= hopStartedAt && time - hopStartedAt < run.tuning.hopAirtime;
  return airborne ? 1 : 0;
}

export function isDone(run: Run): boolean {
  return run.walls.every((wall) => wall.result !== "pending");
}

function withFrog(run: Run, frog: Partial<RuleFrog>): Run {
  return { ...run, frog: { ...run.frog, ...frog } };
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

function jump(run: Run, by: number): Run {
  const step = run.frog.step + by;
  if (step < 0 || step >= run.tuning.corridorSteps) return run;
  // Jumping forward through a wall's plane is a crossing, judged now.
  return judgeCrossings(withFrog(run, { step }), () => run.time);
}

export function applyAction(run: Run, action: FrogAction): Run {
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
      return hopHeight(run, run.time) === 1 ? run : withFrog(run, { hopStartedAt: run.time });
    case "forward":
      return jump(run, 1);
    case "back":
      return jump(run, -1);
  }
}

// Judges every pending wall that is no longer ahead of the frog, nearest
// first. `crossedAt` says when the wall's plane met the frog, which decides
// whether the frog was mid-hop. A bonk shoves the frog back, so each wall is
// checked against where the frog is after the walls before it.
function judgeCrossings(run: Run, crossedAt: (wall: Wall, frogDepth: number) => number): Run {
  let next = run;
  run.walls.forEach((wall, index) => {
    const depth = frogDepth(next);
    if (wall.result !== "pending" || wall.depth > depth) return;
    const time = crossedAt(wall, depth);
    const frog = { ...next.frog, hop: hopHeight(next, time) };
    const passed = frogPasses(frog, wall.opening);
    const result: WallResult = passed ? "passed" : "bonked";
    const walls = next.walls.map((w, i) => (i === index ? { ...w, result } : w));
    const step = passed ? next.frog.step : Math.max(0, next.frog.step - next.tuning.bonkKnockback);
    next = { ...withFrog(next, { step }), walls, lastJudgment: { wall: index, passed, time } };
  });
  return next;
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously, so a wall whose plane crossed the frog
// during the frame is judged at the instant it crossed, however far it went.
export function advance(run: Run, elapsed: number): Run {
  const dt = Math.min(elapsed, run.tuning.maxFrameDelta);
  const time = run.time + dt;
  const speed = run.tuning.wallSpeed;
  const moved: Run = {
    ...run,
    time,
    walls: run.walls.map((wall) => ({ ...wall, depth: wall.depth - speed * dt })),
  };
  return judgeCrossings(moved, (wall, depth) => time - (depth - wall.depth) / speed);
}
