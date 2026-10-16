import { startRun, type Course } from "../courses";
import {
  applyInput,
  crossedFinish,
  fitsRow,
  frogShape,
  isDone,
  nextWall,
  overlappingSolids,
  playTo,
  replay,
  type InputLog,
  type Run,
  type TimedInput,
  type Wall,
} from "../run";
import { TICK_RATE, tickTiming } from "../ticks";
import { TUNING, type Tuning } from "../tuning";
import type { Frog } from "../types";
import { planShape, planTeam, type PlanStep, type TeamPose } from "./team-plan";

// The solver proves a course can be beaten by finding an input log that takes
// the team from the helicopter through every row without a bonk, and over the
// finish line, and the proof is that log: the rules are a pure function of
// the course and the log, so replaying it is the verification.
//
// It works row by row in the real engine. Once the last row has gone by and
// every hop has come down, it plans the team's way from its pose to one that
// passes the next row (`team-plan.ts`), then turns the plan into timed
// inputs: jumps forward first, as many as leave the plan room, then the
// plan's actions a slot apart, timed so the row arrives just after the last
// one, while every hop the pose needs is still up. The engine plays them, and
// the row must pass: any step where the engine's team differs from the plan's
// is a disagreement between the planner and the rules, and fails loudly. It
// goes row after row, never back: a row with no route from where the team
// stands ends the search there, naming the row and why.

export interface ProofOptions {
  // Ticks between the plan's actions: one slot. The hop's airtime must be a
  // whole number of slots.
  slot?: number;
  // Stop once the team has passed this many rows, rather than at the finish.
  rows?: number;
  // The most team poses one row's plan may look at.
  maxPoses?: number;
  // The pose each frog must pass a row in, by the row's index: a designed
  // course's answers, so the proof plays its rows as designed. Undefined for
  // a row any passing pose will do.
  answers?: (index: number) => readonly Omit<Frog, "kind">[] | undefined;
}

// How the team passed one row.
export interface RowProof {
  // Which row of the course: its index in the course's rows.
  index: number;
  // The row as the rules saw it.
  wall: Pick<Wall, "solids">;
  // The team as the plan started, and each slot of the plan.
  start: TeamPose;
  steps: PlanStep[];
  // How many times the team jumped forward before the plan.
  jumps: number;
  // The inputs for this row: the jumps and the plan.
  inputs: TimedInput[];
  // The tick the row reached the team and passed it.
  passedAt: number;
}

export interface Proof {
  log: InputLog;
  rows: RowProof[];
  // Where the proof's run ends: once the team has landed on the finish
  // gantry, or a little after the last row passed when stopping early.
  until: number;
  finished: boolean;
}

export interface Stuck {
  // The row no route was found for, with every way tried.
  index: number;
  reason: string;
}

export type ProofResult = { ok: true; proof: Proof } | { ok: false; stuck: Stuck; rows: RowProof[] };

// Ticks between the plan's actions, unless the options say otherwise.
export const DEFAULT_SLOT = 14;

// When the team jumps out of the helicopter: a second in, so a watcher sees it
// start.
const DROP_TICK = 100;
// How long a run may wait for a row to go by before something is wrong.
const MAX_WAIT = 2000;
// How long a proof that stops early runs on after its last row.
const TAIL = 200;

// The team pose the planner starts from: the run's frogs, every hop's
// airtime over.
function poseOf(run: Run): TeamPose {
  return run.frogs.map((frog) => ({ kind: frog.kind, col: frog.col, rotation: frog.rotation, height: frog.height, air: 0 }));
}

function samePose(run: Run, pose: TeamPose): boolean {
  return run.frogs.every((frog, i) => {
    const planned = planShape(pose[i]);
    const shape = frogShape(frog);
    return shape.kind === planned.kind && shape.col === planned.col && shape.rotation === planned.rotation && shape.height === planned.height;
  });
}

function describePose(pose: readonly Frog[]): string {
  return pose.map((f) => `${f.kind} r${String(f.rotation)} c${String(f.col)}${f.height > 0 ? ` up ${String(f.height)}` : ""}`).join(", ");
}

// The first tick at which the wall's front reaches a team at `depth`, as the
// run moves walls.
function arrivalTick(wall: Wall, depth: number, tuning: Tuning): number {
  const at = (tick: number): number => wall.placedDepth - (tuning.wallSpeed * (tick - wall.placedAt)) / TICK_RATE;
  let tick = wall.placedAt + Math.floor(((wall.placedDepth - depth) * TICK_RATE) / tuning.wallSpeed) - 2;
  while (at(tick) > depth) tick++;
  return tick;
}

interface Track {
  run: Run;
  log: TimedInput[];
}

function act(track: Track, player: number, input: TimedInput["input"]): Track {
  const timed: TimedInput = { tick: track.run.tick, player, input };
  return { run: applyInput(track.run, timed), log: [...track.log, timed] };
}

function waitTo(track: Track, tick: number): Track {
  return { run: playTo(track.run, tick), log: track.log };
}

// Plays on until no row overlaps the team and every hop's airtime is over.
function settle(track: Track): Track {
  const { run } = track;
  const airtime = tickTiming(run.tuning).hopAirtime;
  const settled = (r: Run): boolean =>
    r.walls.every((wall) => overlappingSolids(wall, r.depth).length === 0) &&
    r.frogs.every((frog) => frog.latestHop === null || r.tick >= frog.latestHop.startedAt + airtime);
  let next = run;
  while (!settled(next)) {
    if (next.tick > run.tick + MAX_WAIT) throw new Error(`The team never got clear of a row after tick ${String(run.tick)}`);
    next = playTo(next, next.tick + 1);
  }
  return { run: next, log: track.log };
}

interface Context {
  tuning: Tuning;
  slot: number;
  airSlots: number;
  holdRepeat: number;
  rowLimit: number | null;
  maxPoses: number;
  answers: ProofOptions["answers"];
}

// Jumps forward a held key's repeat apart for as long as `room` allows each
// next jump, never reaching the next row's face. Returns the jumps made.
function jumpWhile(track: Track, wallAt: number, room: (run: Run, depth: number) => boolean): { track: Track; jumps: number } {
  const repeat = tickTiming(track.run.tuning).holdRepeat;
  let next = track;
  let jumps = 0;
  for (;;) {
    const { run } = next;
    if (crossedFinish(run)) break;
    const depth = run.depth + run.tuning.depthStep;
    if (run.walls[wallAt].depth <= depth || !room(run, depth)) break;
    next = act(next, 0, { kind: "act", action: "forward" });
    jumps++;
    if (!crossedFinish(next.run)) next = waitTo(next, next.run.tick + repeat);
  }
  return { track: next, jumps };
}

// Plays the plan through the next row: the jumps, then the plan's actions a
// slot apart, the row arriving half a slot after the last. Null if the row
// comes too soon for the plan; throws if the engine disagrees with the plan.
function playPlan(ctx: Context, track: Track, wallAt: number, steps: PlanStep[]): { track: Track; jumps: number; inputs: TimedInput[] } | null {
  const wall = track.run.walls[wallAt];
  const length = steps.length;
  const half = Math.floor(ctx.slot / 2);
  // The tick the plan's first action must come at, for the row to arrive
  // half a slot after its last; with no plan, the row may come any time.
  const planStart = (depth: number): number => arrivalTick(wall, depth, ctx.tuning) - half - (length - 1) * ctx.slot;
  const before = track.log.length;
  const { track: jumped, jumps } = jumpWhile(track, wallAt, (run, depth) =>
    length === 0 ? arrivalTick(wall, depth, ctx.tuning) > run.tick + ctx.holdRepeat : planStart(depth) >= run.tick + ctx.holdRepeat,
  );
  let next = jumped;
  if (crossedFinish(next.run)) return { track: next, jumps, inputs: next.log.slice(before) };
  if (length > 0) {
    const start = planStart(next.run.depth);
    if (start < next.run.tick) return null;
    next = waitTo(next, start);
    for (const [i, step] of steps.entries()) {
      if (i > 0) next = waitTo(next, start + i * ctx.slot);
      if (step.move.kind === "act") next = act(next, step.move.player, { kind: "act", action: step.move.action });
      if (!samePose(next.run, step.pose)) {
        throw new Error(
          `The engine disagrees with the plan at row ${String(wall.index)}, step ${String(i + 1)}: ` +
            `planned ${describePose(step.pose.map(planShape))}, engine ${describePose(next.run.frogs.map(frogShape))}`,
        );
      }
    }
  }
  const bonks = next.run.lastBonk;
  while (!next.run.walls[wallAt].passed && next.run.lastBonk === bonks) {
    if (next.run.tick > track.run.tick + MAX_WAIT) throw new Error(`Row ${String(wall.index)} never reached the team`);
    next = waitTo(next, next.run.tick + 1);
  }
  if (next.run.lastBonk !== bonks) {
    throw new Error(`Row ${String(wall.index)} bonked the team in the pose its plan passes: the planner and the rules disagree`);
  }
  return { track: next, jumps, inputs: next.log.slice(before) };
}

// Straight for the finish, if the team can jump over the line before the next
// row arrives.
function dash(track: Track): Track | null {
  const at = nextWall(track.run);
  if (at === null) throw new Error("No row ahead of the team");
  const { track: next } = jumpWhile(track, at, () => true);
  return crossedFinish(next.run) ? next : null;
}

// Plans and plays the team through the next row; the row's proof and the
// run after it, or why no route was found.
function passRow(ctx: Context, settled: Track): { track: Track; proof: RowProof } | Stuck {
  const wallAt = nextWall(settled.run);
  if (wallAt === null) throw new Error("No row ahead of the team");
  const wall = settled.run.walls[wallAt];
  const start = poseOf(settled.run);
  const answer = ctx.answers?.(wall.index);
  const isAnswer = (shape: Frog, i: number): boolean =>
    answer === undefined || (shape.col === answer[i].col && shape.rotation === answer[i].rotation && shape.height === answer[i].height);
  const plan = planTeam({
    start,
    lanes: settled.run.lanes,
    airSlots: ctx.airSlots,
    maxPoses: ctx.maxPoses,
    goal: (pose) =>
      pose.every((frog, i) => {
        const shape = planShape(frog);
        return isAnswer(shape, i) && fitsRow(shape, wall.solids);
      }),
  });
  const note = answer === undefined ? "" : " in its designed answer";
  if (plan === null) return { index: wall.index, reason: `no team pose reachable from ${describePose(start.map(planShape))} passes it${note}` };
  const played = playPlan(ctx, settled, wallAt, plan.steps);
  if (played === null) return { index: wall.index, reason: `the row comes too soon for a ${String(plan.steps.length)}-slot plan${note}` };
  return {
    track: played.track,
    proof: {
      index: wall.index,
      wall: { solids: wall.solids },
      start,
      steps: plan.steps,
      jumps: played.jumps,
      inputs: played.inputs,
      passedAt: played.track.run.tick,
    },
  };
}

// The team through the course row after row, to the finish or the row
// limit; the rows passed, and where it got stuck if it did.
function search(ctx: Context, from: Track): { track: Track; rows: RowProof[]; stuck: Stuck | null } {
  const rows: RowProof[] = [];
  let track = from;
  while (!crossedFinish(track.run) && (ctx.rowLimit === null || rows.length < ctx.rowLimit)) {
    const settled = settle(track);
    const dashed = dash(settled);
    if (dashed !== null) return { track: dashed, rows, stuck: null };
    const passed = passRow(ctx, settled);
    if (!("proof" in passed)) return { track: settled, rows, stuck: passed };
    rows.push(passed.proof);
    track = passed.track;
  }
  return { track, rows, stuck: null };
}

// The run a course starts with, as a session starts it.
export function courseRun(course: Course, tuning: Tuning = TUNING): Run {
  return startRun(course, tuning);
}

// Finds an input log taking the team through the course's rows without a
// bonk, to the finish (or through `rows` rows), and checks it by replaying it
// from the start.
export function proveCourse(course: Course, options: ProofOptions = {}, tuning: Tuning = TUNING): ProofResult {
  const timing = tickTiming(tuning);
  const slot = options.slot ?? DEFAULT_SLOT;
  if (timing.hopAirtime % slot !== 0) throw new Error(`A hop's ${String(timing.hopAirtime)} ticks aren't a whole number of ${String(slot)}-tick slots`);
  const ctx: Context = {
    tuning,
    slot,
    airSlots: timing.hopAirtime / slot,
    holdRepeat: timing.holdRepeat,
    rowLimit: options.rows ?? null,
    maxPoses: options.maxPoses ?? 200_000,
    answers: options.answers,
  };
  const start: Track = { run: courseRun(course, tuning), log: [] };
  const dropped = act(waitTo(start, DROP_TICK), 0, { kind: "act", action: "forward" });
  const landed = waitTo(dropped, DROP_TICK + timing.dropDuration);
  const { track, rows, stuck } = search(ctx, landed);
  if (stuck !== null) return { ok: false, stuck, rows };
  const finished = crossedFinish(track.run);
  const until = finished ? (track.run.finishedAt ?? 0) + timing.finishLeap : track.run.tick + TAIL;
  const proof: Proof = { log: track.log, rows, until, finished };
  verifyProof(course, proof, tuning);
  return { ok: true, proof };
}

export interface Verdict {
  run: Run;
  passes: number;
  bonked: boolean;
  finished: boolean;
}

// Replays a log from the course's start to `until` in the real rules and
// reads off what happened: the proof itself.
export function replayVerdict(course: Course, log: InputLog, until: number, tuning: Tuning = TUNING): Verdict {
  const run = replay(courseRun(course, tuning), log, until);
  return { run, passes: run.passes, bonked: run.lastBonk !== null, finished: isDone(run) };
}

// Fails loudly unless the proof's log, replayed from the start, passes every
// row it claims without a bonk, and finishes if it claims to.
export function verifyProof(course: Course, proof: Proof, tuning: Tuning = TUNING): Verdict {
  const verdict = replayVerdict(course, proof.log, proof.until, tuning);
  if (verdict.bonked) throw new Error(`The proof's log bonks the team at tick ${String(verdict.run.lastBonk?.tick)} on replay`);
  if (verdict.passes !== proof.rows.length) {
    throw new Error(`The proof claims ${String(proof.rows.length)} rows, but its log passes ${String(verdict.passes)} on replay`);
  }
  if (proof.finished && !verdict.finished) throw new Error("The proof's log doesn't reach the finish on replay");
  return verdict;
}
