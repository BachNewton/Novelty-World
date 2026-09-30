import { describe, it, expect } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { COURSE_SEED, generateCourse } from "./course";
import { TETROMINOES, cellKey, frogCells, insideLanes, pieceSize, rectOpening as rect } from "./logic";
import type { PullOff } from "./pull-off";
import {
  FROG_THICKNESS,
  WALL_THICKNESS,
  advance,
  applyAction,
  createRun,
  frogShape,
  hopHeight,
  isDone,
  isRiding,
  lanesAt,
  nextWall,
  pullOffHoldingFrog,
  pressJump,
  releaseJump,
  type FrogAction,
  type Run,
} from "./run";
import { TUNING, type Tuning } from "./tuning";
import type { Opening, TetrominoKind } from "./types";

// Unit jumps and unit wall speed keep the arithmetic readable: a jump is 1
// unit, a wall moves 1 unit a second, and a bonk knocks the frog back 3.
const TEST_TUNING: Tuning = {
  ...TUNING,
  wallSpeed: 1,
  depthStep: 1,
  bonkKnockback: 3,
  wallSpacing: 14,
  wallJitter: 2,
  corridorCols: 7,
  courseLength: 100,
  hopAirtime: 0.5,
  jumpRepeatInterval: 0.25,
  maxFrameDelta: 0.1,
};
const SEED = 7;

// The flat L starts at column 2: cells (2..4, 0) and (4, 1).
const FITS = rect([2, 4], [0, 1]);
const BLOCKED = rect([0, 1], [0, 3]);
const RAISED = rect([2, 4], [1, 2]);
// Room for the flat L to slide one column either way, but not to hop.
const WIDE = rect([1, 5], [0, 1]);
// Room for the flat L to hop, or to turn upright where it stands.
const TALL = rect([2, 4], [0, 3]);
// Holds the upright L at column 0, but not the flat L the next turn kicks it
// into, one row up.
const UPRIGHT_AT_EDGE = rect([0, 1], [0, 2]);
// Fits the flat L one column to the left of where it starts.
const LEFT_OF_START = rect([1, 3], [0, 1]);

function runWithWalls(walls: readonly { opening: Opening; depth: number }[], frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  const run = createRun(walls, { ...TEST_TUNING, ...tuning }, SEED);
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

// Whether a wall's depth range and the frog's intersect, by more than
// rounding.
function overlaps(wallDepth: number, frogDepth: number): boolean {
  return wallDepth < frogDepth - 1e-9 && wallDepth + WALL_THICKNESS > frogDepth - FROG_THICKNESS + 1e-9;
}

function act(run: Run, ...actions: FrogAction[]): Run {
  return actions.reduce(applyAction, run);
}

describe("a run", () => {
  it("starts with the frog centred in the start zone and the walls where the course put them", () => {
    const run = createRun([{ opening: FITS, depth: 12 }, { opening: FITS, depth: 30 }], TEST_TUNING, SEED);
    expect(run.frog).toMatchObject({ col: 2, rotation: 0, depth: 0 });
    expect(run.walls.map((w) => w.depth)).toEqual([12, 30]);
    expect(run.lastBonk).toBeNull();
    expect(run.heldJump).toBeNull();
  });

  it("refuses tuning where a bonk could knock the frog into a passed wall, or not move it", () => {
    expect(() => createRun([], { ...TEST_TUNING, wallSpacing: 8 }, SEED)).toThrow();
    expect(() => createRun([], { ...TEST_TUNING, bonkKnockback: 0 }, SEED)).toThrow();
    expect(() => createRun([], { ...TEST_TUNING, jumpRepeatInterval: 0 }, SEED)).toThrow();
    expect(() => createRun([], TUNING, SEED)).not.toThrow();
  });

  it("ignores moves off the corridor edge", () => {
    let run = act(createRun([], TEST_TUNING, SEED), "left", "left", "left");
    expect(run.frog.col).toBe(0);
    run = act(run, "right", "right", "right", "right", "right");
    expect(run.frog.col).toBe(4);
  });

  it("rotates with a wall kick at the edge", () => {
    const run = act(createRun([], TEST_TUNING, SEED), "rotateCw", "left", "left", "left");
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
    run = advanceBy(run, 3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
  });

  it("bonks a frog that doesn't fit, knocking it back by the knock-back from the wall's face", () => {
    const run = advanceBy(runWithWall(BLOCKED, 5.1), 0.2);
    expect(run.frog.depth).toBeCloseTo(2);
    expect(run.lastBonk?.time).toBeCloseTo(0.1);
    expect(run.lastBonk?.depth).toBeCloseTo(5);
    expect(run.walls[0].passed).toBe(false);
    expect(nextWall(run)).toBe(0);
  });

  it("clamps the knock-back at the start zone", () => {
    let run = advanceBy(runWithWall(BLOCKED, 2.1, 2), 0.2);
    expect(run.lastBonk?.depth).toBeCloseTo(2);
    expect(run.frog.depth).toBe(0);
    // A frog in the start zone is safe: the wall disappears at its edge.
    const bonk = run.lastBonk;
    run = advanceBy(run, 2);
    expect(run.lastBonk).toBe(bonk);
    expect(run.frog.depth).toBe(0);
  });

  it("bonks the frog again when the same wall arrives again and it still doesn't fit", () => {
    let run = advanceBy(runWithWall(BLOCKED, 8.1, 8), 0.2);
    expect(run.frog.depth).toBeCloseTo(5);
    run = advanceBy(run, 3);
    expect(run.lastBonk?.time).toBeCloseTo(3.1);
    expect(run.frog.depth).toBeCloseTo(2);
    expect(run.walls[0].passed).toBe(false);
  });

  it("lets the wall pass once the frog fits it before it arrives again", () => {
    let run = advanceBy(runWithWall(LEFT_OF_START, 8.1, 8), 0.2);
    expect(run.frog.depth).toBeCloseTo(5);
    const bonk = run.lastBonk;
    run = advanceBy(applyAction(run, "left"), 3.5);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBe(bonk);
    expect(run.frog.depth).toBeCloseTo(5);
  });

  it("judges each wall of a long frame, nearest first", () => {
    const run = advance(
      runWithWalls([{ opening: BLOCKED, depth: 7 }, { opening: FITS, depth: 5.5 }], 5, { maxFrameDelta: 10 }),
      3,
    );
    expect(run.walls[1].passed).toBe(true);
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastBonk?.time).toBeCloseTo(2);
    expect(run.frog.depth).toBeCloseTo(2);
  });

  it("judges every arrival of a long frame, however many bonks it holds", () => {
    const start = runWithWall(BLOCKED, 8.5, 8, { maxFrameDelta: 10 });
    const long = advance(start, 7);
    const short = advanceBy(start, 7, 0.01);
    // Bonked at 0.5 s (to 5), 3.5 s (to 2) and 6.5 s (to the start).
    expect(long.lastBonk?.time).toBeCloseTo(6.5);
    expect(long.frog.depth).toBe(0);
    expect(short.lastBonk?.time).toBeCloseTo(6.5);
    expect(short.frog.depth).toBe(0);
  });
});

describe("traffic", () => {
  it("brings a wall that reaches the start back behind the rearmost wall, with the same opening", () => {
    const run = advanceBy(runWithWalls([{ opening: BLOCKED, depth: 1 }, { opening: FITS, depth: 20 }], 0), 1.2);
    const [recycled, rearmost] = run.walls;
    expect(recycled.opening).toBe(BLOCKED);
    expect(recycled.passed).toBe(false);
    expect(recycled.depth - rearmost.depth).toBeGreaterThanOrEqual(TEST_TUNING.wallSpacing - TEST_TUNING.wallJitter);
    expect(recycled.depth - rearmost.depth).toBeLessThanOrEqual(TEST_TUNING.wallSpacing + TEST_TUNING.wallJitter);
    expect(run.lastBonk).toBeNull();
  });

  it("places walls coming back from the same seed the same way, jittered", () => {
    const course = [{ opening: FITS, depth: 1 }, { opening: FITS, depth: 2 }, { opening: FITS, depth: 30 }];
    const once = advanceBy(runWithWalls(course, 0), 2.5);
    expect(advanceBy(runWithWalls(course, 0), 2.5).walls).toEqual(once.walls);
    const gaps = [once.walls[0].depth - once.walls[2].depth, once.walls[1].depth - once.walls[0].depth];
    expect(gaps[0]).not.toBeCloseTo(gaps[1]);
  });

  it("judges a wall afresh each time it comes back", () => {
    let run = runWithWalls([{ opening: FITS, depth: 3.5 }, { opening: FITS, depth: 10 }], 3);
    run = advanceBy(run, 1);
    expect(run.walls[0].passed).toBe(true);
    run = advanceBy(run, 3);
    // Back at the far end, ahead of the frog again.
    expect(run.walls[0].passed).toBe(false);
    expect(run.walls[0].depth).toBeGreaterThan(run.frog.depth);
    const arrival = run.walls[0].depth - run.frog.depth;
    run = advanceBy(run, arrival - 0.2);
    expect(run.walls[0].passed).toBe(false);
    run = advanceBy(run, 0.4);
    expect(run.walls[0].passed).toBe(true);
  });

  it("brings a wall back ahead of a frog that has raced past every wall", () => {
    let run = runWithWalls([{ opening: FITS, depth: 0.05 }, { opening: FITS, depth: 3 }], 50);
    run = { ...run, walls: run.walls.map((wall) => ({ ...wall, passed: true })) };
    // The first wall reaches the start edge at the end of this frame.
    run = advance(run, 0.05);
    expect(run.walls[0].passed).toBe(false);
    expect(run.walls[0].depth).toBeGreaterThanOrEqual(50 + TEST_TUNING.wallSpacing - TEST_TUNING.wallJitter);
    expect(nextWall(run)).toBe(0);
  });

  it("never lets a wall reach the frog unjudged, whatever the player does or the frame rate", () => {
    const tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
    const course = generateCourse(COURSE_SEED, tuning);
    const run = createRun(course.rows, tuning, COURSE_SEED, { kind: course.start, pullOffs: course.pullOffs });
    const counts = playRandomly(run, 99);
    // The play really did pass, bonk and loop.
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(20);
  });

  it("keeps the same promises with a pull-off beside the whole road, swapping pieces as it goes", () => {
    const tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
    const course = generateCourse(COURSE_SEED, tuning);
    const everywhere: PullOff = { side: "right", near: 0.5, far: 1e8, width: 3, waiting: "I" };
    const run = createRun(course.rows, tuning, COURSE_SEED, { pullOffs: [everywhere] });
    const counts = playRandomly(run, 7, ["right", "right", "swap"]);
    expect(Math.min(counts.bonks, counts.passes, counts.returns, counts.swaps)).toBeGreaterThan(20);
  });
});

// Plays at random, mixing actions and frames of every length, and checks
// after every step that each wall the frog hasn't passed is ahead of it and
// each it has passed behind it, that the frog's cells in traffic lanes are
// inside the opening of any wall overlapping it, and that every cell is in a
// lane the frog may use there.
function playRandomly(start: Run, seed: number, extra: FrogAction[] = []) {
  const random = createRng(seed).next;
  const actions: FrogAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop", "forward", "forward", "back", ...extra];
  let run = start;
  const counts = { bonks: 0, passes: 0, returns: 0, swaps: 0 };
  for (let step = 0; step < 10000; step++) {
    const before = run;
    run = random() < 0.3 ? applyAction(run, actions[Math.floor(random() * actions.length)]) : advance(run, random() * 1.2);
    if (run.lastBonk !== before.lastBonk) counts.bonks++;
    if (run.frog.kind !== before.frog.kind) counts.swaps++;
    run.walls.forEach((wall, i) => {
      if (wall.passed && !before.walls[i].passed) counts.passes++;
      if (wall.depth > before.walls[i].depth) counts.returns++;
    });
    const frog = run.frog.depth;
    const cols = run.tuning.corridorCols;
    const onRoad = frogCells(frogShape(run.frog)).filter((c) => c.col >= 0 && c.col < cols);
    for (const wall of run.walls) {
      if (wall.passed) expect(wall.depth).toBeLessThanOrEqual(frog + 1e-9);
      else expect(wall.depth).toBeGreaterThanOrEqual(frog - 1e-9);
      if (overlaps(wall.depth, frog)) {
        const open = new Set(wall.opening.map(cellKey));
        for (const c of onRoad) expect(open.has(cellKey(c))).toBe(true);
      }
    }
    expect(insideLanes(run.frog.kind, run.frog, lanesAt(run, frog))).toBe(true);
  }
  return counts;
}

describe("hop", () => {
  it("keeps the frog up for the tuning's airtime", () => {
    expect(TUNING.hopAirtime).toBe(0.7);
    const run = applyAction(createRun([], TUNING, SEED), "hop");
    expect(hopHeight(advanceBy(run, 0.69, 0.01).frog)).toBe(1);
    const landed = advanceBy(run, 0.71, 0.01).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(0.7);
    const short = applyAction(createRun([], TEST_TUNING, SEED), "hop");
    expect(hopHeight(advanceBy(short, 0.49, 0.01).frog)).toBe(1);
    expect(hopHeight(advanceBy(short, 0.51, 0.01).frog)).toBe(0);
  });

  it("passes a raised opening mid-hop", () => {
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.2), "hop"), 0.3);
    expect(run.walls[0].passed).toBe(true);
  });

  it("is bonked by a raised opening when grounded", () => {
    const run = advanceBy(runWithWall(RAISED, 5.2), 0.3);
    expect(run.lastBonk).not.toBeNull();
  });

  it("is judged at the instant of arrival, not the end of a long frame", () => {
    // The wall arrives 0.3 s in, mid-hop; by the frame's end the frog has landed.
    const run = advance(applyAction(runWithWall(RAISED, 5.3, 5, { maxFrameDelta: 10 }), "hop"), 1);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
  });

  it("ignores a hop pressed while airborne", () => {
    let run = applyAction(runWithWall(FITS, 20), "hop");
    run = advanceBy(run, 0.3);
    expect(applyAction(run, "hop")).toBe(run);
    run = advanceBy(run, 0.3);
    expect(applyAction(run, "hop").frog.latestHop?.startedAt).toBeCloseTo(0.6);
  });
});

// The frog at 5 fills 4 to 5. A wall arriving at 0.2 s overlaps it from
// then until 2.2 s, when its back face passes the frog's.
describe("a wall overlapping the frog", () => {
  function overlapping(opening: Opening, ...before: FrogAction[]): Run {
    const run = advanceBy(act(runWithWall(opening, 5.2), ...before), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(overlaps(run.walls[0].depth, run.frog.depth)).toBe(true);
    return run;
  }

  it("is judged when its front face reaches the frog's, once, whatever the frame length", () => {
    for (const frame of [0.01, 0.3, 2.5]) {
      const run = runWithWall(BLOCKED, 5.2, 5, { maxFrameDelta: 10 });
      let judged = 0;
      let next = run;
      for (let t = 0; t < 2.5 - 1e-9; t += frame) {
        const before = next;
        next = advance(next, frame);
        if (next.lastBonk !== before.lastBonk) judged++;
      }
      expect(judged).toBe(1);
      expect(next.lastBonk?.time).toBeCloseTo(0.2);
      expect(next.lastBonk?.depth).toBeCloseTo(5);
    }
    // Passed, it stays passed through the whole overlap and after it.
    const passed = advance(runWithWall(FITS, 5.2, 5, { maxFrameDelta: 10 }), 3);
    expect(passed.walls[0].passed).toBe(true);
    expect(passed.lastBonk).toBeNull();
  });

  it("refuses a slide into its solid cells", () => {
    const run = overlapping(FITS);
    expect(applyAction(run, "left")).toBe(run);
    expect(applyAction(run, "right")).toBe(run);
  });

  it("allows a slide that stays inside its opening", () => {
    const run = overlapping(WIDE);
    expect(applyAction(run, "left").frog.col).toBe(1);
    // One column right still fits; a second would leave the opening.
    expect(act(run, "right", "right").frog.col).toBe(3);
  });

  it("frees the frog to slide once it has gone by", () => {
    const run = overlapping(FITS);
    const late = advanceBy(run, 1.8);
    expect(applyAction(late, "left")).toBe(late);
    expect(applyAction(advanceBy(run, 2), "left").frog.col).toBe(1);
  });

  it("refuses a turn into its solid cells, and allows one inside its opening", () => {
    const run = overlapping(FITS);
    expect(applyAction(run, "rotateCw")).toBe(run);
    expect(applyAction(overlapping(TALL), "rotateCw").frog).toMatchObject({ col: 2, rotation: 1 });
  });

  it("refuses a turn whose wall kick lands in its solid cells", () => {
    // Upright at the left edge, the frog passes the wall; the next turn
    // would kick it back to column 0 as a flat L one row up.
    const run = overlapping(UPRIGHT_AT_EDGE, "rotateCw", "left", "left");
    expect(run.frog).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw")).toBe(run);
  });

  it("refuses a hop into its solid cells, and allows one inside its opening", () => {
    const run = overlapping(FITS);
    expect(applyAction(run, "hop")).toBe(run);
    expect(hopHeight(applyAction(overlapping(TALL), "hop").frog)).toBe(1);
  });

  it("rides a frog that passed a raised opening across it until it has gone by, then lands it", () => {
    // Up from 0 s, the frog passes at 0.2 s; its airtime ends at 0.5 s.
    const run = overlapping(RAISED, "hop");
    expect(hopHeight(advanceBy(run, 1.8).frog)).toBe(1);
    const landed = advanceBy(run, 2).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(2.2);
    // A long frame lands it at the same instant.
    const long = advance(applyAction(runWithWall(RAISED, 5.2, 5, { maxFrameDelta: 10 }), "hop"), 3);
    expect(long.walls[0].passed).toBe(true);
    expect(long.frog.latestHop?.landedAt).toBeCloseTo(2.2);
    expect(advanceBy(run, 2).lastBonk).toBeNull();
  });

  it("gives an early hop grace: one whose airtime ends mid-overlap still passes and rides across", () => {
    // Up from 0 s with 0.5 s of airtime, the frog meets the raised opening at
    // 0.45 s, just before it would have landed, and rides it until 2.45 s.
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.45), "hop"), 0.5, 0.01);
    expect(run.walls[0].passed).toBe(true);
    expect(isRiding(run)).toBe(true);
    const across = advanceBy(run, 1.9, 0.01);
    expect(hopHeight(across.frog)).toBe(1);
    expect(across.lastBonk).toBeNull();
    const landed = advanceBy(run, 2, 0.01).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(2.45);
  });

  it("rides even where landing would fit, and keeps riding through a slide", () => {
    // Room to stand or hop, and to slide: the frog passed up high rides on.
    const run = overlapping(rect([1, 5], [0, 3]), "hop");
    const slid = applyAction(advanceBy(run, 0.5), "left");
    expect(slid.frog.col).toBe(1);
    expect(isRiding(slid)).toBe(true);
    expect(hopHeight(advanceBy(slid, 1).frog)).toBe(1);
    expect(hopHeight(advanceBy(slid, 1.5).frog)).toBe(0);
  });

  it("jumps a riding frog forward in its pose and height, clearing the wall sooner", () => {
    // At 0.6 s the wall fills 4.6 to 5.6. One jump forward leaves the frog
    // (5 to 6) still riding it; a second takes it clear, and it lands, long
    // before the 2.2 s the wall would have taken to go by.
    const run = advanceBy(overlapping(RAISED, "hop"), 0.3);
    expect(isRiding(run)).toBe(true);
    const once = applyAction(run, "forward");
    expect(once.frog).toMatchObject({ depth: 6, col: run.frog.col, rotation: run.frog.rotation });
    expect(isRiding(once)).toBe(true);
    const twice = applyAction(once, "forward");
    expect(twice.frog.depth).toBe(7);
    expect(hopHeight(twice.frog)).toBe(0);
    expect(twice.frog.latestHop?.landedAt).toBeCloseTo(0.6);
  });

  it("repeats a held jump while riding", () => {
    // Riding from 0.3 s, the press jumps the frog to 6, still on the wall;
    // the repeat at 0.55 s carries it clear to 7, where it lands.
    const riding = pressJump(overlapping(RAISED, "hop"), "forward");
    expect(riding.frog.depth).toBe(6);
    expect(isRiding(riding)).toBe(true);
    const repeated = advanceBy(riding, 0.25, 0.01);
    expect(repeated.frog.depth).toBe(7);
    expect(repeated.frog.latestHop?.landedAt).toBeCloseTo(0.55);
  });

  it("refuses a hop while riding", () => {
    const run = advanceBy(overlapping(RAISED, "hop"), 0.3);
    expect(applyAction(run, "hop")).toBe(run);
  });

  it("knocks a bonked frog back clear of every wall, even the closest walls the tuning allows", () => {
    // Walls 5 apart, the closest a 3-jump knock-back allows. The frog passes
    // the first at 0.2 s; the second arrives at 5.2 s and knocks it back to
    // 7, its back face touching the first wall's.
    let run = runWithWalls([{ opening: FITS, depth: 10.2 }, { opening: BLOCKED, depth: 15.2 }], 10, { wallSpacing: 9 });
    run = advanceBy(run, 5.3);
    expect(run.lastBonk?.time).toBeCloseTo(5.2);
    expect(run.frog.depth).toBeCloseTo(7);
    for (const wall of run.walls) expect(overlaps(wall.depth, run.frog.depth)).toBe(false);
    expect(run.walls[0].depth + WALL_THICKNESS).toBeLessThanOrEqual(run.frog.depth - FROG_THICKNESS + 1e-9);
    // Clear of the wall it passed, it moves freely, but can't jump back into it.
    expect(applyAction(run, "left").frog.col).toBe(1);
    expect(applyAction(run, "back")).toBe(run);
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

  it("is bonked by a wall it jumps into and doesn't fit", () => {
    const run = applyAction(runWithWall(BLOCKED, 5.5), "forward");
    expect(run.frog.depth).toBe(2.5);
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastBonk).toEqual({ time: 0, depth: 5.5 });
  });

  it("doesn't judge a wall still ahead after the jump", () => {
    const run = applyAction(runWithWall(BLOCKED, 6.5), "forward");
    expect(run.frog.depth).toBe(6);
    expect(run.lastBonk).toBeNull();
  });

  it("is refused going back into or through a wall it has passed", () => {
    let run = applyAction(runWithWall(FITS, 5.5), "forward");
    expect(run.walls[0].passed).toBe(true);
    // The wall overlaps the frog, whose cells are all inside its opening,
    // and the jump back is still refused.
    expect(applyAction(run, "back")).toBe(run);
    // A second later the jump would still land the frog's back in the wall.
    run = advanceBy(run, 1);
    expect(applyAction(run, "back")).toBe(run);
    // Once it has moved on far enough, the frog can jump back again.
    run = advanceBy(run, 1.6);
    expect(applyAction(run, "back").frog.depth).toBe(5);
    expect(run.lastBonk).toBeNull();
  });
});

describe("a held jump", () => {
  function jumpsIn(seconds: number, frame: number): Run {
    const run = pressJump(createRun([], { ...TEST_TUNING, maxFrameDelta: 10 }, SEED), "forward");
    return advanceBy(run, seconds, frame);
  }

  it("jumps on the press, then again every repeat interval, whatever the frame rate", () => {
    const pressed = pressJump(createRun([], TEST_TUNING, SEED), "forward");
    expect(pressed.frog.depth).toBe(1);
    // Repeats at 0.25, 0.5 and 0.75 s.
    for (const frame of [0.01, 0.05, 0.1, 0.3, 0.9]) {
      expect(jumpsIn(0.9, frame).frog.depth).toBe(4);
    }
    expect(jumpsIn(1.2, 0.4).frog.depth).toBe(5);
  });

  it("repeats a held jump back too", () => {
    let run = createRun([], TEST_TUNING, SEED);
    run = { ...run, frog: { ...run.frog, depth: 10 } };
    run = advanceBy(pressJump(run, "back"), 0.6);
    expect(run.frog.depth).toBe(7);
  });

  it("keeps jumping after a bonk, a full repeat interval later", () => {
    let run = pressJump(runWithWall(BLOCKED, 10, 0), "forward");
    // At 2 s the wall reaches the frog at 8, just as the key would repeat,
    // and bonks it back to 5.
    run = advanceBy(run, 2.1);
    expect(run.lastBonk?.time).toBeCloseTo(2);
    expect(run.frog.depth).toBeCloseTo(5);
    expect(run.heldJump?.nextAt).toBeCloseTo(2.25);
    // Still held, it jumps on at 2.25 s and 2.5 s, and at 2.75 s jumps into
    // the wall at 7.25 and is bonked again.
    run = advanceBy(run, 0.5);
    expect(run.frog.depth).toBe(7);
    run = advanceBy(run, 0.2);
    expect(run.lastBonk?.time).toBeCloseTo(2.75);
    expect(run.frog.depth).toBeCloseTo(4.25);
  });

  it("waits a full repeat interval after a bonk between repeats, rather than jumping at once", () => {
    let run = createRun([{ opening: BLOCKED, depth: 9.1 }], TEST_TUNING, SEED);
    run = pressJump({ ...run, frog: { ...run.frog, depth: 10 } }, "back");
    expect(run.frog.depth).toBe(9);
    // The wall arrives at 0.1 s, before the repeat due at 0.25 s, and bonks
    // the frog to 6. The repeat moves to 0.35 s.
    run = advanceBy(run, 0.3, 0.01);
    expect(run.lastBonk?.time).toBeCloseTo(0.1);
    expect(run.frog.depth).toBeCloseTo(6);
    run = advanceBy(run, 0.1, 0.01);
    expect(run.frog.depth).toBeCloseTo(5);
  });

  it("keeps repeating when a jump back is refused", () => {
    let run = applyAction(runWithWall(FITS, 5.5), "forward");
    run = pressJump(run, "back");
    expect(run.frog.depth).toBe(6);
    expect(run.heldJump).not.toBeNull();
    // The wall clears the frog's back after 2.5 s, and the held key goes on.
    run = advanceBy(run, 2.9);
    expect(run.heldJump).not.toBeNull();
    expect(run.frog.depth).toBe(5);
  });

  it("stops when its key is released, or every key is let go", () => {
    const held = pressJump(createRun([], TEST_TUNING, SEED), "forward");
    expect(releaseJump(held, "back")).toBe(held);
    const released = releaseJump(held, "forward");
    expect(released.heldJump).toBeNull();
    expect(advanceBy(released, 1).frog.depth).toBe(1);
    // Losing focus lets go of whatever is held.
    const blurred = releaseJump(held);
    expect(blurred.heldJump).toBeNull();
    expect(advanceBy(blurred, 1).frog.depth).toBe(1);
  });

  it("follows the latest jump key pressed", () => {
    let run = createRun([], TEST_TUNING, SEED);
    run = { ...run, frog: { ...run.frog, depth: 10 } };
    run = pressJump(pressJump(run, "forward"), "back");
    expect(run.heldJump?.direction).toBe("back");
    expect(releaseJump(run, "forward")).toBe(run);
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
    expect(pressJump(run, "back")).toBe(run);
  });
});

// A pull-off on the right, lanes 7 to 9, holding a frog whose depth range
// lies from 10 to 16: its front face from 11 to 16.
const PULL_OFF: PullOff = { side: "right", near: 10, far: 16, width: 3, waiting: "I" };

function runBeside(frog: Partial<Run["frog"]>, walls: readonly { opening: Opening; depth: number }[] = [], pullOff: Partial<PullOff> = {}): Run {
  const run = createRun(walls, TEST_TUNING, SEED, { pullOffs: [{ ...PULL_OFF, ...pullOff }] });
  return { ...run, frog: { ...run.frog, ...frog } };
}

describe("a pull-off", () => {
  it("takes the frog sliding in from the outer traffic lane, one lane a press, until it is entirely inside", () => {
    // The flat L at lane 4 fills lanes 4 to 6.
    let run = runBeside({ col: 4, depth: 12 });
    run = applyAction(run, "right");
    expect(run.frog.col).toBe(5);
    run = act(run, "right", "right");
    expect(run.frog.col).toBe(7);
    expect(pullOffHoldingFrog(run)).toBe(0);
    // Its outer edge is as far as it goes.
    expect(applyAction(run, "right")).toBe(run);
  });

  it("lets the frog back onto the road by sliding out", () => {
    const run = act(runBeside({ col: 7, depth: 12 }), "left", "left", "left");
    expect(run.frog.col).toBe(4);
    expect(pullOffHoldingFrog(run)).toBeNull();
  });

  it("refuses a slide into its barriers, beside the stretch at either end", () => {
    // The frog's back face short of the near end, or its front past the far end.
    for (const depth of [10.5, 16.5, 5, 30]) {
      const run = runBeside({ col: 4, depth });
      expect(applyAction(run, "right")).toBe(run);
    }
    // At the stretch's very ends it may.
    expect(applyAction(runBeside({ col: 4, depth: 11 }), "right").frog.col).toBe(5);
    expect(applyAction(runBeside({ col: 4, depth: 16 }), "right").frog.col).toBe(5);
  });

  it("turns the frog inside the road's and the pull-off's lanes together, kicking it back in from the outer edge", () => {
    // The flat L entirely inside turns upright, two lanes wide, in place.
    const upright = applyAction(runBeside({ col: 7, depth: 12 }), "rotateCw");
    expect(upright.frog).toMatchObject({ col: 7, rotation: 1 });
    // The upright I against the outer edge lies flat kicked back in, straddling the edge.
    expect(applyAction(runBeside({ kind: "I", col: 9, rotation: 1, depth: 12 }), "rotateCw").frog).toMatchObject({ col: 6, rotation: 2 });
    // The upright L at the road's edge turns flat into the pull-off's lanes
    // beside its stretch, but beside a barrier it is kicked back onto the road.
    expect(applyAction(runBeside({ col: 5, rotation: 1, depth: 12 }), "rotateCcw").frog).toMatchObject({ col: 5, rotation: 0 });
    expect(applyAction(runBeside({ col: 5, rotation: 1, depth: 20 }), "rotateCcw").frog).toMatchObject({ col: 4, rotation: 0 });
  });

  it("lets the frog jump within the stretch, and refuses a jump past either end while any cell is in pull-off lanes", () => {
    let run = runBeside({ col: 7, depth: 12 });
    run = act(run, "forward", "forward", "forward", "forward");
    expect(run.frog.depth).toBe(16);
    expect(applyAction(run, "forward")).toBe(run);
    run = act(run, "back", "back", "back", "back", "back");
    expect(run.frog.depth).toBe(11);
    expect(applyAction(run, "back")).toBe(run);
    // Straddling the edge, the same.
    const straddling = runBeside({ col: 5, depth: 16 });
    expect(applyAction(straddling, "forward")).toBe(straddling);
    // On the road, the stretch's ends don't matter.
    expect(applyAction(runBeside({ col: 4, depth: 16 }), "forward").frog.depth).toBe(17);
    expect(applyAction(runBeside({ col: 4, depth: 11 }), "back").frog.depth).toBe(10);
  });

  it("keeps a held jump repeating when it is refused at the stretch's end", () => {
    let run = pressJump(runBeside({ col: 7, depth: 15 }), "forward");
    expect(run.frog.depth).toBe(16);
    run = advanceBy(run, 0.6);
    expect(run.frog.depth).toBe(16);
    expect(run.heldJump).not.toBeNull();
  });
});

// The flat L at lane 5 straddles the edge: lanes 5 and 6 on the road, lane 7
// (and its raised end) in the pull-off.
describe("a row arriving at a frog straddling a pull-off's edge", () => {
  it("is judged on the frog's cells in traffic lanes only, and passes when they are all in the opening", () => {
    const run = advanceBy(runBeside({ col: 5, depth: 12 }, [{ opening: rect([5, 6], [0, 0]), depth: 12.2 }]), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    // While the row overlaps it, the frog may slide deeper into the pull-off,
    // which keeps its road cells in the opening, but not further onto the road.
    expect(applyAction(run, "right").frog.col).toBe(6);
    expect(applyAction(run, "left")).toBe(run);
  });

  it("bonks when a road cell meets a vehicle, knocking the frog back onto the road", () => {
    const run = advanceBy(runBeside({ col: 5, depth: 12 }, [{ opening: rect([6, 6], [0, 3]), depth: 12.2 }]), 0.3);
    expect(run.lastBonk?.depth).toBeCloseTo(12);
    expect(run.frog.depth).toBeCloseTo(9);
    // Shifted sideways just far enough that every cell is in traffic lanes.
    expect(run.frog.col).toBe(4);
    expect(insideLanes(run.frog.kind, run.frog, { first: 0, last: 6 })).toBe(true);
  });

  it("passes a frog entirely inside the pull-off, whatever the row, and keeps it from sliding into the row's vehicles", () => {
    let run = advanceBy(runBeside({ col: 7, depth: 12 }, [{ opening: [], depth: 12.2 }]), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(applyAction(run, "left")).toBe(run);
    // Once the row has gone by, the road is open again.
    run = advanceBy(run, 2);
    expect(applyAction(run, "left").frog.col).toBe(6);
  });

  it("doesn't carry a frog up in the pull-off as a rider: it lands at the end of its airtime", () => {
    const run = advanceBy(applyAction(runBeside({ col: 7, depth: 12 }, [{ opening: [], depth: 12.2 }]), "hop"), 0.6, 0.01);
    expect(run.walls[0].passed).toBe(true);
    expect(isRiding(run)).toBe(false);
    expect(hopHeight(run.frog)).toBe(0);
    expect(run.frog.latestHop?.landedAt).toBeCloseTo(0.5);
  });
});

describe("a swap", () => {
  it("gives the frog the waiting piece and leaves its own in its place, so a second swap swaps back", () => {
    const run = runBeside({ col: 7, depth: 12 }, [], { waiting: "O" });
    const swapped = applyAction(run, "swap");
    expect(swapped.frog).toMatchObject({ kind: "O", col: 7, rotation: 0, depth: 12 });
    expect(swapped.pullOffs[0].waiting).toBe("L");
    const back = applyAction(swapped, "swap");
    expect(back.frog).toMatchObject({ kind: "L", col: 7, rotation: 0 });
    expect(back.pullOffs[0].waiting).toBe("O");
  });

  it("keeps the frog's rotation and lane when the new piece fits there", () => {
    // The upright L at lane 8 fills lanes 8 and 9; so does the upright S.
    const swapped = applyAction(runBeside({ col: 8, rotation: 1, depth: 12 }, [], { waiting: "S" }), "swap");
    expect(swapped.frog).toMatchObject({ kind: "S", col: 8, rotation: 1 });
  });

  it("otherwise takes the first rotation, then lane, that fits inside the pull-off", () => {
    // The flat I is four lanes wide; the first rotation that fits stands it
    // up, at the pull-off's first lane.
    const swapped = applyAction(runBeside({ col: 7, depth: 12 }), "swap");
    expect(swapped.frog).toMatchObject({ kind: "I", col: 7, rotation: 1 });
    // The upright I in the outer lane swapped for the T, two lanes wide in
    // that rotation, which doesn't fit there: the T's first rotation, three
    // lanes wide, fits from the pull-off's first lane.
    const t = applyAction(runBeside({ kind: "I", col: 9, rotation: 1, depth: 12 }, [], { waiting: "T" }), "swap");
    expect(t.frog).toMatchObject({ kind: "T", col: 7, rotation: 0 });
  });

  it("does nothing unless the frog is entirely inside a pull-off", () => {
    for (const frog of [{ col: 6, depth: 12 }, { col: 4, depth: 12 }, { col: 2, depth: 0 }]) {
      const run = runBeside(frog);
      expect(applyAction(run, "swap")).toBe(run);
    }
    const nowhere = createRun([], TEST_TUNING, SEED);
    expect(applyAction(nowhere, "swap")).toBe(nowhere);
  });

  it("can't happen in a run whose pull-off can't be landed in, or can't hold its piece", () => {
    expect(() => runBeside({}, [], { far: 11.5 })).toThrow();
    expect(() => runBeside({}, [], { width: 1, waiting: "O" })).toThrow();
  });
});

describe("pieces other than the L", () => {
  const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
  const atFive = (run: Run): Run => ({ ...run, frog: { ...run.frog, depth: 5 } });

  it.each(KINDS)("the %s starts centred, passes a row shaped like it, and is bonked by one a lane over", (kind) => {
    const start = createRun([], TEST_TUNING, SEED, { kind });
    expect(start.frog.col).toBe(Math.floor((7 - pieceSize(kind, 0).width) / 2));
    const own = frogCells(frogShape(start.frog));
    const passed = advanceBy(atFive(createRun([{ opening: own, depth: 5.2 }], TEST_TUNING, SEED, { kind })), 0.3);
    expect(passed.walls[0].passed).toBe(true);
    const over = own.map((c) => ({ col: c.col + 1, row: c.row }));
    const bonked = advanceBy(atFive(createRun([{ opening: over, depth: 5.2 }], TEST_TUNING, SEED, { kind })), 0.3);
    expect(bonked.lastBonk).not.toBeNull();
    // One slide over first, and it fits.
    const slid = advanceBy(applyAction(atFive(createRun([{ opening: over, depth: 5.2 }], TEST_TUNING, SEED, { kind })), "right"), 0.3);
    expect(slid.walls[0].passed).toBe(true);
  });

  it("stands the I up to pass a one-lane slot, and rides it across a raised opening", () => {
    const slot = atFive(createRun([{ opening: rect([3, 3], [0, 3]), depth: 5.2 }], TEST_TUNING, SEED, { kind: "I" }));
    const upright = applyAction(slot, "rotateCw");
    expect(upright.frog).toMatchObject({ col: 2, rotation: 1 });
    expect(advanceBy(applyAction(upright, "right"), 0.3).walls[0].passed).toBe(true);
    const raised = atFive(createRun([{ opening: rect([1, 4], [1, 1]), depth: 5.2 }], TEST_TUNING, SEED, { kind: "I" }));
    const riding = advanceBy(applyAction(raised, "hop"), 0.6, 0.01);
    expect(riding.walls[0].passed).toBe(true);
    expect(isRiding(riding)).toBe(true);
  });
});
