import { describe, it, expect } from "vitest";
import { rectOpening as rect } from "./logic";
import { advance, applyAction, createRun, isDone, nextWall, type FrogAction, type Run } from "./run";
import { TUNING, type Tuning } from "./tuning";
import type { Opening } from "./types";

// Unit jumps and unit wall speed keep the arithmetic readable: a jump is 1
// unit and a wall moves 1 unit a second.
const TEST_TUNING: Tuning = {
  ...TUNING,
  wallSpeed: 1,
  depthStep: 1,
  corridorCols: 7,
  courseLength: 100,
  hopAirtime: 0.5,
  maxFrameDelta: 0.1,
};

// The flat L starts at column 2: cells (2..4, 0) and (4, 1).
const FITS = rect([2, 4], [0, 1]);
const BLOCKED = rect([0, 1], [0, 3]);
const RAISED = rect([2, 4], [1, 2]);
// Fits the flat L one column to the left of where it starts.
const LEFT_OF_START = rect([1, 3], [0, 1]);
// Fits only the L turned clockwise once (upright, foot right) at column 2.
const UPRIGHT = [{ col: 2, row: 0 }, { col: 3, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }];

function runWithWalls(walls: readonly { opening: Opening; depth: number }[], frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  const run = createRun(walls, { ...TEST_TUNING, ...tuning });
  return { ...run, frog: { ...run.frog, depth: frogDepth } };
}

function runWithWall(opening: Opening, depth: number, frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return runWithWalls([{ opening, depth }], frogDepth, tuning);
}

function advanceBy(run: Run, seconds: number, frame = 0.05): Run {
  let next = run;
  for (let t = 0; t < seconds - 1e-9; t += frame) next = advance(next, frame);
  return next;
}

function act(run: Run, ...actions: FrogAction[]): Run {
  return actions.reduce(applyAction, run);
}

describe("a run", () => {
  it("starts with the frog centred in the start zone and the walls where the course put them", () => {
    const run = createRun([{ opening: FITS, depth: 12 }, { opening: FITS, depth: 30 }], TEST_TUNING);
    expect(run.frog).toMatchObject({ col: 2, rotation: 0, depth: 0, pinnedTo: null });
    expect(run.walls.map((w) => w.depth)).toEqual([12, 30]);
  });

  it("ignores moves off the corridor edge", () => {
    let run = act(createRun([], TEST_TUNING), "left", "left", "left");
    expect(run.frog.col).toBe(0);
    run = act(run, "right", "right", "right", "right", "right");
    expect(run.frog.col).toBe(4);
  });

  it("rotates with a wall kick at the edge", () => {
    const run = act(createRun([], TEST_TUNING), "rotateCw", "left", "left", "left");
    expect(run.frog).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw").frog).toMatchObject({ col: 0, rotation: 2 });
  });

  it("clamps a long frame to the longest frame", () => {
    const run = advance(runWithWall(FITS, 9), 5);
    expect(run.time).toBeCloseTo(0.1);
    expect(run.walls[0].depth).toBeCloseTo(8.9);
  });
});

describe("walls reaching the frog", () => {
  it("passes a wall the frog fits, once, at the moment it arrives", () => {
    let run = advanceBy(runWithWall(FITS, 5.2), 0.1);
    expect(run.walls[0].passed).toBe(false);
    run = advanceBy(run, 0.2);
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog.depth).toBe(5);
    const judgment = run.lastJudgment;
    expect(judgment).toMatchObject({ passed: true });
    expect(judgment?.time).toBeCloseTo(0.2);
    run = advanceBy(run, 3);
    expect(run.lastJudgment).toBe(judgment);
  });

  it("pins a frog that doesn't fit and carries it backward", () => {
    let run = advanceBy(runWithWall(BLOCKED, 5.1), 0.2);
    expect(run.frog.pinnedTo).toBe(0);
    expect(run.lastJudgment).toMatchObject({ passed: false });
    expect(run.frog.depth).toBeCloseTo(4.9);
    run = advanceBy(run, 2);
    expect(run.frog.pinnedTo).toBe(0);
    expect(run.frog.depth).toBeCloseTo(2.9);
    expect(run.frog.depth).toBe(run.walls[0].depth);
  });

  it("judges a wall a long frame carried right past the frog", () => {
    const run = advance(runWithWall(BLOCKED, 5.5, 5, { maxFrameDelta: 10 }), 3);
    expect(run.frog.pinnedTo).toBe(0);
    expect(run.frog.depth).toBeCloseTo(2.5);
  });

  it("judges each wall of a long frame, nearest first", () => {
    const run = advance(
      runWithWalls([{ opening: BLOCKED, depth: 7 }, { opening: FITS, depth: 5.5 }], 5, { maxFrameDelta: 10 }),
      3,
    );
    expect(run.walls[1].passed).toBe(true);
    expect(run.frog.pinnedTo).toBe(0);
    expect(run.frog.depth).toBeCloseTo(4);
  });

  it("makes a wall disappear at the start zone's edge", () => {
    const run = advanceBy(runWithWall(FITS, 1, 0), 1.2);
    expect(run.walls[0]).toMatchObject({ gone: true, passed: false });
    expect(run.lastJudgment).toBeNull();
    expect(nextWall(run)).toBeNull();
  });

  it("leaves a frog pushed all the way back standing at the start", () => {
    let run = advanceBy(runWithWall(BLOCKED, 2.1, 2), 0.2);
    expect(run.frog.pinnedTo).toBe(0);
    run = advanceBy(run, 2.5);
    expect(run.walls[0].gone).toBe(true);
    expect(run.frog).toMatchObject({ depth: 0, pinnedTo: null });
  });
});

describe("a pinned frog", () => {
  const pinned = advanceBy(runWithWall(LEFT_OF_START, 5.1), 0.2);

  it("is released by a move that fits", () => {
    expect(pinned.frog.pinnedTo).toBe(0);
    expect(applyAction(pinned, "right").frog.pinnedTo).toBe(0);
    const run = applyAction(pinned, "left");
    expect(run.frog.pinnedTo).toBeNull();
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastJudgment).toMatchObject({ passed: true });
    // Freed, it stays where the wall left it.
    expect(advanceBy(run, 1).frog.depth).toBeCloseTo(4.9);
  });

  it("is released by a rotation that fits", () => {
    const run = advanceBy(runWithWall(UPRIGHT, 5.1), 0.2);
    expect(run.frog.pinnedTo).toBe(0);
    expect(applyAction(run, "rotateCw").frog.pinnedTo).toBeNull();
  });

  it("is released by a hop that fits", () => {
    const run = advanceBy(runWithWall(RAISED, 5.1), 0.2);
    expect(run.frog.pinnedTo).toBe(0);
    expect(applyAction(run, "hop").frog.pinnedTo).toBeNull();
  });

  it("is released when a hop lands and the landed frog fits", () => {
    // Hopping, the frog doesn't fit this floor-level opening; landing, it does.
    let run = applyAction(runWithWall(FITS, 5.1), "hop");
    run = advanceBy(run, 0.2);
    expect(run.frog.pinnedTo).toBe(0);
    run = advanceBy(run, 0.4);
    expect(run.frog.pinnedTo).toBeNull();
    expect(run.lastJudgment?.time).toBeCloseTo(0.5);
    expect(run.frog.depth).toBeCloseTo(4.6);
  });

  it("can't jump forward into the wall", () => {
    expect(applyAction(pinned, "forward")).toBe(pinned);
  });

  it("can jump back, which frees it", () => {
    const run = applyAction(pinned, "back");
    expect(run.frog.pinnedTo).toBeNull();
    expect(run.frog.depth).toBeCloseTo(3.9);
    expect(run.walls[0].passed).toBe(false);
  });
});

describe("hop", () => {
  it("passes a raised opening mid-hop", () => {
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.2), "hop"), 0.3);
    expect(run.walls[0].passed).toBe(true);
  });

  it("is pinned by a raised opening when grounded", () => {
    const run = advanceBy(runWithWall(RAISED, 5.2), 0.3);
    expect(run.frog.pinnedTo).toBe(0);
  });

  it("is judged at the instant of arrival, not the end of a long frame", () => {
    // The wall arrives 0.3 s in, mid-hop; by the frame's end the frog has landed.
    const run = advance(applyAction(runWithWall(RAISED, 5.3, 5, { maxFrameDelta: 10 }), "hop"), 1);
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog.pinnedTo).toBeNull();
  });

  it("ignores a hop pressed while airborne", () => {
    let run = applyAction(runWithWall(FITS, 20), "hop");
    run = advanceBy(run, 0.3);
    expect(applyAction(run, "hop")).toBe(run);
    run = advanceBy(run, 0.3);
    expect(applyAction(run, "hop").frog.hopStartedAt).toBeCloseTo(0.6);
  });
});

describe("jump", () => {
  it("moves forward with no cap and back no further than the start", () => {
    let run = runWithWall(FITS, 50, 0);
    expect(applyAction(run, "back")).toBe(run);
    for (let i = 0; i < 40; i++) run = applyAction(run, "forward");
    expect(run.frog.depth).toBe(40);
    run = act(runWithWall(FITS, 50, 0.5), "back");
    expect(run.frog.depth).toBe(0);
  });

  it("passes a wall jumped through when the frog fits", () => {
    const run = applyAction(runWithWall(FITS, 5.5), "forward");
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog.depth).toBe(6);
  });

  it("pins the frog against a wall it jumps into and doesn't fit", () => {
    const run = applyAction(runWithWall(BLOCKED, 5.5), "forward");
    expect(run.frog).toMatchObject({ pinnedTo: 0, depth: 5.5 });
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastJudgment).toMatchObject({ passed: false, time: 0 });
  });

  it("doesn't judge a wall still ahead after the jump", () => {
    const run = applyAction(runWithWall(BLOCKED, 6.5), "forward");
    expect(run.frog.pinnedTo).toBeNull();
    expect(run.lastJudgment).toBeNull();
  });

  it("stops against the back of a passed wall it doesn't fit", () => {
    let run = applyAction(runWithWall(FITS, 5.5), "forward");
    run = act(run, "left", "back");
    expect(run.frog.depth).toBe(5.5);
    expect(run.walls[0].passed).toBe(true);
  });

  it("goes back through a passed wall it fits, which is then ahead again", () => {
    const run = act(runWithWall(FITS, 5.5), "forward", "back");
    expect(run.frog.depth).toBe(5);
    expect(run.walls[0].passed).toBe(false);
    expect(nextWall(run)).toBe(0);
    expect(advanceBy(run, 1).walls[0].passed).toBe(true);
  });
});

describe("the end zone", () => {
  it("completes the course when the frog reaches it, and the run stops", () => {
    let run = runWithWall(FITS, 50, 98.5);
    expect(isDone(run)).toBe(false);
    run = applyAction(run, "forward");
    expect(isDone(run)).toBe(false);
    run = applyAction(run, "forward");
    expect(isDone(run)).toBe(true);
    expect(advance(run, 0.1)).toBe(run);
    expect(applyAction(run, "back")).toBe(run);
  });
});
