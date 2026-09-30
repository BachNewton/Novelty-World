import { describe, expect, it } from "vitest";
import type { CourseWall } from "../course";
import { advance, applyAction, createRun, pressJump, type Run } from "../run";
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

// One row: no vehicle at all, or one filling the whole face.
function oneRow(open: boolean): CourseWall {
  return { solids: [{ cells: open ? [] : wholeFace(), length: 2 }], depth: WALL_DEPTH };
}

// A frog dropped onto the road, with one row coming: wide open, or solid.
function runWithOneRow(open: boolean): Run {
  return applyAction(createRun([oneRow(open)], TUNING, 1), "forward");
}

// Plays frames until the row has reached the frog and gone by, but not so
// long that a row that bonked the frog reaches it again, hearing every change
// the way the game does.
function hearFrames(run: Run, seconds = WALL_DEPTH / TUNING.wallSpeed + 1): SoundCue[] {
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
    const standing = applyAction(createRun([], TUNING, 1), "forward");
    const hopping = applyAction(standing, "hop");
    expect(soundsOf(soundCues({ run: standing, runId: 0 }, { run: hopping, runId: 0 }, 0).cues)).toEqual(["hop"]);
    expect(hearFrames(hopping)).toEqual([]);
  });

  it("climbs the scale on clean passes in a row, and a bonk starts it over", () => {
    const before = runWithOneRow(true);
    const passed: Run = { ...before, walls: before.walls.map((wall) => ({ ...wall, passed: true })), passes: before.passes + 1 };
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

  it("sounds the drop once, as the frog leaves the overpass", () => {
    const up = createRun([oneRow(true)], TUNING, 1);
    const dropped = applyAction(up, "forward");
    expect(soundsOf(soundCues({ run: up, runId: 0 }, { run: dropped, runId: 0 }, 0).cues)).toEqual(["drop"]);
    // A held jump carries on along the road, and nothing drops again.
    expect(soundsOf(hearFrames(pressJump(dropped, "forward"), 3))).not.toContain("drop");
  });

  it("is silent while rows go by beneath the frog on the overpass", () => {
    expect(hearFrames(createRun([oneRow(false)], TUNING, 1))).toEqual([]);
  });

  it("sounds the finish once, as the frog crosses the line, and never while the traffic goes by beneath", () => {
    const tuning = { ...TUNING, courseLength: 3 };
    const up = createRun([oneRow(false)], tuning, 1);
    // The held jump drops the frog and carries it over the line; the solid
    // row arrives after, beneath the finished frog.
    const pressed = pressJump(up, "forward");
    const heard = [...soundCues({ run: up, runId: 0 }, { run: pressed, runId: 0 }, 0).cues];
    let before: GameMoment = { run: pressed, runId: 0 };
    for (let t = 0; t < WALL_DEPTH / TUNING.wallSpeed + 2; t += FRAME) {
      const after = { run: advance(before.run, FRAME), runId: 0 };
      heard.push(...soundCues(before, after, 0).cues);
      before = after;
    }
    expect(soundsOf(heard)).toEqual(["drop", "finish"]);
  });
});
