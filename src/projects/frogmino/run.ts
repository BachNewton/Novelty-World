import { cellKey, frogCells, insideLanes, pieceSize, turnWithKicks, type Placement } from "./logic";
import { gateLanes, insideGate, keepsClear, rowBack } from "./traffic";
import type { Frog, Gate, HopHeight, Lanes, Rotation, Solid, TetrominoKind } from "./types";
import { TICK_RATE, tickTiming } from "./ticks";
import type { Tuning } from "./tuning";

// One playthrough of a course, as the rules see it. Everything here is pure:
// the frog's rule state changes the instant an input is applied, and `step`
// moves time on by one tick (see `ticks.ts`). A run is a pure function of
// its course, its tuning and its input log: every player input, stamped with
// the tick it applies at, so replaying the log from the start reproduces it.
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
// The rules are written for a team of frogs, one per player; solo is a team
// of one. The frogs share one depth: the jumps are the team's, and a row
// reaching them passes only if every frog fits, or bonks the whole team
// back. Slides, turns and hops are each frog's own, and the frogs are solid
// to each other as vehicles are: no action may put one frog's cells into
// another's. Wherever the rules below say "the frog", each frog of the team
// is meant, at the team's depth.
//
// The team starts out of play on the overpass above the start, and drops to
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
  // Falls as the wall comes at the frog: where it was placed, less the
  // traffic's travel since. Worked out afresh from those each tick, so no
  // rounding builds up along the way.
  depth: number;
  placedDepth: number;
  // The tick it was placed at.
  placedAt: number;
  // Whether the frog is past this wall's front face, so the wall is between
  // it and the start or still around it. A crossing sets it; a jump back
  // across its front, or the wall reappearing ahead, clears it.
  passed: boolean;
  // Which row of the stream it is.
  index: number;
}

// Times in the rules are ticks.
export interface Hop {
  startedAt: number;
  // When the frog came down; null while it is up.
  landedAt: number | null;
}

export interface RuleFrog {
  kind: TetrominoKind;
  col: number;
  rotation: Rotation;
  // The latest hop; null if the frog never hopped.
  latestHop: Hop | null;
}

// A frog where it stands along the course: its own state and the team's
// depth.
export type PlacedFrog = RuleFrog & { depth: number };

export interface Bonk {
  tick: number;
  // Where the team met the wall that bonked it.
  depth: number;
}

// The actions whose keys repeat while held: the jumps and the slides.
export type HeldAction = "forward" | "back" | "left" | "right";

// A key held down, which acts again every repeat interval.
export interface Hold {
  // Whose key it is.
  player: number;
  action: HeldAction;
  // The tick it next acts at.
  nextAt: number;
}

export interface Run {
  tuning: Tuning;
  // Ticks of play so far.
  tick: number;
  // The team, one frog per player in player order; solo is a team of one.
  frogs: readonly RuleFrog[];
  // How far along the course the team is: every frog's front face. It moves
  // a jump or a bonk at a time.
  depth: number;
  walls: Wall[];
  // Where a recycled wall's next row comes from.
  rows: RuleRows;
  lastBonk: Bonk | null;
  // How many times the team has passed a row.
  passes: number;
  // The keys held down, in the order pressed: at most one jump, the team's,
  // whoever pressed it, and a slide for each player.
  holds: readonly Hold[];
  // When the team dropped from the overpass to the road; null while it is
  // still up there.
  droppedAt: number | null;
  // When the team crossed the finish line; null until it does.
  finishedAt: number | null;
}

export type FrogAction = "left" | "right" | "rotateCcw" | "rotateCw" | "hop" | "forward" | "back";

// What a player does: an action, or a jump or slide key pressed or let go, or
// every key let go at once, as when the window loses focus.
export type PlayerInput =
  | { kind: "act"; action: FrogAction }
  | { kind: "press"; action: HeldAction }
  | { kind: "release"; action: HeldAction }
  | { kind: "releaseAll" };

// An input as the log keeps it: which player's, and the tick it applies at.
export interface TimedInput {
  tick: number;
  player: number;
  input: PlayerInput;
}

// Every input of a run, in tick order; inputs stamped with the same tick
// apply in the order listed. It is plain data, so a session can insert an
// input that reaches it late in its place and replay from there.
export type InputLog = readonly TimedInput[];

const NO_INPUTS: InputLog = [];

// A bonked frog must leave the wall's face, or the wall would bonk it again
// at once, forever, and a held key must wait between repeats. Rows must be
// spaced far enough apart, back to front, that a bonk never knocks the frog
// into a wall it has passed, which also means no two walls ever overlap the
// frog at once. A row is recycled only once it is behind the frog, and
// reappears ahead of it.
function checkTuning(tuning: Tuning): void {
  if (tuning.bonkKnockback <= 0) throw new Error("A bonk must knock the frog back");
  if (tickTiming(tuning).holdRepeat < 1) throw new Error("A held key must wait at least a tick between repeats");
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
  // Each frog's starting piece, one per player; a lone L unless the course
  // says otherwise.
  kinds?: readonly TetrominoKind[];
}

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

// Where each frog starts on the overpass, on a road `lanes` wide: each in the
// middle of its own share of the road, rounded down, in its piece's first
// rotation no wider than the share. So a lone frog starts in the middle of
// the road, and a team's frogs side by side, never overlapping.
export function startPlacements(kinds: readonly TetrominoKind[], lanes: number): Placement[] {
  const share = lanes / kinds.length;
  return kinds.map((kind, i) => {
    const rotation = ROTATIONS.find((r) => pieceSize(kind, r).width <= share);
    if (rotation === undefined) throw new Error(`A ${kind} fits no share of ${String(share)} lanes`);
    return { col: Math.floor(i * share + (share - pieceSize(kind, rotation).width) / 2), rotation };
  });
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
    const depth = index === 0 ? row.gap : back + row.gap;
    const wall: Wall = { solids: row.solids, gates: row.gates, depth, placedDepth: depth, placedAt: 0, passed: false, index };
    walls.push(wall);
    back = rowBack(wall);
  } while (back < tuning.trafficHorizon);
  return walls;
}

export function createRun(rows: RuleRows, tuning: Tuning, options: RunOptions = {}): Run {
  checkTuning(tuning);
  const { kinds = ["L"] } = options;
  if (kinds.length === 0) throw new Error("A run needs at least one frog");
  return {
    tuning,
    tick: 0,
    frogs: startPlacements(kinds, tuning.corridorCols).map((placement, i) => ({ kind: kinds[i], ...placement, latestHop: null })),
    depth: 0,
    walls: lineUpTraffic(rows, tuning),
    rows,
    lastBonk: null,
    passes: 0,
    holds: [],
    droppedAt: null,
    finishedAt: null,
  };
}

// A player's frog where it stands, at the team's depth.
export function placedFrog(run: Run, player: number): PlacedFrog {
  return { ...run.frogs[player], depth: run.depth };
}

// A hopping frog is one cell up until it lands.
export function hopHeight(frog: RuleFrog): HopHeight {
  return frog.latestHop !== null && frog.latestHop.landedAt === null ? 1 : 0;
}

// The frog as the wall face sees it.
export function frogShape(frog: RuleFrog): Frog {
  return { kind: frog.kind, col: frog.col, rotation: frog.rotation, hop: hopHeight(frog) };
}

// Whether the team is still up on the overpass, before its drop.
export function onOverpass(run: Run): boolean {
  return run.droppedAt === null;
}

// Whether the team has crossed the finish line. The rules stop there.
export function crossedFinish(run: Run): boolean {
  return run.finishedAt !== null;
}

// Whether the team is on the road among the traffic: dropped from the
// overpass and not yet over the finish line.
export function inPlay(run: Run): boolean {
  return !onOverpass(run) && !crossedFinish(run);
}

// Whether the run is over: the team has crossed the finish line and its leap
// onto the finish gantry has landed. The rules' clock runs on after the
// crossing, and the traffic with it.
export function isDone(run: Run): boolean {
  return run.finishedAt !== null && run.tick >= run.finishedAt + tickTiming(run.tuning).finishLeap;
}

// The wall the team meets next: the nearest one it hasn't passed. Null only
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

// The pass test against some of a row's solids, for a player's frog taking
// `shape` from its pose now: each cell on the row's face and in no vehicle's
// cells, and nothing standing or moving across a gate's post.
function fitsAmong(run: Run, player: number, shape: Frog, solids: readonly Solid[]): boolean {
  if (solids.length === 0) return true;
  const cells = frogCells(shape);
  const from = frogCells(frogShape(run.frogs[player]));
  return cells.every((cell) => cell.row < run.tuning.wallRows) && keepsClear(from, cells, solids);
}

// The vehicles of a wall the team has passed that still overlap it, with its
// front face at `depth`: those whose back hasn't yet gone by its back. For a
// team jumping back to `depth`, they are also every vehicle it would meet on
// the way.
export function overlappingSolids(wall: Wall, depth: number): readonly Solid[] {
  if (!wall.passed) return [];
  return wall.solids.filter((solid) => wall.depth + solid.length > depth - FROG_THICKNESS);
}

// Whether a player's frog could take this shape with the team's front face
// at `depth`: inside the opening the overlapping vehicles leave.
function clearOfWallsAt(run: Run, player: number, shape: Frog, depth: number): boolean {
  return run.walls.every((wall) => fitsAmong(run, player, shape, overlappingSolids(wall, depth)));
}

// Out of play, no vehicle touches the frogs.
function clearOfWalls(run: Run, player: number, shape: Frog): boolean {
  return !inPlay(run) || clearOfWallsAt(run, player, shape, run.depth);
}

// Whether a player's frog in this shape keeps out of every other frog's
// cells: the frogs are solid to each other, on the road and off it.
function clearOfPartners(run: Run, player: number, shape: Frog): boolean {
  const cells = new Set(frogCells(shape).map(cellKey));
  return run.frogs.every((frog, other) => other === player || frogCells(frogShape(frog)).every((cell) => !cells.has(cellKey(cell))));
}

// Whether a player's frog may take this shape where it stands: clear of the
// vehicles overlapping it and of its partners.
function roomFor(run: Run, player: number, shape: Frog): boolean {
  return clearOfWalls(run, player, shape) && clearOfPartners(run, player, shape);
}

function withFrog(run: Run, player: number, frog: Partial<RuleFrog>): Run {
  return { ...run, frogs: run.frogs.map((f, i) => (i === player ? { ...f, ...frog } : f)) };
}

function withWall(run: Run, index: number, wall: Partial<Wall>): Run {
  return { ...run, walls: run.walls.map((w, i) => (i === index ? { ...w, ...wall } : w)) };
}

function landNow(run: Run, player: number): Run {
  const hopping = run.frogs[player].latestHop;
  if (hopping === null || hopping.landedAt !== null) return run;
  return withFrog(run, player, { latestHop: { ...hopping, landedAt: run.tick } });
}

// A frog that is up lands, unless landing would put it into a partner under
// it: it stands on its partner until the partner moves out from under it.
function landIfClear(run: Run, player: number): Run {
  const frog = run.frogs[player];
  if (hopHeight(frog) === 0 || !clearOfPartners(run, player, { ...frogShape(frog), hop: 0 })) return run;
  return landNow(run, player);
}

// Where the gate's piece stands in the gate: the frog's rotation, column and
// height if it fits there, inside the gate's lanes, on the face and clear of
// its partners; otherwise the first rotation, then column, that does at the
// frog's height, or, when none does (an I, one cell up), on the road. Null
// if none fits at all.
function placeInGate(run: Run, player: number, kind: TetrominoKind, gate: Gate): Frog | null {
  const lanes = gateLanes(gate);
  const fits = (frog: Frog): boolean =>
    insideLanes(kind, frog, lanes) &&
    pieceSize(kind, frog.rotation).height + frog.hop <= run.tuning.wallRows &&
    clearOfPartners(run, player, frog);
  const current = run.frogs[player];
  const hop = hopHeight(current);
  const kept: Frog = { kind, col: current.col, rotation: current.rotation, hop };
  if (fits(kept)) return kept;
  for (const height of hop === 1 ? ([1, 0] as const) : ([0] as const)) {
    for (const rotation of ROTATIONS) {
      for (let col = lanes.first; col <= lanes.last; col++) {
        const frog: Frog = { kind, col, rotation, hop: height };
        if (fits(frog)) return frog;
      }
    }
  }
  return null;
}

// Whether any of a player's partners has a cell in the gate's lanes.
function partnerInGate(run: Run, player: number, gate: Gate): boolean {
  const { first, last } = gateLanes(gate);
  return run.frogs.some((frog, other) => other !== player && frogCells(frogShape(frog)).some((cell) => cell.col >= first && cell.col <= last));
}

// The frog takes the gate's piece. A gate sets the piece rather than
// swapping it, so going through one twice is harmless. A lone frog in a gate
// always has room for its new piece: every piece has an upright pose two
// lanes wide or narrower, and the gate is the face's full height. Two frogs
// in a gate together fill its two lanes exactly, so neither new piece has
// room beside the other, and both keep their pieces.
function takeGate(run: Run, player: number, gate: Gate): Run {
  const current = run.frogs[player];
  if (current.kind === gate.kind) return run;
  const frog = placeInGate(run, player, gate.kind, gate);
  if (frog === null) {
    if (partnerInGate(run, player, gate)) return run;
    throw new Error(`A ${gate.kind} fits nowhere in a gate`);
  }
  const landed = frog.hop === hopHeight(current) ? run : landNow(run, player);
  const next = withFrog(landed, player, { kind: frog.kind, col: frog.col, rotation: frog.rotation });
  if (!clearOfWalls(next, player, frog)) throw new Error(`A ${gate.kind} taken from a gate is inside a vehicle`);
  return next;
}

// Each frog crossing the wall's front with every cell in one of its gates'
// lanes takes that gate's piece.
function crossFront(run: Run, wall: Wall): Run {
  let next = run;
  for (let player = 0; player < next.frogs.length; player++) {
    const cells = frogCells(frogShape(next.frogs[player]));
    const gate = wall.gates.find((g) => insideGate(cells, g));
    if (gate !== undefined) next = takeGate(next, player, gate);
  }
  return next;
}

// The wall passes around the team.
function pass(run: Run, index: number): Run {
  return crossFront({ ...withWall(run, index, { passed: true }), passes: run.passes + 1 }, run.walls[index]);
}

// The wall goes by beneath a team out of play, unjudged.
function goBy(run: Run, index: number): Run {
  return withWall(run, index, { passed: true });
}

// The team is knocked back from the wall's face, however far that takes it.
// The wall stays solid and keeps coming, so it bonks the team again when it
// arrives unless every frog fits by then or the team has got clear. A held
// key keeps repeating, a full repeat interval after the bonk. A frog in the
// air stays up: a bonk lands no hop.
function bonk(run: Run, index: number): Run {
  const { tick, tuning } = run;
  const face = run.walls[index].depth;
  return {
    ...run,
    depth: face - tuning.bonkKnockback * tuning.depthStep,
    holds: run.holds.map((hold) => ({ ...hold, nextAt: tick + tickTiming(tuning).holdRepeat })),
    lastBonk: { tick, depth: face },
  };
}

// Judges the next wall at the team's face, now, against all its vehicles:
// it passes only if every frog fits, and bonks the whole team otherwise.
function meet(run: Run, index: number): Run {
  const { solids } = run.walls[index];
  const fit = run.frogs.every((frog, player) => fitsAmong(run, player, frogShape(frog), solids));
  return fit ? pass(run, index) : bonk(run, index);
}

// A slide off the road's edge, into a vehicle overlapping the frog or into a
// partner, is refused.
function moveColumn(run: Run, player: number, by: number): Run {
  const frog = run.frogs[player];
  const placement = { col: frog.col + by, rotation: frog.rotation };
  if (!insideLanes(frog.kind, placement, roadLanes(run))) return run;
  return roomFor(run, player, { ...frogShape(frog), ...placement }) ? withFrog(run, player, placement) : run;
}

// A turn takes the first of its kicks that stays on the road, clear of the
// vehicles overlapping the frog and of its partners; if none does, it fails.
function rotate(run: Run, player: number, turn: 1 | -1): Run {
  const frog = run.frogs[player];
  const shape = frogShape(frog);
  const placement = turnWithKicks(
    frog.kind,
    frog,
    turn,
    (p) => insideLanes(frog.kind, p, roadLanes(run)) && roomFor(run, player, { ...shape, ...p }),
  );
  return placement === null ? run : withFrog(run, player, placement);
}

function hop(run: Run, player: number): Run {
  const frog = run.frogs[player];
  if (hopHeight(frog) === 1) return run;
  if (!roomFor(run, player, { ...frogShape(frog), hop: 1 })) return run;
  return withFrog(run, player, { latestHop: { startedAt: run.tick, landedAt: null } });
}

// Riding: a frog that is up while a vehicle overlaps it stays up, gliding
// across the vehicles' low parts, until the last of them has gone by or a
// jump forward carries the team off. So a hop's timing is forgiving: one
// pressed early, whose airtime would end mid-overlap, still carries the frog
// across. Each frog rides on its own: its partner may stand on the road
// between the same row's vehicles. Player 0's unless said: solo's.
export function isRiding(run: Run, player = 0): boolean {
  return inPlay(run) && hopHeight(run.frogs[player]) === 1 && run.walls.some((wall) => overlappingSolids(wall, run.depth).length > 0);
}

// Each hop whose airtime is over lands, unless the frog is riding or would
// land on its partner.
function settle(run: Run): Run {
  let next = run;
  for (let player = 0; player < next.frogs.length; player++) {
    const hopping = next.frogs[player].latestHop;
    if (hopping === null || hopping.landedAt !== null) continue;
    if (next.tick < hopping.startedAt + tickTiming(next.tuning).hopAirtime) continue;
    if (!isRiding(next, player)) next = landIfClear(next, player);
  }
  return next;
}

// The team crosses the finish line: the rules stop, so no row judges it
// again, every held key lets go, and every hop lands, but on a partner. It
// leaps onto the finish gantry, where the traffic goes by beneath it.
function finish(run: Run): Run {
  let next: Run = { ...run, holds: [], finishedAt: run.tick };
  for (let player = 0; player < next.frogs.length; player++) next = landIfClear(next, player);
  return next;
}

// Each wall whose front face the jump reaches is judged at once, nearest
// first. A wall the team doesn't fit bonks it and ends the jump. A jump
// forward never meets a passed wall: those are all behind the team's front.
// A jump that reaches the finish line ends the run.
function jumpForward(run: Run): Run {
  const target = run.depth + run.tuning.depthStep;
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= target; index = nextWall(next)) {
    next = meet(next, index);
    if (!next.walls[index].passed) return next;
  }
  const moved = { ...next, depth: target };
  return target >= run.tuning.courseLength ? finish(moved) : moved;
}

// Whether every frog could stand where it is with the team's front at
// `depth`, clear of every vehicle of the passed walls it would meet getting
// there.
function teamClearAt(run: Run, depth: number): boolean {
  return run.frogs.every((frog, player) => clearOfWallsAt(run, player, frogShape(frog), depth));
}

// A jump back may carry the team into a wall it has passed, or back through
// it, wherever every frog fits: it is refused if it would put any frog's
// cell into a vehicle on the way, like a move off the corridor edge. A wall
// whose front the team jumps back across is ahead of it again, to be judged
// afresh when it arrives, and a gate a frog crosses back through gives it
// its piece. Behind the start the road goes on, and so may the team.
function jumpBack(run: Run): Run {
  const target = run.depth - run.tuning.depthStep;
  if (!teamClearAt(run, target)) return run;
  let next: Run = { ...run, depth: target };
  run.walls.forEach((wall, index) => {
    if (!wall.passed || wall.depth < target) return;
    next = crossFront(withWall(next, index, { passed: false }), wall);
  });
  return next;
}

// The first jump forward drops the team from the overpass onto the road,
// the drop distance ahead of where it stood, and puts it in play. It leaps
// over the traffic: the rows it flies over go by beneath it, unjudged, and
// the last jump's worth of the leap is a jump forward, so one onto a row's
// face is judged like any other. A drop that would land any frog in a
// vehicle is refused, like a move off the corridor edge. A held key repeats
// once the leap has landed.
function drop(run: Run): Run {
  const { tick, tuning } = run;
  const target = run.depth + tuning.dropDistance;
  const approach = target - tuning.depthStep;
  let flown: Run = { ...run, droppedAt: tick };
  run.walls.forEach((wall, index) => {
    if (!wall.passed && wall.depth <= approach) flown = goBy(flown, index);
  });
  if (!teamClearAt(flown, target)) return run;
  return jumpForward({
    ...flown,
    depth: approach,
    holds: run.holds.map((hold) => ({ ...hold, nextAt: tick + tickTiming(tuning).dropDuration })),
  });
}

// A player's action. The slides, turns and hops are the player's own frog's;
// the jumps are the team's. On the overpass the frogs can line themselves up
// and drop; nothing else.
function act(run: Run, player: number, action: FrogAction): Run {
  switch (action) {
    case "left":
      return moveColumn(run, player, -1);
    case "right":
      return moveColumn(run, player, 1);
    case "rotateCcw":
      return rotate(run, player, -1);
    case "rotateCw":
      return rotate(run, player, 1);
    case "hop":
      return onOverpass(run) ? run : hop(run, player);
    case "forward":
      return onOverpass(run) ? drop(run) : jumpForward(run);
    case "back":
      return onOverpass(run) ? run : jumpBack(run);
  }
}

// A player's action, player 0's unless said: solo's. A jump forward can
// carry a riding frog off its wall, so it lands straight after.
export function applyAction(run: Run, action: FrogAction, player = 0): Run {
  if (crossedFinish(run)) return run;
  return settle(act(run, player, action));
}

function isJump(action: HeldAction): boolean {
  return action === "forward" || action === "back";
}

// A jump or slide key pressed: one action now, and another every repeat
// interval while it stays held, until it is released. A jump and a slide can
// be held at once. The jump is the team's: a newer jump, either player's,
// replaces the held one. A slide is each player's own: a newer slide
// replaces that player's held slide. Player 0's unless said.
export function pressHeld(run: Run, action: HeldAction, player = 0): Run {
  if (crossedFinish(run)) return run;
  const replaced = (hold: Hold): boolean => (isJump(action) ? isJump(hold.action) : !isJump(hold.action) && hold.player === player);
  const holds = [...run.holds.filter((hold) => !replaced(hold)), { player, action, nextAt: run.tick + tickTiming(run.tuning).holdRepeat }];
  return applyAction({ ...run, holds }, action, player);
}

// A player's held key released; with no action, every key the player holds
// is let go, as when the window loses focus and key releases can no longer
// be seen. A player lets go only of their own keys: a held jump the
// partner's newer press replaced is the partner's. Player 0's unless said.
export function releaseHeld(run: Run, action?: HeldAction, player = 0): Run {
  const holds = run.holds.filter((hold) => hold.player !== player || (action !== undefined && hold.action !== action));
  return holds.length === run.holds.length ? run : { ...run, holds };
}

function sameKey(a: Hold, b: Hold): boolean {
  return a.player === b.player && a.action === b.action;
}

function repeatHeld(run: Run, held: Hold): Run {
  const holds = run.holds.map((hold) => (sameKey(hold, held) ? { ...hold, nextAt: held.nextAt + tickTiming(run.tuning).holdRepeat } : hold));
  return applyAction({ ...run, holds }, held.action, held.player);
}

// A wall whose back is the recycling distance behind the team, out of the
// camera's view, reappears ahead of it as the stream's next row: its gap
// beyond the frontmost wall's back, and never nearer the team than the
// traffic horizon, beyond the fog. So a wall never appears or vanishes on
// screen, and the team meets the stream's rows in order however it goes.
function recycle(run: Run): Run {
  const limit = run.depth - run.tuning.recycleBehind;
  if (run.walls.every((wall) => rowBack(wall) >= limit)) return run;
  const leaving = run.walls
    .map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => rowBack(wall) < limit)
    .sort((a, b) => a.wall.depth - b.wall.depth);
  let next = run;
  for (const { index } of leaving) {
    const others = next.walls.filter((_, i) => i !== index);
    const streamIndex = Math.max(...next.walls.map((wall) => wall.index)) + 1;
    const row = next.rows(streamIndex);
    const depth = Math.max(Math.max(...others.map(rowBack)) + row.gap, next.depth + next.tuning.trafficHorizon);
    next = withWall(next, index, {
      solids: row.solids,
      gates: row.gates,
      depth,
      placedDepth: depth,
      placedAt: next.tick,
      passed: false,
      index: streamIndex,
    });
  }
  return next;
}

// The clock moves on a tick, carrying every wall toward the start.
function moveWalls(run: Run): Run {
  const tick = run.tick + 1;
  const { wallSpeed } = run.tuning;
  return {
    ...run,
    tick,
    walls: run.walls.map((wall) => ({ ...wall, depth: wall.placedDepth - (wallSpeed * (tick - wall.placedAt)) / TICK_RATE })),
  };
}

// Each wall that has reached the team's face: judged in play, and going by
// beneath out of play. The spacing lets only one arrive at a time, but each
// is met in turn, nearest first, and a bonk takes the team back from the
// face, so none is ever carried past the team unjudged.
function arrive(run: Run): Run {
  let next = run;
  for (let index = nextWall(next); index !== null && next.walls[index].depth <= next.depth; index = nextWall(next)) {
    next = inPlay(next) ? meet(next, index) : goBy(next, index);
  }
  return next;
}

// Each held key due to act this tick acts, in the order pressed. A bonk or
// the finish along the way puts the later ones off, or lets them go.
function repeatDue(run: Run): Run {
  let next = run;
  for (const key of run.holds) {
    const held = next.holds.find((hold) => sameKey(hold, key));
    if (held !== undefined && held.nextAt <= next.tick) next = repeatHeld(next, held);
  }
  return next;
}

// One tick: the walls move on, a wall far enough behind the team is
// recycled, and then whatever falls due in the tick happens, in this order.
// A wall reaching the team is judged first: it arrived within the tick, at
// or before anything timed to the tick's end, so a hop due to land then is
// read still up. Then a hop whose airtime is over lands, unless its frog
// rides, and a ride ends once the last vehicle has gone by. Then the held
// keys repeat. The inputs stamped with the tick apply after all of that.
// After the finish the traffic keeps driving, beneath the team on the gantry.
export function step(run: Run): Run {
  return repeatDue(settle(arrive(recycle(moveWalls(run)))));
}

// One input, at the run's own tick, for one of the team's frogs: players
// count from 0, one per frog.
export function applyInput(run: Run, { tick, player, input }: TimedInput): Run {
  if (tick !== run.tick) throw new Error(`An input for tick ${String(tick)} reached the run at tick ${String(run.tick)}`);
  if (!Number.isInteger(player) || player < 0 || player >= run.frogs.length) throw new Error(`There is no frog for player ${String(player)}`);
  switch (input.kind) {
    case "act":
      return applyAction(run, input.action, player);
    case "press":
      return pressHeld(run, input.action, player);
    case "release":
      return releaseHeld(run, input.action, player);
    case "releaseAll":
      return releaseHeld(run, undefined, player);
  }
}

// Where the log's inputs after `tick` start.
function firstAfter(log: InputLog, tick: number): number {
  let low = 0;
  let high = log.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (log[mid].tick <= tick) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Plays the run on to `tick`, a tick at a time, applying each of the log's
// inputs as the run reaches its tick. The inputs stamped with the run's own
// tick are taken to be in it already.
export function playTo(run: Run, tick: number, log: InputLog = NO_INPUTS): Run {
  if (tick < run.tick) throw new Error(`A run at tick ${String(run.tick)} can't play back to ${String(tick)}`);
  let next = run;
  let i = firstAfter(log, run.tick);
  while (next.tick < tick) {
    next = step(next);
    for (; i < log.length && log[i].tick <= next.tick; i++) {
      if (log[i].tick < next.tick) throw new Error("The input log is out of tick order");
      next = applyInput(next, log[i]);
    }
  }
  return next;
}

// The run from `start`, at the start of its log, to `tick`, with every
// input of the log applied at its own tick.
export function replay(start: Run, log: InputLog, tick: number): Run {
  let first = start;
  for (const input of log) if (input.tick === start.tick) first = applyInput(first, input);
  return playTo(first, tick, log);
}
