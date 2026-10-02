import { frogCells, insideLanes, pieceSize, rotateInCorridor, type Placement } from "./logic";
import { gateLanes, insideGate, keepsClear, rowBack } from "./traffic";
import type { Frog, Gate, HopHeight, Lanes, Rotation, Solid, TetrominoKind } from "./types";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state changes the instant an action is applied, the walls'
// depths are continuous, and `advance` moves time on.
//
// Depth is measured forward from the course's start, at depth 0, and the
// road runs on forever both ways. A wall is a row of vehicles whose fronts
// line up: its depth is that front, the face coming at the frog, and each
// vehicle fills from there back along the course its own length. The frog's
// depth is its front face, and it fills from there toward the start. A
// vehicle overlaps the frog while their depth ranges intersect: from when the
// row's front reaches the frog's front until the vehicle's own back goes by
// the frog's back. The row is judged once, as its front arrives, against all
// its vehicles; after that each vehicle is solid only while it overlaps the
// frog, so a shorter vehicle frees its lanes while a longer one still
// overlaps, and the opening only grows.
//
// Every wall the frog hasn't passed is ahead of it, and every wall it has
// passed is behind it. Each rule below keeps that true, so a wall is judged
// exactly once each time it reaches the frog. And the frog's cells are
// always inside the opening left by the vehicles overlapping it: an action
// that would break that is refused. A frog that is up while a vehicle
// overlaps it rides: it stays up until the last one has gone by.
//
// A row may hold gates: gaps two lanes wide and the face's full height,
// framed by a post on the lane line either side. A post is solid like a
// vehicle, for as long as the row overlaps the frog, so a frog meets a gate
// wholly in it or wholly out of it. A frog that crosses a row's front with
// every cell in a gate's lanes, either way, takes the gate's piece.
//
// The frog starts out of play on the overpass above the start, and drops to
// the road with its first jump forward; there is no way back up. It is out
// of play again once it crosses the finish line, when it leaps up onto the
// finish gantry. Out of play, no row touches it: the traffic goes by beneath.

// How deep the frog is along the course, in units. The scene draws it this
// deep too.
export const FROG_THICKNESS = 1;

// What the rules need of a row: its solids (its vehicles' cells and its
// gates' posts, with their lengths), its gates, and how far its front comes
// after the back of the row before it.
export interface RuleRow {
  solids: readonly Solid[];
  gates: readonly Gate[];
  gap: number;
}

// The rows of traffic in the order they reach the frog: row n of an
// unbounded stream.
export type RuleRows = (index: number) => RuleRow;

export interface Wall {
  // The row's vehicles and gate posts, their fronts all at `depth`.
  solids: readonly Solid[];
  gates: readonly Gate[];
  // Falls as the wall comes at the frog.
  depth: number;
  // Whether the frog is past this wall's front face, so the wall is between
  // it and the start or still around it. A crossing sets it; a jump back
  // across its front, or the wall reappearing ahead, clears it.
  passed: boolean;
  // Which row of the stream it is.
  index: number;
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

// The actions whose keys repeat while held: the jumps and the slides.
export type HeldAction = "forward" | "back" | "left" | "right";

// A key held down, which acts again every repeat interval.
export interface Hold {
  action: HeldAction;
  // When it next acts, in run time.
  nextAt: number;
}

export interface Run {
  tuning: Tuning;
  // Seconds of play so far.
  time: number;
  frog: RuleFrog;
  walls: Wall[];
  // Where a recycled wall's next row comes from.
  rows: RuleRows;
  lastBonk: Bonk | null;
  // How many times the frog has passed a row.
  passes: number;
  // The keys held down, in the order pressed: at most a jump and a slide.
  holds: readonly Hold[];
  // When the frog dropped from the overpass to the road; null while it is
  // still up there.
  droppedAt: number | null;
  // When the frog crossed the finish line; null until it does.
  finishedAt: number | null;
}

export type FrogAction = "left" | "right" | "rotateCcw" | "rotateCw" | "hop" | "forward" | "back";

// A bonked frog must leave the wall's face, or the wall would bonk it again
// at once, forever, and a held key must wait between repeats. Rows must be
// spaced far enough apart, back to front, that a bonk never knocks the frog
// into a wall it has passed, which also means no two walls ever overlap the
// frog at once. A row is recycled only once it is behind the frog, and
// reappears ahead of it.
function checkTuning(tuning: Tuning): void {
  if (tuning.bonkKnockback <= 0) throw new Error("A bonk must knock the frog back");
  if (tuning.holdRepeatInterval <= 0) throw new Error("A held key must wait between repeats");
  if (tuning.dropDistance < tuning.depthStep) throw new Error("The drop must reach at least a jump ahead");
  const closestGap = tuning.wallSpacing - tuning.wallJitter;
  const bonkReach = tuning.bonkKnockback * tuning.depthStep + FROG_THICKNESS;
  if (closestGap < bonkReach) {
    throw new Error(`Rows as close as ${String(closestGap)} let a bonk reach ${String(bonkReach)} back into a passed row`);
  }
  if (tuning.recycleBehind < 0) throw new Error("A row must be behind the frog to be recycled");
  if (tuning.trafficHorizon <= 0) throw new Error("A recycled row must reappear ahead of the frog");
}

export interface RunOptions {
  // The piece the frog starts as; an L unless the course says otherwise.
  kind?: TetrominoKind;
}

// The stream's rows in order, each its gap beyond the back of the one
// before, until the traffic reaches the traffic horizon from the start. So a
// row recycled behind the frontmost one comes back out of sight.
function lineUpTraffic(rows: RuleRows, tuning: Tuning): Wall[] {
  const walls: Wall[] = [];
  let back = 0;
  do {
    const index = walls.length;
    const row = rows(index);
    const wall: Wall = { solids: row.solids, gates: row.gates, depth: index === 0 ? row.gap : back + row.gap, passed: false, index };
    walls.push(wall);
    back = rowBack(wall);
  } while (back < tuning.trafficHorizon);
  return walls;
}

export function createRun(rows: RuleRows, tuning: Tuning, options: RunOptions = {}): Run {
  checkTuning(tuning);
  const { kind = "L" } = options;
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
    walls: lineUpTraffic(rows, tuning),
    rows,
    lastBonk: null,
    passes: 0,
    holds: [],
    droppedAt: null,
    finishedAt: null,
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

// Whether the frog is still up on the overpass, before its drop.
export function onOverpass(run: Run): boolean {
  return run.droppedAt === null;
}

// Whether the frog has crossed the finish line. The rules stop there.
export function crossedFinish(run: Run): boolean {
  return run.finishedAt !== null;
}

// Whether the frog is on the road among the traffic: dropped from the
// overpass and not yet over the finish line.
export function inPlay(run: Run): boolean {
  return !onOverpass(run) && !crossedFinish(run);
}

// Whether the run is over: the frog has crossed the finish line and its leap
// onto the finish gantry has landed. The rules' clock runs on after the
// crossing, and the traffic with it.
export function isDone(run: Run): boolean {
  return run.finishedAt !== null && run.time >= run.finishedAt + run.tuning.finishLeapDuration;
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

// The traffic lanes, across the road from 0.
function roadLanes(run: Run): Lanes {
  return { first: 0, last: run.tuning.corridorCols - 1 };
}

// The pass test against some of a row's solids, for the frog taking `shape`
// from its pose now: each cell on the row's face and in no vehicle's cells,
// and nothing standing or moving across a gate's post.
function fitsAmong(run: Run, shape: Frog, solids: readonly Solid[]): boolean {
  if (solids.length === 0) return true;
  const cells = frogCells(shape);
  return cells.every((cell) => cell.row < run.tuning.wallRows) && keepsClear(frogCells(frogShape(run.frog)), cells, solids);
}

// The vehicles of a wall the frog has passed that still overlap it, with its
// front face at `frogDepth`: those whose back hasn't yet gone by its back.
// For a frog jumping back to `frogDepth`, they are also every vehicle it
// would meet on the way.
export function overlappingSolids(wall: Wall, frogDepth: number): readonly Solid[] {
  if (!wall.passed) return [];
  return wall.solids.filter((solid) => wall.depth + solid.length > frogDepth - FROG_THICKNESS);
}

// Whether the frog could take this shape with its front face at `depth`:
// inside the opening the overlapping vehicles leave.
function clearOfWallsAt(run: Run, shape: Frog, depth: number): boolean {
  return run.walls.every((wall) => fitsAmong(run, shape, overlappingSolids(wall, depth)));
}

// Out of play, no vehicle touches the frog.
function clearOfWalls(run: Run, shape: Frog): boolean {
  return !inPlay(run) || clearOfWallsAt(run, shape, run.frog.depth);
}

function withFrog(run: Run, frog: Partial<RuleFrog>): Run {
  return { ...run, frog: { ...run.frog, ...frog } };
}

function withWall(run: Run, index: number, wall: Partial<Wall>): Run {
  return { ...run, walls: run.walls.map((w, i) => (i === index ? { ...w, ...wall } : w)) };
}

function landNow(run: Run): Run {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  return withFrog(run, { latestHop: { ...hopping, landedAt: run.time } });
}

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

// Where the gate's piece stands in the gate: the frog's rotation, column and
// height if it fits there, inside the gate's lanes and on the face;
// otherwise the first rotation, then column, that does at the frog's
// height, or, when none does (an I, one cell up), on the road.
function placeInGate(run: Run, kind: TetrominoKind, gate: Gate): Frog {
  const lanes = gateLanes(gate);
  const fits = (frog: Frog): boolean =>
    insideLanes(kind, frog, lanes) && pieceSize(kind, frog.rotation).height + frog.hop <= run.tuning.wallRows;
  const hop = hopHeight(run.frog);
  const kept: Frog = { kind, col: run.frog.col, rotation: run.frog.rotation, hop };
  if (fits(kept)) return kept;
  for (const height of hop === 1 ? ([1, 0] as const) : ([0] as const)) {
    for (const rotation of ROTATIONS) {
      for (let col = lanes.first; col <= lanes.last; col++) {
        const frog: Frog = { kind, col, rotation, hop: height };
        if (fits(frog)) return frog;
      }
    }
  }
  throw new Error(`A ${kind} fits nowhere in a gate`);
}

// The frog takes the gate's piece. A gate sets the piece rather than
// swapping it, so going through one twice is harmless.
function takeGate(run: Run, gate: Gate): Run {
  if (run.frog.kind === gate.kind) return run;
  const frog = placeInGate(run, gate.kind, gate);
  const landed = frog.hop === hopHeight(run.frog) ? run : landNow(run);
  const next = withFrog(landed, { kind: frog.kind, col: frog.col, rotation: frog.rotation });
  if (!clearOfWalls(next, frog)) throw new Error(`A ${gate.kind} taken from a gate is inside a vehicle`);
  return next;
}

// A frog crossing the wall's front with every cell in one of its gates'
// lanes takes that gate's piece.
function crossFront(run: Run, wall: Wall): Run {
  const cells = frogCells(frogShape(run.frog));
  const gate = wall.gates.find((g) => insideGate(cells, g));
  return gate === undefined ? run : takeGate(run, gate);
}

// The wall passes around the frog.
function pass(run: Run, index: number): Run {
  return crossFront({ ...withWall(run, index, { passed: true }), passes: run.passes + 1 }, run.walls[index]);
}

// The wall goes by beneath a frog out of play, unjudged.
function goBy(run: Run, index: number): Run {
  return withWall(run, index, { passed: true });
}

// The frog is knocked back from the wall's face, however far that takes it.
// The wall stays solid and keeps coming, so it bonks the frog again when it
// arrives unless the frog fits by then or has got clear. A held key keeps
// repeating, a full repeat interval after the bonk.
function bonk(run: Run, index: number): Run {
  const { time, tuning } = run;
  const face = run.walls[index].depth;
  return {
    ...withFrog(run, { depth: face - tuning.bonkKnockback * tuning.depthStep }),
    holds: run.holds.map((hold) => ({ ...hold, nextAt: time + tuning.holdRepeatInterval })),
    lastBonk: { time, depth: face },
  };
}

// Judges the next wall at the frog's face, now, against all its vehicles.
function meet(run: Run, index: number): Run {
  return fitsAmong(run, frogShape(run.frog), run.walls[index].solids) ? pass(run, index) : bonk(run, index);
}

// Takes up a new placement if it stays inside the opening the overlapping
// vehicles leave; otherwise the action is refused, like a move off the
// corridor edge.
function reshape(run: Run, frog: Placement): Run {
  return clearOfWalls(run, { ...frogShape(run.frog), ...frog }) ? withFrog(run, frog) : run;
}

// A slide off the road's edge is refused.
function moveColumn(run: Run, by: number): Run {
  const placement = { col: run.frog.col + by, rotation: run.frog.rotation };
  if (!insideLanes(run.frog.kind, placement, roadLanes(run))) return run;
  return reshape(run, placement);
}

function rotate(run: Run, turn: 1 | -1): Run {
  const placement = rotateInCorridor(run.frog.kind, run.frog, turn, roadLanes(run));
  return placement === null ? run : reshape(run, placement);
}

function hop(run: Run): Run {
  if (hopHeight(run.frog) === 1) return run;
  if (!clearOfWalls(run, { ...frogShape(run.frog), hop: 1 })) return run;
  return withFrog(run, { latestHop: { startedAt: run.time, landedAt: null } });
}

// Riding: a frog that is up while a vehicle overlaps it stays up, gliding
// across the vehicles' low parts, until the last of them has gone by or a
// jump forward carries it off. So a hop's timing is forgiving: one pressed
// early, whose airtime would end mid-overlap, still carries the frog across.
export function isRiding(run: Run): boolean {
  return inPlay(run) && hopHeight(run.frog) === 1 && run.walls.some((wall) => overlappingSolids(wall, run.frog.depth).length > 0);
}

// A hop whose airtime is over lands, unless the frog is riding.
function settle(run: Run): Run {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  if (run.time < hopping.startedAt + run.tuning.hopAirtime) return run;
  return isRiding(run) ? run : landNow(run);
}

// The frog crosses the finish line: the rules stop, so no row judges it
// again, and every held key lets go. It leaps onto the finish gantry, where
// the traffic goes by beneath it.
function finish(run: Run): Run {
  return { ...landNow(run), holds: [], finishedAt: run.time };
}

// Each wall whose front face the jump reaches is judged at once, nearest
// first. A wall the frog doesn't fit bonks it and ends the jump. A jump
// forward never meets a passed wall: those are all behind the frog's front.
// A jump that reaches the finish line ends the run.
function jumpForward(run: Run): Run {
  const target = run.frog.depth + run.tuning.depthStep;
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= target; index = nextWall(next)) {
    next = meet(next, index);
    if (!next.walls[index].passed) return next;
  }
  const moved = withFrog(next, { depth: target });
  return target >= run.tuning.courseLength ? finish(moved) : moved;
}

// A jump back may carry the frog into a wall it has passed, or back through
// it, wherever it fits: it is refused only if it would put a cell into a
// vehicle on the way, like a move off the corridor edge. A wall whose front
// the frog jumps back across is ahead of it again, to be judged afresh when
// it arrives, and a gate the frog crosses back through gives it its piece.
// Behind the start the road goes on, and so may the frog.
function jumpBack(run: Run): Run {
  const target = run.frog.depth - run.tuning.depthStep;
  if (!clearOfWallsAt(run, frogShape(run.frog), target)) return run;
  let next = withFrog(run, { depth: target });
  run.walls.forEach((wall, index) => {
    if (!wall.passed || wall.depth < target) return;
    next = crossFront(withWall(next, index, { passed: false }), wall);
  });
  return next;
}

// The first jump forward drops the frog from the overpass onto the road, the
// drop distance ahead of where it stood, and puts it in play. It leaps over
// the traffic: the rows it flies over go by beneath it, unjudged, and the
// last jump's worth of the leap is a jump forward, so one onto a row's face
// is judged like any other. A drop that would land it in a vehicle is
// refused, like a move off the corridor edge. A held key repeats once the
// leap has landed.
function drop(run: Run): Run {
  const { time, tuning } = run;
  const target = run.frog.depth + tuning.dropDistance;
  const approach = target - tuning.depthStep;
  let flown: Run = { ...run, droppedAt: time };
  run.walls.forEach((wall, index) => {
    if (!wall.passed && wall.depth <= approach) flown = goBy(flown, index);
  });
  if (!clearOfWallsAt(flown, frogShape(run.frog), target)) return run;
  const landing = withFrog(flown, { depth: approach });
  return jumpForward({ ...landing, holds: run.holds.map((hold) => ({ ...hold, nextAt: time + tuning.dropDuration })) });
}

// On the overpass the frog can line itself up and drop; nothing else.
function actOnOverpass(run: Run, action: FrogAction): Run {
  switch (action) {
    case "left":
      return moveColumn(run, -1);
    case "right":
      return moveColumn(run, 1);
    case "rotateCcw":
      return rotate(run, -1);
    case "rotateCw":
      return rotate(run, 1);
    case "forward":
      return drop(run);
    case "hop":
    case "back":
      return run;
  }
}

function act(run: Run, action: FrogAction): Run {
  if (onOverpass(run)) return actOnOverpass(run, action);
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
  if (crossedFinish(run)) return run;
  return settle(act(run, action));
}

function isJump(action: HeldAction): boolean {
  return action === "forward" || action === "back";
}

// A jump or slide key pressed: one action now, and another every repeat
// interval while it stays held, until it is released. A jump and a slide can
// be held at once; a newer jump replaces a held jump, and a newer slide a
// held slide.
export function pressHeld(run: Run, action: HeldAction): Run {
  if (crossedFinish(run)) return run;
  const others = run.holds.filter((hold) => isJump(hold.action) !== isJump(action));
  const holds = [...others, { action, nextAt: run.time + run.tuning.holdRepeatInterval }];
  return applyAction({ ...run, holds }, action);
}

// A held key released; with no action, every held key is let go, as when the
// window loses focus and key releases can no longer be seen.
export function releaseHeld(run: Run, action?: HeldAction): Run {
  const holds = run.holds.filter((hold) => action !== undefined && hold.action !== action);
  return holds.length === run.holds.length ? run : { ...run, holds };
}

function repeatHeld(run: Run, held: Hold): Run {
  const holds = run.holds.map((hold) => (hold.action === held.action ? { ...hold, nextAt: held.nextAt + run.tuning.holdRepeatInterval } : hold));
  return applyAction({ ...run, holds }, held.action);
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

// When the next wall reaches the frog. In play it is judged there; out of
// play it goes by beneath.
function nextArrival(run: Run): RunEvent | null {
  const index = nextWall(run);
  if (index === null) return null;
  return {
    time: run.time + (run.walls[index].depth - run.frog.depth) / run.tuning.wallSpeed,
    happen: (at) => (inPlay(at) ? meet(at, index) : goBy(at, index)),
  };
}

// When a hopping frog comes down: at the end of its airtime or, if it is
// riding then, once the last vehicle overlapping it has gone by. Only one
// wall can overlap the frog at a time (the tuning check spaces them).
function nextLanding(run: Run): RunEvent | null {
  const hopping = run.frog.latestHop;
  if (hopping === null || hopping.landedAt !== null) return null;
  const due = hopping.startedAt + run.tuning.hopAirtime;
  if (run.time < due) return { time: due, happen: settle };
  const backs = run.walls.flatMap((wall) => overlappingSolids(wall, run.frog.depth).map((solid) => wall.depth + solid.length));
  if (backs.length === 0) throw new Error("A frog is riding with no vehicle overlapping it");
  return {
    time: run.time + (Math.max(...backs) - (run.frog.depth - FROG_THICKNESS)) / run.tuning.wallSpeed,
    happen: landNow,
  };
}

function nextRepeats(run: Run): RunEvent[] {
  return run.holds.map((held) => ({ time: held.nextAt, happen: (at) => repeatHeld(at, held) }));
}

// The soonest of a landing, the next wall arrival and the next repeat of each
// held key. At the same instant, a landing comes first, then an arrival, then
// the held keys in the order pressed.
function nextEvent(run: Run): RunEvent | null {
  let soonest: RunEvent | null = null;
  for (const event of [nextLanding(run), nextArrival(run), ...nextRepeats(run)]) {
    if (event !== null && (soonest === null || event.time < soonest.time)) soonest = event;
  }
  return soonest;
}

// A wall whose back is the recycling distance behind the frog, out of the
// camera's view, reappears ahead of it as the stream's next row: its gap
// beyond the frontmost wall's back, and never nearer the frog than the
// traffic horizon, beyond the fog. So a wall never appears or vanishes on
// screen, and the frog meets the stream's rows in order however it goes.
function recycle(run: Run): Run {
  const limit = run.frog.depth - run.tuning.recycleBehind;
  const leaving = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => rowBack(wall) < limit)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = run;
  for (const { index } of leaving) {
    const others = next.walls.filter((_, i) => i !== index);
    const streamIndex = Math.max(...next.walls.map((wall) => wall.index)) + 1;
    const row = next.rows(streamIndex);
    const depth = Math.max(Math.max(...others.map(rowBack)) + row.gap, next.frog.depth + next.tuning.trafficHorizon);
    next = withWall(next, index, { solids: row.solids, gates: row.gates, depth, passed: false, index: streamIndex });
  }
  return next;
}

// A wall going by can end a ride.
function moveOnTo(run: Run, time: number): Run {
  return settle(recycle(moveWallsTo(run, time)));
}

// Moves the run on by `elapsed` seconds (clamped to the tuning's longest
// frame). Walls travel continuously toward the start, and everything that
// happens during the frame (a wall reaching the frog, a hop landing, a held
// key repeating) happens in order, at its own instant: a long frame can't
// carry a wall past the frog unjudged or skip a repeat, a hop is read when
// the wall arrives rather than at the frame's end, and a wall that bonks the
// frog and arrives again within the frame is judged again. After the finish
// the traffic keeps driving, beneath the frog on the gantry.
export function advance(run: Run, elapsed: number): Run {
  const end = run.time + Math.min(elapsed, run.tuning.maxFrameDelta);
  let next = run;
  for (;;) {
    const event = nextEvent(next);
    if (event === null || event.time > end) return moveOnTo(next, end);
    next = event.happen(moveOnTo(next, event.time));
  }
}
