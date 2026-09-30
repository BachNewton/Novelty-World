"use client";

import { create } from "zustand";
import { COURSE_SEED, generateCourse, type Course } from "./course";
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
import { TUNING } from "./tuning";

const COURSE = generateCourse(COURSE_SEED, TUNING);

function freshRun(): Run {
  return createRun(COURSE.rows, TUNING, COURSE_SEED, { kind: COURSE.start, pullOffs: COURSE.pullOffs });
}

// Which of the course's rows each wall of the traffic is: the same for every
// run, since a run lines its traffic up from the course alone.
const TRAFFIC = freshRun().walls.map((wall) => wall.row);

interface FrogminoStore {
  course: Course;
  traffic: readonly number[];
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
  course: COURSE,
  traffic: TRAFFIC,
  run: freshRun(),
  runId: 0,
  act: (action) => set((s) => ({ run: applyAction(s.run, action) })),
  pressJump: (direction) => set((s) => ({ run: pressJump(s.run, direction) })),
  releaseJump: (direction) => set((s) => ({ run: releaseJump(s.run, direction) })),
  tick: (elapsed) => set((s) => ({ run: advance(s.run, elapsed) })),
  restart: () => set((s) => ({ run: freshRun(), runId: s.runId + 1 })),
}));
