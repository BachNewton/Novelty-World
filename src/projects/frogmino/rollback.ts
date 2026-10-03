import { applyInput, step, type InputLog, type Run, type TimedInput } from "./run";

// Rollback, for online co-op: a run that can take an input late, in its place
// in the log, and correct itself to it. A timeline keeps the run at every
// snapshot tick since the last confirmed one, so a late input re-runs the
// rules from the nearest snapshot before it rather than from the start.
//
// A snapshot is the run at its tick before that tick's inputs, so it depends
// only on the inputs stamped earlier: an input inserted at a tick can always
// re-run from a snapshot at that very tick.

// How often the run is kept: every tenth of a second.
export const SNAPSHOT_TICKS = 10;

export interface Timeline {
  // The confirmed run, at its tick and before that tick's inputs. Nothing
  // before it can change.
  base: Run;
  // Every input from the base's tick on, in order.
  log: InputLog;
  // The run at each snapshot tick after the base's, before that tick's
  // inputs, oldest first.
  snapshots: readonly Run[];
  // The run now, its tick's inputs applied.
  run: Run;
}

export function startTimeline(start: Run): Timeline {
  if (start.tick % SNAPSHOT_TICKS !== 0) throw new Error(`A timeline can't start between snapshots, at tick ${String(start.tick)}`);
  return { base: start, log: [], snapshots: [], run: start };
}

// Where the log's inputs at `tick` and after start.
function firstAt(log: InputLog, tick: number): number {
  let i = 0;
  while (i < log.length && log[i].tick < tick) i++;
  return i;
}

// A snapshot with its own tick's inputs applied.
function withInputsAt(run: Run, log: InputLog): Run {
  let next = run;
  for (let i = firstAt(log, run.tick); i < log.length && log[i].tick === run.tick; i++) next = applyInput(next, log[i]);
  return next;
}

// Plays `run`, its tick's inputs applied, on to `tick`, applying the log's
// inputs as it reaches them and keeping a snapshot at every snapshot tick.
function playOn(run: Run, tick: number, log: InputLog, snapshots: Run[]): Run {
  let next = run;
  let i = firstAt(log, run.tick + 1);
  while (next.tick < tick) {
    next = step(next);
    if (next.tick % SNAPSHOT_TICKS === 0) snapshots.push(next);
    for (; i < log.length && log[i].tick === next.tick; i++) next = applyInput(next, log[i]);
  }
  return next;
}

// The timeline played on to `tick`; a tick it has passed changes nothing.
export function advance(timeline: Timeline, tick: number): Timeline {
  if (tick <= timeline.run.tick) return timeline;
  const snapshots = [...timeline.snapshots];
  const run = playOn(timeline.run, tick, timeline.log, snapshots);
  return { ...timeline, snapshots, run };
}

// The run at `tick`, before that tick's inputs, from a confirmed run and the
// inputs from its tick on.
export function runAt(base: Run, log: InputLog, tick: number): Run {
  if (tick < base.tick) throw new Error(`A run at tick ${String(base.tick)} can't go back to ${String(tick)}`);
  if (tick === base.tick) return base;
  return step(playOn(withInputsAt(base, log), tick - 1, log, []));
}

// A timeline from a new confirmed run and its inputs, played to `tick`.
export function timelineFrom(base: Run, log: InputLog, tick: number): Timeline {
  const snapshots: Run[] = [];
  const run = playOn(withInputsAt(base, log), Math.max(tick, base.tick), log, snapshots);
  return { base, log, snapshots, run };
}

export function sameInput(a: TimedInput, b: TimedInput): boolean {
  if (a.tick !== b.tick || a.player !== b.player || a.input.kind !== b.input.kind) return false;
  return !("action" in a.input) || !("action" in b.input) || a.input.action === b.input.action;
}

// The timeline with its log replaced. Where the new log first differs from
// the old, the run re-plays from the snapshot nearest before it; inputs only
// added at the run's own tick, after those it has applied, apply at once, as
// a local input does; and a change still in the run's future waits for it.
export function withLog(timeline: Timeline, log: InputLog): Timeline {
  const old = timeline.log;
  let i = 0;
  while (i < old.length && i < log.length && sameInput(old[i], log[i])) i++;
  if (i === old.length && i === log.length) return timeline;
  const from = Math.min(old[i]?.tick ?? Infinity, log[i]?.tick ?? Infinity);
  const { run } = timeline;
  if (from > run.tick) return { ...timeline, log };
  if (from < timeline.base.tick) throw new Error(`An input at tick ${String(from)} is before the confirmed run at ${String(timeline.base.tick)}`);
  if (from === run.tick && (i === old.length || old[i].tick > run.tick)) {
    let next = run;
    for (let j = i; j < log.length && log[j].tick === run.tick; j++) next = applyInput(next, log[j]);
    return { ...timeline, log, run: next };
  }
  const kept = timeline.snapshots.filter((snapshot) => snapshot.tick <= from);
  const source = kept.at(-1) ?? timeline.base;
  const snapshots = [...kept];
  return { ...timeline, log, snapshots, run: playOn(withInputsAt(source, log), run.tick, log, snapshots) };
}

// One input put in the log in its place: after every input stamped with its
// tick or earlier, as the host orders them.
export function inserted(log: InputLog, input: TimedInput): TimedInput[] {
  const at = firstAt(log, input.tick + 1);
  return [...log.slice(0, at), input, ...log.slice(at)];
}

// The timeline confirmed to `tick`, a snapshot tick it has reached: its run
// there becomes the base, and the inputs before it are final.
export function confirm(timeline: Timeline, tick: number): { timeline: Timeline; final: InputLog } {
  const base = timeline.snapshots.find((snapshot) => snapshot.tick === tick);
  if (base === undefined) throw new Error(`No snapshot at tick ${String(tick)} to confirm`);
  const split = firstAt(timeline.log, tick);
  return {
    timeline: {
      base,
      log: timeline.log.slice(split),
      snapshots: timeline.snapshots.filter((snapshot) => snapshot.tick > tick),
      run: timeline.run,
    },
    final: timeline.log.slice(0, split),
  };
}

// A cheap fingerprint of a run's rule state, for two devices to compare a
// confirmed run without sending it: FNV-1a over everything the rules keep but
// the course and the tuning, which both devices share.
export function runHash(run: Run): number {
  const state = JSON.stringify([
    run.tick,
    run.depth,
    run.frogs,
    run.walls.map((wall) => [wall.index, wall.depth, wall.placedDepth, wall.placedAt, wall.passed]),
    run.lastBonk,
    run.passes,
    run.holds,
    run.droppedAt,
    run.finishedAt,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < state.length; i++) {
    hash ^= state.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
