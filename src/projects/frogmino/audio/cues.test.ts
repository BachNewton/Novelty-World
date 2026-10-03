import { describe, expect, it } from "vitest";
import { applyAction, createRun, playTo, pressHeld, type RuleRow, type RuleRows, type Run } from "../run";
import { toTicks } from "../ticks";
import { TUNING } from "../tuning";
import type { Cell, Gate } from "../types";
import { soundCues, type GameMoment, type SoundCue } from "./cues";

// Two ticks a frame.
const FRAME = 0.02;

function advance(run: Run, seconds: number): Run {
  return playTo(run, run.tick + toTicks(seconds));
}
// The row comes this far ahead of where the drop lands the frog.
const ROW_AHEAD = 12;
const WALL_DEPTH = TUNING.dropDistance + ROW_AHEAD;

function wholeFace(): Cell[] {
  const cells: Cell[] = [];
  for (let col = 0; col < TUNING.corridorCols; col++) {
    for (let row = 0; row < TUNING.wallRows; row++) cells.push({ col, row });
  }
  return cells;
}

// One row coming, then nothing within reach: a row with `cells` filled and
// `gates`.
function oneRow(cells: readonly Cell[], gates: readonly Gate[] = []): RuleRows {
  return (index): RuleRow => ({ solids: [{ cells, length: 2 }], gates, gap: index === 0 ? WALL_DEPTH : 1e6 });
}

// One row: no vehicle at all, or one filling the whole face.
function openOrSolid(open: boolean): RuleRows {
  return oneRow(open ? [] : wholeFace());
}

// No traffic within reach: one solid row far up the road.
const NOTHING: RuleRows = () => ({ solids: [{ cells: wholeFace(), length: 2 }], gates: [], gap: 1e6 });

// A frog dropped onto the road, with one row coming: wide open, or solid.
function runWithOneRow(open: boolean): Run {
  return applyAction(createRun(openOrSolid(open), TUNING), "forward");
}

// A row with a gate for the O in lanes 3 and 4, and every other cell filled.
function gateRow(): RuleRows {
  return oneRow(
    wholeFace().filter((cell) => cell.col !== 3 && cell.col !== 4),
    [{ lane: 3, kind: "O" }],
  );
}

// Plays frames until the row has reached the frog and gone by, but not so
// long that a row that bonked the frog reaches it again, hearing every change
// the way the game does.
function hearFrames(run: Run, seconds = ROW_AHEAD / TUNING.wallSpeed + 1): SoundCue[] {
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
    const standing = applyAction(createRun(NOTHING, TUNING), "forward");
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
    const bonked: Run = { ...before, lastBonk: { tick: before.tick, depth: WALL_DEPTH } };
    expect(soundCues(moment(before), moment(bonked), 4)).toEqual({ cues: [{ sound: "bonk" }], streak: 0 });
  });

  it("is silent across a restart, and starts the streak over", () => {
    const finished = runWithOneRow(true);
    const fresh = createRun(NOTHING, TUNING);
    expect(soundCues({ run: finished, runId: 0 }, { run: fresh, runId: 1 }, 5)).toEqual({ cues: [], streak: 0 });
  });

  it("sounds the gate once as the frog passes through one and becomes its piece", () => {
    // The upright L lined up with the gate.
    const lined = applyAction(applyAction(createRun(gateRow(), TUNING), "rotateCw"), "right");
    expect(lined.frogs[0]).toMatchObject({ col: 3, rotation: 1 });
    expect(soundsOf(hearFrames(applyAction(lined, "forward")))).toEqual(["pass", "gate"]);
  });

  it("sounds the gate once as the frog goes back through one, and not when the gate gives it the piece it has", () => {
    // Through the gate as the O, the frog jumps back out of it: the gate sets
    // the piece it already has, which is no transformation.
    const lined = applyAction(applyAction(createRun(gateRow(), TUNING), "rotateCw"), "right");
    let run = applyAction(lined, "forward");
    while (run.passes === 0) run = advance(run, FRAME);
    const back = applyAction(run, "back");
    expect(back.walls[0].passed).toBe(false);
    expect(soundCues({ run, runId: 0 }, { run: back, runId: 0 }, 0).cues).toEqual([]);
    // As an L, going back through the gate turns it into the O, once.
    const asL: Run = { ...run, frogs: [{ ...run.frogs[0], kind: "L", rotation: 1 }] };
    const turned = applyAction(asL, "back");
    expect(turned.frogs[0].kind).toBe("O");
    expect(soundsOf(soundCues({ run: asL, runId: 0 }, { run: turned, runId: 0 }, 0).cues)).toEqual(["gate"]);
  });

  it("sounds the drop once, as the frog leaves the overpass", () => {
    const up = createRun(openOrSolid(true), TUNING);
    const dropped = applyAction(up, "forward");
    expect(soundsOf(soundCues({ run: up, runId: 0 }, { run: dropped, runId: 0 }, 0).cues)).toEqual(["drop"]);
    // A held jump carries on along the road, and nothing drops again.
    expect(soundsOf(hearFrames(pressHeld(dropped, "forward"), 3))).not.toContain("drop");
  });

  it("is silent while rows go by beneath the frog on the overpass", () => {
    expect(hearFrames(createRun(openOrSolid(false), TUNING))).toEqual([]);
  });

  it("sounds the finish once, as the frog crosses the line, and never while the traffic goes by beneath", () => {
    const tuning = { ...TUNING, courseLength: 3 };
    const up = createRun(openOrSolid(false), tuning);
    // The held jump drops the frog and carries it over the line; the solid
    // row arrives after, beneath the finished frog.
    const pressed = pressHeld(up, "forward");
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
