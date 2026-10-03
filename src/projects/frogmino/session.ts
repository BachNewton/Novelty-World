import { createStore, type StoreApi } from "zustand/vanilla";
import type { Course } from "./courses";
import { applyInput, createRun, playTo, type InputLog, type PlayerInput, type Run } from "./run";
import { frameTicks } from "./ticks";
import { TUNING, type Tuning } from "./tuning";

// A session owns one run of a course: its input log and its stepping. The
// game reads the run from it and sends it each player's inputs, by slot, and
// never knows where a player is. A local session, solo or local co-op, has
// every player on this device: an input takes effect at once, at the run's
// current tick, and goes into the log there. An online session will sit
// behind the same interface, owning the log the host orders.

export interface SessionState {
  course: Course;
  run: Run;
  // Every input of the run so far, each stamped with the tick it applied
  // at, from which the run can be replayed.
  log: InputLog;
  // How far real time has got into the run's next tick, from 0 up to 1. The
  // drawing runs this far on from the rules, so it never steps a tick at a
  // time.
  carry: number;
  // Bumped on every restart, so the drawing knows to snap rather than ease.
  runId: number;
}

export interface Session {
  // The session's state, to read and subscribe to.
  readonly store: StoreApi<SessionState>;
  // One player's input, by slot from 0.
  input: (player: number, input: PlayerInput) => void;
  // Runs as many ticks as a frame of `elapsed` seconds has brought due.
  frame: (elapsed: number) => void;
  restart: () => void;
}

function freshRun(course: Course, tuning: Tuning): Run {
  return createRun(course.row, tuning, { kinds: course.kinds, lanes: course.lanes });
}

// Solo is a local session with one player; local co-op, one with a player
// per frog on this device.
export function localSession(course: Course, tuning: Tuning = TUNING): Session {
  const store = createStore<SessionState>()(() => ({
    course,
    run: freshRun(course, tuning),
    log: [],
    carry: 0,
    runId: 0,
  }));
  return {
    store,
    input: (player, input) => {
      store.setState((s) => {
        const timed = { tick: s.run.tick, player, input };
        return { run: applyInput(s.run, timed), log: [...s.log, timed] };
      });
    },
    frame: (elapsed) => {
      store.setState((s) => {
        const { ticks, carry } = frameTicks(s.carry, elapsed, tuning.maxFrameDelta);
        return { run: playTo(s.run, s.run.tick + ticks, s.log), carry };
      });
    },
    restart: () => {
      store.setState((s) => ({ run: freshRun(course, tuning), log: [], carry: 0, runId: s.runId + 1 }));
    },
  };
}
