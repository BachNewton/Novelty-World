import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { coopCourse } from "./courses";
import { advance, confirm, inserted, runAt, runHash, startTimeline, timelineFrom, withLog } from "./rollback";
import { replay, type FrogAction, type TimedInput } from "./run";
import { freshRun } from "./session";
import { TUNING } from "./tuning";

const ACTS: readonly FrogAction[] = ["left", "right", "rotateCcw", "rotateCw", "hop", "forward", "back"];
const start = () => freshRun(coopCourse(), TUNING);

describe("a timeline", () => {
  it("takes inputs late, in their place, to exactly the run a straight replay gives", () => {
    for (const seed of ["one", "two", "three"]) {
      const rng = createRng(seed);
      let timeline = startTimeline(start());
      // Every input, the confirmed ones too, from the start.
      let all: TimedInput[] = [];
      for (let tick = 0; tick < 1200; tick += 1 + Math.floor(rng.next() * 20)) {
        timeline = advance(timeline, tick);
        // Somewhere from the confirmed run up to now, as a late input lands.
        const from = timeline.base.tick;
        const at = from + Math.floor(rng.next() * (tick - from + 1));
        const action = ACTS[Math.floor(rng.next() * ACTS.length)];
        const input: TimedInput = { tick: at, player: Math.floor(rng.next() * 2), input: { kind: "act", action } };
        timeline = withLog(timeline, inserted(timeline.log, input));
        all = inserted(all, input);
        expect(runHash(timeline.run)).toBe(runHash(replay(start(), all, timeline.run.tick)));
        const due = Math.floor((tick - 100) / 50) * 50;
        if (due > timeline.base.tick) {
          const confirmed = confirm(timeline, due);
          timeline = confirmed.timeline;
          expect(confirmed.final.every((final) => final.tick < due)).toBe(true);
          expect(timeline.log.every((later) => later.tick >= due)).toBe(true);
          expect(runHash(timeline.base)).toBe(runHash(runAt(start(), all, due)));
        }
      }
    }
  });

  it("keeps a snapshot at every snapshot tick, before that tick's inputs", () => {
    let timeline = startTimeline(start());
    timeline = withLog(timeline, [{ tick: 0, player: 0, input: { kind: "act", action: "rotateCw" } }]);
    timeline = withLog(timeline, inserted(timeline.log, { tick: 20, player: 1, input: { kind: "act", action: "right" } }));
    timeline = advance(timeline, 35);
    expect(timeline.snapshots.map((s) => s.tick)).toEqual([10, 20, 30]);
    const col = start().frogs[1].col;
    expect(timeline.snapshots[1].frogs[1].col).toBe(col);
    expect(timeline.snapshots[2].frogs[1].col).toBe(col + 1);
  });

  it("re-runs from a new confirmed run to where it was", () => {
    let timeline = startTimeline(start());
    const log: TimedInput[] = [{ tick: 30, player: 0, input: { kind: "act", action: "forward" } }];
    timeline = advance(withLog(timeline, log), 120);
    const base = runAt(start(), log, 50);
    const again = timelineFrom(base, [], timeline.run.tick);
    expect(runHash(again.run)).toBe(runHash(timeline.run));
  });

  it("refuses an input before its confirmed run", () => {
    const timeline = advance(startTimeline(start()), 200);
    const confirmed = confirm(timeline, 100).timeline;
    expect(() => withLog(confirmed, [{ tick: 99, player: 0, input: { kind: "act", action: "hop" } }])).toThrow(/before the confirmed run/);
  });
});
