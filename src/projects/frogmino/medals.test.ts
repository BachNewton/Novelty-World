import { describe, expect, it } from "vitest";
import { COOP_COURSES } from "./coop-courses";
import { coopCourse, courseOf, soloCourse, startRun } from "./courses";
import { checkMedalTimes, formatTime, heldJumpTicks, medalFor, type MedalTimes } from "./medals";
import { SAVED_REPLAYS } from "./proof/saved-replays";
import { applyAction, createRun, playTo, pressHeld, replay, runTime, type Run, type RuleRows } from "./run";
import { localSession } from "./session";
import { tickTiming, toTicks } from "./ticks";
import { TUNING } from "./tuning";

const TIMES: MedalTimes = { gold: 60, silver: 80, bronze: 115 };

// A road with no traffic on it: a single empty row far beyond the finish.
const EMPTY_ROAD: RuleRows = () => ({ solids: [{ cells: [], length: 1 }], gates: [], gap: 1e6 });

function emptyRun(): Run {
  return createRun(EMPTY_ROAD, TUNING);
}

describe("the run's clock", () => {
  it("doesn't start while the team lines up on the overpass", () => {
    let run = playTo(emptyRun(), 300);
    run = applyAction(applyAction(run, "left"), "rotateCw");
    run = playTo(run, 450);
    expect(runTime(run)).toBe(0);
  });

  it("starts as the team drops off the overpass, and counts the rules' ticks from there", () => {
    const dropped = applyAction(playTo(emptyRun(), 250), "forward");
    expect(dropped.droppedAt).toBe(250);
    expect(runTime(dropped)).toBe(0);
    expect(runTime(playTo(dropped, 250 + 1234))).toBe(1234);
  });

  it("stops as the team crosses the finish line, while the rules' clock runs on", () => {
    let run = pressHeld(playTo(emptyRun(), 50), "forward");
    while (run.finishedAt === null) run = playTo(run, run.tick + 1);
    const time = runTime(run);
    expect(time).toBe(run.finishedAt - 50);
    const later = playTo(run, run.tick + tickTiming(TUNING).finishLeap + 500);
    expect(runTime(later)).toBe(time);
  });

  it("times a held jump on an empty road at the held-jump floor", () => {
    let run = pressHeld(playTo(emptyRun(), 80), "forward");
    while (run.finishedAt === null) run = playTo(run, run.tick + 1);
    expect(runTime(run)).toBe(heldJumpTicks(TUNING, TUNING.courseLength));
  });

  it("times a held jump to a course's own finish, where the course puts it", () => {
    let run = pressHeld(playTo(createRun(EMPTY_ROAD, TUNING, { courseLength: 100 }), 80), "forward");
    while (run.finishedAt === null) run = playTo(run, run.tick + 1);
    expect(run.depth).toBeGreaterThanOrEqual(100);
    expect(run.depth).toBeLessThan(100 + TUNING.depthStep);
    expect(runTime(run)).toBe(heldJumpTicks(TUNING, 100));
  });

  it.each(Object.keys(SAVED_REPLAYS))("gives %s the same time however its frames are chunked", (name) => {
    const proof = SAVED_REPLAYS[name];
    const course = courseOf(proof.course);
    const start = () => startRun(course);
    const whole = replay(start(), proof.log, proof.until);
    expect(whole.finishedAt).not.toBeNull();
    for (const chunk of [1, 7, 100, 1013]) {
      let run = replay(start(), proof.log, 0);
      while (run.tick < proof.until) run = playTo(run, Math.min(proof.until, run.tick + chunk), proof.log);
      expect(runTime(run)).toBe(runTime(whole));
    }
  });

  it("is the same in a session played frame by frame as in a replay of its log", () => {
    const session = localSession(soloCourse());
    session.frame(0.5);
    session.input(0, { kind: "press", action: "forward" });
    for (let i = 0; i < 400; i++) session.frame((1 / 60) * (0.5 + (i % 3)));
    const { run, log, course } = session.store.getState();
    expect(runTime(run)).toBeGreaterThan(0);
    const replayed = replay(startRun(course), log, run.tick);
    expect(runTime(replayed)).toBe(runTime(run));
  });
});

describe("medals", () => {
  it("earns the best medal whose time the run is at or under", () => {
    expect(medalFor(0, TIMES)).toBe("gold");
    expect(medalFor(6000, TIMES)).toBe("gold");
    expect(medalFor(6001, TIMES)).toBe("silver");
    expect(medalFor(8000, TIMES)).toBe("silver");
    expect(medalFor(8001, TIMES)).toBe("bronze");
    expect(medalFor(11500, TIMES)).toBe("bronze");
    expect(medalFor(11501, TIMES)).toBeNull();
  });

  it("fails loudly on medal times out of order, or not times at all", () => {
    expect(() => checkMedalTimes({ gold: 80, silver: 80, bronze: 115 })).toThrow(/gold < silver < bronze/);
    expect(() => checkMedalTimes({ gold: 60, silver: 120, bronze: 115 })).toThrow(/gold < silver < bronze/);
    expect(() => checkMedalTimes({ gold: 0, silver: 80, bronze: 115 })).toThrow(/gold time/);
    expect(() => checkMedalTimes({ gold: 60, silver: Number.NaN, bronze: 115 })).toThrow(/silver time/);
    expect(checkMedalTimes(TIMES)).toBe(TIMES);
  });

  it("has every playable course declare medal times in order", () => {
    for (const course of [soloCourse(), ...COOP_COURSES.map((c) => coopCourse(c.id))]) expect(checkMedalTimes(course.medals)).toBe(course.medals);
  });

  it("sets every course's gold slower than a held jump with nothing in its way", () => {
    for (const course of [soloCourse(), ...COOP_COURSES.map((c) => coopCourse(c.id))]) expect(toTicks(course.medals.gold)).toBeGreaterThan(heldJumpTicks(TUNING, course.length));
  });
});

describe("a time as shown", () => {
  it("reads as minutes, seconds and hundredths, or tenths", () => {
    expect(formatTime(0)).toBe("0:00.00");
    expect(formatTime(9079)).toBe("1:30.79");
    expect(formatTime(9079, true)).toBe("1:30.7");
    expect(formatTime(605)).toBe("0:06.05");
  });
});
