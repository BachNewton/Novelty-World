import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { coopPlaceholderCourse, soloCourse } from "./courses";
import { seatedSink, SOLO_SEATING } from "./input/devices";
import { EMPTY_LINEUP, join, lineupSeating } from "./input/lineup";
import { createRun, replay, type FrogAction, type HeldAction, type PlayerInput } from "./run";
import { localSession } from "./session";
import { TUNING } from "./tuning";
import { PREVIEW_LANES } from "./world/preview-rows";

const FRAME = 1 / 60;

describe("a solo session", () => {
  it("plays the row stream on its own road with one frog, as solo always has", () => {
    const session = localSession(soloCourse());
    const { run, log } = session.store.getState();
    expect(run.frogs).toHaveLength(1);
    expect(run.lanes).toBe(TUNING.corridorCols);
    expect(log).toEqual([]);
  });

  it("applies an input at once, at the run's tick, and logs it there", () => {
    const session = localSession(soloCourse());
    // A long frame is clamped, so a backgrounded tab doesn't lurch on.
    session.frame(0.1);
    session.frame(5);
    session.frame(0.05);
    const tick = session.store.getState().run.tick;
    expect(tick).toBe(25);
    session.input(0, { kind: "act", action: "forward" });
    const { run, log } = session.store.getState();
    expect(run.droppedAt).toBe(tick);
    expect(log).toEqual([{ tick, player: 0, input: { kind: "act", action: "forward" } }]);
  });

  it("drives player 0 from every device", () => {
    const session = localSession(soloCourse());
    const sink = seatedSink(SOLO_SEATING, session);
    sink.input("keys", { kind: "act", action: "rotateCw" });
    sink.input("touch", { kind: "act", action: "rotateCw" });
    sink.input("pad:3", { kind: "act", action: "rotateCw" });
    expect(session.store.getState().log.map((input) => input.player)).toEqual([0, 0, 0]);
  });

  it("starts afresh on a restart, and says so", () => {
    const session = localSession(soloCourse());
    session.frame(0.1);
    session.input(0, { kind: "act", action: "left" });
    session.restart();
    const { run, log, carry, runId } = session.store.getState();
    expect(run.tick).toBe(0);
    expect(log).toEqual([]);
    expect(carry).toBe(0);
    expect(runId).toBe(1);
  });
});

describe("a local co-op session", () => {
  it("plays the placeholder course at the width it is given, a frog per player", () => {
    for (const lanes of PREVIEW_LANES) {
      const { run } = localSession(coopPlaceholderCourse(lanes)).store.getState();
      expect(run.lanes).toBe(lanes);
      expect(run.frogs.map((frog) => frog.kind)).toEqual(["L", "J"]);
      // Side by side: the flat L's three lanes, then the J.
      expect(run.frogs[1].col).toBeGreaterThanOrEqual(run.frogs[0].col + 3);
    }
  });

  it("routes each joined device to its own frog, and drops an unseated one's inputs", () => {
    const session = localSession(coopPlaceholderCourse(10));
    const sink = seatedSink(lineupSeating(join(join(EMPTY_LINEUP, "keys:right"), "pad:0")), session);
    sink.input("pad:0", { kind: "act", action: "right" });
    sink.input("keys:right", { kind: "act", action: "left" });
    sink.input("keys:left", { kind: "act", action: "left" });
    expect(session.store.getState().log.map((input) => input.player)).toEqual([1, 0]);
  });

  it("fails loudly on an input for a player with no frog", () => {
    const session = localSession(coopPlaceholderCourse(9));
    expect(() => {
      session.input(2, { kind: "act", action: "hop" });
    }).toThrow(/no frog for player 2/);
  });

  it("replays its recorded log to exactly the run it played, whatever the frames", () => {
    const course = coopPlaceholderCourse(10);
    const session = localSession(course);
    const random = createRng("frogmino-session-replay").next;
    const ACTS: readonly FrogAction[] = ["left", "right", "rotateCcw", "rotateCw", "hop", "forward", "back"];
    const HELD: readonly HeldAction[] = ["forward", "back", "left", "right"];
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    // Into play first, then two players pressing, holding and letting go.
    session.input(0, { kind: "act", action: "forward" });
    for (let i = 0; i < 1500; i++) {
      session.frame(FRAME * (0.25 + random() * 3));
      if (random() < 0.4) {
        const roll = random();
        const input: PlayerInput =
          roll < 0.55
            ? { kind: "act", action: pick(ACTS) }
            : roll < 0.75
              ? { kind: "press", action: pick(HELD) }
              : roll < 0.95
                ? { kind: "release", action: pick(HELD) }
                : { kind: "releaseAll" };
        session.input(random() < 0.5 ? 0 : 1, input);
      }
    }
    const { run, log } = session.store.getState();
    expect(new Set(log.map((input) => input.player))).toEqual(new Set([0, 1]));
    expect(run.passes + (run.lastBonk === null ? 0 : 1)).toBeGreaterThan(0);
    const start = createRun(course.row, TUNING, { kinds: course.kinds, lanes: course.lanes });
    expect(replay(start, log, run.tick)).toEqual(run);
  }, 30_000);
});
