import { describe, it, expect } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { normalFits, type Face } from "./composer";
import { COURSE_SEED } from "./course";
import { TETROMINOES, cellKey, frogCells, insideLanes, pieceSize, rectOpening as rect, type Placement } from "./logic";
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
  nextWall,
  onOverpass,
  overlappingSolids,
  pressHeld,
  releaseHeld,
  type FrogAction,
  type RuleRow,
  type RuleRows,
  type Run,
  type Wall,
} from "./run";
import { rowStream, type RowStream } from "./stream";
import { acrossLine, gateLanes, gatePostLines, insideGate, rowBack } from "./traffic";
import { TUNING, type Tuning } from "./tuning";
import type { Cell, Frog, Gate, Opening, Solid, TetrominoKind } from "./types";

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
  holdRepeatInterval: 0.25,
  maxFrameDelta: 0.1,
  recycleBehind: 5,
  trafficHorizon: 30,
};

// Ten thousand random steps through a real stream take a few seconds, more
// when the whole suite shares the machine.
const RANDOM_PLAY_TIMEOUT = 30_000;

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
  gates?: Gate[];
}

// The walls where the test puts them, each a row of one vehicle filling
// everything but the opening, with its gates' posts, then the same rows
// again in order, each the spacing beyond the back of the one before.
function rowsOf(walls: readonly TestWall[]): RuleRows {
  const rows = walls.map(({ opening, length = 1, gates = [] }) => ({
    solids: [{ cells: closed(opening), length }, ...gates.flatMap((gate) => gatePostLines(gate).map((post) => ({ post, length })))],
    gates,
  }));
  const gaps = walls.map((w, i) => (i === 0 ? w.depth : w.depth - (walls[i - 1].depth + (walls[i - 1].length ?? 1))));
  return (index): RuleRow => ({ ...rows[index % rows.length], gap: index < walls.length ? gaps[index] : TEST_TUNING.wallSpacing });
}

// No traffic within reach of any test: one solid row far up the road.
const NO_TRAFFIC: RuleRows = () => ({ solids: [{ cells: closed([]), length: 1 }], gates: [], gap: 1e6 });

// The frog dropped onto the road, in play.
function onRoad(run: Run, frog: Partial<Run["frog"]> = {}): Run {
  return { ...run, droppedAt: 0, frog: { ...run.frog, ...frog } };
}

function runWithWalls(walls: readonly TestWall[], frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return onRoad(createRun(rowsOf(walls), { ...TEST_TUNING, ...tuning }), { depth: frogDepth });
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
  it("starts with the frog centred on the overpass, out of play, and the stream's rows where their gaps put them", () => {
    const run = createRun(rowsOf([{ opening: FITS, depth: 12 }, { opening: FITS, depth: 30 }]), TEST_TUNING);
    expect(run.frog).toMatchObject({ col: 2, rotation: 0, depth: 0 });
    expect(onOverpass(run)).toBe(true);
    expect(inPlay(run)).toBe(false);
    expect(run.walls.slice(0, 2).map((w) => w.depth)).toEqual([12, 30]);
    expect(run.lastBonk).toBeNull();
    expect(run.holds).toEqual([]);
  });

  it("lines the stream's rows up in order, each its gap beyond the back of the one before, out to the traffic horizon", () => {
    const rows = rowsOf([{ opening: FITS, depth: 12, length: 3 }, { opening: FITS, depth: 30 }]);
    const run = createRun(rows, TUNING);
    run.walls.forEach((w, i) => expect(w.index).toBe(i));
    run.walls.slice(1).forEach((w, i) => expect(w.depth - rowBack(run.walls[i])).toBeCloseTo(rows(i + 1).gap));
    expect(rowBack(run.walls[run.walls.length - 1])).toBeGreaterThanOrEqual(TUNING.trafficHorizon);
    expect(rowBack(run.walls[run.walls.length - 2])).toBeLessThan(TUNING.trafficHorizon);
  });

  it("refuses tuning where a bonk could knock the frog into a passed wall, or not move it", () => {
    expect(() => createRun(NO_TRAFFIC, { ...TEST_TUNING, wallSpacing: 5 })).toThrow();
    expect(() => createRun(NO_TRAFFIC, { ...TEST_TUNING, bonkKnockback: 0 })).toThrow();
    expect(() => createRun(NO_TRAFFIC, { ...TEST_TUNING, holdRepeatInterval: 0 })).toThrow();
    expect(() => createRun(NO_TRAFFIC, TUNING)).not.toThrow();
  });

  it("ignores moves off the corridor edge", () => {
    let run = act(createRun(NO_TRAFFIC, TEST_TUNING), "left", "left", "left");
    expect(run.frog.col).toBe(0);
    run = act(run, "right", "right", "right", "right", "right");
    expect(run.frog.col).toBe(4);
  });

  it("rotates with a wall kick at the edge", () => {
    const run = act(createRun(NO_TRAFFIC, TEST_TUNING), "rotateCw", "left", "left", "left");
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
    // The stream's next row, which in a stream of one row is that row again.
    expect(recycled.index).toBe(Math.max(...rest.map((w) => w.index)) + 1);
    expect(recycled.solids).toBe(solids);
    expect(recycled.depth).toBeGreaterThanOrEqual(20 + TEST_TUNING.trafficHorizon - 0.2);
    // Behind the frontmost row, at the usual back-to-front spacing.
    const frontmost = Math.max(...rest.map(rowBack));
    expect(recycled.depth - frontmost).toBeGreaterThanOrEqual(TEST_TUNING.wallSpacing - TEST_TUNING.wallJitter - 0.2);
    expect(run.lastBonk).toBeNull();
  });

  it("gives a recycled wall the stream's next row, so the frog meets the stream's rows in order", () => {
    const rows = rowsOf([{ opening: FITS, depth: 1 }, { opening: TALL, depth: 2.5 }]);
    let run = onRoad(createRun(rows, TEST_TUNING), { depth: 0.5 });
    let recycled = 0;
    for (let step = 0; step < 1000; step++) {
      const before = run;
      run = advance(run, 0.1);
      run.walls.forEach((w, i) => {
        expect(w.solids).toBe(rows(w.index).solids);
        if (w.index !== before.walls[i].index) recycled++;
      });
      const byDepth = [...run.walls].sort((x, y) => x.depth - y.depth);
      byDepth.slice(1).forEach((w, i) => expect(w.index).toBe(byDepth[i].index + 1));
    }
    expect(recycled).toBeGreaterThan(5);
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
    const counts = playRandomly(streamRun(), 99, [], readsRows(STREAM, 0));
    // The play really did pass, bonk and loop.
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  }, RANDOM_PLAY_TIMEOUT);

  it("keeps the same promises for a frog taking gates, both ways, as it goes", () => {
    const counts = playRandomly(streamRun(), 7, ["back", "back"], readsRows(STREAM, 0.5));
    expect(Math.min(counts.bonks, counts.passes, counts.returns, counts.gates)).toBeGreaterThan(10);
  }, RANDOM_PLAY_TIMEOUT);

  it("keeps the same promises for a frog that keeps going back, far behind the start", () => {
    const counts = playRandomly(streamRun(), 3, ["back", "back", "back", "back", "back"], readsRows(STREAM, 0));
    expect(counts.furthestBack).toBeLessThan(-100);
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  }, RANDOM_PLAY_TIMEOUT);
});

const PLAY_TUNING: Tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
const STREAM = rowStream(COURSE_SEED, PLAY_TUNING);

function streamRun(): Run {
  return onRoad(createRun(STREAM.row, PLAY_TUNING, { kind: STREAM.start }));
}

// A player who, now and then, reads the next row and takes up a pose it was
// built around, piece and all, while nothing overlaps the frog; or, as often
// as `gates` says, a pose of its own piece inside the row's gate. Otherwise
// the random frog would hardly ever fit a row, and a row built for another
// piece would knock it back down the road forever.
function readsRows(stream: RowStream, gates: number): (run: Run, random: () => number) => Run {
  return (run, random) => {
    const next = nextWall(run);
    if (next === null || run.walls.some((w) => overlappingSolids(w, run.frog.depth).length > 0)) return run;
    const row = stream.row(run.walls[next].index);
    const gate = row.gates.at(0);
    if (gate !== undefined && random() < gates) {
      const placement = inGate(run.frog.kind, gate);
      return { ...run, frog: { ...run.frog, ...placement } };
    }
    const answer = row.answers.find((a) => a.kind === run.frog.kind) ?? row.answers[0];
    return { ...run, frog: { ...run.frog, kind: answer.kind, col: answer.col, rotation: answer.rotation } };
  };
}

// A piece's first rotation narrow enough for a gate, in its first lane.
function inGate(kind: TetrominoKind, gate: Gate): Placement {
  const lanes = gateLanes(gate);
  const rotation = ([0, 1, 2, 3] as const).find((r) => pieceSize(kind, r).width <= lanes.last - lanes.first + 1);
  if (rotation === undefined) throw new Error(`A ${kind} is too wide for any gate`);
  return { col: lanes.first, rotation };
}

// Plays at random, mixing actions and frames of every length, and checks
// after every step that each wall the frog hasn't passed is ahead of it and
// each it has passed behind it; that the frog's cells are clear of every
// vehicle overlapping it; that a wall's overlapping vehicles only ever drop
// away unless the frog jumped back among them; that a wall is recycled only
// once it is well behind the frog, and comes back beyond the traffic
// horizon; that every cell is on the road; that the frog never stands across
// a gate's post while its row overlaps the frog; and that the frog's piece
// only changes in a gate it has just crossed.
function playRandomly(start: Run, seed: number, extra: FrogAction[], lineUp: (run: Run, random: () => number) => Run) {
  const random = createRng(seed).next;
  const actions: FrogAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop", "forward", "forward", "back", ...extra];
  const { recycleBehind, trafficHorizon, wallSpeed, wallRows, maxFrameDelta, corridorCols } = start.tuning;
  let run = start;
  const counts = { bonks: 0, passes: 0, returns: 0, gates: 0, furthestBack: start.frog.depth };
  for (let step = 0; step < 10000; step++) {
    const before = run;
    const elapsed = random() * 1.2;
    const roll = random();
    if (roll < 0.15) run = lineUp(run, random);
    else if (roll < 0.4) run = applyAction(run, actions[Math.floor(random() * actions.length)]);
    else run = advance(run, elapsed);
    if (run.lastBonk !== before.lastBonk) counts.bonks++;
    if (run.frog.kind !== before.frog.kind && roll >= 0.15) {
      // Taken in a gate whose row's front it crossed, with every cell in it.
      counts.gates++;
      const cells = frogCells(frogShape(run.frog));
      const crossed = run.walls.filter((w, i) => w.passed !== before.walls[i].passed || w.index !== before.walls[i].index);
      expect(crossed.some((w) => w.gates.some((g) => g.kind === run.frog.kind && insideGate(cells, g)))).toBe(true);
    }
    counts.passes += run.passes - before.passes;
    counts.furthestBack = Math.min(counts.furthestBack, run.frog.depth);
    const frog = run.frog.depth;
    const cells = frogCells(frogShape(run.frog));
    run.walls.forEach((w, i) => {
      const was = before.walls[i];
      if (w.depth > was.depth) {
        counts.returns++;
        const travel = wallSpeed * Math.min(elapsed, maxFrameDelta);
        expect(rowBack(was) - travel).toBeLessThan(before.frog.depth - recycleBehind);
        expect(w.depth).toBeGreaterThanOrEqual(frog + trafficHorizon - travel - 1e-9);
      } else if (w.passed && was.passed && frog >= before.frog.depth) {
        const earlier = overlappingSolids(was, before.frog.depth);
        for (const solid of overlappingSolids(w, frog)) expect(earlier).toContain(solid);
      }
      if (w.passed) expect(w.depth).toBeLessThanOrEqual(frog + 1e-9);
      else expect(w.depth).toBeGreaterThanOrEqual(frog - 1e-9);
      for (const solid of overlapping(w, frog)) if ("post" in solid) expect(acrossLine(cells, solid.post)).toBe(false);
      const solid = new Set(overlapping(w, frog).flatMap((v) => ("cells" in v ? v.cells.map(cellKey) : [])));
      if (solid.size === 0) return;
      for (const c of cells) {
        expect(solid.has(cellKey(c))).toBe(false);
        expect(c.row).toBeLessThan(wallRows);
      }
    });
    expect(insideLanes(run.frog.kind, run.frog, { first: 0, last: corridorCols - 1 })).toBe(true);
  }
  return counts;
}

describe("hop", () => {
  it("keeps the frog up for the tuning's airtime", () => {
    expect(TUNING.hopAirtime).toBe(0.7);
    const run = applyAction(onRoad(createRun(NO_TRAFFIC, TUNING)), "hop");
    expect(hopHeight(advanceBy(run, 0.69, 0.01).frog)).toBe(1);
    const landed = advanceBy(run, 0.71, 0.01).frog;
    expect(hopHeight(landed)).toBe(0);
    expect(landed.latestHop?.landedAt).toBeCloseTo(0.7);
    const short = applyAction(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "hop");
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
    const riding = pressHeld(passedInto(RAISED, "hop"), "forward");
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
    // Clear of the wall it passed, it moves freely, and can jump back into
    // it only where it fits.
    const slid = applyAction(run, "left");
    expect(slid.frog.col).toBe(1);
    expect(applyAction(slid, "back")).toBe(slid);
    expect(applyAction(run, "back").frog.depth).toBe(6);
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

  it("goes back into a wall it has passed, and back out through its front, wherever it fits", () => {
    const run = act(runWithWalls([{ opening: WIDE, depth: 5.5, length: 3 }]), "forward", "forward");
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog.depth).toBe(7);
    // Overlapping the wall, inside its opening, the frog jumps back among its
    // vehicles, still past its front.
    const among = applyAction(run, "back");
    expect(among.frog.depth).toBe(6);
    expect(among.walls[0].passed).toBe(true);
    // The next jump back takes it out through the front: the wall is ahead
    // again, and is judged afresh when it arrives.
    const out = applyAction(among, "back");
    expect(out.frog.depth).toBe(5);
    expect(out.walls[0].passed).toBe(false);
    expect(nextWall(out)).toBe(0);
    const again = advanceBy(out, 1);
    expect(again.walls[0].passed).toBe(true);
    expect(again.passes).toBe(2);
    expect(again.lastBonk).toBeNull();
  });

  it("refuses a jump back that would put a cell in a vehicle of a wall it has passed", () => {
    // Past the wall and clear of it, the frog slides out of line with its
    // opening, and can't jump back into it until it has moved on far enough.
    let run = advanceBy(applyAction(runWithWall(FITS, 5.5), "forward"), 1.6);
    run = applyAction(run, "left");
    expect(run.frog.col).toBe(1);
    expect(applyAction(run, "back")).toBe(run);
    expect(applyAction(advanceBy(run, 1), "back").frog.depth).toBe(5);
    // Back in line, it can.
    expect(applyAction(applyAction(run, "right"), "back").frog.depth).toBe(5);
  });
});

describe("a held jump", () => {
  function jumpsIn(seconds: number, frame: number): Run {
    const run = pressHeld(onRoad(createRun(NO_TRAFFIC, { ...TEST_TUNING, maxFrameDelta: 10 })), "forward");
    return advanceBy(run, seconds, frame);
  }

  it("jumps on the press, then again every repeat interval, whatever the frame rate", () => {
    const pressed = pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "forward");
    expect(pressed.frog.depth).toBe(1);
    // Repeats at 0.25, 0.5 and 0.75 s.
    for (const frame of [0.01, 0.05, 0.1, 0.3, 0.9]) {
      expect(jumpsIn(0.9, frame).frog.depth).toBe(4);
    }
    expect(jumpsIn(1.2, 0.4).frog.depth).toBe(5);
  });

  it("repeats a held jump back too", () => {
    const run = advanceBy(pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 }), "back"), 0.6);
    expect(run.frog.depth).toBe(7);
  });

  it("keeps jumping after a bonk, a full repeat interval later", () => {
    let run = pressHeld(runWithWall(BLOCKED, 10, 0), "forward");
    // At 2 s the wall reaches the frog at 8, just as the key would repeat,
    // and bonks it back to 5.
    run = advanceBy(run, 2.1);
    expect(run.lastBonk?.time).toBeCloseTo(2);
    expect(run.frog.depth).toBeCloseTo(5);
    expect(run.holds.at(0)?.nextAt).toBeCloseTo(2.25);
    // Still held, it jumps on at 2.25 s and 2.5 s, and at 2.75 s jumps into
    // the wall at 7.25 and is bonked again.
    run = advanceBy(run, 0.5);
    expect(run.frog.depth).toBe(7);
    run = advanceBy(run, 0.2);
    expect(run.lastBonk?.time).toBeCloseTo(2.75);
    expect(run.frog.depth).toBeCloseTo(4.25);
  });

  it("waits a full repeat interval after a bonk between repeats, rather than jumping at once", () => {
    let run = pressHeld(runWithWall(BLOCKED, 9.1, 10), "back");
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
    // Past the wall, out of line with its opening, the frog holds back. The
    // wall is clear of where the jump lands from 0.9 s, and the key goes on.
    let run = applyAction(advanceBy(applyAction(runWithWall(FITS, 5.5), "forward"), 1.6), "left");
    run = pressHeld(run, "back");
    expect(run.frog.depth).toBe(6);
    expect(run.holds).toHaveLength(1);
    run = advanceBy(run, 1.1);
    expect(run.holds).toHaveLength(1);
    expect(run.frog.depth).toBe(5);
  });

  it("stops when its key is released, or every key is let go", () => {
    const held = pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "forward");
    expect(releaseHeld(held, "back")).toBe(held);
    const released = releaseHeld(held, "forward");
    expect(released.holds).toEqual([]);
    expect(advanceBy(released, 1).frog.depth).toBe(1);
    // Losing focus lets go of whatever is held.
    const blurred = releaseHeld(held);
    expect(blurred.holds).toEqual([]);
    expect(advanceBy(blurred, 1).frog.depth).toBe(1);
  });

  it("follows the latest jump key pressed", () => {
    let run = onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 });
    run = pressHeld(pressHeld(run, "forward"), "back");
    expect(run.holds.map((hold) => hold.action)).toEqual(["back"]);
    expect(releaseHeld(run, "forward")).toBe(run);
  });
});

describe("a held slide", () => {
  function slidesIn(seconds: number, frame: number): Run {
    const atLeftEdge = onRoad(createRun(NO_TRAFFIC, { ...TEST_TUNING, maxFrameDelta: 10 }), { col: 0, depth: 10 });
    return advanceBy(pressHeld(atLeftEdge, "right"), seconds, frame);
  }

  it("slides on the press, then again every repeat interval, whatever the frame rate", () => {
    expect(slidesIn(0, 0.05).frog.col).toBe(1);
    // Repeats at 0.25 and 0.5 s.
    for (const frame of [0.01, 0.05, 0.1, 0.3, 0.6]) {
      expect(slidesIn(0.6, frame).frog.col).toBe(3);
    }
  });

  it("keeps repeating at the corridor edge, and on the overpass", () => {
    // From column 2 on the overpass: 1 on the press, 0 at 0.25 s, then the
    // edge refuses it, and the key is still held.
    const run = advanceBy(pressHeld(createRun(NO_TRAFFIC, TEST_TUNING), "left"), 0.6);
    expect(onOverpass(run)).toBe(true);
    expect(run.frog.col).toBe(0);
    expect(run.holds.map((hold) => hold.action)).toEqual(["left"]);
    expect(advanceBy(releaseHeld(run, "left"), 1).frog.col).toBe(0);
  });

  it("keeps repeating when a vehicle overlapping the frog refuses it", () => {
    // The frog passes into a two-long row at 0.5 s, which overlaps it until
    // 3.5 s. Held from 1.1 s, the slide is refused until the repeat at 3.6 s.
    let run = advanceBy(runWithWalls([{ opening: FITS, depth: 5.5, length: 2 }]), 1.1);
    expect(run.walls[0].passed).toBe(true);
    run = pressHeld(run, "left");
    expect(run.frog.col).toBe(2);
    expect(run.holds).toHaveLength(1);
    expect(advanceBy(run, 2.4).frog.col).toBe(2);
    expect(advanceBy(run, 2.6).frog.col).toBe(1);
  });

  it("repeats while riding", () => {
    // Riding from 0.3 s, the press slides the frog to 1, the opening's edge.
    // The repeats are refused until the wall has gone by at 2.2 s.
    const riding = pressHeld(advanceBy(applyAction(runWithWall(rect([1, 5], [0, 3]), 5.2), "hop"), 0.3), "left");
    expect(isRiding(riding)).toBe(true);
    expect(riding.frog.col).toBe(1);
    const along = advanceBy(riding, 1.5);
    expect(isRiding(along)).toBe(true);
    expect(along.frog.col).toBe(1);
    expect(advanceBy(riding, 2.1).frog.col).toBe(0);
  });

  it("slides at its own instant within a long frame, before or after a row arrives", () => {
    const heldRight = (wallDepth: number): Run =>
      pressHeld(onRoad(runWithWall(FITS, wallDepth, 5, { maxFrameDelta: 10 }), { col: 0 }), "right");
    // The repeat at 0.25 s lines the frog up before the row arrives at 0.3 s,
    // and the next, at 0.5 s, is refused by its vehicle.
    const lined = advance(heldRight(5.3), 0.6);
    expect(lined.passes).toBe(1);
    expect(lined.lastBonk).toBeNull();
    expect(lined.frog.col).toBe(2);
    // A row arriving at 0.2 s, before the repeat, bonks the frog, and the
    // slide comes a full repeat interval later, at 0.45 s.
    const bonked = advance(heldRight(5.2), 0.5);
    expect(bonked.lastBonk?.time).toBeCloseTo(0.2);
    expect(bonked.frog.col).toBe(2);
    expect(bonked.holds.at(0)?.nextAt).toBeCloseTo(0.7);
  });

  it("is held alongside a held jump, and a newer slide replaces the held one", () => {
    let run = onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 });
    run = pressHeld(pressHeld(run, "forward"), "left");
    expect(run.frog).toMatchObject({ depth: 11, col: 1 });
    // Both repeat at 0.25 s; at 0.3 s right replaces left.
    run = pressHeld(advanceBy(run, 0.3), "right");
    expect(run.frog).toMatchObject({ depth: 12, col: 1 });
    expect(run.holds.map((hold) => hold.action)).toEqual(["forward", "right"]);
    expect(releaseHeld(run, "left")).toBe(run);
    // The jump repeats at 0.5 s, the slide at 0.55 s.
    expect(advanceBy(run, 0.3).frog).toMatchObject({ depth: 13, col: 2 });
    // Releasing the slide leaves the jump held; losing focus lets go of both.
    expect(releaseHeld(run, "right").holds.map((hold) => hold.action)).toEqual(["forward"]);
    expect(releaseHeld(run).holds).toEqual([]);
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
    expect(pressHeld(run, "back")).toBe(run);
  });

  it("stops a held jump, and lands a hop, as the frog crosses", () => {
    let run = advanceBy(pressHeld(runWithWall(TALL, 200, 97.5), "forward"), 0.3, 0.01);
    expect(run.frog.depth).toBe(99.5);
    run = advanceBy(applyAction(run, "hop"), 0.25, 0.01);
    expect(crossedFinish(run)).toBe(true);
    expect(run.holds).toEqual([]);
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
  // A drop four jumps long, whose leap takes half a second.
  const tuning: Tuning = { ...TEST_TUNING, dropDistance: 4, dropDuration: 0.5 };
  const start = (walls: readonly TestWall[] = []): Run => createRun(walls.length === 0 ? NO_TRAFFIC : rowsOf(walls), tuning);

  it("holds the frog out of play: the traffic goes by beneath, unjudged", () => {
    const run = advanceBy(start([{ opening: [], depth: 2 }]), 5);
    expect(onOverpass(run)).toBe(true);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(run.passes).toBe(0);
    expect(run.frog.depth).toBe(0);
  });

  it("lets the frog line itself up, but not hop or jump back", () => {
    const run = start();
    expect(applyAction(run, "left").frog.col).toBe(1);
    expect(applyAction(run, "rotateCw").frog.rotation).toBe(1);
    for (const action of ["hop", "back"] as const) expect(applyAction(run, action)).toBe(run);
  });

  it("drops the frog onto the road with its first jump forward, the drop distance ahead, into play", () => {
    const run = advanceBy(start(), 0.5);
    const dropped = applyAction(run, "forward");
    expect(dropped.droppedAt).toBeCloseTo(0.5);
    expect(inPlay(dropped)).toBe(true);
    expect(dropped.frog.depth).toBe(4);
    // A held jump drops, and keeps jumping along the road once the leap lands.
    const held = pressHeld(start(), "forward");
    expect(advanceBy(held, 0.3).frog.depth).toBe(4);
    expect(advanceBy(held, 0.6).frog.depth).toBe(5);
  });

  it("has no way back up: once dropped, a jump back goes along the road behind the start", () => {
    const run = act(start(), "forward", "back", "back", "back", "back", "back", "back");
    expect(run.droppedAt).toBe(0);
    expect(onOverpass(run)).toBe(false);
    expect(run.frog.depth).toBe(-2);
  });

  it("flies over the rows between, which go by beneath it unjudged", () => {
    const run = applyAction(start([{ opening: [], depth: 2 }]), "forward");
    expect(run.frog.depth).toBe(4);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(run.passes).toBe(0);
  });

  it("refuses a drop onto a vehicle going by beneath, and lets one into a gap in it", () => {
    // A long row, flown over, still beneath where the frog would land.
    const under = advanceBy(start([{ opening: BLOCKED, depth: 1.5, length: 5 }]), 1);
    expect(applyAction(under, "forward")).toBe(under);
    const gap = applyAction(advanceBy(start([{ opening: FITS, depth: 1.5, length: 5 }]), 1), "forward");
    expect(inPlay(gap)).toBe(true);
    expect(gap.frog.depth).toBe(4);
    expect(gap.lastBonk).toBeNull();
    // One gone under the deck before the drop, likewise.
    const gone = advanceBy(start([{ opening: BLOCKED, depth: 0.5, length: 6 }]), 1);
    expect(gone.walls[0].passed).toBe(true);
    expect(applyAction(gone, "forward")).toBe(gone);
  });

  it("judges a row whose face the leap's last jump lands on, like any jump forward", () => {
    const bonked = applyAction(advanceBy(start([{ opening: BLOCKED, depth: 4.5 }]), 1), "forward");
    expect(bonked.lastBonk?.depth).toBeCloseTo(3.5);
    expect(bonked.frog.depth).toBeCloseTo(0.5);
    expect(inPlay(bonked)).toBe(true);
    const passed = applyAction(advanceBy(start([{ opening: FITS, depth: 4.5 }]), 1), "forward");
    expect(passed.passes).toBe(1);
    expect(passed.frog.depth).toBe(4);
  });
});

describe("a row's vehicles, each its own length", () => {
  // Lanes 0-1 hold a short car, one unit long; lanes 5-6 a long truck, three.
  const SHORT: Solid = { cells: closed([], [0, 1]), length: 1 };
  const LONG: Solid = { cells: closed([], [5, 6]), length: 3 };
  const row = (solids: readonly Solid[], frog: Partial<Run["frog"]> = {}): Run =>
    onRoad(createRun((index) => ({ solids, gates: [], gap: index === 0 ? 5.2 : TEST_TUNING.wallSpacing }), TEST_TUNING), { depth: 5, ...frog });
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
    // The car has gone by the frog's back. Slid into its lanes, the frog
    // would meet it jumping back; in line with the opening, it wouldn't.
    const gone = advanceBy(row([SHORT]), 2.3);
    expect(overlappingSolids(gone.walls[0], gone.frog.depth)).toEqual([]);
    const inItsLanes = act(gone, "left", "left");
    expect(inItsLanes.frog.col).toBe(0);
    expect(applyAction(inItsLanes, "back")).toBe(inItsLanes);
    expect(applyAction(gone, "back").frog.depth).toBe(4);
    expect(applyAction(advanceBy(inItsLanes, 1), "back").frog.depth).toBe(4);
  });
});

describe("pieces other than the L", () => {
  const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
  const atFive = (run: Run): Run => onRoad(run, { depth: 5 });
  const withRow = (opening: Opening, kind: TetrominoKind): Run =>
    atFive(createRun(rowsOf([{ opening, depth: 5.2 }]), TEST_TUNING, { kind }));

  it.each(KINDS)("the %s starts centred, passes a row shaped like it, and is bonked by one a lane over", (kind) => {
    const start = createRun(NO_TRAFFIC, TEST_TUNING, { kind });
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

// A row whose openings are a gate for `kind` from `lane` and the cells of
// `more`.
function gateRow(kind: TetrominoKind, more: Opening = [], lane = 3): TestWall {
  const gate: Gate = { lane, kind };
  const { first, last } = gateLanes(gate);
  return { opening: [...rect([first, last], [0, 3]), ...more], depth: 5.2, gates: [gate] };
}

// The frog at 5 with a gate row arriving at 0.2 s.
function beforeGate(frog: Partial<Run["frog"]>, row: TestWall): Run {
  return onRoad(createRun(rowsOf([row]), TEST_TUNING), { depth: 5, ...frog });
}

describe("a gate", () => {
  it("gives a frog passing through it the gate's piece, in the frog's rotation and column when they fit", () => {
    const run = advanceBy(beforeGate({ rotation: 1, col: 3 }, gateRow("O")), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.passes).toBe(1);
    expect(run.frog).toMatchObject({ kind: "O", col: 3, rotation: 1, depth: 5 });
  });

  it("otherwise stands the new piece in the first rotation, then column, that fits the gate", () => {
    // The flat I is four lanes wide: it stands up in the gate's first lane.
    const i = advanceBy(beforeGate({ kind: "O", col: 3 }, gateRow("I")), 0.3);
    expect(i.frog).toMatchObject({ kind: "I", col: 3, rotation: 1 });
    // The O in the upright I's column would poke out of the gate: it takes
    // its first rotation, from the gate's first lane.
    const o = advanceBy(beforeGate({ kind: "I", rotation: 1, col: 4 }, gateRow("O")), 0.3);
    expect(o.frog).toMatchObject({ kind: "O", col: 3, rotation: 0 });
  });

  it("lands a frog that is up, when the new piece only fits the gate on the road: an I stands four cells tall", () => {
    const run = advanceBy(applyAction(beforeGate({ kind: "O", col: 3 }, gateRow("I")), "hop"), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog).toMatchObject({ kind: "I", col: 3, rotation: 1 });
    expect(hopHeight(run.frog)).toBe(0);
    expect(run.frog.latestHop?.landedAt).toBeCloseTo(0.2);
    // A piece that fits one cell up stays up, and rides the row.
    const t = advanceBy(applyAction(beforeGate({ kind: "O", col: 3 }, gateRow("T")), "hop"), 0.3);
    expect(t.frog).toMatchObject({ kind: "T", col: 3, rotation: 1 });
    expect(isRiding(t)).toBe(true);
  });

  it("bonks a frog standing across one of its posts as the row arrives, as a vehicle would", () => {
    // The upright L at lane 2 has its foot in the gate and its body beside
    // it: every cell is open, but the gate's post stands between them.
    const run = advanceBy(beforeGate({ rotation: 1, col: 2 }, gateRow("O", rect([2, 2], [0, 3]))), 0.3);
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastBonk?.depth).toBeCloseTo(5);
    expect(run.frog).toMatchObject({ kind: "L", depth: 2 });
  });

  it("bonks a frog jumping forward into its row across one of its posts", () => {
    const run = applyAction(beforeGate({ rotation: 1, col: 2 }, gateRow("O", rect([2, 2], [0, 3]))), "forward");
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastBonk?.depth).toBeCloseTo(5.2);
    expect(run.frog.kind).toBe("L");
  });

  it("refuses a slide or turn across one of its posts while the row overlaps the frog, either way", () => {
    // A gate for the frog's own piece, beside an opening three lanes wide.
    const row = gateRow("L", rect([0, 2], [0, 3]));
    // In the gate, the upright L can't slide or turn out of it.
    const inside = advanceBy(beforeGate({ rotation: 1, col: 3 }, row), 0.3);
    expect(inside.walls[0].passed).toBe(true);
    for (const action of ["left", "right", "rotateCw", "rotateCcw"] as const) expect(applyAction(inside, action).frog).toEqual(inside.frog);
    // Beside it, the upright I can't step through the post into it.
    const beside = advanceBy(beforeGate({ kind: "I", rotation: 1, col: 2 }, row), 0.3);
    expect(beside.walls[0].passed).toBe(true);
    expect(applyAction(beside, "right").frog).toEqual(beside.frog);
    expect(applyAction(beside, "left").frog.col).toBe(1);
    // Once the row has gone by, the posts are gone with it.
    const clear = advanceBy(beside, 2);
    expect(applyAction(clear, "right").frog.col).toBe(3);
  });

  it("refuses a jump back that would put the frog across one of its posts", () => {
    // The O passes beside the gate, jumps on and, once the row has gone by,
    // stands across the gate's post.
    let run = advanceBy(beforeGate({ kind: "O", col: 1 }, gateRow("L", rect([0, 2], [0, 3]))), 0.3);
    expect(run.walls[0].passed).toBe(true);
    run = advanceBy(applyAction(run, "forward"), 1);
    run = applyAction(run, "right");
    expect(run.frog).toMatchObject({ col: 2, depth: 6 });
    expect(applyAction(run, "back").frog.depth).toBe(6);
    // Wholly in the gate, it may jump back into the row.
    run = applyAction(run, "right");
    expect(applyAction(run, "back").frog.depth).toBe(5);
  });

  it("is optional: a frog through a normal opening keeps its piece", () => {
    const run = advanceBy(beforeGate({}, gateRow("O", FITS, 5)), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.passes).toBe(1);
    expect(run.frog.kind).toBe("L");
  });

  it("gives a frog going back through it its piece too", () => {
    // Through the opening beside the gate, the upright I keeps its piece. It
    // jumps on and, once the row has gone by, lines up in the gate.
    let run = advanceBy(beforeGate({ kind: "I", rotation: 1, col: 2 }, gateRow("O", rect([2, 2], [0, 3]))), 0.3);
    expect(run.frog.kind).toBe("I");
    run = applyAction(advanceBy(applyAction(run, "forward"), 1), "right");
    expect(run.frog).toMatchObject({ col: 3, depth: 6 });
    // Jumps back into the row, and out across its front, every cell in the
    // gate.
    run = act(run, "back", "back");
    expect(run.frog).toMatchObject({ kind: "I", depth: 4 });
    run = applyAction(run, "back");
    expect(run.frog).toMatchObject({ kind: "O", col: 3, rotation: 1, depth: 3 });
    expect(run.walls[0].passed).toBe(false);
    // The row comes again, and the frog, in the gate, passes it.
    run = advanceBy(run, 1.5);
    expect(run.walls[0].passed).toBe(true);
    expect(run.passes).toBe(2);
    expect(run.frog.kind).toBe("O");
  });

  it("sets the piece rather than swapping it, so going through it twice, either way, is harmless", () => {
    let run = advanceBy(beforeGate({ rotation: 1, col: 3 }, gateRow("O")), 0.3);
    expect(run.frog.kind).toBe("O");
    const frog = run.frog;
    run = applyAction(run, "back");
    expect(run.frog).toEqual({ ...frog, depth: 4 });
    run = advanceBy(run, 1);
    expect(run.passes).toBe(2);
    expect(run.frog).toEqual({ ...frog, depth: 4 });
    expect(run.walls[0].gates).toEqual([{ lane: 3, kind: "O" }]);
  });
});

describe("going back for a gate the frog skipped", () => {
  const RECOVERY_TUNING = { ...TEST_TUNING, recycleBehind: 36, trafficHorizon: 80, courseLength: 1e9 };

  it("is always possible: knocked back by a row only the gate's piece passes, the frog goes back through the gate and on", () => {
    // A gate for the O in lanes 4 and 5 beside an opening for the flat L at
    // lanes 0 to 2; then a row whose only opening is a square, which no L
    // passes.
    const rows = rowsOf([
      { opening: [...rect([0, 2], [0, 1]), ...rect([4, 5], [0, 3])], depth: 8, gates: [{ lane: 4, kind: "O" }] },
      { opening: rect([2, 3], [0, 1]), depth: 23 },
    ]);
    let run = onRoad(createRun(rows, RECOVERY_TUNING), { col: 0, depth: 5 });
    // The frog keeps its L through the normal opening, and the second row
    // knocks it back, twice.
    run = advanceBy(run, 21.1);
    expect(run.walls[0].passed).toBe(true);
    expect(run.frog.kind).toBe("L");
    expect(run.lastBonk?.time).toBeCloseTo(21);
    // Upright in the gate, it holds back until it is through.
    run = pressHeld(steer(run, { rotation: 1, col: 4 }), "back");
    expect(run.frog).toMatchObject({ rotation: 1, col: 4 });
    for (let t = 0; t < 10 && run.frog.kind === "L"; t += 0.05) run = advance(run, 0.05);
    expect(run.frog.kind).toBe("O");
    run = releaseHeld(run);
    // The gate row comes again and passes around it; once it has gone by,
    // the O lines up with the square, and passes the row that knocked it back.
    for (let t = 0; t < 10 && (!run.walls[0].passed || overlappingSolids(run.walls[0], run.frog.depth).length > 0); t += 0.05) run = advance(run, 0.05);
    run = steer(run, { rotation: 0, col: 2 });
    expect(run.frog).toMatchObject({ kind: "O", rotation: 0, col: 2 });
    const bonk = run.lastBonk;
    for (let t = 0; t < 30 && !run.walls[1].passed; t += 0.05) run = advance(run, 0.05);
    expect(run.walls[1].passed).toBe(true);
    expect(run.lastBonk).toBe(bonk);
  });

  it.each([COURSE_SEED, 1, 2, 3, 4, 5])("never softlocks a frog that skips every gate it can, on seed %d's stream", (seed) => {
    const { recoveries, stuck } = skipGatesAndRecover(seed, 3);
    expect(stuck).toBe(false);
    expect(recoveries).toHaveLength(3);
  });
});

const FACE: Face = { cols: TUNING.corridorCols, rows: TUNING.wallRows };

// A way through a row that keeps the frog's piece, on the road if it can be.
function wayThrough(kind: TetrominoKind, row: { opening: Opening; gates: readonly Gate[] }): Frog | null {
  const ways = normalFits(kind, FACE, row.opening, row.gates);
  return ways.find((p) => p.hop === 0) ?? ways.at(0) ?? null;
}

// Turns, then slides, the frog to a placement.
function steer(run: Run, to: Placement): Run {
  let next = run;
  for (let turn = 0; turn < 4 && next.frog.rotation !== to.rotation; turn++) next = applyAction(next, "rotateCw");
  for (let step = 0; step < TUNING.corridorCols && next.frog.col !== to.col; step++) next = applyAction(next, next.frog.col < to.col ? "right" : "left");
  return next;
}

function overlapped(run: Run): boolean {
  return run.walls.some((w) => overlappingSolids(w, run.frog.depth).length > 0);
}

// The gate a needs-gate row needs: the latest before it.
function neededGate(stream: RowStream, index: number): { at: number; gate: Gate } {
  for (let at = index - 1; at >= 0; at--) {
    const gate = stream.row(at).gates.at(0);
    if (gate !== undefined) return { at, gate };
  }
  throw new Error(`Row ${String(index)} needs a gate that isn't there`);
}

interface Recovery {
  // The gate's row, the row that needs it, and the gate.
  at: number;
  needs: number;
  gate: Gate;
  bonks: number;
}

// Plays a stream as a player who stands and meets each row through a way
// that keeps its piece, never taking a gate, until a needs-gate row knocks
// it back. Then, after letting that row knock it back once more, it goes
// back for the gate: holding the jump back, lining up with each row it goes
// back through while nothing overlaps it, upright in the gate at the gate's
// row. With the gate's piece it meets the rows again, through the gate, and
// on through the row that knocked it back. Returns the needs-gate rows it
// got through that way.
function skipGatesAndRecover(seed: number, wanted: number): { recoveries: number[]; stuck: boolean } {
  const tuning = { ...TUNING, courseLength: 1e9 };
  const stream = rowStream(seed, tuning);
  let run = onRoad(createRun(stream.row, tuning, { kind: stream.start }));
  let recovering: Recovery | null = null;
  let recovered: Recovery | null = null;
  const recoveries: number[] = [];
  const FRAME = 0.05;
  for (let step = 0; step < 60000 && recoveries.length < wanted; step++) {
    const before = run;
    run = advance(run, FRAME);
    if (run.lastBonk !== before.lastBonk) {
      const next = nextWall(run);
      if (next === null) throw new Error("A bonk with no wall ahead");
      const row = stream.row(run.walls[next].index);
      if (recovering === null && row.needsGate) {
        const needed = neededGate(stream, row.index);
        if (needed.gate.kind !== run.frog.kind) recovering = { ...needed, needs: row.index, bonks: 0 };
      }
      if (recovering !== null) recovering.bonks++;
    }
    if (recovered !== null && run.walls.some((w) => w.passed && w.index === recovered?.needs)) {
      expect(run.frog.kind).toBe(recovered.gate.kind);
      recoveries.push(recovered.needs);
      recovered = null;
    }
    if (recovering !== null) {
      if (run.frog.kind === recovering.gate.kind) {
        run = releaseHeld(run);
        recovered = recovering;
        recovering = null;
        continue;
      }
      if (recovering.bonks < 2) continue;
      if (!overlapped(run)) {
        const { at, gate } = recovering;
        const behind = run.walls.filter((w) => w.passed && w.index >= at).sort((a, b) => b.depth - a.depth).at(0);
        if (behind === undefined) throw new Error(`The gate's row ${String(at)} has gone`);
        const pose = behind.index === at ? { ...inGate(run.frog.kind, gate), hop: 0 } : wayThrough(run.frog.kind, stream.row(behind.index));
        if (pose === null) throw new Error(`No way back through row ${String(behind.index)}`);
        run = steer(run, pose);
        if (pose.hop === 1 && hopHeight(run.frog) === 0) run = applyAction(run, "hop");
      }
      if (run.holds.length === 0) run = pressHeld(run, "back");
      continue;
    }
    const next = nextWall(run);
    if (next === null) continue;
    const wall = run.walls[next];
    const row = stream.row(wall.index);
    const gate = row.gates.at(0);
    const pose = gate !== undefined && gate.kind === run.frog.kind ? { ...inGate(gate.kind, gate), hop: 0 } : wayThrough(run.frog.kind, row);
    // A needs-gate row it can't pass will knock it back.
    if (pose === null) continue;
    if (!overlapped(run)) run = steer(run, pose);
    const arriving = (wall.depth - run.frog.depth) / tuning.wallSpeed;
    if (pose.hop === 1 && hopHeight(run.frog) === 0 && arriving < tuning.hopAirtime / 2) run = applyAction(run, "hop");
  }
  return { recoveries, stuck: recoveries.length < wanted };
}
