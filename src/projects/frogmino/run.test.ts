import { describe, it, expect } from "vitest";
import { rectOpening as rect } from "./logic";
import { advance, applyAction, createRun, frogDepth, isDone, type Run } from "./run";
import { TUNING, type Tuning } from "./tuning";
import type { Opening } from "./types";

// Unit depth steps and unit wall speed keep the arithmetic readable: the frog
// starts on step 5, at depth 5, and a wall moves 1 unit a second.
const TEST_TUNING: Tuning = {
  ...TUNING,
  wallSpeed: 1,
  depthStep: 1,
  corridorCols: 7,
  corridorSteps: 10,
  startStep: 5,
  hopAirtime: 0.5,
  bonkKnockback: 3,
  maxFrameDelta: 0.1,
};

// The flat L starts at column 2: cells (2..4, 0) and (4, 1).
const FITS = rect([2, 4], [0, 1]);
const BLOCKED = rect([0, 1], [0, 3]);
const RAISED = rect([2, 4], [1, 2]);

function runWithWall(opening: Opening, depth: number, tuning: Partial<Tuning> = {}): Run {
  const run = createRun([opening], { ...TEST_TUNING, ...tuning });
  return { ...run, walls: run.walls.map((wall) => ({ ...wall, depth })) };
}

function advanceBy(run: Run, seconds: number, frame = 0.05): Run {
  let next = run;
  for (let t = 0; t < seconds - 1e-9; t += frame) next = advance(next, frame);
  return next;
}

describe("a run", () => {
  it("starts with the frog centred on the start step and the first wall at the corridor end", () => {
    const run = createRun([FITS, FITS], TEST_TUNING);
    expect(run.frog).toMatchObject({ col: 2, rotation: 0, step: 5 });
    expect(run.walls.map((w) => w.depth)).toEqual([10, 10 + TEST_TUNING.wallSpacing]);
  });

  it("ignores moves off the corridor edge", () => {
    let run = createRun([FITS], TEST_TUNING);
    run = applyAction(applyAction(applyAction(run, "left"), "left"), "left");
    expect(run.frog.col).toBe(0);
    run = applyAction(run, "right");
    run = applyAction(applyAction(applyAction(applyAction(run, "right"), "right"), "right"), "right");
    expect(run.frog.col).toBe(4);
  });

  it("rotates with a wall kick at the edge", () => {
    let run = createRun([FITS], TEST_TUNING);
    run = applyAction(run, "rotateCw");
    run = applyAction(applyAction(applyAction(run, "left"), "left"), "left");
    expect(run.frog).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw").frog).toMatchObject({ col: 0, rotation: 2 });
  });

  it("clamps a long frame to the longest frame", () => {
    const run = advance(runWithWall(FITS, 9), 5);
    expect(run.time).toBeCloseTo(0.1);
    expect(run.walls[0].depth).toBeCloseTo(8.9);
  });
});

describe("crossing", () => {
  it("judges a wall once, when its plane crosses the frog", () => {
    let run = advanceBy(runWithWall(FITS, 5.2), 0.1);
    expect(run.walls[0].result).toBe("pending");
    run = advanceBy(run, 0.2);
    expect(run.walls[0].result).toBe("passed");
    const judgment = run.lastJudgment;
    expect(judgment).toMatchObject({ wall: 0, passed: true });
    run = advanceBy(run, 3);
    expect(run.lastJudgment).toBe(judgment);
  });

  it("judges a wall a long frame carried right past the frog, once", () => {
    let run = advance(runWithWall(BLOCKED, 5.5, { maxFrameDelta: 10 }), 3);
    expect(run.walls[0]).toMatchObject({ result: "bonked" });
    expect(run.walls[0].depth).toBeCloseTo(2.5);
    // Knocked back to depth 2, the resolved wall is ahead of the frog again,
    // but it is never judged a second time.
    expect(frogDepth(run)).toBe(2);
    const judgment = run.lastJudgment;
    run = advanceBy(run, 2);
    expect(run.lastJudgment).toBe(judgment);
    expect(run.frog.step).toBe(2);
  });

  it("passes through an opening the frog fits", () => {
    const run = advanceBy(runWithWall(FITS, 5.1), 0.2);
    expect(run.walls[0].result).toBe("passed");
    expect(run.frog.step).toBe(5);
  });

  it("bonks a wall the frog doesn't fit and knocks it back", () => {
    const run = advanceBy(runWithWall(BLOCKED, 5.1), 0.2);
    expect(run.walls[0].result).toBe("bonked");
    expect(run.lastJudgment).toMatchObject({ wall: 0, passed: false });
    expect(run.frog.step).toBe(2);
  });

  it("clamps the knock-back at the corridor start", () => {
    const run = advanceBy(runWithWall(BLOCKED, 1.1, { startStep: 1 }), 0.2);
    expect(run.walls[0].result).toBe("bonked");
    expect(run.frog.step).toBe(0);
  });

  it("is finished once every wall is resolved", () => {
    const run = runWithWall(FITS, 5.1);
    expect(isDone(run)).toBe(false);
    expect(isDone(advanceBy(run, 0.2))).toBe(true);
  });
});

describe("hop", () => {
  it("passes a raised opening mid-hop", () => {
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.2), "hop"), 0.3);
    expect(run.walls[0].result).toBe("passed");
  });

  it("bonks a raised opening when grounded", () => {
    const run = advanceBy(runWithWall(RAISED, 5.2), 0.3);
    expect(run.walls[0].result).toBe("bonked");
  });

  it("bonks a raised opening once the hop has landed", () => {
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.8), "hop"), 1);
    expect(run.walls[0].result).toBe("bonked");
  });

  it("is judged at the instant of crossing, not the end of a long frame", () => {
    // The wall crosses 0.3 s in, mid-hop; by the frame's end the frog has landed.
    const run = advance(applyAction(runWithWall(RAISED, 5.3, { maxFrameDelta: 10 }), "hop"), 1);
    expect(run.walls[0].result).toBe("passed");
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
  it("moves a depth step within the corridor", () => {
    let run = runWithWall(FITS, 20, { startStep: 0 });
    expect(applyAction(run, "back")).toBe(run);
    run = applyAction(run, "forward");
    expect(run.frog.step).toBe(1);
    run = { ...run, frog: { ...run.frog, step: 9 } };
    expect(applyAction(run, "forward")).toBe(run);
  });

  it("judges a wall straight away when jumping forward through its plane", () => {
    const run = applyAction(runWithWall(BLOCKED, 5.5), "forward");
    expect(run.walls[0].result).toBe("bonked");
    expect(run.lastJudgment).toMatchObject({ wall: 0, passed: false, time: 0 });
    expect(run.frog.step).toBe(3);
  });

  it("passes a wall jumped through when the frog fits", () => {
    const run = applyAction(runWithWall(FITS, 6), "forward");
    expect(run.walls[0].result).toBe("passed");
    expect(run.frog.step).toBe(6);
  });

  it("doesn't judge a wall still ahead after the jump", () => {
    const run = applyAction(runWithWall(BLOCKED, 6.5), "forward");
    expect(run.walls[0].result).toBe("pending");
  });
});
