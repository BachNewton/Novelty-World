import { inlineBaker, type BakeScene, type Gathered, type Pass, type RoomLight, type Samples } from "./bake";
import { finishLight, type FinishWork } from "./bake-finish";

/*
 * The bake as background work, in passes. Each job lights one room with one
 * or more passes (the direct light first, then finer ones), each cut into
 * chunks of samples that go to whichever lane (a worker) is free. Once all
 * of a pass's chunks are in, a lane finishes them into the room's light
 * (`bake-finish.ts`), so the main thread only shows it; a pass shows as soon
 * as it is finished, and a job's passes show in order. Which chunk runs next is chosen when a lane
 * frees: earlier passes first, then the room the player cares about most
 * (`setPriority`), then the oldest job. A newer job for the same room
 * supersedes the older one at once: its queued chunks are dropped, and
 * results of its chunks still running are thrown away when they arrive.
 * Nothing here runs on a clock: every step follows a submit or a chunk
 * landing.
 */

/** Direct-light samples' work per chunk at least: below this, posting costs more than baking. */
const LEAST_CHUNK = 4096;
/** Chunk records the debug trace keeps. */
const TRACE_CHUNKS = 600;

/** One chunk of a pass, as a lane runs it. */
export interface ChunkWork {
  pass: Pass;
  /** The room it lights, for whoever watches. */
  room: string;
  scene: BakeScene;
  sceneId: number;
  samples: Samples;
}

/** A pass's light, all in, to be finished into the room's light. */
export interface FinishTask {
  pass: Pass;
  room: string;
  work: FinishWork;
}

/** One worker, or a stand-in: runs one chunk, or one finish, at a time. */
export interface Lane {
  run: (work: ChunkWork) => Promise<Gathered>;
  finish: (task: FinishTask) => Promise<RoomLight>;
  dispose: () => void;
}

/** One pass of a job: its samples, and how its light reaches the screen. */
export interface PassPlan {
  pass: Pass;
  samples: Samples;
  /** The work of one of its samples, in direct-light samples: a finer pass's chunks are cut smaller, so each takes about as long. */
  cost: number;
  /** Whether this kind of work usually takes long enough (more than a couple of seconds) that the screen shows how far it has got, from the start. */
  progress: boolean;
  /** The pass's whole light (at its samples, in order) as work for a lane to finish into the room's light. */
  finish: (joined: Gathered) => FinishWork;
  /** Takes the finished light to the screen. */
  show: (light: RoomLight) => void;
}

export interface BakeJob {
  /** What it lights: a newer job with the same key supersedes this one. */
  key: string;
  /** Where it is, for ordering by what the player sees, and for the debug view. */
  floor: string;
  room: string;
  scene: BakeScene;
  sceneId: number;
  /** In the order they are applied. */
  passes: PassPlan[];
}

/** A submitted job's progress: one promise per pass, resolved once it is
 *  applied (or the pass of the job superseding it is), and the last pass's. */
export interface Submitted {
  passes: Promise<void>[];
  done: Promise<void>;
}

/** The work in hand, for the screen. A batch runs from work arriving while
 *  idle until nothing is left; `done` and `total` count its work over every
 *  pass, in direct-light samples (a sample of a pass weighs its `cost`). */
export interface BakeStatus {
  pending: boolean;
  /** Work in hand is of a kind that shows its progress. */
  progress: boolean;
  /** The passes with work left, in order. */
  passes: Pass[];
  done: number;
  total: number;
  /** When the batch began (`performance.now()`), or null when idle. */
  since: number | null;
}

/** A chunk as the debug view draws it. `end` is null while it runs; a stale
 *  chunk's job was superseded or cancelled, so its light was thrown away. */
export interface ChunkRecord {
  lane: number;
  /** Gathering samples, or finishing a pass's light. */
  step: "gather" | "finish";
  pass: Pass;
  floor: string;
  room: string;
  samples: number;
  start: number;
  end: number | null;
  stale: boolean;
}

/** Each pass's work in the current or last batch: samples, the lanes' time on it, and its span. */
export interface PassTrace {
  samples: number;
  busyMs: number;
  first: number;
  last: number;
}

/** A pass shown on the main thread, and how long that took. */
export interface ApplyRecord {
  pass: Pass;
  room: string;
  at: number;
  ms: number;
}

/** What the debug view reads: kept only once `trace()` is first called. */
export interface BakeTrace {
  lanes: number;
  chunks: ChunkRecord[];
  applies: ApplyRecord[];
  passes: Partial<Record<Pass, PassTrace>>;
  /** The current or last batch: when it began, when it ended (null while running), and the samples baked in it. */
  batch: { start: number; end: number | null; samples: number } | null;
}

export type Priority = (job: { floor: string; room: string }) => number;

interface PassState {
  plan: PassPlan;
  count: number;
  /** Each chunk's sample range. */
  ranges: [number, number][];
  /** Chunks not yet sent, by index. */
  queued: number[];
  parts: (Gathered | null)[];
  /** Chunks not yet in. */
  left: number;
  /** Its light, finished; null until then. */
  light: RoomLight | null;
  applied: Deferred;
}

interface Running {
  id: number;
  job: BakeJob;
  passes: PassState[];
  /** Passes shown so far. */
  applied: number;
  live: boolean;
}

interface Deferred {
  promise: Promise<void>;
  resolve: (value: void | Promise<void>) => void;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const IDLE: BakeStatus = { pending: false, progress: false, passes: [], done: 0, total: 0, since: null };

/** Samples in a sample set. */
const sampleCount = (samples: Samples) => samples.position.length / 3;

function slice(samples: Samples, start: number, end: number): Samples {
  return { position: samples.position.slice(start * 3, end * 3), normal: samples.normal.slice(start * 3, end * 3), within: samples.within.slice(start * 6, end * 6) };
}

/** A pass's chunks joined back in order. */
function join(parts: Gathered[]): Gathered {
  const light = new Float32Array(parts.reduce((sum, part) => sum + part.light.length, 0));
  const weights = new Float32Array(parts.reduce((sum, part) => sum + part.weights.length, 0));
  let at = 0;
  let weightAt = 0;
  for (const part of parts) {
    light.set(part.light, at);
    weights.set(part.weights, weightAt);
    at += part.light.length;
    weightAt += part.weights.length;
  }
  return { light, weights };
}

/** `spawn` makes the lanes, the first time there is work, and again after `stop`. */
export function createBakeScheduler(spawn: () => Lane[]) {
  let lanes: { lane: Lane; busy: boolean }[] | null = null;
  const jobs: Running[] = [];
  const byKey = new Map<string, Running>();
  let ids = 0;
  let priority: Priority = () => 0;
  let status: BakeStatus = IDLE;
  let done = 0;
  let total = 0;
  let since: number | null = null;
  const listeners = new Set<() => void>();
  let trace: BakeTrace | null = null;
  let pumpQueued = false;

  /** Samples of a job not yet in. */
  const left = (running: Running) => running.passes.reduce((sum, state) => sum + state.ranges.reduce((each, [start, end], i) => each + (state.parts[i] ? 0 : (end - start) * state.plan.cost), 0), 0);
  const publish = () => {
    if (jobs.length === 0 && since !== null) {
      since = null;
      done = 0;
      total = 0;
      if (trace?.batch) trace.batch.end = performance.now();
    }
    const unshown = (running: Running) => running.passes.slice(running.applied);
    const passes = [...new Set(jobs.flatMap((running) => unshown(running).map((state) => state.plan.pass)))];
    const progress = jobs.some((running) => unshown(running).some((state) => state.plan.progress));
    status = jobs.length === 0 ? IDLE : { pending: true, progress, passes, done, total, since };
    for (const listener of listeners) listener();
  };

  const drop = (running: Running) => {
    running.live = false;
    total -= left(running);
    jobs.splice(jobs.indexOf(running), 1);
    if (byKey.get(running.job.key) === running) byKey.delete(running.job.key);
  };

  /** The next chunk: the earliest pass with work queued, then the room most wanted, then the oldest job. */
  const next = (): { running: Running; pass: number } | null => {
    let best: { running: Running; pass: number; want: number } | null = null;
    for (const running of jobs) {
      const pass = running.passes.findIndex((state) => state.queued.length > 0);
      if (pass === -1) continue;
      if (best && pass > best.pass) continue;
      const want = priority(running.job);
      if (!best || pass < best.pass || want > best.want) best = { running, pass, want };
    }
    return best;
  };

  /** Shows the passes that are finished, in order: a later pass finished first waits for the earlier. */
  const advance = (running: Running) => {
    while (running.applied < running.passes.length && running.passes[running.applied].light !== null) {
      const ready = running.passes[running.applied];
      const start = performance.now();
      ready.plan.show(ready.light as RoomLight);
      if (trace) {
        trace.applies.push({ pass: ready.plan.pass, room: running.job.room, at: start, ms: performance.now() - start });
        if (trace.applies.length > TRACE_CHUNKS) trace.applies.splice(0, trace.applies.length - TRACE_CHUNKS);
      }
      ready.applied.resolve();
      running.applied++;
    }
    if (running.applied === running.passes.length) drop(running);
  };

  /** Passes all in, waiting for a lane to finish them: they go before any chunk, being the last step to the screen. */
  const finishing: { running: Running; state: PassState }[] = [];

  const land = (running: Running, state: PassState, part: number, gathered: Gathered) => {
    state.parts[part] = gathered;
    state.left--;
    done += (state.ranges[part][1] - state.ranges[part][0]) * state.plan.cost;
    if (state.left === 0) finishing.push({ running, state });
  };

  /** Starts a trace record of work on a lane. */
  const record = (lane: number, step: ChunkRecord["step"], running: Running, state: PassState, samples: number): ChunkRecord | null => {
    if (!trace) return null;
    const chunk: ChunkRecord = { lane, step, pass: state.plan.pass, floor: running.job.floor, room: running.job.room, samples, start: performance.now(), end: null, stale: false };
    trace.chunks.push(chunk);
    if (trace.chunks.length > TRACE_CHUNKS) trace.chunks.splice(0, trace.chunks.length - TRACE_CHUNKS);
    return chunk;
  };

  /** A lane's work failed: the job fails loudly, every pass of it. */
  const fail = (running: Running, error: unknown) => {
    if (!running.live) return;
    drop(running);
    for (const each of running.passes) each.applied.reject(error instanceof Error ? error : new Error(String(error)));
  };

  const pump = () => {
    if (!lanes) return;
    for (const [index, slot] of lanes.entries()) {
      if (slot.busy) continue;
      while (finishing.length > 0 && !finishing[0].running.live) finishing.shift();
      const finish = finishing.shift();
      if (finish) {
        const { running, state } = finish;
        slot.busy = true;
        const chunk = record(index, "finish", running, state, 0);
        const ended = () => {
          slot.busy = false;
          if (chunk) {
            chunk.end = performance.now();
            chunk.stale = !running.live;
          }
        };
        slot.lane.finish({ pass: state.plan.pass, room: running.job.room, work: state.plan.finish(join(state.parts as Gathered[])) }).then(
          (light) => {
            ended();
            if (running.live) {
              state.light = light;
              advance(running);
            }
            pump();
            publish();
          },
          (error: unknown) => {
            ended();
            fail(running, error);
            pump();
            publish();
          },
        );
        continue;
      }
      const chosen = next();
      if (!chosen) break;
      const { running, pass } = chosen;
      const state = running.passes[pass];
      const part = state.queued.shift() as number;
      const range = state.ranges[part];
      slot.busy = true;
      const chunk = record(index, "gather", running, state, range[1] - range[0]);
      const { scene, sceneId } = running.job;
      slot.lane.run({ pass: state.plan.pass, room: running.job.room, scene, sceneId, samples: slice(state.plan.samples, range[0], range[1]) }).then(
        (gathered) => {
          slot.busy = false;
          if (trace && chunk) {
            chunk.end = performance.now();
            chunk.stale = !running.live;
            const passTrace = (trace.passes[chunk.pass] ??= { samples: 0, busyMs: 0, first: chunk.start, last: chunk.end });
            passTrace.samples += chunk.samples;
            passTrace.busyMs += chunk.end - chunk.start;
            passTrace.last = chunk.end;
            if (trace.batch && running.live) trace.batch.samples += chunk.samples;
          }
          if (running.live) land(running, state, part, gathered);
          pump();
          publish();
        },
        (error: unknown) => {
          slot.busy = false;
          fail(running, error);
          pump();
          publish();
        },
      );
    }
  };

  const submit = (job: BakeJob): Submitted => {
    if (job.passes.length === 0) throw new Error(`A bake job for ${job.room} has no passes`);
    const pool = (lanes ??= spawn().map((lane) => ({ lane, busy: false })));
    if (trace) trace.lanes = pool.length;
    if (since === null) {
      since = performance.now();
      if (trace) {
        trace.batch = { start: since, end: null, samples: 0 };
        trace.passes = {};
      }
    }
    const running: Running = {
      id: ids++,
      job,
      applied: 0,
      live: true,
      passes: job.passes.map((plan) => {
        const count = sampleCount(plan.samples);
        const size = Math.max(Math.ceil(LEAST_CHUNK / plan.cost), Math.ceil(count / (pool.length * 2)));
        const ranges: [number, number][] = [];
        for (let start = 0; start < count; start += size) ranges.push([start, Math.min(count, start + size)]);
        return { plan, count, ranges, queued: ranges.map((_, i) => i), parts: ranges.map(() => null), left: ranges.length, light: null, applied: deferred() };
      }),
    };
    const older = byKey.get(job.key);
    if (older) {
      drop(older);
      older.passes.forEach((state, i) => {
        state.applied.resolve(running.passes[Math.min(i, running.passes.length - 1)].applied.promise);
      });
    }
    jobs.push(running);
    byKey.set(job.key, running);
    total += running.passes.reduce((sum, state) => sum + state.count * state.plan.cost, 0);
    // A pass with no samples has nothing to gather: it only needs finishing.
    for (const state of running.passes) if (state.left === 0) finishing.push({ running, state });
    // Work starts once everything submitted alongside it is in (a layout lays every floor at once),
    // so the first lanes go to the rooms most wanted rather than to whichever came first.
    if (!pumpQueued) {
      pumpQueued = true;
      queueMicrotask(() => {
        pumpQueued = false;
        pump();
        publish();
      });
    }
    publish();
    const passes = running.passes.map((state) => state.applied.promise);
    return { passes, done: passes[passes.length - 1] };
  };

  return {
    submit,
    /** Drops the job for `key`, if any: what it lit is gone. */
    cancel: (key: string) => {
      const running = byKey.get(key);
      if (!running) return;
      drop(running);
      for (const state of running.passes) state.applied.resolve();
      publish();
    },
    /** How much each room is wanted now, asked as each lane frees: higher runs first. */
    setPriority: (want: Priority | null) => {
      priority = want ?? (() => 0);
    },
    status: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Lanes in the pool: as many as it will have once there is work. */
    lanes: () => lanes?.length ?? 0,
    /** Chunks and finishes waiting for a lane. */
    queued: () => finishing.length + jobs.reduce((sum, running) => sum + running.passes.reduce((each, state) => each + state.queued.length, 0), 0),
    /** Starts keeping the debug trace (and returns it); nothing is kept until asked. */
    trace: (): BakeTrace => {
      trace ??= { lanes: lanes?.length ?? 0, chunks: [], applies: [], passes: {}, batch: since === null ? null : { start: since, end: null, samples: 0 } };
      trace.lanes = lanes?.length ?? trace.lanes;
      return trace;
    },
    /** Ends every job unfinished and the lanes with them; new work spawns fresh lanes. */
    stop: () => {
      for (const running of [...jobs]) drop(running);
      finishing.length = 0;
      for (const slot of lanes ?? []) slot.lane.dispose();
      lanes = null;
      publish();
    },
  };
}

export type BakeScheduler = ReturnType<typeof createBakeScheduler>;

/** A lane that bakes in this thread: for tests, and where workers can't run. */
export function inlineLane(): Lane {
  const baker = inlineBaker();
  return {
    run: ({ pass, scene, sceneId, samples }) => baker(scene, sceneId, samples, pass),
    finish: ({ work }) => Promise.resolve(finishLight(work)),
    dispose: () => undefined,
  };
}

/** A scheduler of one lane in this thread. */
export function inlineScheduler(): BakeScheduler {
  return createBakeScheduler(() => [inlineLane()]);
}
