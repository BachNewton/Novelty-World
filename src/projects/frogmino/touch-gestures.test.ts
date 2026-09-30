import { describe, expect, it } from "vitest";
import type { FrogAction } from "./run";
import {
  GESTURE_TUNING,
  holdDeadline,
  NO_GESTURES,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  timeReached,
  zoneAt,
  type GestureState,
  type PointerSample,
  type TouchCommand,
} from "./touch-gestures";

const WIDTH = 360;
const CENTRE_X = 180;
const { tapSlop, laneStep, swipeDistance, holdDelay } = GESTURE_TUNING;

type Event =
  | { type: "down"; sample: PointerSample }
  | { type: "move"; sample: PointerSample }
  | { type: "up"; sample: PointerSample }
  | { type: "cancel"; id: number }
  | { type: "time"; time: number };

function at(x: number, y: number, time: number, id = 1): PointerSample {
  return { id, x, y, time };
}

// Feeds events in order, collecting every command.
function play(events: Event[], state: GestureState = NO_GESTURES): { state: GestureState; commands: TouchCommand[] } {
  const commands: TouchCommand[] = [];
  let current = state;
  for (const event of events) {
    const step =
      event.type === "down"
        ? pointerDown(current, event.sample, WIDTH)
        : event.type === "move"
          ? pointerMove(current, event.sample)
          : event.type === "up"
            ? pointerUp(current, event.sample)
            : event.type === "cancel"
              ? pointerCancel(current, event.id)
              : timeReached(current, event.time);
    current = step.state;
    commands.push(...step.commands);
  }
  return { state: current, commands };
}

const act = (action: FrogAction): TouchCommand => ({ kind: "act", action });

describe("zones", () => {
  it("splits the play area into thirds", () => {
    expect(zoneAt(10, WIDTH)).toBe("left");
    expect(zoneAt(CENTRE_X, WIDTH)).toBe("centre");
    expect(zoneAt(350, WIDTH)).toBe("right");
  });
});

describe("taps", () => {
  it("rotates on the sides and jumps forward in the centre, on lifting", () => {
    const tap = (x: number) =>
      play([
        { type: "down", sample: at(x, 300, 0) },
        { type: "up", sample: at(x, 300, 80) },
      ]).commands;
    expect(tap(40)).toEqual([act("rotateCcw")]);
    expect(tap(320)).toEqual([act("rotateCw")]);
    expect(tap(CENTRE_X)).toEqual([act("forward")]);
  });

  it("waits for the finger to lift", () => {
    expect(play([{ type: "down", sample: at(40, 300, 0) }]).commands).toEqual([]);
  });

  it("forgives a wobble inside the tap slop", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 300, 0) },
      { type: "move", sample: at(40 + tapSlop, 300 - tapSlop, 30) },
      { type: "up", sample: at(40 + tapSlop, 300 - tapSlop, 60) },
    ]);
    expect(commands).toEqual([act("rotateCcw")]);
  });

  it("is not a tap once the finger has left the slop, even if it comes back", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 300, 0) },
      { type: "move", sample: at(40, 300 - tapSlop - 5, 30) },
      { type: "move", sample: at(40, 300, 60) },
      { type: "up", sample: at(40, 300, 90) },
    ]);
    expect(commands).toEqual([]);
  });

  it("taps the side it came down on, wherever it lifts", () => {
    const { commands } = play([
      { type: "down", sample: at(119, 300, 0) },
      { type: "up", sample: at(119 + tapSlop, 300, 40) },
    ]);
    expect(commands).toEqual([act("rotateCcw")]);
  });
});

describe("drags", () => {
  it("moves one lane per step of travel, keeping pace mid-gesture", () => {
    const short = play([
      { type: "down", sample: at(CENTRE_X, 300, 0) },
      { type: "move", sample: at(CENTRE_X + laneStep - 1, 300, 20) },
    ]);
    expect(short.commands).toEqual([]);
    const further = play([{ type: "move", sample: at(CENTRE_X + laneStep, 300, 40) }], short.state);
    expect(further.commands).toEqual([act("right")]);
  });

  it("emits every lane crossed by one fast move", () => {
    const { commands } = play([
      { type: "down", sample: at(300, 300, 0) },
      { type: "move", sample: at(300 - laneStep * 3 - 5, 300, 16) },
    ]);
    expect(commands).toEqual([act("left"), act("left"), act("left")]);
  });

  it("moves back when the finger comes back", () => {
    const { commands } = play([
      { type: "down", sample: at(100, 300, 0) },
      { type: "move", sample: at(100 + laneStep * 2, 300, 20) },
      { type: "move", sample: at(100 + laneStep, 305, 40) },
      { type: "move", sample: at(100 - laneStep, 310, 60) },
    ]);
    expect(commands).toEqual([act("right"), act("right"), act("left"), act("left"), act("left")]);
  });

  it("never taps or swipes, even ending well off its axis", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 300, 0) },
      { type: "move", sample: at(40 + laneStep, 300, 20) },
      { type: "move", sample: at(40 + laneStep, 300 - swipeDistance * 3, 40) },
      { type: "up", sample: at(40 + laneStep, 300 - swipeDistance * 3, 60) },
    ]);
    expect(commands).toEqual([act("right")]);
  });

  it("counts the lifting position's lanes", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 300, 0) },
      { type: "up", sample: at(CENTRE_X + laneStep, 300, 30) },
    ]);
    expect(commands).toEqual([act("right")]);
  });
});

describe("swipes", () => {
  it("hops the moment an upward swipe goes far enough, before lifting", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 400, 0) },
      { type: "move", sample: at(CENTRE_X, 400 - swipeDistance + 1, 20) },
    ]);
    expect(commands).toEqual([]);
    const fired = play([
      { type: "down", sample: at(CENTRE_X, 400, 0) },
      { type: "move", sample: at(CENTRE_X, 400 - swipeDistance + 1, 20) },
      { type: "move", sample: at(CENTRE_X + 3, 400 - swipeDistance, 30) },
    ]);
    expect(fired.commands).toEqual([act("hop")]);
  });

  it("jumps back on a downward swipe", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 200, 0) },
      { type: "move", sample: at(40, 200 + swipeDistance, 20) },
    ]);
    expect(commands).toEqual([act("back")]);
  });

  it("fires once per gesture, however far it goes, and never taps too", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 400, 0) },
      { type: "move", sample: at(CENTRE_X, 400 - swipeDistance, 10) },
      { type: "move", sample: at(CENTRE_X, 400 - swipeDistance * 4, 20) },
      { type: "move", sample: at(CENTRE_X, 400 + swipeDistance * 4, 30) },
      { type: "move", sample: at(CENTRE_X + laneStep * 3, 400, 40) },
      { type: "up", sample: at(CENTRE_X, 400, 50) },
    ]);
    expect(commands).toEqual([act("hop")]);
  });

  it("does nothing when a vertical flick stops short", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 400, 0) },
      { type: "move", sample: at(CENTRE_X, 400 - tapSlop - 2, 20) },
      { type: "up", sample: at(CENTRE_X, 400 - tapSlop - 2, 40) },
    ]);
    expect(commands).toEqual([]);
  });

  it("fires on a lift that is the first sample past the threshold", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 400, 0) },
      { type: "up", sample: at(CENTRE_X, 400 - swipeDistance - 10, 30) },
    ]);
    expect(commands).toEqual([act("hop")]);
  });
});

describe("holding the centre", () => {
  const down = play([{ type: "down", sample: at(CENTRE_X, 300, 1000) }]);

  it("asks to be woken when the hold delay runs out", () => {
    expect(holdDeadline(down.state)).toBe(1000 + holdDelay);
    expect(holdDeadline(play([{ type: "down", sample: at(40, 300, 0) }]).state)).toBeNull();
  });

  it("holds the jump once the delay passes, and lets go on lifting, without a tap", () => {
    const early = play([{ type: "time", time: 1000 + holdDelay - 1 }], down.state);
    expect(early.commands).toEqual([]);
    const held = play([{ type: "time", time: 1000 + holdDelay }], early.state);
    expect(held.commands).toEqual([{ kind: "holdJump" }]);
    expect(holdDeadline(held.state)).toBeNull();
    const lifted = play([{ type: "up", sample: at(CENTRE_X, 300, 2000) }], held.state);
    expect(lifted.commands).toEqual([{ kind: "releaseJump" }]);
    expect(lifted.state.fingers.size).toBe(0);
  });

  it("can start from a move event's timestamp inside the slop", () => {
    const { commands } = play([{ type: "move", sample: at(CENTRE_X + 2, 301, 1000 + holdDelay + 5) }], down.state);
    expect(commands).toEqual([{ kind: "holdJump" }]);
  });

  it("ignores movement while held", () => {
    const { commands } = play(
      [
        { type: "time", time: 1000 + holdDelay },
        { type: "move", sample: at(CENTRE_X + laneStep * 3, 300 - swipeDistance * 2, 1500) },
        { type: "up", sample: at(CENTRE_X + laneStep * 3, 300 - swipeDistance * 2, 1600) },
      ],
      down.state,
    );
    expect(commands).toEqual([{ kind: "holdJump" }, { kind: "releaseJump" }]);
  });

  it("is a tap when lifted before the delay", () => {
    const { commands } = play([{ type: "up", sample: at(CENTRE_X, 300, 1000 + holdDelay - 1) }], down.state);
    expect(commands).toEqual([act("forward")]);
  });

  it("never holds a finger that has started moving", () => {
    const { commands } = play(
      [
        { type: "move", sample: at(CENTRE_X, 300 - tapSlop - 1, 1050) },
        { type: "time", time: 1000 + holdDelay * 2 },
      ],
      down.state,
    );
    expect(commands).toEqual([]);
  });

  it("does not hold on the sides", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 300, 0) },
      { type: "time", time: holdDelay * 3 },
      { type: "up", sample: at(40, 300, holdDelay * 4) },
    ]);
    expect(commands).toEqual([act("rotateCcw")]);
  });

  it("lets go when the browser cancels the finger", () => {
    const { commands, state } = play([{ type: "time", time: 1000 + holdDelay }, { type: "cancel", id: 1 }], down.state);
    expect(commands).toEqual([{ kind: "holdJump" }, { kind: "releaseJump" }]);
    expect(state.fingers.size).toBe(0);
  });
});

describe("several fingers", () => {
  it("tracks each finger as its own gesture", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 300, 0, 1) },
      { type: "down", sample: at(40, 500, 10, 2) },
      { type: "move", sample: at(40 + laneStep, 500, 20, 2) },
      { type: "time", time: holdDelay },
      { type: "move", sample: at(40 + laneStep * 2, 500, holdDelay + 20, 2) },
      { type: "up", sample: at(40 + laneStep * 2, 500, holdDelay + 30, 2) },
      { type: "up", sample: at(CENTRE_X, 300, holdDelay + 40, 1) },
    ]);
    expect(commands).toEqual([act("right"), { kind: "holdJump" }, act("right"), { kind: "releaseJump" }]);
  });

  it("holds with only one finger at a time; another centre finger taps", () => {
    const { commands } = play([
      { type: "down", sample: at(CENTRE_X, 300, 0, 1) },
      { type: "time", time: holdDelay },
      { type: "down", sample: at(CENTRE_X + 10, 400, holdDelay + 10, 2) },
      { type: "time", time: holdDelay * 3 },
      { type: "up", sample: at(CENTRE_X + 10, 400, holdDelay * 3 + 10, 2) },
      { type: "up", sample: at(CENTRE_X, 300, holdDelay * 3 + 20, 1) },
    ]);
    expect(commands).toEqual([{ kind: "holdJump" }, act("forward"), { kind: "releaseJump" }]);
  });

  it("gives each finger's tap once, with no double fire from a lifted finger's stray events", () => {
    const { commands } = play([
      { type: "down", sample: at(40, 300, 0, 1) },
      { type: "down", sample: at(320, 300, 5, 2) },
      { type: "up", sample: at(40, 300, 50, 1) },
      { type: "up", sample: at(40, 300, 55, 1) },
      { type: "move", sample: at(40, 100, 60, 1) },
      { type: "cancel", id: 1 },
      { type: "up", sample: at(320, 300, 70, 2) },
    ]);
    expect(commands).toEqual([act("rotateCcw"), act("rotateCw")]);
  });

  it("refuses a finger that comes down twice", () => {
    const { state } = play([{ type: "down", sample: at(40, 300, 0) }]);
    expect(() => pointerDown(state, at(50, 300, 10), WIDTH)).toThrow(/twice/);
  });
});
