import { describe, expect, it } from "vitest";
import type { FrogAction } from "../run";
import {
  GESTURE_TUNING,
  NO_GESTURES,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  zoneAt,
  type GestureState,
  type PointerSample,
} from "./touch-gestures";

const WIDTH = 360;
const CENTRE_X = 180;
const { tapSlop, laneStep, jumpStep } = GESTURE_TUNING;

type Event =
  | { type: "down"; sample: PointerSample }
  | { type: "move"; sample: PointerSample }
  | { type: "up"; sample: PointerSample }
  | { type: "cancel"; id: number };

function at(x: number, y: number, id = 1): PointerSample {
  return { id, x, y };
}

// Feeds events in order, collecting every action.
function play(events: Event[], state: GestureState = NO_GESTURES): { state: GestureState; actions: FrogAction[] } {
  const actions: FrogAction[] = [];
  let current = state;
  for (const event of events) {
    const step =
      event.type === "down"
        ? pointerDown(current, event.sample, WIDTH)
        : event.type === "move"
          ? pointerMove(current, event.sample)
          : event.type === "up"
            ? pointerUp(current, event.sample)
            : pointerCancel(current, event.id);
    current = step.state;
    actions.push(...step.actions);
  }
  return { state: current, actions };
}

describe("zones", () => {
  it("splits the play area into thirds", () => {
    expect(zoneAt(10, WIDTH)).toBe("left");
    expect(zoneAt(CENTRE_X, WIDTH)).toBe("centre");
    expect(zoneAt(350, WIDTH)).toBe("right");
  });
});

describe("taps", () => {
  it("rotates on the sides and hops in the centre, on lifting", () => {
    const tap = (x: number) =>
      play([
        { type: "down", sample: at(x, 300) },
        { type: "up", sample: at(x, 300) },
      ]).actions;
    expect(tap(40)).toEqual(["rotateCcw"]);
    expect(tap(320)).toEqual(["rotateCw"]);
    expect(tap(CENTRE_X)).toEqual(["hop"]);
  });

  it("waits for the finger to lift, however long it stays", () => {
    expect(play([{ type: "down", sample: at(CENTRE_X, 300) }]).actions).toEqual([]);
  });

  it("forgives a wobble inside the tap slop", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 300) },
      { type: "move", sample: at(40 + tapSlop, 300 - tapSlop) },
      { type: "up", sample: at(40 + tapSlop, 300 - tapSlop) },
    ]);
    expect(actions).toEqual(["rotateCcw"]);
  });

  it("is not a tap once the finger has left the slop, even if it comes back", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 300) },
      { type: "move", sample: at(40, 300 - tapSlop - 5) },
      { type: "move", sample: at(40, 300) },
      { type: "up", sample: at(40, 300) },
    ]);
    expect(actions).toEqual([]);
  });

  it("taps the zone it came down in, wherever it lifts", () => {
    const { actions } = play([
      { type: "down", sample: at(119, 300) },
      { type: "up", sample: at(119 + tapSlop, 300) },
    ]);
    expect(actions).toEqual(["rotateCcw"]);
  });
});

describe("sideways drags", () => {
  it("move one lane per step of travel, keeping pace mid-gesture", () => {
    const short = play([
      { type: "down", sample: at(CENTRE_X, 300) },
      { type: "move", sample: at(CENTRE_X + laneStep - 1, 300) },
    ]);
    expect(short.actions).toEqual([]);
    const further = play([{ type: "move", sample: at(CENTRE_X + laneStep, 300) }], short.state);
    expect(further.actions).toEqual(["right"]);
  });

  it("make every lane crossed by one fast move", () => {
    const { actions } = play([
      { type: "down", sample: at(300, 300) },
      { type: "move", sample: at(300 - laneStep * 3 - 5, 300) },
    ]);
    expect(actions).toEqual(["left", "left", "left"]);
  });

  it("move back when the finger comes back", () => {
    const { actions } = play([
      { type: "down", sample: at(100, 300) },
      { type: "move", sample: at(100 + laneStep * 2, 300) },
      { type: "move", sample: at(100 + laneStep, 305) },
      { type: "move", sample: at(100 - laneStep, 310) },
    ]);
    expect(actions).toEqual(["right", "right", "left", "left", "left"]);
  });

  it("stay locked sideways: drifting up never jumps, and lifting never taps", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 300) },
      { type: "move", sample: at(40 + laneStep, 300) },
      { type: "move", sample: at(40 + laneStep, 300 - jumpStep * 3) },
      { type: "up", sample: at(40 + laneStep, 300 - jumpStep * 3) },
    ]);
    expect(actions).toEqual(["right"]);
  });

  it("count the lifting position's lanes", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 300) },
      { type: "up", sample: at(CENTRE_X + laneStep, 300) },
    ]);
    expect(actions).toEqual(["right"]);
  });
});

describe("drags up and down", () => {
  it("jump forward one jump per step of travel up, the moment it gets there", () => {
    const short = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep + 1) },
    ]);
    expect(short.actions).toEqual([]);
    const further = play([{ type: "move", sample: at(CENTRE_X + 3, 400 - jumpStep) }], short.state);
    expect(further.actions).toEqual(["forward"]);
  });

  it("jump back on the way down, from any zone", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 200) },
      { type: "move", sample: at(40, 200 + jumpStep * 2) },
    ]);
    expect(actions).toEqual(["back", "back"]);
  });

  it("take jumps back when the finger comes back, and go on past where it started", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep * 3) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep) },
      { type: "move", sample: at(CENTRE_X, 400 + jumpStep) },
    ]);
    expect(actions).toEqual(["forward", "forward", "forward", "back", "back", "back", "back"]);
  });

  it("stay locked up and down: drifting sideways never slides, and lifting never taps", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep) },
      { type: "move", sample: at(CENTRE_X + laneStep * 3, 400 - jumpStep) },
      { type: "up", sample: at(CENTRE_X + laneStep * 3, 400 - jumpStep) },
    ]);
    expect(actions).toEqual(["forward"]);
  });

  it("do nothing when a flick stops short of a step", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X, 400 - tapSlop - 2) },
      { type: "up", sample: at(CENTRE_X, 400 - tapSlop - 2) },
    ]);
    expect(actions).toEqual([]);
  });

  it("count a lift that is the first sample past a step", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "up", sample: at(CENTRE_X, 400 - jumpStep - 10) },
    ]);
    expect(actions).toEqual(["forward"]);
  });

  it("lock to the axis the finger first left the slop along", () => {
    // Out of the slop more up than across: a jump drag, though it then goes
    // further across.
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X + tapSlop, 400 - tapSlop - 1) },
      { type: "move", sample: at(CENTRE_X + laneStep * 2, 400 - jumpStep) },
    ]);
    expect(actions).toEqual(["forward"]);
  });
});

describe("several fingers", () => {
  it("tracks each finger as its own gesture", () => {
    const { actions } = play([
      { type: "down", sample: at(CENTRE_X, 400, 1) },
      { type: "down", sample: at(40, 500, 2) },
      { type: "move", sample: at(40 + laneStep, 500, 2) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep, 1) },
      { type: "move", sample: at(40 + laneStep * 2, 500, 2) },
      { type: "up", sample: at(40 + laneStep * 2, 500, 2) },
      { type: "up", sample: at(CENTRE_X, 400 - jumpStep, 1) },
    ]);
    expect(actions).toEqual(["right", "forward", "right"]);
  });

  it("lets one finger tap to hop while another drags", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 500, 1) },
      { type: "move", sample: at(40, 500 - jumpStep, 1) },
      { type: "down", sample: at(CENTRE_X, 300, 2) },
      { type: "up", sample: at(CENTRE_X, 300, 2) },
      { type: "move", sample: at(40, 500 - jumpStep * 2, 1) },
    ]);
    expect(actions).toEqual(["forward", "hop", "forward"]);
  });

  it("gives each finger's tap once, with no double fire from a lifted finger's stray events", () => {
    const { actions } = play([
      { type: "down", sample: at(40, 300, 1) },
      { type: "down", sample: at(320, 300, 2) },
      { type: "up", sample: at(40, 300, 1) },
      { type: "up", sample: at(40, 300, 1) },
      { type: "move", sample: at(40, 100, 1) },
      { type: "cancel", id: 1 },
      { type: "up", sample: at(320, 300, 2) },
    ]);
    expect(actions).toEqual(["rotateCcw", "rotateCw"]);
  });

  it("never taps a finger the browser cancels, and keeps the steps it made", () => {
    const { actions, state } = play([
      { type: "down", sample: at(CENTRE_X, 400) },
      { type: "move", sample: at(CENTRE_X, 400 - jumpStep) },
      { type: "cancel", id: 1 },
      { type: "down", sample: at(CENTRE_X, 400, 2) },
      { type: "cancel", id: 2 },
    ]);
    expect(actions).toEqual(["forward"]);
    expect(state.fingers.size).toBe(0);
  });

  it("refuses a finger that comes down twice", () => {
    const { state } = play([{ type: "down", sample: at(40, 300) }]);
    expect(() => pointerDown(state, at(50, 300), WIDTH)).toThrow(/twice/);
  });
});
