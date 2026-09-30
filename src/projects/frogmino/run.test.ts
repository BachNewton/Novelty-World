import { describe, it, expect } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { COURSE_SEED, generateCourse, type Course, type CourseWall } from "./course";
import { TETROMINOES, cellKey, frogCells, insideLanes, pieceSize, rectOpening as rect } from "./logic";
import type { PullOff } from "./pull-off";
import {
  FROG_THICKNESS,
  advance,
  applyAction,
  createRun,
  crossedFinish,
  frogShape,
  hopHeight,
  inPlay,
  isDone,
  isRiding,
  lanesAt,
  nextWall,
  onOverpass,
  overlappingSolids,
  pullOffHoldingFrog,
  pressJump,
  releaseJump,
  type FrogAction,
  type Run,
  type Wall,
} from "./run";
import { rowBack } from "./traffic";
import { TUNING, type Tuning } from "./tuning";
import type { Cell, Opening, Solid, TetrominoKind } from "./types";

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
  recycleBehind: 5,
  trafficHorizon: 30,
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

// Every cell of the 7 × 4 face that `opening` leaves out.
function closed(opening: Opening, cols: readonly number[] = [0, 1, 2, 3, 4, 5, 6]): Cell[] {
  const open = new Set(opening.map(cellKey));
  return cols.flatMap((col) => [0, 1, 2, 3].map((row) => ({ col, row }))).filter((cell) => !open.has(cellKey(cell)));
}

interface TestWall {
  opening: Opening;
  depth: number;
  // How far the row reaches back; one unit unless the test says otherwise.
  length?: number;
}

// A row as one vehicle filling everything but the opening.
function wall({ opening, depth, length = 1 }: TestWall): CourseWall {
  return { solids: [{ cells: closed(opening), length }], depth };
}

// The frog dropped onto the road, in play.
function onRoad(run: Run, frog: Partial<Run["frog"]> = {}): Run {
  return { ...run, droppedAt: 0, frog: { ...run.frog, ...frog } };
}

function runWithWalls(walls: readonly TestWall[], frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return onRoad(createRun(walls.map(wall), { ...TEST_TUNING, ...tuning }, SEED), { depth: frogDepth });
}

function runWithWall(opening: Opening, depth: number, frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return runWithWalls([{ opening, depth }], frogDepth, tuning);
}

function advanceBy(run: Run, seconds: number, frame = 0.05): Run {
  let next = run;
  for (let t = 0; t < seconds - 1e-9; t += frame) next = advance(next, frame);
  return next;
}

// The vehicles of a wall whose depth range and the frog's intersect, by more
// than rounding.
function overlapping(w: Wall, frogDepth: number): Solid[] {
  if (w.depth >= frogDepth - 1e-9) return [];
  return w.solids.filter((solid) => w.depth + solid.length > frogDepth - FROG_THICKNESS + 1e-9);
}

function act(run: Run, ...actions: FrogAction[]): Run {
  return actions.reduce(applyAction, run);
}

describe("a run", () => {
  it("starts with the frog centred on the overpass, out of play, and the course's rows where it put them", () => {
    const run = createRun([wall({ opening: FITS, depth: 12 }), wall({ opening: FITS, depth: 30 })], TEST_TUNING, SEED);
    expect(run.frog).toMatchObject({ col: 2, rotation: 0, depth: 0 });
    expect(onOverpass(run)).toBe(true);
    expect(inPlay(run)).toBe(false);
    expect(run.walls.slice(0, 2).map((w) => w.depth)).toEqual([12, 30]);
    expect(run.lastBonk).toBeNull();
    expect(run.heldJump).toBeNull();
  });

  it("lines the course's rows up again beyond them, back to front, out to the traffic horizon", () => {
    const run = createRun([wall({ opening: FITS, depth: 12, length: 3 }), wall({ opening: FITS, depth: 30 })], TUNING, SEED);
    expect(run.walls.map((w) => w.row).slice(0, 5)).toEqual([0, 1, 0, 1, 0]);
    run.walls.slice(1).forEach((w, i) => {
      const gap = w.depth - rowBack(run.walls[i]);
      if (i === 0) return;
      expect(gap).toBeGreaterThanOrEqual(TUNING.wallSpacing - TUNING.wallJitter);
      expect(gap).toBeLessThanOrEqual(TUNING.wallSpacing + TUNING.wallJitter);
    });
    expect(rowBack(run.walls[run.walls.length - 1])).toBeGreaterThanOrEqual(TUNING.trafficHorizon);
    expect(rowBack(run.walls[run.walls.length - 2])).toBeLessThan(TUNING.trafficHorizon);
  });

  it("refuses tuning where a bonk could knock the frog into a passed wall, or not move it", () => {
    expect(() => createRun([], { ...TEST_TUNING, wallSpacing: 5 }, SEED)).toThrow();
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

  it("knocks the frog back however far that takes it, behind the start and on down the road", () => {
    let run = advanceBy(runWithWall(BLOCKED, 2.1, 2), 0.2);
    expect(run.lastBonk?.depth).toBeCloseTo(2);
    expect(run.frog.depth).toBeCloseTo(-1);
    // There is no safe zone: the wall keeps coming, and bonks it again.
    run = advanceBy(run, 3);
    expect(run.lastBonk?.time).toBeCloseTo(3.1);
    expect(run.frog.depth).toBeCloseTo(-4);
    run = advanceBy(run, 30);
    expect(run.frog.depth).toBeCloseTo(-34);
    expect(run.walls[0].passed).toBe(false);
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
    // Bonked at 0.5 s (to 5), 3.5 s (to 2) and 6.5 s (to -1, behind the start).
    expect(long.lastBonk?.time).toBeCloseTo(6.5);
    expect(long.frog.depth).toBeCloseTo(-1);
    expect(short.lastBonk?.time).toBeCloseTo(6.5);
    expect(short.frog.depth).toBeCloseTo(-1);
  });
});

describe("traffic", () => {
  it("recycles a row only once it is the recycling distance behind the frog, bringing it back beyond the traffic horizon", () => {
    // The frog at 20 passes the row at 1 s; the row's back goes by 20 - 5 at 7 s.
    let run = runWithWalls([{ opening: FITS, depth: 21 }], 20);
    run = advanceBy(run, 6.9, 0.1);
    expect(run.walls[0].passed).toBe(true);
    expect(run.walls[0].depth).toBeCloseTo(14.1);
    const solids = run.walls[0].solids;
    run = advanceBy(run, 0.2, 0.1);
    const [recycled, ...rest] = run.walls;
    expect(recycled.passed).toBe(false);
    expect(recycled.solids).toBe(solids);
    expect(recycled.depth).toBeGreaterThanOrEqual(20 + TEST_TUNING.trafficHorizon - 0.2);
    // Behind the frontmost row, at the usual back-to-front spacing.
    const frontmost = Math.max(...rest.map(rowBack));
    expect(recycled.depth - frontmost).toBeGreaterThanOrEqual(TEST_TUNING.wallSpacing - TEST_TUNING.wallJitter - 0.2);
    expect(run.lastBonk).toBeNull();
  });

  it("places rows coming back from the same seed the same way, jittered", () => {
    const course = [{ opening: FITS, depth: 1 }, { opening: FITS, depth: 2.5 }];
    const once = advanceBy(runWithWalls(course, 0.5), 12);
    expect(advanceBy(runWithWalls(course, 0.5), 12).walls).toEqual(once.walls);
    const ahead = [...once.walls].sort((x, y) => x.depth - y.depth);
    const gaps = ahead.slice(1).map((w, i) => w.depth - rowBack(ahead[i]));
    expect(new Set(gaps.map((gap) => gap.toFixed(3))).size).toBeGreaterThan(1);
  });

  it("judges a row afresh each time it comes back", () => {
    let run = runWithWalls([{ opening: FITS, depth: 3.5 }], 3);
    run = advanceBy(run, 1);
    expect(run.walls[0].passed).toBe(true);
    run = advanceBy(run, 7);
    // Back far ahead of the frog again.
    expect(run.walls[0].passed).toBe(false);
    expect(run.walls[0].depth).toBeGreaterThan(run.frog.depth + TEST_TUNING.trafficHorizon - 2);
    const arrival = run.walls[0].depth - run.frog.depth;
    run = advanceBy(run, arrival - 0.2);
    expect(run.walls[0].passed).toBe(false);
    run = advanceBy(run, 0.4);
    expect(run.walls[0].passed).toBe(true);
  });

  it("brings a row back beyond the traffic horizon when no other row is further out", () => {
    let run = runWithWalls([{ opening: FITS, depth: 3 }], 50, { trafficHorizon: 1 });
    run = { ...run, walls: run.walls.map((w) => ({ ...w, passed: true })) };
    expect(run.walls).toHaveLength(1);
    run = advance(run, 0.05);
    expect(run.walls[0].passed).toBe(false);
    expect(run.walls[0].depth).toBeCloseTo(51);
    expect(nextWall(run)).toBe(0);
  });

  it("recycles only out of view, for a frog far behind the start as much as ahead of it", () => {
    let run = runWithWalls([{ opening: FITS, depth: -170 }, { opening: FITS, depth: -150 }], -200);
    let returns = 0;
    for (let step = 0; step < 1000; step++) {
      const before = run;
      run = advance(run, 0.1);
      run.walls.forEach((w, i) => {
        if (w.depth <= before.walls[i].depth) return;
        returns++;
        expect(rowBack(before.walls[i]) - 0.1).toBeLessThan(before.frog.depth - TEST_TUNING.recycleBehind);
        expect(w.depth).toBeGreaterThanOrEqual(run.frog.depth + TEST_TUNING.trafficHorizon - 0.1);
      });
    }
    expect(run.frog.depth).toBe(-200);
    expect(run.passes).toBeGreaterThan(3);
    expect(returns).toBeGreaterThan(3);
  });

  it("never lets a wall reach the frog unjudged, whatever the player does or the frame rate", () => {
    const tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
    const course = generateCourse(COURSE_SEED, tuning);
    const run = onRoad(createRun(course.rows, tuning, COURSE_SEED, { kind: course.start, pullOffs: course.pullOffs }));
    const counts = playRandomly(run, 99, [], readsRows(course));
    // The play really did pass, bonk and loop.
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  });

  it("keeps the same promises with a pull-off beside the whole road, swapping pieces as it goes", () => {
    const tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
    const course = generateCourse(COURSE_SEED, tuning);
    const everywhere: PullOff = { side: "right", near: -1e8, far: 1e8, width: 3, waiting: "I" };
    const run = onRoad(createRun(course.rows, tuning, COURSE_SEED, { pullOffs: [everywhere] }), { depth: 1 });
    const counts = playRandomly(run, 7, ["right", "right", "swap"], (unread) => unread);
    expect(Math.min(counts.bonks, counts.passes, counts.returns, counts.swaps)).toBeGreaterThan(10);
  });

  it("keeps the same promises for a frog that keeps going back, far behind the start", () => {
    const tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
    const course = generateCourse(COURSE_SEED, tuning);
    const run = onRoad(createRun(course.rows, tuning, COURSE_SEED, { kind: course.start }));
    const counts = playRandomly(run, 3, ["back", "back", "back", "back", "back"], readsRows(course));
    expect(counts.furthestBack).toBeLessThan(-100);
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  });
});

// A player who, now and then, reads the next row and takes up a pose it was
// built around, piece and all, while nothing overlaps the frog. Otherwise the
// random frog would hardly ever fit a row, and a row built for another piece
// would knock it back down the road forever.
function readsRows(course: Course): (run: Run) => Run {
  return (run) => {
    const next = nextWall(run);
    if (next === null || run.walls.some((w) => overlappingSolids(w, run.frog.depth).length > 0)) return run;
    const { answers } = course.rows[run.walls[next].row];
    const answer = answers.find((a) => a.kind === run.frog.kind) ?? answers[0];
    return { ...run, frog: { ...run.frog, kind: answer.kind, col: answer.col, rotation: answer.rotation } };
  };
}

// Plays at random, mixing actions and frames of every length, and checks
// after every step that each wall the frog hasn't passed is ahead of it and
// each it has passed behind it; that the frog's cells in traffic lanes are
// clear of every vehicle overlapping it; that a wall's overlapping vehicles
// only ever drop away, so the opening only grows; that a wall is recycled
// only once it is well behind the frog, and comes back beyond the traffic
// horizon; and that every cell is in a lane the frog may use there.
function playRandomly(start: Run, seed: number, extra: FrogAction[], lineUp: (run: Run) => Run) {
  const random = createRng(seed).next;
  const actions: FrogAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop", "forward", "forward", "back", ...extra];
  const { recycleBehind, trafficHorizon, wallSpeed, wallRows, maxFrameDelta } = start.tuning;
  let run = start;
  const counts = { bonks: 0, passes: 0, returns: 0, swaps: 0, furthestBack: start.frog.depth };
  for (let step = 0; step < 10000; step++) {
    const before = run;
    const elapsed = random() * 1.2;
    const roll = random();
    if (roll < 0.15) run = lineUp(run);
    else if (roll < 0.4) run = applyAction(run, actions[Math.floor(random() * actions.length)]);
    else run = advance(run, elapsed);
    if (run.lastBonk !== before.lastBonk) counts.bonks++;
    // The reader taking up a row's piece is no swap.
    if (run.frog.kind !== before.frog.kind && roll >= 0.15) counts.swaps++;
    counts.passes += run.passes - before.passes;
    counts.furthestBack = Math.min(counts.furthestBack, run.frog.depth);
    const frog = run.frog.depth;
    const cols = run.tuning.corridorCols;
    const roadCells = frogCells(frogShape(run.frog)).filter((c) => c.col >= 0 && c.col < cols);
    run.walls.forEach((w, i) => {
      const was = before.walls[i];
      if (w.depth > was.depth) {
        counts.returns++;
        const travel = wallSpeed * Math.min(elapsed, maxFrameDelta);
        expect(rowBack(was) - travel).toBeLessThan(before.frog.depth - recycleBehind);
        expect(w.depth).toBeGreaterThanOrEqual(frog + trafficHorizon - travel - 1e-9);
      } else if (w.passed && was.passed) {
        const earlier = overlappingSolids(was, before.frog.depth);
        for (const solid of overlappingSolids(w, frog)) expect(earlier).toContain(solid);
      }
      if (w.passed) expect(w.depth).toBeLessThanOrEqual(frog + 1e-9);
      else expect(w.depth).toBeGreaterThanOrEqual(frog - 1e-9);
      const solid = new Set(overlapping(w, frog).flatMap((v) => v.cells.map(cellKey)));
      if (solid.size === 0) return;
      for (const c of roadCells) {
        expect(solid.has(cellKey(c))).toBe(false);
        expect(c.row).toBeLessThan(wallRows);
      }
    });
    expect(insideLanes(run.frog.kind, run.frog, lanesAt(run, frog))).toBe(true);
  }
  return counts;
}

describe("hop", () => {
  it("keeps the frog up for the tuning's airtime", () => {
    expect(TUNING.hopAirtime).toBe(0.7);
    const run = applyAction(onRoad(createRun([], TUNING, SEED)), "hop");
    expect(hopHeight(advanceBy(run, 0.69, 0.01).frog)).toBe(1);
    const landed = advanceBy(run, 0.71, 0.01).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(0.7);
    const short = applyAction(onRoad(createRun([], TEST_TUNING, SEED)), "hop");
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
  function passedInto(opening: Opening, ...before: FrogAction[]): Run {
    const run = advanceBy(act(runWithWall(opening, 5.2), ...before), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(overlapping(run.walls[0], run.frog.depth)).toHaveLength(1);
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
    const run = passedInto(FITS);
    expect(applyAction(run, "left")).toBe(run);
    expect(applyAction(run, "right")).toBe(run);
  });

  it("allows a slide that stays inside its opening", () => {
    const run = passedInto(WIDE);
    expect(applyAction(run, "left").frog.col).toBe(1);
    // One column right still fits; a second would leave the opening.
    expect(act(run, "right", "right").frog.col).toBe(3);
  });

  it("frees the frog to slide once it has gone by", () => {
    const run = passedInto(FITS);
    const late = advanceBy(run, 1.8);
    expect(applyAction(late, "left")).toBe(late);
    expect(applyAction(advanceBy(run, 2), "left").frog.col).toBe(1);
  });

  it("refuses a turn into its solid cells, and allows one inside its opening", () => {
    const run = passedInto(FITS);
    expect(applyAction(run, "rotateCw")).toBe(run);
    expect(applyAction(passedInto(TALL), "rotateCw").frog).toMatchObject({ col: 2, rotation: 1 });
  });

  it("refuses a turn whose wall kick lands in its solid cells", () => {
    // Upright at the left edge, the frog passes the wall; the next turn
    // would kick it back to column 0 as a flat L one row up.
    const run = passedInto(UPRIGHT_AT_EDGE, "rotateCw", "left", "left");
    expect(run.frog).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw")).toBe(run);
  });

  it("refuses a hop into its solid cells, and allows one inside its opening", () => {
    const run = passedInto(FITS);
    expect(applyAction(run, "hop")).toBe(run);
    expect(hopHeight(applyAction(passedInto(TALL), "hop").frog)).toBe(1);
  });

  it("rides a frog that passed a raised opening across it until it has gone by, then lands it", () => {
    // Up from 0 s, the frog passes at 0.2 s; its airtime ends at 0.5 s.
    const run = passedInto(RAISED, "hop");
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
    const run = passedInto(rect([1, 5], [0, 3]), "hop");
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
    const run = advanceBy(passedInto(RAISED, "hop"), 0.3);
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
    const riding = pressJump(passedInto(RAISED, "hop"), "forward");
    expect(riding.frog.depth).toBe(6);
    expect(isRiding(riding)).toBe(true);
    const repeated = advanceBy(riding, 0.25, 0.01);
    expect(repeated.frog.depth).toBe(7);
    expect(repeated.frog.latestHop?.landedAt).toBeCloseTo(0.55);
  });

  it("refuses a hop while riding", () => {
    const run = advanceBy(passedInto(RAISED, "hop"), 0.3);
    expect(applyAction(run, "hop")).toBe(run);
  });

  it("knocks a bonked frog back clear of every wall, even the closest walls the tuning allows", () => {
    // Rows 4 apart back to front, the closest a 3-jump knock-back allows,
    // however long the first. The frog passes the first at 0.2 s; the second
    // arrives at 7.2 s and knocks it back to 7, its back face touching the
    // first row's back.
    let run = runWithWalls(
      [
        { opening: FITS, depth: 10.2, length: 3 },
        { opening: BLOCKED, depth: 17.2 },
      ],
      10,
      { wallSpacing: 6 },
    );
    run = advanceBy(run, 7.3);
    expect(run.lastBonk?.time).toBeCloseTo(7.2);
    expect(run.frog.depth).toBeCloseTo(7);
    for (const w of run.walls) expect(overlapping(w, run.frog.depth)).toEqual([]);
    expect(rowBack(run.walls[0])).toBeLessThanOrEqual(run.frog.depth - FROG_THICKNESS + 1e-9);
    // Clear of the wall it passed, it moves freely, but can't jump back into it.
    expect(applyAction(run, "left").frog.col).toBe(1);
    expect(applyAction(run, "back")).toBe(run);
  });
});

describe("jump", () => {
  it("moves forward with no cap, and back past the start as far as it likes", () => {
    let run = runWithWall(FITS, 50, 0);
    for (let i = 0; i < 40; i++) run = applyAction(run, "forward");
    expect(run.frog.depth).toBe(40);
    run = runWithWall(FITS, 50, 0.5);
    for (let i = 0; i < 20; i++) run = applyAction(run, "back");
    expect(run.frog.depth).toBe(-19.5);
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
    const run = advanceBy(pressJump(onRoad(createRun([], TEST_TUNING, SEED), { depth: 10 }), "back"), 0.6);
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
    let run = pressJump(runWithWall(BLOCKED, 9.1, 10), "back");
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
    let run = onRoad(createRun([], TEST_TUNING, SEED), { depth: 10 });
    run = pressJump(pressJump(run, "forward"), "back");
    expect(run.heldJump?.direction).toBe("back");
    expect(releaseJump(run, "forward")).toBe(run);
  });
});

describe("the finish", () => {
  it("ends the run the moment the frog crosses the line, and the rules stop", () => {
    let run = runWithWall(FITS, 50, 98.5);
    run = applyAction(run, "forward");
    expect(crossedFinish(run)).toBe(false);
    run = applyAction(run, "forward");
    expect(crossedFinish(run)).toBe(true);
    expect(run.finishedAt).toBe(0);
    expect(inPlay(run)).toBe(false);
    for (const action of ["back", "forward", "left", "hop"] as const) expect(applyAction(run, action)).toBe(run);
    expect(pressJump(run, "back")).toBe(run);
  });

  it("stops a held jump, and lands a hop, as the frog crosses", () => {
    let run = advanceBy(pressJump(runWithWall(TALL, 200, 97.5), "forward"), 0.3, 0.01);
    expect(run.frog.depth).toBe(99.5);
    run = advanceBy(applyAction(run, "hop"), 0.25, 0.01);
    expect(crossedFinish(run)).toBe(true);
    expect(run.heldJump).toBeNull();
    expect(hopHeight(run.frog)).toBe(0);
    expect(advanceBy(run, 2).frog).toEqual(run.frog);
  });

  it("lets the traffic drive on beneath the finished frog, judging and bonking it no more", () => {
    let run = applyAction(runWithWall(BLOCKED, 101.5, 99.5), "forward");
    expect(crossedFinish(run)).toBe(true);
    run = advanceBy(run, 5);
    expect(run.walls[0].depth).toBeCloseTo(96.5);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(run.passes).toBe(0);
    expect(run.frog.depth).toBe(100.5);
  });

  it("is done once the leap onto the gantry has landed", () => {
    const crossed = applyAction(runWithWall(FITS, 50, 99.5), "forward");
    expect(isDone(crossed)).toBe(false);
    expect(isDone(advanceBy(crossed, TEST_TUNING.finishLeapDuration - 0.05))).toBe(false);
    expect(isDone(advanceBy(crossed, TEST_TUNING.finishLeapDuration + 0.05))).toBe(true);
  });
});

describe("the overpass", () => {
  const start = (walls: readonly TestWall[] = []): Run => createRun(walls.map(wall), TEST_TUNING, SEED);

  it("holds the frog out of play: the traffic goes by beneath, unjudged", () => {
    const run = advanceBy(start([{ opening: [], depth: 2 }]), 5);
    expect(onOverpass(run)).toBe(true);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(run.passes).toBe(0);
    expect(run.frog.depth).toBe(0);
  });

  it("lets the frog line itself up, but not hop, jump back or swap", () => {
    const run = start();
    expect(applyAction(run, "left").frog.col).toBe(1);
    expect(applyAction(run, "rotateCw").frog.rotation).toBe(1);
    for (const action of ["hop", "back", "swap"] as const) expect(applyAction(run, action)).toBe(run);
  });

  it("drops the frog onto the road with its first jump forward, a jump ahead, into play", () => {
    const run = advanceBy(start(), 0.5);
    const dropped = applyAction(run, "forward");
    expect(dropped.droppedAt).toBeCloseTo(0.5);
    expect(inPlay(dropped)).toBe(true);
    expect(dropped.frog.depth).toBe(1);
    // A held jump drops, then keeps jumping along the road.
    expect(advanceBy(pressJump(start(), "forward"), 0.3).frog.depth).toBe(2);
  });

  it("has no way back up: once dropped, a jump back goes along the road behind the start", () => {
    const run = act(start(), "forward", "back", "back", "back");
    expect(run.droppedAt).toBe(0);
    expect(onOverpass(run)).toBe(false);
    expect(run.frog.depth).toBe(-2);
  });

  it("refuses a drop onto a vehicle going by beneath, and lets one into a gap in it", () => {
    // A long row gone under the deck, still beneath where the frog would land.
    const under = advanceBy(start([{ opening: BLOCKED, depth: 0.5, length: 3 }]), 1);
    expect(under.walls[0].passed).toBe(true);
    expect(applyAction(under, "forward")).toBe(under);
    const gap = applyAction(advanceBy(start([{ opening: FITS, depth: 0.5, length: 3 }]), 1), "forward");
    expect(inPlay(gap)).toBe(true);
    expect(gap.frog.depth).toBe(1);
    expect(gap.lastBonk).toBeNull();
  });

  it("judges a row whose face the drop lands on, like any jump forward", () => {
    const bonked = applyAction(advanceBy(start([{ opening: BLOCKED, depth: 1.5 }]), 1), "forward");
    expect(bonked.lastBonk?.depth).toBeCloseTo(0.5);
    expect(bonked.frog.depth).toBeCloseTo(-2.5);
    expect(inPlay(bonked)).toBe(true);
    const passed = applyAction(advanceBy(start([{ opening: FITS, depth: 1.5 }]), 1), "forward");
    expect(passed.passes).toBe(1);
    expect(passed.frog.depth).toBe(1);
  });
});

describe("a row's vehicles, each its own length", () => {
  // Lanes 0-1 hold a short car, one unit long; lanes 5-6 a long truck, three.
  const SHORT: Solid = { cells: closed([], [0, 1]), length: 1 };
  const LONG: Solid = { cells: closed([], [5, 6]), length: 3 };
  const row = (solids: readonly Solid[], frog: Partial<Run["frog"]> = {}): Run =>
    onRoad(createRun([{ solids, depth: 5.2 }], TEST_TUNING, SEED), { depth: 5, ...frog });
  // The frog at 5 fills 4 to 5; the row arrives at 0.2 s. The car's back goes
  // by the frog's at 2.2 s, the truck's at 4.2 s.
  const overlappedBy = (): Run => advanceBy(row([SHORT, LONG]), 0.3);

  it("is judged once, as the row's front arrives, against every vehicle", () => {
    const run = overlappedBy();
    expect(run.walls[0].passed).toBe(true);
    expect(run.passes).toBe(1);
    expect(advanceBy(row([SHORT, LONG], { col: 1 }), 0.3).lastBonk).not.toBeNull();
  });

  it("frees a shorter vehicle's lanes once it has gone by, while a longer neighbour still overlaps", () => {
    const run = overlappedBy();
    // Both overlap: no slide toward either.
    expect(applyAction(run, "left")).toBe(run);
    expect(applyAction(run, "right")).toBe(run);
    // The car has gone by: the frog may slide into its lanes, but not the truck's.
    const later = advanceBy(run, 2);
    expect(overlappingSolids(later.walls[0], later.frog.depth)).toEqual([LONG]);
    expect(act(later, "left", "left").frog.col).toBe(0);
    expect(applyAction(later, "right")).toBe(later);
    // Once the truck has gone by too, the whole road is free.
    const clear = advanceBy(run, 4);
    expect(overlappingSolids(clear.walls[0], clear.frog.depth)).toEqual([]);
    expect(applyAction(clear, "right").frog.col).toBe(3);
  });

  it("only ever grows the opening, never closing a lane it has freed", () => {
    let run = overlappedBy();
    let open = 3;
    for (let t = 0; t < 5; t += 0.1) {
      run = advance(run, 0.1);
      const lanes = 7 - 2 * overlappingSolids(run.walls[0], run.frog.depth).length;
      expect(lanes).toBeGreaterThanOrEqual(open);
      open = lanes;
    }
    expect(open).toBe(7);
  });

  it("carries a riding frog until the last of its vehicles has gone by", () => {
    const run = advanceBy(applyAction(row([SHORT, LONG]), "hop"), 0.3, 0.01);
    expect(isRiding(run)).toBe(true);
    expect(hopHeight(advanceBy(run, 3.8, 0.01).frog)).toBe(1);
    const landed = advanceBy(run, 4, 0.01).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(4.2);
  });

  it("refuses a jump back into a vehicle it has passed until that vehicle's own back is clear", () => {
    const run = advanceBy(row([SHORT]), 0.3);
    // The car has gone by the frog's back, but a jump back would meet it.
    const gone = advanceBy(run, 2);
    expect(overlappingSolids(gone.walls[0], gone.frog.depth)).toEqual([]);
    expect(applyAction(gone, "back")).toBe(gone);
    expect(applyAction(advanceBy(run, 3), "back").frog.depth).toBe(4);
  });
});

// A pull-off on the right, lanes 7 to 9, holding a frog whose depth range
// lies from 10 to 16: its front face from 11 to 16.
const PULL_OFF: PullOff = { side: "right", near: 10, far: 16, width: 3, waiting: "I" };

function runBeside(frog: Partial<Run["frog"]>, walls: readonly TestWall[] = [], pullOff: Partial<PullOff> = {}): Run {
  return onRoad(createRun(walls.map(wall), TEST_TUNING, SEED, { pullOffs: [{ ...PULL_OFF, ...pullOff }] }), frog);
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
  const atFive = (run: Run): Run => onRoad(run, { depth: 5 });
  const withRow = (opening: Opening, kind: TetrominoKind): Run =>
    atFive(createRun([wall({ opening, depth: 5.2 })], TEST_TUNING, SEED, { kind }));

  it.each(KINDS)("the %s starts centred, passes a row shaped like it, and is bonked by one a lane over", (kind) => {
    const start = createRun([], TEST_TUNING, SEED, { kind });
    expect(start.frog.col).toBe(Math.floor((7 - pieceSize(kind, 0).width) / 2));
    const own = frogCells(frogShape(start.frog));
    const passed = advanceBy(withRow(own, kind), 0.3);
    expect(passed.walls[0].passed).toBe(true);
    const over = own.map((c) => ({ col: c.col + 1, row: c.row }));
    const bonked = advanceBy(withRow(over, kind), 0.3);
    expect(bonked.lastBonk).not.toBeNull();
    // One slide over first, and it fits.
    const slid = advanceBy(applyAction(withRow(over, kind), "right"), 0.3);
    expect(slid.walls[0].passed).toBe(true);
  });

  it("stands the I up to pass a one-lane slot, and rides it across a raised opening", () => {
    const slot = withRow(rect([3, 3], [0, 3]), "I");
    const upright = applyAction(slot, "rotateCw");
    expect(upright.frog).toMatchObject({ col: 2, rotation: 1 });
    expect(advanceBy(applyAction(upright, "right"), 0.3).walls[0].passed).toBe(true);
    const raised = withRow(rect([1, 4], [1, 1]), "I");
    const riding = advanceBy(applyAction(raised, "hop"), 0.6, 0.01);
    expect(riding.walls[0].passed).toBe(true);
    expect(isRiding(riding)).toBe(true);
  });
});
