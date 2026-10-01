"use client";

import { create } from "zustand";
import { COURSE_SEED } from "./course";
import {
  advance,
  applyAction,
  createRun,
  pressJump,
  releaseJump,
  type FrogAction,
  type JumpDirection,
  type Run,
} from "./run";
import { rowStream, type RowStream } from "./stream";
import { TUNING } from "./tuning";

const STREAM = rowStream(COURSE_SEED, TUNING);

function freshRun(): Run {
  return createRun(STREAM.row, TUNING, { kind: STREAM.start });
}

interface FrogminoStore {
  // The rows of traffic, which each wall of the run is one of.
  stream: RowStream;
  run: Run;
  // Bumped on every restart, so the drawing knows to snap rather than ease.
  runId: number;
  act: (action: FrogAction) => void;
  pressJump: (direction: JumpDirection) => void;
  // With no direction, lets go of every held jump.
  releaseJump: (direction?: JumpDirection) => void;
  tick: (elapsed: number) => void;
  restart: () => void;
}

export const useFrogminoStore = create<FrogminoStore>()((set) => ({
  stream: STREAM,
  run: freshRun(),
  runId: 0,
  act: (action) => set((s) => ({ run: applyAction(s.run, action) })),
  pressJump: (direction) => set((s) => ({ run: pressJump(s.run, direction) })),
  releaseJump: (direction) => set((s) => ({ run: releaseJump(s.run, direction) })),
  tick: (elapsed) => set((s) => ({ run: advance(s.run, elapsed) })),
  restart: () => set((s) => ({ run: freshRun(), runId: s.runId + 1 })),
}));
