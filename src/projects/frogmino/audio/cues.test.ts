import { describe, expect, it } from "vitest";
import { advance, applyAction, createRun, type Run } from "../run";
import { TUNING } from "../tuning";
import type { Cell } from "../types";
import { soundCues, type GameMoment, type SoundCue } from "./cues";

const FRAME = 1 / 60;
const WALL_DEPTH = 12;

function wholeFace(): Cell[] {
  const cells: Cell[] = [];
  for (let col = 0; col < TUNING.corridorCols; col++) {
    for (let row = 0; row < TUNING.wallRows; row++) cells.push({ col, row });
  }
  return cells;
}

// A frog one jump onto the road, with one row coming: wide open, or solid.
function runWithOneRow(open: boolean): Run {
  const run = createRun([{ opening: open ? wholeFace() : [], depth: WALL_DEPTH }], TUNING, 1);
  return applyAction(run, "forward");
}

// Plays frames until the row has reached the frog and gone well by, hearing
// every change the way the game does.
function hearFrames(run: Run): SoundCue[] {
  const seconds = WALL_DEPTH / TUNING.wallSpeed + 2;
  let before: GameMoment = { run, runId: 0 };
  let streak = 0;
  const heard: SoundCue[] = [];
  for (let t = 0; t < seconds; t += FRAME) {
    const after = { run: advance(before.run, FRAME), runId: 0 };
    const result = soundCues(before, after, streak);
    heard.push(...result.cues);
    streak = result.streak;
    before = after;
  }
  return heard;
}

function soundsOf(cues: SoundCue[]): string[] {
  return cues.map((cue) => cue.sound);
}

describe("soundCues", () => {
  it("sounds a pass once for a row the frog fits", () => {
    expect(soundsOf(hearFrames(runWithOneRow(true)))).toEqual(["pass"]);
  });

  it("sounds a bonk once for a row the frog doesn't fit", () => {
    expect(soundsOf(hearFrames(runWithOneRow(false)))).toEqual(["bonk"]);
  });

  it("sounds a hop as it starts, and not again while the frog is up or lands", () => {
    const standing = createRun([], TUNING, 1);
    const hopping = applyAction(standing, "hop");
    expect(soundsOf(soundCues({ run: standing, runId: 0 }, { run: hopping, runId: 0 }, 0).cues)).toEqual(["hop"]);
    expect(hearFrames(hopping)).toEqual([]);
  });

  it("climbs the scale on clean passes in a row, and a bonk starts it over", () => {
    const before = runWithOneRow(true);
    const passed: Run = { ...before, walls: before.walls.map((wall) => ({ ...wall, passed: true })) };
    const moment = (run: Run): GameMoment => ({ run, runId: 0 });
    expect(soundCues(moment(before), moment(passed), 0)).toEqual({ cues: [{ sound: "pass", semitones: 0 }], streak: 1 });
    expect(soundCues(moment(before), moment(passed), 3).cues).toEqual([{ sound: "pass", semitones: 7 }]);
    const bonked: Run = { ...before, lastBonk: { time: before.time, depth: WALL_DEPTH } };
    expect(soundCues(moment(before), moment(bonked), 4)).toEqual({ cues: [{ sound: "bonk" }], streak: 0 });
  });

  it("is silent across a restart, and starts the streak over", () => {
    const finished = runWithOneRow(true);
    const fresh = createRun([], TUNING, 1);
    expect(soundCues({ run: finished, runId: 0 }, { run: fresh, runId: 1 }, 5)).toEqual({ cues: [], streak: 0 });
  });

  it("sounds a swap when the frog's piece changes", () => {
    const before = createRun([], TUNING, 1);
    const swapped: Run = { ...before, frog: { ...before.frog, kind: "T" } };
    expect(soundsOf(soundCues({ run: before, runId: 0 }, { run: swapped, runId: 0 }, 0).cues)).toEqual(["swap"]);
  });

  it("sounds the finish once, as the frog reaches the end", () => {
    const before = createRun([], TUNING, 1);
    const done: Run = { ...before, frog: { ...before.frog, depth: TUNING.courseLength } };
    expect(soundsOf(soundCues({ run: before, runId: 0 }, { run: done, runId: 0 }, 0).cues)).toEqual(["finish"]);
    expect(soundCues({ run: done, runId: 0 }, { run: done, runId: 0 }, 0).cues).toEqual([]);
  });
});
