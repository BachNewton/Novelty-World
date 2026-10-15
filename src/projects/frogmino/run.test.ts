import { describe, it, expect } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { TETROMINOES, cellKey, frogCells, insideLanes, pieceSize, rectOpening as rect } from "./logic";
import {
  FROG_THICKNESS,
  applyAction,
  createRun,
  crossedFinish,
  fitsRow,
  frogShape,
  inPlay,
  isDone,
  isRiding,
  nextWall,
  onOverpass,
  overlappingSolids,
  placedFrog,
  applyInput,
  playTo,
  pressHeld,
  releaseHeld,
  replay,
  type FrogAction,
  type PlacedFrog,
  type PlayerInput,
  type TimedInput,
  type RuleFrog,
  type RuleRow,
  type RuleRows,
  type Run,
  type Wall,
} from "./run";
import { rowBack, rowSolids, type Row } from "./traffic";
import { frameTicks, toSeconds, toTicks } from "./ticks";
import { TUNING, type Tuning } from "./tuning";
import type { Cell, Frog, Opening, Solid, TetrominoKind } from "./types";
import { PREVIEW_ROWS, passingPoses } from "./world/preview-rows";

// Unit jumps and unit wall speed keep the arithmetic readable: a jump is 1
// unit, a wall moves 1 unit a second (a hundredth of a unit a tick), and a
// bonk knocks the frog back 3.
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
  recycleBehind: 5,
  trafficHorizon: 30,
};

// Ten thousand random steps through a stream of rows take a few seconds, more
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
// into, one row up, nor any other kick.
const UPRIGHT_AT_EDGE = rect([0, 1], [0, 2]);
// Fits the flat L one column to the left of where it starts.
const LEFT_OF_START = rect([1, 3], [0, 1]);

// Every cell of a 7 × 4 face that `opening` leaves out: the test rows are
// four cells tall, and above them is open air.
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

// The walls where the test puts them, each a row of one vehicle filling
// everything but the opening, then the same rows again in order, each the
// spacing beyond the back of the one before.
function rowsOf(walls: readonly TestWall[]): RuleRows {
  const rows = walls.map(({ opening, length = 1 }) => ({ solids: [{ cells: closed(opening), length }] }));
  const gaps = walls.map((w, i) => (i === 0 ? w.depth : w.depth - (walls[i - 1].depth + (walls[i - 1].length ?? 1))));
  return (index): RuleRow => ({ ...rows[index % rows.length], gap: index < walls.length ? gaps[index] : TEST_TUNING.wallSpacing });
}

// No traffic within reach of any test: one solid row far up the road.
const NO_TRAFFIC: RuleRows = () => ({ solids: [{ cells: closed([]), length: 1 }], gap: 1e6 });

// The frog dropped onto the road, in play.
function onRoad(run: Run, frog: Partial<PlacedFrog> = {}): Run {
  const { depth = run.depth, ...own } = frog;
  return { ...run, droppedAt: 0, depth, frogs: [{ ...run.frogs[0], ...own }, ...run.frogs.slice(1)] };
}

function runWithWalls(walls: readonly TestWall[], frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return onRoad(createRun(rowsOf(walls), { ...TEST_TUNING, ...tuning }), { depth: frogDepth });
}

function runWithWall(opening: Opening, depth: number, frogDepth = 5, tuning: Partial<Tuning> = {}): Run {
  return runWithWalls([{ opening, depth }], frogDepth, tuning);
}

// Plays on `seconds`, in one go.
function playFor(run: Run, seconds: number): Run {
  return playTo(run, run.tick + toTicks(seconds));
}

// Plays on `seconds`, `chunk` seconds at a time. However the ticks are
// chunked, the run comes out the same (see "the rules' clock").
function advanceBy(run: Run, seconds: number, chunk = 0.05): Run {
  const end = run.tick + toTicks(seconds);
  let next = run;
  while (next.tick < end) next = playTo(next, Math.min(end, next.tick + Math.max(1, toTicks(chunk))));
  return next;
}

// A tick of the rules in seconds, for comparing with the times the tests
// reason in.
function at(tick: number | null | undefined): number {
  if (tick === null || tick === undefined) return Number.NaN;
  return toSeconds(tick);
}

// When a frog next comes down from where it is in `run`: the first tick, in
// seconds, at which its height drops.
function landsAt(run: Run, player = 0): number {
  const from = run.frogs[player].height;
  let next = run;
  while (next.frogs[player].height >= from) {
    if (next.tick > run.tick + toTicks(10)) throw new Error("The frog never came down");
    next = playTo(next, next.tick + 1);
  }
  return at(next.tick);
}

// The vehicles of a wall whose depth range and the frog's intersect, by more
// than rounding.
function overlapping(w: Wall, frogDepth: number): Solid[] {
  if (w.depth >= frogDepth - 1e-9) return [];
  return w.solids.filter((solid) => w.depth + solid.length > frogDepth - FROG_THICKNESS + 1e-9);
}

function act(run: Run, ...actions: FrogAction[]): Run {
  return actions.reduce((next, action) => applyAction(next, action), run);
}

describe("a run", () => {
  it("starts with the frog centred on the overpass, out of play, and the stream's rows where their gaps put them", () => {
    const run = createRun(rowsOf([{ opening: FITS, depth: 12 }, { opening: FITS, depth: 30 }]), TEST_TUNING);
    expect(placedFrog(run, 0)).toMatchObject({ col: 2, rotation: 0, depth: 0 });
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
    expect(run.frogs[0].col).toBe(0);
    run = act(run, "right", "right", "right", "right", "right");
    expect(run.frogs[0].col).toBe(4);
  });

  it("rotates with a wall kick at the edge", () => {
    const run = act(createRun(NO_TRAFFIC, TEST_TUNING), "rotateCw", "left", "left", "left");
    expect(run.frogs[0]).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw").frogs[0]).toMatchObject({ col: 0, rotation: 2 });
  });

  it("runs a frame's ticks, carrying the rest of the frame into the next, and clamps a long frame", () => {
    expect(frameTicks(0, 0.025, 0.1)).toEqual({ ticks: 2, carry: expect.closeTo(0.5) as number });
    expect(frameTicks(0.5, 0.025, 0.1)).toEqual({ ticks: 3, carry: expect.closeTo(0) as number });
    expect(frameTicks(0.25, 5, 0.1)).toEqual({ ticks: 10, carry: 0.25 });
    // Frames of a 120 Hz display run the rules' ticks at real time's pace.
    let carry = 0;
    let ticks = 0;
    for (let frame = 0; frame < 120; frame++) {
      const due = frameTicks(carry, 1 / 120, 0.1);
      ticks += due.ticks;
      carry = due.carry;
    }
    expect(ticks + carry).toBeCloseTo(100);
  });
});

describe("walls reaching the frog", () => {
  it("passes a wall the frog fits, once, at the moment it arrives", () => {
    let run = advanceBy(runWithWall(FITS, 5.2), 0.1);
    expect(run.walls[0].passed).toBe(false);
    run = advanceBy(run, 0.2);
    expect(run.walls[0].passed).toBe(true);
    expect(run.depth).toBe(5);
    run = advanceBy(run, 3);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
  });

  it("bonks a frog that doesn't fit, knocking it back by the knock-back from the wall's face", () => {
    const run = advanceBy(runWithWall(BLOCKED, 5.1), 0.2);
    expect(run.depth).toBeCloseTo(2);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(0.1);
    expect(run.lastBonk?.depth).toBeCloseTo(5);
    expect(run.walls[0].passed).toBe(false);
    expect(nextWall(run)).toBe(0);
  });

  it("knocks the frog back however far that takes it, behind the start and on down the road", () => {
    let run = advanceBy(runWithWall(BLOCKED, 2.1, 2), 0.2);
    expect(run.lastBonk?.depth).toBeCloseTo(2);
    expect(run.depth).toBeCloseTo(-1);
    // There is no safe zone: the wall keeps coming, and bonks it again.
    run = advanceBy(run, 3);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(3.1);
    expect(run.depth).toBeCloseTo(-4);
    // Each bonk knocks it back from where the wall's face is at the tick it
    // arrives, which may be up to a tick's travel past the frog's own face.
    run = advanceBy(run, 30);
    expect(run.depth).toBeCloseTo(-34, 1);
    expect(run.walls[0].passed).toBe(false);
  });

  it("bonks the frog again when the same wall arrives again and it still doesn't fit", () => {
    let run = advanceBy(runWithWall(BLOCKED, 8.1, 8), 0.2);
    expect(run.depth).toBeCloseTo(5);
    run = advanceBy(run, 3);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(3.1);
    expect(run.depth).toBeCloseTo(2);
    expect(run.walls[0].passed).toBe(false);
  });

  it("lets the wall pass once the frog fits it before it arrives again", () => {
    let run = advanceBy(runWithWall(LEFT_OF_START, 8.1, 8), 0.2);
    expect(run.depth).toBeCloseTo(5);
    const bonk = run.lastBonk;
    run = advanceBy(applyAction(run, "left"), 3.5);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBe(bonk);
    expect(run.depth).toBeCloseTo(5);
  });

  it("judges each wall reached in one long catch-up, nearest first", () => {
    const run = playFor(
      runWithWalls([{ opening: BLOCKED, depth: 7 }, { opening: FITS, depth: 5.5 }], 5),
      3,
    );
    expect(run.walls[1].passed).toBe(true);
    expect(run.walls[0].passed).toBe(false);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(2);
    expect(run.depth).toBeCloseTo(2);
  });

  it("judges every arrival of one long catch-up, however many bonks it holds", () => {
    const start = runWithWall(BLOCKED, 8.5, 8);
    const long = playFor(start, 7);
    const short = advanceBy(start, 7, 0.01);
    // Bonked at 0.5 s (to 5), 3.5 s (to 2) and 6.5 s (to -1, behind the start).
    expect(at(long.lastBonk?.tick)).toBeCloseTo(6.5);
    expect(long.depth).toBeCloseTo(-1);
    expect(at(short.lastBonk?.tick)).toBeCloseTo(6.5);
    expect(short.depth).toBeCloseTo(-1);
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
      run = playFor(run, 0.1);
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
    expect(run.walls[0].depth).toBeGreaterThan(run.depth + TEST_TUNING.trafficHorizon - 2);
    const arrival = run.walls[0].depth - run.depth;
    run = advanceBy(run, arrival - 0.2);
    expect(run.walls[0].passed).toBe(false);
    run = advanceBy(run, 0.4);
    expect(run.walls[0].passed).toBe(true);
  });

  it("brings a row back beyond the traffic horizon when no other row is further out", () => {
    let run = runWithWalls([{ opening: FITS, depth: 3 }], 50, { trafficHorizon: 1 });
    run = { ...run, walls: run.walls.map((w) => ({ ...w, passed: true })) };
    expect(run.walls).toHaveLength(1);
    run = playTo(run, run.tick + 1);
    expect(run.walls[0].passed).toBe(false);
    expect(run.walls[0].depth).toBeCloseTo(51);
    expect(nextWall(run)).toBe(0);
  });

  it("recycles only out of view, for a frog far behind the start as much as ahead of it", () => {
    let run = runWithWalls([{ opening: FITS, depth: -170 }, { opening: FITS, depth: -150 }], -200);
    let returns = 0;
    for (let step = 0; step < 1000; step++) {
      const before = run;
      run = playFor(run, 0.1);
      run.walls.forEach((w, i) => {
        if (w.depth <= before.walls[i].depth) return;
        returns++;
        expect(rowBack(before.walls[i]) - 0.1).toBeLessThan(before.depth - TEST_TUNING.recycleBehind);
        expect(w.depth).toBeGreaterThanOrEqual(run.depth + TEST_TUNING.trafficHorizon - 0.1);
      });
    }
    expect(run.depth).toBe(-200);
    expect(run.passes).toBeGreaterThan(3);
    expect(returns).toBeGreaterThan(3);
  });

  it("never lets a wall reach the frog unjudged, whatever the player does or however many ticks each call plays", () => {
    const counts = playRandomly(playRun(), 99, []);
    // The play really did pass, bonk and loop.
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  }, RANDOM_PLAY_TIMEOUT);

  it("keeps the same promises for a frog that keeps going back, far behind the start", () => {
    const counts = playRandomly(playRun(), 3, ["back", "back", "back", "back", "back"]);
    expect(counts.furthestBack).toBeLessThan(-100);
    expect(Math.min(counts.bonks, counts.passes, counts.returns)).toBeGreaterThan(10);
  }, RANDOM_PLAY_TIMEOUT);
});

// Rows for a frog to play through, at random or by inputs: each a row the L
// passes in a known pose, its answer, which a seed picks for each row along
// with its length and its gap, so the rows vary as a course's do.
const PLAY_ROWS: readonly { opening: Opening; answer: Omit<Frog, "kind"> }[] = [
  { opening: FITS, answer: { col: 2, rotation: 0, height: 0 } },
  { opening: LEFT_OF_START, answer: { col: 1, rotation: 0, height: 0 } },
  { opening: RAISED, answer: { col: 2, rotation: 0, height: 1 } },
  { opening: UPRIGHT_AT_EDGE, answer: { col: 0, rotation: 1, height: 0 } },
  { opening: rect([4, 6], [0, 1]), answer: { col: 4, rotation: 0, height: 0 } },
];

interface PlayRow extends RuleRow {
  answer: Omit<Frog, "kind">;
}

// Row `index` of the play rows, the same each time it is asked for.
function playRows(tuning: Tuning): (index: number) => PlayRow {
  const made = new Map<number, PlayRow>();
  return (index) => {
    const known = made.get(index);
    if (known !== undefined) return known;
    const random = createRng(`frogmino-play:${String(index)}`).next;
    const { opening, answer } = PLAY_ROWS[Math.floor(random() * PLAY_ROWS.length)];
    const length = 1 + Math.floor(random() * 3);
    const gap = (index === 0 ? tuning.firstWallDepth : tuning.wallSpacing) + (random() * 2 - 1) * tuning.wallJitter;
    const row: PlayRow = { solids: [{ cells: closed(opening), length }], gap, answer };
    made.set(index, row);
    return row;
  };
}

const PLAY_TUNING: Tuning = { ...TUNING, courseLength: 1e9, maxFrameDelta: 1 };
const PLAY = playRows(PLAY_TUNING);

function playRun(): Run {
  return onRoad(createRun(PLAY, PLAY_TUNING));
}

// A player who, now and then, reads the next row and takes up the pose it
// was built around, while nothing overlaps the frog. Otherwise the random
// frog would hardly ever fit a row, and would be knocked back down the road
// forever.
function readRow(run: Run): Run {
  const next = nextWall(run);
  if (next === null || run.walls.some((w) => overlappingSolids(w, run.depth).length > 0)) return run;
  const { col, rotation } = PLAY(run.walls[next].index).answer;
  return onRoad(run, { col, rotation });
}

// Plays at random, mixing actions and runs of ticks of every length, and checks
// after every step that each wall the frog hasn't passed is ahead of it and
// each it has passed behind it; that the frog's cells are clear of every
// vehicle overlapping it; that a wall's overlapping vehicles only ever drop
// away unless the frog jumped back among them; that a wall is recycled only
// once it is well behind the frog, and comes back beyond the traffic
// horizon; that every cell is on the road; and that the frog's piece never
// changes.
function playRandomly(start: Run, seed: number, extra: FrogAction[]) {
  const random = createRng(seed).next;
  const actions: FrogAction[] = ["left", "right", "rotateCw", "rotateCcw", "hop", "forward", "forward", "back", ...extra];
  const { recycleBehind, trafficHorizon, wallSpeed, maxFrameDelta, corridorCols } = start.tuning;
  let run = start;
  const counts = { bonks: 0, passes: 0, returns: 0, furthestBack: start.depth };
  for (let step = 0; step < 10000; step++) {
    const before = run;
    const elapsed = random() * 1.2;
    const roll = random();
    if (roll < 0.15) run = readRow(run);
    else if (roll < 0.4) run = applyAction(run, actions[Math.floor(random() * actions.length)]);
    else run = playTo(run, run.tick + toTicks(Math.min(elapsed, maxFrameDelta)));
    if (run.lastBonk !== before.lastBonk) counts.bonks++;
    expect(run.frogs[0].kind).toBe(start.frogs[0].kind);
    counts.passes += run.passes - before.passes;
    counts.furthestBack = Math.min(counts.furthestBack, run.depth);
    const frog = run.depth;
    const cells = frogCells(frogShape(run.frogs[0]));
    run.walls.forEach((w, i) => {
      const was = before.walls[i];
      if (w.depth > was.depth) {
        counts.returns++;
        const travel = wallSpeed * toSeconds(toTicks(Math.min(elapsed, maxFrameDelta)));
        expect(rowBack(was) - travel).toBeLessThan(before.depth - recycleBehind);
        expect(w.depth).toBeGreaterThanOrEqual(frog + trafficHorizon - travel - 1e-9);
      } else if (w.passed && was.passed && frog >= before.depth) {
        const earlier = overlappingSolids(was, before.depth);
        for (const solid of overlappingSolids(w, frog)) expect(earlier).toContain(solid);
      }
      if (w.passed) expect(w.depth).toBeLessThanOrEqual(frog + 1e-9);
      else expect(w.depth).toBeGreaterThanOrEqual(frog - 1e-9);
      const solid = new Set(overlapping(w, frog).flatMap((v) => v.cells.map(cellKey)));
      if (solid.size === 0) return;
      for (const c of cells) expect(solid.has(cellKey(c))).toBe(false);
    });
    expect(insideLanes(run.frogs[0].kind, run.frogs[0], { first: 0, last: corridorCols - 1 })).toBe(true);
  }
  return counts;
}

describe("hop", () => {
  it("keeps the frog up for the tuning's airtime", () => {
    expect(TUNING.hopAirtime).toBe(0.7);
    const run = applyAction(onRoad(createRun(NO_TRAFFIC, TUNING)), "hop");
    expect(advanceBy(run, 0.69, 0.01).frogs[0].height).toBe(1);
    const landed = advanceBy(run, 0.71, 0.01).frogs[0];
    expect(landed.height).toBe(0);
    expect(landsAt(run)).toBeCloseTo(0.7);
    const short = applyAction(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "hop");
    expect(advanceBy(short, 0.49, 0.01).frogs[0].height).toBe(1);
    expect(advanceBy(short, 0.51, 0.01).frogs[0].height).toBe(0);
  });

  it("passes a raised opening mid-hop", () => {
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.2), "hop"), 0.3);
    expect(run.walls[0].passed).toBe(true);
  });

  it("is bonked by a raised opening when grounded", () => {
    const run = advanceBy(runWithWall(RAISED, 5.2), 0.3);
    expect(run.lastBonk).not.toBeNull();
  });

  it("is judged at the tick it arrives, not the end of a long catch-up", () => {
    // The wall arrives 0.3 s in, mid-hop; by the catch-up's end the frog has landed.
    const run = playFor(applyAction(runWithWall(RAISED, 5.3, 5), "hop"), 1);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
  });

  it("ignores a hop pressed while airborne", () => {
    let run = applyAction(runWithWall(FITS, 20), "hop");
    run = advanceBy(run, 0.3);
    expect(applyAction(run, "hop")).toBe(run);
    run = advanceBy(run, 0.3);
    expect(at(applyAction(run, "hop").frogs[0].latestHop?.startedAt)).toBeCloseTo(0.6);
  });
});

// The frog at 5 fills 4 to 5. A wall arriving at 0.2 s overlaps it from
// then until 2.2 s, when its back face passes the frog's.
describe("a wall overlapping the frog", () => {
  function passedInto(opening: Opening, ...before: FrogAction[]): Run {
    const run = advanceBy(act(runWithWall(opening, 5.2), ...before), 0.3);
    expect(run.walls[0].passed).toBe(true);
    expect(overlapping(run.walls[0], run.depth)).toHaveLength(1);
    return run;
  }

  it("is judged when its front face reaches the frog's, once, however the ticks are chunked", () => {
    for (const chunk of [0.01, 0.3, 2.5]) {
      const run = runWithWall(BLOCKED, 5.2, 5);
      let judged = 0;
      let next = run;
      for (let t = 0; t < 2.5 - 1e-9; t += chunk) {
        const before = next;
        next = playFor(next, chunk);
        if (next.lastBonk !== before.lastBonk) judged++;
      }
      expect(judged).toBe(1);
      expect(at(next.lastBonk?.tick)).toBeCloseTo(0.2);
      expect(next.lastBonk?.depth).toBeCloseTo(5);
    }
    // Passed, it stays passed through the whole overlap and after it.
    const passed = playFor(runWithWall(FITS, 5.2, 5), 3);
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
    expect(applyAction(run, "left").frogs[0].col).toBe(1);
    // One column right still fits; a second would leave the opening.
    expect(act(run, "right", "right").frogs[0].col).toBe(3);
  });

  it("frees the frog to slide once it has gone by", () => {
    const run = passedInto(FITS);
    const late = advanceBy(run, 1.8);
    expect(applyAction(late, "left")).toBe(late);
    expect(applyAction(advanceBy(run, 2), "left").frogs[0].col).toBe(1);
  });

  it("refuses a turn into its solid cells, and allows one inside its opening", () => {
    const run = passedInto(FITS);
    expect(applyAction(run, "rotateCw")).toBe(run);
    expect(applyAction(passedInto(TALL), "rotateCw").frogs[0]).toMatchObject({ col: 2, rotation: 1 });
  });

  it("refuses a turn whose every kick lands in its solid cells", () => {
    // Upright at the left edge, the frog passes the wall; the next turn
    // would kick it back to column 0 as a flat L one row up, and every other
    // kick is off the road or into the wall too.
    const run = passedInto(UPRIGHT_AT_EDGE, "rotateCw", "left", "left");
    expect(run.frogs[0]).toMatchObject({ col: 0, rotation: 1 });
    expect(applyAction(run, "rotateCw")).toBe(run);
  });

  it("kicks a turn off its solid cells into its opening", () => {
    // Upright where it stands, the L would meet the vehicle above its first
    // lane; the turn kicks it a lane right, into the opening.
    const run = passedInto([{ col: 2, row: 0 }, ...rect([3, 4], [0, 3])]);
    expect(applyAction(run, "rotateCw").frogs[0]).toMatchObject({ col: 3, rotation: 1 });
  });

  it("refuses a hop into its solid cells, and allows one inside its opening", () => {
    const run = passedInto(FITS);
    expect(applyAction(run, "hop")).toBe(run);
    expect(applyAction(passedInto(TALL), "hop").frogs[0].height).toBe(1);
  });

  it("rides a frog that passed a raised opening across it until it has gone by, then lands it", () => {
    // Up from 0 s, the frog passes at 0.2 s; its airtime ends at 0.5 s.
    const run = passedInto(RAISED, "hop");
    expect(advanceBy(run, 1.8).frogs[0].height).toBe(1);
    const landed = advanceBy(run, 2).frogs[0];
    expect(landed.height).toBe(0);
    expect(landsAt(run)).toBeCloseTo(2.2);
    // One long catch-up lands it at the same tick.
    const hopped = applyAction(runWithWall(RAISED, 5.2, 5), "hop");
    const long = playFor(hopped, 3);
    expect(long.walls[0].passed).toBe(true);
    expect(long.frogs[0].height).toBe(0);
    expect(playFor(hopped, 2.19).frogs[0].height).toBe(1);
    expect(playFor(hopped, 2.2).frogs[0].height).toBe(0);
    expect(advanceBy(run, 2).lastBonk).toBeNull();
  });

  it("gives an early hop grace: one whose airtime ends mid-overlap still passes and rides across", () => {
    // Up from 0 s with 0.5 s of airtime, the frog meets the raised opening at
    // 0.45 s, just before it would have landed, and rides it until 2.45 s.
    const run = advanceBy(applyAction(runWithWall(RAISED, 5.45), "hop"), 0.5, 0.01);
    expect(run.walls[0].passed).toBe(true);
    expect(isRiding(run)).toBe(true);
    const across = advanceBy(run, 1.9, 0.01);
    expect(across.frogs[0].height).toBe(1);
    expect(across.lastBonk).toBeNull();
    const landed = advanceBy(run, 2, 0.01).frogs[0];
    expect(landed.height).toBe(0);
    expect(landsAt(run)).toBeCloseTo(2.45);
  });

  it("rides even where landing would fit, and keeps riding through a slide", () => {
    // Room to stand or hop, and to slide: the frog passed up high rides on.
    const run = passedInto(rect([1, 5], [0, 3]), "hop");
    const slid = applyAction(advanceBy(run, 0.5), "left");
    expect(slid.frogs[0].col).toBe(1);
    expect(isRiding(slid)).toBe(true);
    expect(advanceBy(slid, 1).frogs[0].height).toBe(1);
    expect(advanceBy(slid, 1.5).frogs[0].height).toBe(0);
  });

  it("jumps a riding frog forward in its pose and height, clearing the wall sooner", () => {
    // At 0.6 s the wall fills 4.6 to 5.6. One jump forward leaves the frog
    // (5 to 6) still riding it; a second takes it clear, and it lands, long
    // before the 2.2 s the wall would have taken to go by.
    const run = advanceBy(passedInto(RAISED, "hop"), 0.3);
    expect(isRiding(run)).toBe(true);
    const once = applyAction(run, "forward");
    expect(placedFrog(once, 0)).toMatchObject({ depth: 6, col: run.frogs[0].col, rotation: run.frogs[0].rotation });
    expect(isRiding(once)).toBe(true);
    const twice = applyAction(once, "forward");
    expect(twice.depth).toBe(7);
    expect(twice.frogs[0].height).toBe(0);
  });

  it("repeats a held jump while riding", () => {
    // Riding from 0.3 s, the press jumps the frog to 6, still on the wall;
    // the repeat at 0.55 s carries it clear to 7, where it lands.
    const riding = pressHeld(passedInto(RAISED, "hop"), "forward");
    expect(riding.depth).toBe(6);
    expect(isRiding(riding)).toBe(true);
    const repeated = advanceBy(riding, 0.25, 0.01);
    expect(repeated.depth).toBe(7);
    expect(repeated.frogs[0].height).toBe(0);
    expect(landsAt(riding)).toBeCloseTo(0.55);
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
    expect(at(run.lastBonk?.tick)).toBeCloseTo(7.2);
    expect(run.depth).toBeCloseTo(7);
    for (const w of run.walls) expect(overlapping(w, run.depth)).toEqual([]);
    expect(rowBack(run.walls[0])).toBeLessThanOrEqual(run.depth - FROG_THICKNESS + 1e-9);
    // Clear of the wall it passed, it moves freely, and can jump back into
    // it only where it fits.
    const slid = applyAction(run, "left");
    expect(slid.frogs[0].col).toBe(1);
    expect(applyAction(slid, "back")).toBe(slid);
    expect(applyAction(run, "back").depth).toBe(6);
  });
});

describe("jump", () => {
  it("moves forward with no cap, and back past the start as far as it likes", () => {
    let run = runWithWall(FITS, 50, 0);
    for (let i = 0; i < 40; i++) run = applyAction(run, "forward");
    expect(run.depth).toBe(40);
    run = runWithWall(FITS, 50, 0.5);
    for (let i = 0; i < 20; i++) run = applyAction(run, "back");
    expect(run.depth).toBe(-19.5);
  });

  it("passes a wall jumped through when the frog fits", () => {
    const run = applyAction(runWithWall(FITS, 5.5), "forward");
    expect(run.walls[0].passed).toBe(true);
    expect(run.depth).toBe(6);
  });

  it("is bonked by a wall it jumps into and doesn't fit", () => {
    const run = applyAction(runWithWall(BLOCKED, 5.5), "forward");
    expect(run.depth).toBe(2.5);
    expect(run.walls[0].passed).toBe(false);
    expect(run.lastBonk).toEqual({ tick: 0, depth: 5.5 });
  });

  it("doesn't judge a wall still ahead after the jump", () => {
    const run = applyAction(runWithWall(BLOCKED, 6.5), "forward");
    expect(run.depth).toBe(6);
    expect(run.lastBonk).toBeNull();
  });

  it("goes back into a wall it has passed, and back out through its front, wherever it fits", () => {
    const run = act(runWithWalls([{ opening: WIDE, depth: 5.5, length: 3 }]), "forward", "forward");
    expect(run.walls[0].passed).toBe(true);
    expect(run.depth).toBe(7);
    // Overlapping the wall, inside its opening, the frog jumps back among its
    // vehicles, still past its front.
    const among = applyAction(run, "back");
    expect(among.depth).toBe(6);
    expect(among.walls[0].passed).toBe(true);
    // The next jump back takes it out through the front: the wall is ahead
    // again, and is judged afresh when it arrives.
    const out = applyAction(among, "back");
    expect(out.depth).toBe(5);
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
    expect(run.frogs[0].col).toBe(1);
    expect(applyAction(run, "back")).toBe(run);
    expect(applyAction(advanceBy(run, 1), "back").depth).toBe(5);
    // Back in line, it can.
    expect(applyAction(applyAction(run, "right"), "back").depth).toBe(5);
  });
});

describe("a held jump", () => {
  function jumpsIn(seconds: number, chunk: number): Run {
    const run = pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "forward");
    return advanceBy(run, seconds, chunk);
  }

  it("jumps on the press, then again every repeat interval, however the ticks are chunked", () => {
    const pressed = pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "forward");
    expect(pressed.depth).toBe(1);
    // Repeats at 0.25, 0.5 and 0.75 s.
    for (const chunk of [0.01, 0.05, 0.1, 0.3, 0.9]) {
      expect(jumpsIn(0.9, chunk).depth).toBe(4);
    }
    expect(jumpsIn(1.2, 0.4).depth).toBe(5);
  });

  it("repeats a held jump back too", () => {
    const run = advanceBy(pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 }), "back"), 0.6);
    expect(run.depth).toBe(7);
  });

  it("keeps jumping after a bonk, a full repeat interval later", () => {
    let run = pressHeld(runWithWall(BLOCKED, 10, 0), "forward");
    // At 2 s the wall reaches the frog at 8, just as the key would repeat,
    // and bonks it back to 5.
    run = advanceBy(run, 2.1);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(2);
    expect(run.depth).toBeCloseTo(5);
    expect(at(run.holds.at(0)?.nextAt)).toBeCloseTo(2.25);
    // Still held, it jumps on at 2.25 s and 2.5 s, and at 2.75 s jumps into
    // the wall at 7.25 and is bonked again.
    run = advanceBy(run, 0.5);
    expect(run.depth).toBe(7);
    run = advanceBy(run, 0.2);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(2.75);
    expect(run.depth).toBeCloseTo(4.25);
  });

  it("waits a full repeat interval after a bonk between repeats, rather than jumping at once", () => {
    let run = pressHeld(runWithWall(BLOCKED, 9.1, 10), "back");
    expect(run.depth).toBe(9);
    // The wall arrives at 0.1 s, before the repeat due at 0.25 s, and bonks
    // the frog to 6. The repeat moves to 0.35 s.
    run = advanceBy(run, 0.3, 0.01);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(0.1);
    expect(run.depth).toBeCloseTo(6);
    run = advanceBy(run, 0.1, 0.01);
    expect(run.depth).toBeCloseTo(5);
  });

  it("keeps repeating when a jump back is refused", () => {
    // Past the wall, out of line with its opening, the frog holds back. The
    // wall is clear of where the jump lands from 0.9 s, and the key goes on.
    let run = applyAction(advanceBy(applyAction(runWithWall(FITS, 5.5), "forward"), 1.6), "left");
    run = pressHeld(run, "back");
    expect(run.depth).toBe(6);
    expect(run.holds).toHaveLength(1);
    run = advanceBy(run, 1.1);
    expect(run.holds).toHaveLength(1);
    expect(run.depth).toBe(5);
  });

  it("stops when its key is released, or every key is let go", () => {
    const held = pressHeld(onRoad(createRun(NO_TRAFFIC, TEST_TUNING)), "forward");
    expect(releaseHeld(held, "back")).toBe(held);
    const released = releaseHeld(held, "forward");
    expect(released.holds).toEqual([]);
    expect(advanceBy(released, 1).depth).toBe(1);
    // Losing focus lets go of whatever is held.
    const blurred = releaseHeld(held);
    expect(blurred.holds).toEqual([]);
    expect(advanceBy(blurred, 1).depth).toBe(1);
  });

  it("follows the latest jump key pressed", () => {
    let run = onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 });
    run = pressHeld(pressHeld(run, "forward"), "back");
    expect(run.holds.map((hold) => hold.action)).toEqual(["back"]);
    expect(releaseHeld(run, "forward")).toBe(run);
  });
});

describe("a held slide", () => {
  function slidesIn(seconds: number, chunk: number): Run {
    const atLeftEdge = onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { col: 0, depth: 10 });
    return advanceBy(pressHeld(atLeftEdge, "right"), seconds, chunk);
  }

  it("slides on the press, then again every repeat interval, however the ticks are chunked", () => {
    expect(slidesIn(0, 0.05).frogs[0].col).toBe(1);
    // Repeats at 0.25 and 0.5 s.
    for (const chunk of [0.01, 0.05, 0.1, 0.3, 0.6]) {
      expect(slidesIn(0.6, chunk).frogs[0].col).toBe(3);
    }
  });

  it("keeps repeating at the corridor edge, and on the overpass", () => {
    // From column 2 on the overpass: 1 on the press, 0 at 0.25 s, then the
    // edge refuses it, and the key is still held.
    const run = advanceBy(pressHeld(createRun(NO_TRAFFIC, TEST_TUNING), "left"), 0.6);
    expect(onOverpass(run)).toBe(true);
    expect(run.frogs[0].col).toBe(0);
    expect(run.holds.map((hold) => hold.action)).toEqual(["left"]);
    expect(advanceBy(releaseHeld(run, "left"), 1).frogs[0].col).toBe(0);
  });

  it("keeps repeating when a vehicle overlapping the frog refuses it", () => {
    // The frog passes into a two-long row at 0.5 s, which overlaps it until
    // 3.5 s. Held from 1.1 s, the slide is refused until the repeat at 3.6 s.
    let run = advanceBy(runWithWalls([{ opening: FITS, depth: 5.5, length: 2 }]), 1.1);
    expect(run.walls[0].passed).toBe(true);
    run = pressHeld(run, "left");
    expect(run.frogs[0].col).toBe(2);
    expect(run.holds).toHaveLength(1);
    expect(advanceBy(run, 2.4).frogs[0].col).toBe(2);
    expect(advanceBy(run, 2.6).frogs[0].col).toBe(1);
  });

  it("repeats while riding", () => {
    // Riding from 0.3 s, the press slides the frog to 1, the opening's edge.
    // The repeats are refused until the wall has gone by at 2.2 s.
    const riding = pressHeld(advanceBy(applyAction(runWithWall(rect([1, 5], [0, 3]), 5.2), "hop"), 0.3), "left");
    expect(isRiding(riding)).toBe(true);
    expect(riding.frogs[0].col).toBe(1);
    const along = advanceBy(riding, 1.5);
    expect(isRiding(along)).toBe(true);
    expect(along.frogs[0].col).toBe(1);
    expect(advanceBy(riding, 2.1).frogs[0].col).toBe(0);
  });

  it("slides at its own tick within a long catch-up, before or after a row arrives", () => {
    const heldRight = (wallDepth: number): Run =>
      pressHeld(onRoad(runWithWall(FITS, wallDepth, 5), { col: 0 }), "right");
    // The repeat at 0.25 s lines the frog up before the row arrives at 0.3 s,
    // and the next, at 0.5 s, is refused by its vehicle.
    const lined = playFor(heldRight(5.3), 0.6);
    expect(lined.passes).toBe(1);
    expect(lined.lastBonk).toBeNull();
    expect(lined.frogs[0].col).toBe(2);
    // A row arriving at 0.2 s, before the repeat, bonks the frog, and the
    // slide comes a full repeat interval later, at 0.45 s.
    const bonked = playFor(heldRight(5.2), 0.5);
    expect(at(bonked.lastBonk?.tick)).toBeCloseTo(0.2);
    expect(bonked.frogs[0].col).toBe(2);
    expect(at(bonked.holds.at(0)?.nextAt)).toBeCloseTo(0.7);
  });

  it("is held alongside a held jump, and a newer slide replaces the held one", () => {
    let run = onRoad(createRun(NO_TRAFFIC, TEST_TUNING), { depth: 10 });
    run = pressHeld(pressHeld(run, "forward"), "left");
    expect(placedFrog(run, 0)).toMatchObject({ depth: 11, col: 1 });
    // Both repeat at 0.25 s; at 0.3 s right replaces left.
    run = pressHeld(advanceBy(run, 0.3), "right");
    expect(placedFrog(run, 0)).toMatchObject({ depth: 12, col: 1 });
    expect(run.holds.map((hold) => hold.action)).toEqual(["forward", "right"]);
    expect(releaseHeld(run, "left")).toBe(run);
    // The jump repeats at 0.5 s, the slide at 0.55 s.
    expect(placedFrog(advanceBy(run, 0.3), 0)).toMatchObject({ depth: 13, col: 2 });
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
    expect(run.depth).toBe(99.5);
    run = advanceBy(applyAction(run, "hop"), 0.25, 0.01);
    expect(crossedFinish(run)).toBe(true);
    expect(run.holds).toEqual([]);
    expect(run.frogs[0].height).toBe(0);
    expect(advanceBy(run, 2).frogs[0]).toEqual(run.frogs[0]);
  });

  it("lets the traffic drive on beneath the finished frog, judging and bonking it no more", () => {
    let run = applyAction(runWithWall(BLOCKED, 101.5, 99.5), "forward");
    expect(crossedFinish(run)).toBe(true);
    run = advanceBy(run, 5);
    expect(run.walls[0].depth).toBeCloseTo(96.5);
    expect(run.walls[0].passed).toBe(true);
    expect(run.lastBonk).toBeNull();
    expect(run.passes).toBe(0);
    expect(run.depth).toBe(100.5);
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
    expect(run.depth).toBe(0);
  });

  it("lets the frog line itself up, but not hop or jump back", () => {
    const run = start();
    expect(applyAction(run, "left").frogs[0].col).toBe(1);
    expect(applyAction(run, "rotateCw").frogs[0].rotation).toBe(1);
    for (const action of ["hop", "back"] as const) expect(applyAction(run, action)).toBe(run);
  });

  it("drops the frog onto the road with its first jump forward, the drop distance ahead, into play", () => {
    const run = advanceBy(start(), 0.5);
    const dropped = applyAction(run, "forward");
    expect(at(dropped.droppedAt)).toBeCloseTo(0.5);
    expect(inPlay(dropped)).toBe(true);
    expect(dropped.depth).toBe(4);
    // A held jump drops, and keeps jumping along the road once the leap lands.
    const held = pressHeld(start(), "forward");
    expect(advanceBy(held, 0.3).depth).toBe(4);
    expect(advanceBy(held, 0.6).depth).toBe(5);
  });

  it("has no way back up: once dropped, a jump back goes along the road behind the start", () => {
    const run = act(start(), "forward", "back", "back", "back", "back", "back", "back");
    expect(run.droppedAt).toBe(0);
    expect(onOverpass(run)).toBe(false);
    expect(run.depth).toBe(-2);
  });

  it("flies over the rows between, which go by beneath it unjudged", () => {
    const run = applyAction(start([{ opening: [], depth: 2 }]), "forward");
    expect(run.depth).toBe(4);
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
    expect(gap.depth).toBe(4);
    expect(gap.lastBonk).toBeNull();
    // One gone under the deck before the drop, likewise.
    const gone = advanceBy(start([{ opening: BLOCKED, depth: 0.5, length: 6 }]), 1);
    expect(gone.walls[0].passed).toBe(true);
    expect(applyAction(gone, "forward")).toBe(gone);
  });

  it("judges a row whose face the leap's last jump lands on, like any jump forward", () => {
    const bonked = applyAction(advanceBy(start([{ opening: BLOCKED, depth: 4.5 }]), 1), "forward");
    expect(bonked.lastBonk?.depth).toBeCloseTo(3.5);
    expect(bonked.depth).toBeCloseTo(0.5);
    expect(inPlay(bonked)).toBe(true);
    const passed = applyAction(advanceBy(start([{ opening: FITS, depth: 4.5 }]), 1), "forward");
    expect(passed.passes).toBe(1);
    expect(passed.depth).toBe(4);
  });
});

describe("a row's vehicles, each its own length", () => {
  // Lanes 0-1 hold a short car, one unit long; lanes 5-6 a long truck, three.
  const SHORT: Solid = { cells: closed([], [0, 1]), length: 1 };
  const LONG: Solid = { cells: closed([], [5, 6]), length: 3 };
  const row = (solids: readonly Solid[], frog: Partial<PlacedFrog> = {}): Run =>
    onRoad(createRun((index) => ({ solids, gap: index === 0 ? 5.2 : TEST_TUNING.wallSpacing }), TEST_TUNING), { depth: 5, ...frog });
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
    expect(overlappingSolids(later.walls[0], later.depth)).toEqual([LONG]);
    expect(act(later, "left", "left").frogs[0].col).toBe(0);
    expect(applyAction(later, "right")).toBe(later);
    // Once the truck has gone by too, the whole road is free.
    const clear = advanceBy(run, 4);
    expect(overlappingSolids(clear.walls[0], clear.depth)).toEqual([]);
    expect(applyAction(clear, "right").frogs[0].col).toBe(3);
  });

  it("only ever grows the opening, never closing a lane it has freed", () => {
    let run = overlappedBy();
    let open = 3;
    for (let t = 0; t < 5; t += 0.1) {
      run = playFor(run, 0.1);
      const lanes = 7 - 2 * overlappingSolids(run.walls[0], run.depth).length;
      expect(lanes).toBeGreaterThanOrEqual(open);
      open = lanes;
    }
    expect(open).toBe(7);
  });

  it("carries a riding frog until the last of its vehicles has gone by", () => {
    const run = advanceBy(applyAction(row([SHORT, LONG]), "hop"), 0.3, 0.01);
    expect(isRiding(run)).toBe(true);
    expect(advanceBy(run, 3.8, 0.01).frogs[0].height).toBe(1);
    const landed = advanceBy(run, 4, 0.01).frogs[0];
    expect(landed.height).toBe(0);
    expect(landsAt(run)).toBeCloseTo(4.2);
  });

  it("refuses a jump back into a vehicle it has passed until that vehicle's own back is clear", () => {
    // The car has gone by the frog's back. Slid into its lanes, the frog
    // would meet it jumping back; in line with the opening, it wouldn't.
    const gone = advanceBy(row([SHORT]), 2.3);
    expect(overlappingSolids(gone.walls[0], gone.depth)).toEqual([]);
    const inItsLanes = act(gone, "left", "left");
    expect(inItsLanes.frogs[0].col).toBe(0);
    expect(applyAction(inItsLanes, "back")).toBe(inItsLanes);
    expect(applyAction(gone, "back").depth).toBe(4);
    expect(applyAction(advanceBy(inItsLanes, 1), "back").depth).toBe(4);
  });
});

describe("pieces other than the L", () => {
  const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
  const atFive = (run: Run): Run => onRoad(run, { depth: 5 });
  const withRow = (opening: Opening, kind: TetrominoKind): Run =>
    atFive(createRun(rowsOf([{ opening, depth: 5.2 }]), TEST_TUNING, { kinds: [kind] }));

  it.each(KINDS)("the %s starts centred, passes a row shaped like it, and is bonked by one a lane over", (kind) => {
    const start = createRun(NO_TRAFFIC, TEST_TUNING, { kinds: [kind] });
    expect(start.frogs[0].col).toBe(Math.floor((7 - pieceSize(kind, 0).width) / 2));
    const own = frogCells(frogShape(start.frogs[0]));
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
    expect(upright.frogs[0]).toMatchObject({ col: 2, rotation: 1 });
    expect(advanceBy(applyAction(upright, "right"), 0.3).walls[0].passed).toBe(true);
    const raised = withRow(rect([1, 4], [1, 1]), "I");
    const riding = advanceBy(applyAction(raised, "hop"), 0.6, 0.01);
    expect(riding.walls[0].passed).toBe(true);
    expect(isRiding(riding)).toBe(true);
  });
});

// Every pose of a piece on the road that passes an opening.
function posesThrough(kind: TetrominoKind, solids: readonly Solid[], lanes = TUNING.corridorCols): Frog[] {
  return ([0, 1, 2, 3] as const).flatMap((rotation) =>
    [0, 1].flatMap((height) =>
      Array.from({ length: lanes }, (_, col): Frog => ({ kind, col, rotation, height })).filter(
        (frog) => insideLanes(kind, frog, { first: 0, last: lanes - 1 }) && fitsRow(frog, solids),
      ),
    ),
  );
}

function overlapped(run: Run): boolean {
  return run.walls.some((w) => overlappingSolids(w, run.depth).length > 0);
}

describe("the rules' clock", () => {
  const ROTATIONS = [0, 1, 2, 3] as const;
  const tuning: Tuning = { ...TUNING, courseLength: 120 };
  const rows = playRows(tuning);
  const fresh = (): Run => createRun(rows, tuning);

  // A player at the keys, playing the play rows by inputs alone, recorded as
  // the store records them: each applies at once, at the run's tick, and goes
  // into the log; between them, frames run a few ticks each. It lines up
  // with each row as it comes, up a cell where the row needs it, so it rides,
  // holds the jump, and now and then fumbles, so it is bonked too, until it
  // has crossed the finish and landed on the gantry.
  function playByInputs(seed: number) {
    const random = createRng(seed).next;
    let run = fresh();
    const log: TimedInput[] = [];
    const seen = { bonks: 0, rides: 0 };
    const input = (given: PlayerInput): void => {
      const timed: TimedInput = { tick: run.tick, player: 0, input: given };
      log.push(timed);
      run = applyInput(run, timed);
    };
    let plan: { index: number; pose: Frog | null } | null = null;
    for (let frame = 0; frame < 20000 && !isDone(run); frame++) {
      const next = nextWall(run);
      if (next !== null && plan?.index !== run.walls[next].index) {
        const index: number = run.walls[next].index;
        const pose: Frog = { kind: run.frogs[0].kind, ...rows(index).answer };
        const fumbled: Frog = { kind: run.frogs[0].kind, rotation: ROTATIONS[Math.floor(random() * 4)], col: Math.floor(random() * 4), height: 0 };
        plan = { index, pose: random() < 0.25 ? fumbled : pose };
      }
      const pose = plan?.pose ?? null;
      if (pose !== null && !overlapped(run)) {
        for (let turn = 0; turn < 4 && run.frogs[0].rotation !== pose.rotation; turn++) input({ kind: "act", action: "rotateCw" });
        for (let slide = 0; slide < tuning.corridorCols && run.frogs[0].col !== pose.col; slide++) {
          input({ kind: "act", action: run.frogs[0].col < pose.col ? "right" : "left" });
        }
        const arriving = next === null ? Infinity : (run.walls[next].depth - run.depth) / tuning.wallSpeed;
        if (pose.height === 1 && run.frogs[0].height === 0 && arriving < tuning.hopAirtime / 2) input({ kind: "act", action: "hop" });
      }
      const roll = random();
      if (run.holds.length === 0 && roll < 0.2) input({ kind: "press", action: "forward" });
      else if (run.holds.length > 0 && roll < 0.04) input({ kind: "release", action: "forward" });
      else if (roll > 0.99) input({ kind: "act", action: "back" });
      else if (roll > 0.985) input({ kind: "releaseAll" });
      const before = run;
      run = playTo(run, run.tick + 1 + Math.floor(random() * 3), log);
      if (run.lastBonk !== before.lastBonk) {
        seen.bonks++;
        plan = null;
      }
      if (isRiding(run)) seen.rides++;
    }
    return { run, log, seen };
  }

  // Plays the log again from the start, in calls of `chunk` ticks each.
  function replayInChunks(log: readonly TimedInput[], end: number, chunk: (call: number) => number): Run {
    let run = replay(fresh(), log, 0);
    for (let call = 0; run.tick < end; call++) run = playTo(run, Math.min(end, run.tick + chunk(call)), log);
    return run;
  }

  it("comes out bitwise the same from the log however the ticks are chunked, through bonks, riding, the drop and the finish", () => {
    const { run, log, seen } = playByInputs(12);
    // The play really did all of it.
    expect(run.droppedAt).not.toBeNull();
    expect(isDone(run)).toBe(true);
    expect(run.passes).toBeGreaterThan(3);
    expect(Math.min(seen.bonks, seen.rides)).toBeGreaterThan(0);
    const end = run.tick;
    // In one call; a tick per call; in a frame clamp's ten ticks at a time;
    // and in calls of every size, from one tick to a long catch-up.
    const uneven = createRng(5).next;
    expect(replay(fresh(), log, end)).toEqual(run);
    expect(replayInChunks(log, end, () => 1)).toEqual(run);
    expect(replayInChunks(log, end, () => toTicks(TUNING.maxFrameDelta))).toEqual(run);
    expect(replayInChunks(log, end, (call) => (call % 7 === 6 ? 900 : 1 + Math.floor(uneven() * 30)))).toEqual(run);
  });

  it("applies each input only at its own tick, for player 0's frog, in tick order", () => {
    const run = fresh();
    const hop: PlayerInput = { kind: "act", action: "left" };
    expect(() => applyInput(run, { tick: 1, player: 0, input: hop })).toThrow();
    expect(() => applyInput(run, { tick: 0, player: 1, input: hop })).toThrow();
    const shuffled: TimedInput[] = [
      { tick: 3, player: 0, input: hop },
      { tick: 2, player: 0, input: hop },
    ];
    expect(() => playTo(run, 5, shuffled)).toThrow();
    expect(() => playTo(playTo(run, 5), 4)).toThrow();
  });
});

// A team's rows are built by hand from real traffic.
interface TrafficWall {
  row: Row;
  depth: number;
}

// The rows where the test puts them, each its vehicles, and the rest of the
// traffic out of reach.
function trafficRows(walls: readonly TrafficWall[]): RuleRows {
  const solids = walls.map(({ row }) => rowSolids(row));
  return (index) => {
    if (index >= walls.length) return NO_TRAFFIC(index);
    const { depth } = walls[index];
    const gap = index === 0 ? depth : depth - rowBack({ depth: walls[index - 1].depth, solids: solids[index - 1] });
    return { solids: solids[index], gap };
  };
}

// A frog in a pose, in a hop's airtime if the pose is up off the road.
function posed(frog: RuleFrog, pose: Partial<Frog>, tick: number): RuleFrog {
  const height = pose.height ?? 0;
  return { ...frog, ...pose, height, latestHop: height > 0 ? { startedAt: tick } : frog.latestHop };
}

// A team dropped onto the road at `depth`, each frog in its pose; its pieces
// are the poses' kinds.
function team(rows: RuleRows, poses: readonly (Partial<Frog> & Pick<Frog, "kind">)[], depth = 5, tuning: Tuning = TEST_TUNING): Run {
  const start = createRun(rows, tuning, { kinds: poses.map((pose) => pose.kind) });
  return { ...start, droppedAt: 0, depth, frogs: start.frogs.map((frog, i) => posed(frog, poses[i], start.tick)) };
}

function input(run: Run, player: number, given: PlayerInput): Run {
  return applyInput(run, { tick: run.tick, player, input: given });
}

function by(run: Run, player: number, ...actions: FrogAction[]): Run {
  return actions.reduce((next, action) => input(next, player, { kind: "act", action }), run);
}

function teamCells(run: Run, player: number): Cell[] {
  return frogCells(frogShape(run.frogs[player]));
}

function heldKeys(run: Run): { player: number; action: string }[] {
  return run.holds.map(({ player, action }) => ({ player, action }));
}

// Sprout as the flat L in lanes 0 to 2, Splash as the flat J in lanes 4 to 6.
const SPROUT: Frog = { kind: "L", col: 0, rotation: 0, height: 0 };
const SPLASH: Frog = { kind: "J", col: 4, rotation: 0, height: 0 };
const PAIR = [SPROUT, SPLASH];

describe("a team of frogs", () => {
  it("starts each frog on the overpass in the middle of its own share of the road, side by side", () => {
    const run = createRun(NO_TRAFFIC, TEST_TUNING, { kinds: ["L", "J"] });
    expect(run.frogs).toEqual([
      { kind: "L", col: 0, rotation: 0, height: 0, latestHop: null },
      { kind: "J", col: 3, rotation: 0, height: 0, latestHop: null },
    ]);
    expect(run.depth).toBe(0);
    expect(onOverpass(run)).toBe(true);
    // A piece too wide for its share starts in its first rotation that fits.
    expect(createRun(NO_TRAFFIC, TEST_TUNING, { kinds: ["I", "I"] }).frogs.map(({ col, rotation }) => ({ col, rotation }))).toEqual([
      { col: 1, rotation: 1 },
      { col: 4, rotation: 1 },
    ]);
    expect(() => createRun(NO_TRAFFIC, TEST_TUNING, { kinds: [] })).toThrow();
  });

  it("takes inputs for each of its players, and throws for any other", () => {
    const run = createRun(NO_TRAFFIC, TEST_TUNING, { kinds: ["L", "J"] });
    const left: PlayerInput = { kind: "act", action: "left" };
    expect(applyInput(run, { tick: 0, player: 0, input: left }).frogs[0].col).toBe(0);
    expect(applyInput(run, { tick: 0, player: 1, input: { kind: "act", action: "right" } }).frogs[1].col).toBe(4);
    for (const player of [2, -1, 0.5]) expect(() => applyInput(run, { tick: 0, player, input: left })).toThrow();
  });

  it("keeps the frogs out of each other's cells as they slide, on the overpass as on the road", () => {
    let run = createRun(NO_TRAFFIC, TEST_TUNING, { kinds: ["L", "J"] });
    // The L's raised end would land on the J's foot, and the J's raised end
    // on the L's.
    expect(by(run, 0, "right")).toBe(run);
    expect(by(run, 1, "left")).toBe(run);
    run = by(run, 1, "right");
    run = by(run, 0, "right");
    expect(run.frogs.map((frog) => frog.col)).toEqual([1, 4]);
    expect(by(run, 0, "right").frogs[0].col).toBe(1);
  });

  it("kicks a turn off its partner, and fails one whose every kick meets the partner or the road's edge", () => {
    // The upright I turning counter-clockwise would lie across lanes 2 to 5,
    // into the O; it kicks a lane left.
    const run = team(NO_TRAFFIC, [{ kind: "I", rotation: 1, col: 3 }, { kind: "O", col: 5 }]);
    expect(by(run, 0, "rotateCcw").frogs[0]).toMatchObject({ col: 1, rotation: 0 });
    // Between the road's edge and the O, the I can't lie down either way.
    const hemmed = team(NO_TRAFFIC, [{ kind: "I", rotation: 1, col: 1 }, { kind: "O", col: 3 }]);
    expect(by(hemmed, 0, "rotateCw")).toBe(hemmed);
    expect(by(hemmed, 0, "rotateCcw")).toBe(hemmed);
  });

  it("stands a frog that is up on a partner that slid in under it, for as long as the partner is under it", () => {
    // The O hops; the flat I slides in under it.
    let run = by(team(NO_TRAFFIC, [{ kind: "I", rotation: 0, col: 2 }, { kind: "O", col: 0 }]), 1, "hop");
    run = by(run, 0, "left", "left");
    expect(run.frogs[0].col).toBe(0);
    // Its airtime over, the O stays up, standing on the I.
    run = advanceBy(run, 0.6, 0.01);
    expect(run.frogs.map((frog) => frog.height)).toEqual([0, 1]);
    expect(isRiding(run, 1)).toBe(false);
    // The I turns upright, which carries nothing: the O falls to the road
    // beside it at once.
    const turned = by(run, 0, "rotateCw");
    expect(turned.frogs[0]).toMatchObject({ rotation: 1, height: 0 });
    expect(turned.frogs[1].height).toBe(0);
  });

  it("hops a frog off its partner, and its partner up into it", () => {
    // The O hops and the I slides in under it; once its airtime is over the
    // O hops off the I, one cell above it, and may hop again only once it is
    // out of its airtime and standing on something.
    let run = by(team(NO_TRAFFIC, [{ kind: "I", rotation: 0, col: 2 }, { kind: "O", col: 0 }]), 1, "hop");
    run = advanceBy(by(run, 0, "left", "left"), 0.6, 0.01);
    run = by(run, 1, "hop");
    expect(run.frogs.map((frog) => frog.height)).toEqual([0, 2]);
    expect(by(run, 1, "hop")).toBe(run);
    // A cell between them: the I's hop meets nothing, and rises into
    // touching the O, which now stands on it.
    const under = by(run, 0, "hop");
    expect(under.frogs.map((frog) => frog.height)).toEqual([1, 2]);
    // Its airtime over and nothing under it, the O falls back onto the I,
    // two cells, and stands there.
    const later = advanceBy(run, 0.71, 0.01);
    expect(later.frogs.map((frog) => frog.height)).toEqual([0, 1]);
  });

  it("passes a row only if every frog fits, once for the team, and bonks the whole team if any doesn't", () => {
    const open = trafficRows([{ row: [{ id: "I1", lane: 3 }], depth: 5.2 }]);
    const passed = advanceBy(team(open, PAIR), 0.3);
    expect(passed.walls[0].passed).toBe(true);
    expect(passed.passes).toBe(1);
    expect(passed.lastBonk).toBeNull();
    // An ice-cream van in the J's lanes: the L alone would pass, but the
    // team is bonked back together.
    const blocked = trafficRows([{ row: [{ id: "I1", lane: 3 }, { id: "O0", lane: 5 }], depth: 5.2 }]);
    expect(advanceBy(team(blocked, [SPROUT]), 0.3).passes).toBe(1);
    const bonked = advanceBy(team(blocked, PAIR), 0.3);
    expect(bonked.walls[0].passed).toBe(false);
    expect(bonked.passes).toBe(0);
    expect(at(bonked.lastBonk?.tick)).toBeCloseTo(0.2);
    expect(bonked.depth).toBeCloseTo(2);
    // A jump forward into it is judged the same way.
    expect(by(team(blocked, PAIR, 4.7), 1, "forward").lastBonk?.depth).toBeCloseTo(5.2);
  });

  it("lets the team through openings it can pass only together, interlocked, one frog hopping over the other", () => {
    let hopped = 0;
    for (const row of PREVIEW_ROWS[7]) {
      const poses = passingPoses(row, 7, ["L", "J"]);
      if (poses === null) throw new Error("A co-op preview row lets the pair through nowhere");
      hopped += poses.filter((pose) => pose.height === 1).length;
      const run = advanceBy(team(trafficRows([{ row, depth: 5.2 }]), poses), 0.3);
      expect(run.walls[0].passed).toBe(true);
      expect(run.lastBonk).toBeNull();
    }
    expect(hopped).toBeGreaterThan(0);
  });

  it("refuses a jump back that would put either frog in a vehicle of a row the team has passed", () => {
    const opening = [...frogCells(SPROUT), ...frogCells(SPLASH)];
    // Past the row and clear of it, the J slides out of line with its opening.
    let run = advanceBy(by(team(rowsOf([{ opening, depth: 5.5 }]), PAIR), 0, "forward"), 1.6);
    expect(run.passes).toBe(1);
    run = by(run, 1, "left");
    expect(by(run, 0, "back")).toBe(run);
    expect(by(run, 1, "back")).toBe(run);
    // Back in line, either player's jump back takes the team back into it.
    expect(by(by(run, 1, "right"), 1, "back").depth).toBe(5);
  });

  it("moves along the road as one: either player's jump moves the team, and the newest held jump wins", () => {
    let run = input(team(NO_TRAFFIC, PAIR, 10), 0, { kind: "press", action: "forward" });
    expect(run.depth).toBe(11);
    run = input(advanceBy(run, 0.1, 0.01), 1, { kind: "press", action: "back" });
    expect(run.depth).toBe(10);
    expect(heldKeys(run)).toEqual([{ player: 1, action: "back" }]);
    // The forward key player 0 still holds was replaced: letting it go
    // changes nothing, and the team follows player 1's jump back.
    expect(input(run, 0, { kind: "release", action: "forward" })).toBe(run);
    expect(input(run, 0, { kind: "releaseAll" })).toBe(run);
    expect(advanceBy(run, 0.3, 0.01).depth).toBe(9);
    expect(input(run, 1, { kind: "release", action: "back" }).holds).toEqual([]);
    // Either player's frog follows the team: neither moves across the road.
    expect(advanceBy(run, 0.3, 0.01).frogs).toEqual(run.frogs);
  });

  it("holds each player's slide on its own, beside the team's held jump", () => {
    let run = team(NO_TRAFFIC, [{ ...SPROUT, col: 1 }, SPLASH], 10);
    run = input(run, 0, { kind: "press", action: "left" });
    run = input(advanceBy(run, 0.1, 0.01), 1, { kind: "press", action: "left" });
    run = input(run, 1, { kind: "press", action: "forward" });
    expect(run.frogs.map((frog) => frog.col)).toEqual([0, 3]);
    expect(heldKeys(run)).toEqual([
      { player: 0, action: "left" },
      { player: 1, action: "left" },
      { player: 1, action: "forward" },
    ]);
    // Player 0's slide repeats into the road's edge and player 1's into the
    // L, both refused and both still held, while the team jumps on.
    run = advanceBy(run, 0.4, 0.01);
    expect(run.frogs.map((frog) => frog.col)).toEqual([0, 3]);
    expect(run.depth).toBe(12);
    expect(run.holds).toHaveLength(3);
    // A newer slide replaces only its own player's; losing focus lets go of
    // only that player's keys.
    expect(heldKeys(input(run, 0, { kind: "press", action: "right" })).filter((key) => key.action !== "forward")).toEqual([
      { player: 1, action: "left" },
      { player: 0, action: "right" },
    ]);
    expect(heldKeys(input(run, 1, { kind: "releaseAll" }))).toEqual([{ player: 0, action: "left" }]);
  });

  it("rides each frog on its own: one up across a low vehicle while its partner stands on the road beside it", () => {
    // A snowplough across lanes 0 to 3, two long, arriving at 0.2 s and going
    // by the team's back at 3.2 s: the L passes over it only one cell up, the
    // J stands beside it.
    const rows = trafficRows([{ row: [{ id: "I0", lane: 0 }], depth: 5.2 }]);
    expect(advanceBy(team(rows, PAIR), 0.3).lastBonk).not.toBeNull();
    const run = advanceBy(by(team(rows, PAIR), 0, "hop"), 0.3, 0.01);
    expect(run.walls[0].passed).toBe(true);
    expect(isRiding(run, 0)).toBe(true);
    expect(isRiding(run, 1)).toBe(false);
    expect(advanceBy(run, 2.8, 0.01).frogs[0].height).toBe(1);
    const landed = advanceBy(run, 3, 0.01);
    expect(landed.frogs[0].height).toBe(0);
    expect(landsAt(run)).toBeCloseTo(3.2);
    // The J may hop and ride the same row too.
    expect(isRiding(by(run, 1, "hop"), 1)).toBe(true);
  });

  it("knocks the team back together with a frog in the air, which stays up for its airtime", () => {
    const rows = trafficRows([{ row: [{ id: "I0", lane: 0 }, { id: "O0", lane: 5 }], depth: 5.2 }]);
    const run = advanceBy(by(team(rows, PAIR), 0, "hop"), 0.3, 0.01);
    expect(at(run.lastBonk?.tick)).toBeCloseTo(0.2);
    expect(run.depth).toBeCloseTo(2);
    expect(run.frogs[0].height).toBe(1);
    expect(landsAt(run)).toBeCloseTo(0.5);
  });

  it("drops off the overpass together, refused if any frog would land in a vehicle", () => {
    const tuning: Tuning = { ...TEST_TUNING, dropDistance: 4, dropDuration: 0.5 };
    const start = (opening: Opening): Run =>
      advanceBy(createRun(rowsOf([{ opening, depth: 1.5, length: 5 }]), tuning, { kinds: ["L", "J"] }), 1);
    // A long row going by beneath, open only under the L.
    const underJ = start(rect([0, 2], [0, 1]));
    expect(by(underJ, 0, "forward")).toBe(underJ);
    expect(by(underJ, 1, "forward")).toBe(underJ);
    const dropped = by(start(rect([0, 5], [0, 1])), 1, "forward");
    expect(inPlay(dropped)).toBe(true);
    expect(dropped.depth).toBe(4);
    expect(dropped.frogs.map((frog) => frog.col)).toEqual([0, 3]);
  });

  it("crosses the finish together as the shared depth reaches the line, bringing every frog down", () => {
    let run = by(team(NO_TRAFFIC, PAIR, 99.5), 1, "hop");
    run = input(run, 0, { kind: "press", action: "back" });
    run = by(run, 1, "forward", "forward");
    expect(crossedFinish(run)).toBe(true);
    expect(run.depth).toBe(100.5);
    expect(run.holds).toEqual([]);
    expect(run.frogs.map((frog) => frog.height)).toEqual([0, 0]);
    expect(by(run, 0, "left")).toBe(run);
  });
});

describe("stacking", () => {
  // Sprout's flat I in lanes 0 to 3, Splash's O on it in lanes 1 and 2, its
  // airtime long over.
  const stacked = (depth = 5, rows: RuleRows = NO_TRAFFIC): Run =>
    advanceBy(team(rows, [{ kind: "I", rotation: 0, col: 0 }, { kind: "O", col: 1, height: 1 }], depth), 0.6, 0.01);
  const heights = (run: Run): number[] => run.frogs.map((frog) => frog.height);

  it("carries a frog standing on the hopper up with it, and down with it as it lands", () => {
    const run = stacked();
    expect(heights(run)).toEqual([0, 1]);
    const up = by(run, 0, "hop");
    expect(heights(up)).toEqual([1, 2]);
    // Carried, not hopping: Splash's own airtime hasn't started.
    expect(up.frogs[1].latestHop).toEqual(run.frogs[1].latestHop);
    // The lower frog settles first, so both come down the same tick.
    expect(landsAt(up, 0)).toBeCloseTo(at(up.tick) + 0.5);
    expect(landsAt(up, 1)).toBe(landsAt(up, 0));
    expect(heights(advanceBy(up, 0.6, 0.01))).toEqual([0, 1]);
  });

  it("double jumps: the top frog hops off its partner while the partner is still in the air", () => {
    const up = advanceBy(by(stacked(), 0, "hop"), 0.2, 0.01);
    const double = by(up, 1, "hop");
    // Two cells above where it stood on the I, one hop each.
    expect(heights(double)).toEqual([1, 3]);
    expect(at(double.frogs[1].latestHop?.startedAt)).toBeCloseTo(at(up.tick));
    // The I lands at the end of its airtime; Splash comes down at the end of
    // its own, onto the I.
    expect(heights(advanceBy(double, 0.35, 0.01))).toEqual([0, 3]);
    expect(heights(advanceBy(double, 0.55, 0.01))).toEqual([0, 1]);
  });

  it("hops the top frog alone off its partner, one cell above it, and never a frog with nothing under it", () => {
    const off = by(stacked(), 1, "hop");
    expect(heights(off)).toEqual([0, 2]);
    expect(by(off, 1, "hop")).toBe(off);
    // Off its partner, out of its airtime, a frog over nothing falls at once.
    const slid = by(stacked(), 1, "right", "right");
    expect(slid.frogs[1]).toMatchObject({ col: 3, height: 1 });
    expect(by(slid, 1, "right").frogs[1]).toMatchObject({ col: 4, height: 0 });
  });

  it("slides a frog's rider along with it, and slides without a rider that has no room", () => {
    const run = stacked();
    const along = by(run, 0, "right", "right");
    expect(along.frogs.map((frog) => frog.col)).toEqual([2, 3]);
    expect(heights(along)).toEqual([0, 1]);
    // At the road's edge the rider can't go on, but its partner still
    // slides, out from under it: here the rider still stands on its end.
    const edge = team(NO_TRAFFIC, [{ kind: "O", col: 3 }, { kind: "I", rotation: 0, col: 3, height: 2 }]);
    const blocked = by(advanceBy(edge, 0.6, 0.01), 0, "right");
    expect(blocked.frogs.map((frog) => frog.col)).toEqual([4, 3]);
    expect(heights(blocked)).toEqual([0, 2]);
  });

  it("refuses a hop that would lift its rider into a vehicle overlapping the team", () => {
    // A crane truck in lane 0 hangs its jib over lane 1 two cells up, right
    // above the rider's left end.
    const rows = trafficRows([{ row: [{ id: "J1", lane: 0 }], depth: 5.2 }]);
    const pile = (traffic: RuleRows): Run => advanceBy(team(traffic, [{ kind: "I", rotation: 0, col: 1 }, { kind: "I", rotation: 0, col: 1, height: 1 }]), 0.6, 0.01);
    const run = pile(rows);
    expect(run.passes).toBe(1);
    expect(by(run, 0, "hop")).toBe(run);
    expect(by(run, 1, "hop")).toBe(run);
    expect(heights(by(pile(NO_TRAFFIC), 0, "hop"))).toEqual([1, 2]);
  });

  it("keeps a frog that has lost its support up while a row overlaps the team, then lets it fall", () => {
    // A tall bus in lane 6, arriving at 0.2 s and going by at 4.2 s.
    const rows = trafficRows([{ row: [{ id: "I1", lane: 6 }], depth: 5.2 }]);
    const run = by(stacked(5, rows), 1, "right", "right", "right");
    expect(run.passes).toBe(1);
    expect(run.frogs[1]).toMatchObject({ col: 4, height: 1 });
    expect(isRiding(run, 1)).toBe(true);
    expect(landsAt(run, 1)).toBeCloseTo(4.2);
  });

  it("brings every frog down onto its support as the team crosses the finish", () => {
    let run = by(stacked(99.5), 0, "hop");
    run = by(run, 1, "hop");
    expect(heights(run)).toEqual([1, 3]);
    run = by(run, 0, "forward");
    expect(crossedFinish(run)).toBe(true);
    expect(heights(run)).toEqual([0, 1]);
  });
});

describe("a team's rules' clock", () => {
  const tuning: Tuning = { ...TUNING, courseLength: 120 };
  // Lanes 0 to 2 for Sprout and 4 to 6 for Splash; a low snowplough Sprout
  // rides over; and rows that stand one frog or the other upright.
  const WALLS: readonly Row[] = [
    [{ id: "I1", lane: 3 }],
    [{ id: "I0", lane: 0 }, { id: "I1", lane: 6 }],
    [{ id: "I1", lane: 3 }, { id: "I1", lane: 4 }],
    [{ id: "I1", lane: 2 }, { id: "I1", lane: 3 }],
  ];
  const rows: RuleRows = (index) => ({
    solids: rowSolids(WALLS[index % WALLS.length]),
    gap: index === 0 ? tuning.firstWallDepth : tuning.wallSpacing,
  });
  const fresh = (): Run => createRun(rows, tuning, { kinds: ["L", "J"] });

  const leftOf = (a: Frog, b: Frog): boolean =>
    Math.max(...frogCells(a).map((cell) => cell.col)) < Math.min(...frogCells(b).map((cell) => cell.col));

  // A pose for each frog that passes the row, Sprout's left of Splash's.
  function teamPlan(run: Run, index: number, random: () => number): Frog[] | null {
    const solids = rowSolids(WALLS[index % WALLS.length]);
    const [left, right] = run.frogs.map((frog) => posesThrough(frog.kind, solids));
    const pairs = left.flatMap((a) => right.filter((b) => leftOf(a, b)).map((b) => [a, b]));
    return pairs.at(Math.floor(random() * pairs.length)) ?? null;
  }

  // Two players at the keys, playing the hand-made rows by inputs alone,
  // interleaved, recorded as a session would: each applies at once, at the
  // run's tick, and goes into the log. Each lines its own frog up with the
  // team's plan for the row as it comes, now and then fumbling its own pose;
  // either presses, holds and lets go of the team's jump, and of slides,
  // until the team has crossed the finish and landed. After every frame the
  // frogs share no cell and keep clear of every vehicle overlapping them.
  function playTeamByInputs(seed: number) {
    const random = createRng(seed).next;
    let run = fresh();
    const log: TimedInput[] = [];
    const seen = { bonks: 0, rides: 0, players: new Set<number>() };
    const send = (player: number, given: PlayerInput): void => {
      const timed: TimedInput = { tick: run.tick, player, input: given };
      log.push(timed);
      seen.players.add(player);
      run = applyInput(run, timed);
    };
    const somePlayer = (): number => Math.floor(random() * 2);
    let plan: { index: number; poses: (Frog | null)[] } | null = null;
    for (let frame = 0; frame < 20000 && !isDone(run); frame++) {
      const next = nextWall(run);
      if (next !== null && plan?.index !== run.walls[next].index) {
        const index: number = run.walls[next].index;
        const poses = teamPlan(run, index, random);
        const fumbled = (kind: TetrominoKind): Frog => ({ kind, rotation: ([0, 1, 2, 3] as const)[Math.floor(random() * 4)], col: Math.floor(random() * 5), height: 0 });
        plan = { index, poses: run.frogs.map((frog, player) => (random() < 0.15 ? fumbled(frog.kind) : (poses?.[player] ?? null))) };
      }
      if (plan !== null && !overlappedTeam(run)) {
        const { poses } = plan;
        for (let tries = 0; tries < 8; tries++) {
          const order = (poses[1]?.col ?? 0) > run.frogs[1].col ? [1, 0] : [0, 1];
          for (const player of order) {
            const pose = poses[player];
            const frog = run.frogs[player];
            if (pose === null) continue;
            if (frog.rotation !== pose.rotation) send(player, { kind: "act", action: "rotateCw" });
            else if (frog.col !== pose.col) send(player, { kind: "act", action: frog.col < pose.col ? "right" : "left" });
          }
        }
        const arriving = next === null ? Infinity : (run.walls[next].depth - run.depth) / tuning.wallSpeed;
        poses.forEach((pose, player) => {
          if (pose?.height === 1 && run.frogs[player].height === 0 && arriving < tuning.hopAirtime / 2) send(player, { kind: "act", action: "hop" });
        });
      }
      const roll = random();
      const jump = run.holds.find((hold) => hold.action === "forward" || hold.action === "back");
      const slide = run.holds.find((hold) => hold.action === "left" || hold.action === "right");
      if (jump === undefined && roll < 0.2) send(somePlayer(), { kind: "press", action: "forward" });
      else if (jump !== undefined && roll < 0.04) send(somePlayer(), { kind: "release", action: jump.action });
      else if (slide !== undefined && roll < 0.3) send(slide.player, { kind: "release", action: slide.action });
      else if (roll > 0.995) send(somePlayer(), { kind: "press", action: random() < 0.5 ? "left" : "right" });
      else if (roll > 0.99) send(somePlayer(), { kind: "act", action: "back" });
      else if (roll > 0.985) send(somePlayer(), { kind: "releaseAll" });
      const before = run;
      run = playTo(run, run.tick + 1 + Math.floor(random() * 3), log);
      if (run.lastBonk !== before.lastBonk) {
        seen.bonks++;
        plan = null;
      }
      if (run.frogs.some((_, player) => isRiding(run, player))) seen.rides++;
      expectTeamClear(run);
    }
    return { run, log, seen };
  }

  function overlappedTeam(run: Run): boolean {
    return run.walls.some((w) => overlappingSolids(w, run.depth).length > 0);
  }

  // The frogs share no cell, and each keeps clear of the vehicles
  // overlapping the team and on the road.
  function expectTeamClear(run: Run): void {
    const [a, b] = [teamCells(run, 0).map(cellKey), new Set(teamCells(run, 1).map(cellKey))];
    expect(a.some((key) => b.has(key))).toBe(false);
    run.frogs.forEach((frog, player) => {
      expect(insideLanes(frog.kind, frog, { first: 0, last: run.tuning.corridorCols - 1 })).toBe(true);
      const solid = new Set(run.walls.flatMap((w) => overlapping(w, run.depth)).flatMap((v) => v.cells.map(cellKey)));
      for (const cell of teamCells(run, player)) expect(solid.has(cellKey(cell))).toBe(false);
    });
  }

  function replayInChunks(log: readonly TimedInput[], end: number, chunk: (call: number) => number): Run {
    let run = replay(fresh(), log, 0);
    for (let call = 0; run.tick < end; call++) run = playTo(run, Math.min(end, run.tick + chunk(call)), log);
    return run;
  }

  it("comes out bitwise the same from two players' interleaved log however the ticks are chunked", () => {
    const { run, log, seen } = playTeamByInputs(21);
    // The play really did all of it, with both players at the keys.
    expect(run.droppedAt).not.toBeNull();
    expect(isDone(run)).toBe(true);
    expect(run.passes).toBeGreaterThan(3);
    expect(Math.min(seen.bonks, seen.rides)).toBeGreaterThan(0);
    expect([...seen.players].sort()).toEqual([0, 1]);
    const end = run.tick;
    const uneven = createRng(8).next;
    expect(replay(fresh(), log, end)).toEqual(run);
    expect(replayInChunks(log, end, () => 1)).toEqual(run);
    expect(replayInChunks(log, end, () => toTicks(TUNING.maxFrameDelta))).toEqual(run);
    expect(replayInChunks(log, end, (call) => (call % 7 === 6 ? 900 : 1 + Math.floor(uneven() * 30)))).toEqual(run);
  }, RANDOM_PLAY_TIMEOUT);
});
