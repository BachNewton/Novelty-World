"use client";

import { create } from "zustand";
import { COURSE_SEED, generateCourse, type CourseWall } from "./course";
import { advance, applyAction, createRun, type FrogAction, type Run } from "./run";
import { TUNING } from "./tuning";

const COURSE = generateCourse(COURSE_SEED, TUNING);

interface FrogminoStore {
  course: readonly CourseWall[];
  run: Run;
  // Bumped on every restart, so the drawing knows to snap rather than ease.
  runId: number;
  act: (action: FrogAction) => void;
  tick: (elapsed: number) => void;
  restart: () => void;
}

export const useFrogminoStore = create<FrogminoStore>()((set) => ({
  course: COURSE,
  run: createRun(COURSE, TUNING),
  runId: 0,
  act: (action) => set((s) => ({ run: applyAction(s.run, action) })),
  tick: (elapsed) => set((s) => ({ run: advance(s.run, elapsed) })),
  restart: () => set((s) => ({ run: createRun(COURSE, TUNING), runId: s.runId + 1 })),
}));
