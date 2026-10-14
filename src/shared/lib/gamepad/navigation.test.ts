import { describe, expect, it } from "vitest";
import { axisWay, NAV_AT_REST, NAV_TUNING, navStep, nextInDirection, type Direction, type NavHold } from "./navigation";
import { STANDARD_BUTTONS, type PadSnapshot, type StandardButton } from "./state";

describe("nextInDirection", () => {
  const box = (left: number, top: number, width = 80, height = 40) => ({ left, top, right: left + width, bottom: top + height });
  // Two buttons on a row, a wide one under them, and a small one on a row of its own at the bottom right.
  const boxes = [box(0, 0), box(100, 0), box(0, 60, 300), box(250, 120, 40, 20)];

  it("goes along a row, and stops at its ends", () => {
    expect(nextInDirection(boxes, 0, "right")).toBe(1);
    expect(nextInDirection(boxes, 1, "left")).toBe(0);
    expect(nextInDirection(boxes, 1, "right")).toBeNull();
    expect(nextInDirection(boxes, 2, "left")).toBeNull();
  });

  it("goes to the nearest row up or down, onto the control nearest across", () => {
    expect(nextInDirection(boxes, 0, "down")).toBe(2);
    expect(nextInDirection(boxes, 2, "up")).toBe(1);
    expect(nextInDirection(boxes, 2, "down")).toBe(3);
    expect(nextInDirection(boxes, 3, "up")).toBe(2);
    expect(nextInDirection(boxes, 0, "up")).toBeNull();
  });

  it("counts controls of different heights on one line as one row", () => {
    const line = [box(0, 0, 80, 44), box(100, 10, 30, 20)];
    expect(nextInDirection(line, 0, "right")).toBe(1);
    expect(nextInDirection(line, 0, "down")).toBeNull();
  });

  it("goes down a list and stops at its end", () => {
    const list = [box(0, 0, 300, 60), box(0, 70, 300, 60), box(0, 140, 300, 60)];
    expect(nextInDirection(list, 0, "down")).toBe(1);
    expect(nextInDirection(list, 1, "down")).toBe(2);
    expect(nextInDirection(list, 2, "down")).toBeNull();
    expect(nextInDirection(list, 1, "left")).toBeNull();
  });

  it("finds nothing among one control", () => {
    expect(nextInDirection([box(0, 0)], 0, "down")).toBeNull();
  });
});

describe("axisWay", () => {
  const THRESHOLDS = { press: 0.5, release: 0.35 };
  const way = (stick: number, was: "left" | "right" | null, pad: [boolean, boolean] = [false, false]) =>
    axisWay(stick, pad[0], pad[1], ["left", "right"], was, THRESHOLDS);

  it("holds a way past the press threshold, and lets go inside the release one", () => {
    expect(way(0.45, null)).toBeNull();
    expect(way(0.55, null)).toBe("right");
    expect(way(0.4, "right")).toBe("right");
    expect(way(0.3, "right")).toBeNull();
    expect(way(-0.6, "right")).toBe("left");
  });

  it("lets the d-pad win, and a d-pad pressed both ways fall back to the stick", () => {
    expect(way(0.9, null, [true, false])).toBe("left");
    expect(way(0.9, null, [true, true])).toBe("right");
  });
});

function pad({ held = [], axes = [0, 0, 0, 0], standard = true }: { held?: StandardButton[]; axes?: number[]; standard?: boolean } = {}): PadSnapshot {
  return {
    index: 0,
    id: "Xbox Wireless Controller",
    standard,
    buttons: STANDARD_BUTTONS.map((name) => ({ pressed: held.includes(name), value: held.includes(name) ? 1 : 0 })),
    axes,
  };
}

/** Runs frames of a pad at the given times, returning each frame's move. */
function moves(frames: readonly [number, PadSnapshot | null][], start: NavHold = NAV_AT_REST): (Direction | null)[] {
  let hold = start;
  return frames.map(([now, snapshot]) => {
    const step = navStep(hold, snapshot, now);
    hold = step.hold;
    return step.move;
  });
}

describe("navStep", () => {
  const { delay, interval } = NAV_TUNING;
  const down = pad({ held: ["DpadDown"] });

  it("moves once on a press, and not again while held short of the delay", () => {
    expect(moves([[0, down], [16, down], [delay - 1, down], [delay + 50, pad()]])).toEqual(["down", null, null, null]);
  });

  it("repeats a held way after the delay, then every interval, a move a frame at most", () => {
    const frames: [number, PadSnapshot][] = [[0, down], [16, down], [delay, down], [delay + interval - 1, down], [delay + interval, down], [delay + 10 * interval, down], [delay + 10 * interval + 1, down]];
    expect(moves(frames)).toEqual(["down", null, "down", null, "down", "down", null]);
  });

  it("never repeats a tap that one slow frame spans", () => {
    expect(moves([[0, down], [delay + 100, down], [delay + 116, pad()]])).toEqual(["down", null, null]);
    expect(moves([[0, down], [delay + 100, down], [delay + 116, down]])).toEqual(["down", null, "down"]);
  });

  it("moves at once on a new press after a release, or a flick to the other way", () => {
    const up = pad({ held: ["DpadUp"] });
    expect(moves([[0, down], [10, pad()], [20, down], [30, up]])).toEqual(["down", null, "down", "up"]);
  });

  it("reads the stick past its threshold, with play's hysteresis", () => {
    const tilt = (y: number) => pad({ axes: [0, y, 0, 0] });
    expect(moves([[0, tilt(0.3)], [10, tilt(0.8)], [20, tilt(0.6)], [30, tilt(0.3)], [40, tilt(0.8)]])).toEqual([null, "down", null, null, "down"]);
    expect(moves([[0, pad({ axes: [-0.9, 0, 0, 0] })]])).toEqual(["left"]);
  });

  it("lets a way added to a held one take over, and the one left held wait a delay", () => {
    const both = pad({ held: ["DpadDown", "DpadRight"] });
    const right = pad({ held: ["DpadRight"] });
    expect(moves([[0, down], [10, both], [20, right], [30, right], [20 + delay, right]])).toEqual(["down", "right", null, null, "right"]);
  });

  it("points nowhere for a pad that left, or one whose layout isn't standard", () => {
    expect(moves([[0, down], [10, null], [20, down]])).toEqual(["down", null, "down"]);
    expect(moves([[0, pad({ held: ["DpadDown"], standard: false })]])).toEqual([null]);
  });
});
