"use client";

import { create } from "zustand";
import { COURSE_SEED } from "./course";
import {
  applyInput,
  createRun,
  playTo,
  type FrogAction,
  type HeldAction,
  type InputLog,
  type PlayerInput,
  type Run,
} from "./run";
import { rowStream, type RowStream } from "./stream";
import { frameTicks } from "./ticks";
import { TUNING } from "./tuning";

const STREAM = rowStream(COURSE_SEED, TUNING);

// Solo play is the first player's frog.
const PLAYER = 0;

function freshRun(): Run {
  return createRun(STREAM.row, TUNING, { kinds: [STREAM.start] });
}

interface FrogminoStore {
  // The rows of traffic, which each wall of the run is one of.
  stream: RowStream;
  run: Run;
  // Every input of the run so far, each stamped with the tick it applied at,
  // from which the run can be replayed.
  log: InputLog;
  // How far real time has got into the run's next tick, from 0 up to 1. The
  // drawing runs this far on from the rules, so it never steps a tick at a
  // time.
  carry: number;
  // Bumped on every restart, so the drawing knows to snap rather than ease.
  runId: number;
  act: (action: FrogAction) => void;
  press: (action: HeldAction) => void;
  // With no action, lets go of every held key.
  release: (action?: HeldAction) => void;
  // Runs as many ticks as a frame of `elapsed` seconds has brought due.
  frame: (elapsed: number) => void;
  restart: () => void;
}

// A local input takes effect at once, at the run's current tick, and goes
// into the log at that tick.
function record(s: FrogminoStore, input: PlayerInput): Pick<FrogminoStore, "run" | "log"> {
  const timed = { tick: s.run.tick, player: PLAYER, input };
  return { run: applyInput(s.run, timed), log: [...s.log, timed] };
}

export const useFrogminoStore = create<FrogminoStore>()((set) => ({
  stream: STREAM,
  run: freshRun(),
  log: [],
  carry: 0,
  runId: 0,
  act: (action) => set((s) => record(s, { kind: "act", action })),
  press: (action) => set((s) => record(s, { kind: "press", action })),
  release: (action) => set((s) => record(s, action === undefined ? { kind: "releaseAll" } : { kind: "release", action })),
  frame: (elapsed) =>
    set((s) => {
      const { ticks, carry } = frameTicks(s.carry, elapsed, TUNING.maxFrameDelta);
      return { run: playTo(s.run, s.run.tick + ticks, s.log), carry };
    }),
  restart: () => set((s) => ({ run: freshRun(), log: [], carry: 0, runId: s.runId + 1 })),
}));
