import { describe, expect, it } from "vitest";
import { classifyTwoFinger, isDrag, panOnFloor, spanOf, TAP_SLOP, tapAction, turnBetween } from "./gestures";

describe("isDrag", () => {
  it("is a tap within the slop, and a drag past it", () => {
    expect(isDrag({ x: 0, y: 0 }, { x: TAP_SLOP - 1, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: TAP_SLOP, y: 2 })).toBe(true);
  });
});

describe("classifyTwoFinger", () => {
  const start = spanOf({ x: 0, y: 0 }, { x: 100, y: 0 });

  it("waits while the fingers barely move", () => {
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: 0 }, { x: 104, y: 5 }))).toBe("pending");
  });

  it("is a pinch when the spread changes, either way", () => {
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: 0 }, { x: 130, y: 0 }))).toBe("pinch");
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: 0 }, { x: 70, y: 0 }))).toBe("pinch");
  });

  it("is a twist when the line between the fingers turns", () => {
    const turned = (degrees: number) => spanOf({ x: 0, y: 0 }, { x: 100 * Math.cos((degrees * Math.PI) / 180), y: 100 * Math.sin((degrees * Math.PI) / 180) });
    expect(classifyTwoFinger(start, turned(20))).toBe("twist");
    expect(classifyTwoFinger(start, turned(-20))).toBe("twist");
  });

  it("is a tilt when both fingers move up or down together", () => {
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: -40 }, { x: 100, y: -40 }))).toBe("tilt");
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: 30 }, { x: 100, y: 30 }))).toBe("tilt");
  });

  it("is no tilt when the fingers slide sideways together", () => {
    expect(classifyTwoFinger(start, spanOf({ x: 60, y: 0 }, { x: 160, y: 0 }))).toBe("pending");
  });

  it("goes with whichever passes its threshold by more", () => {
    // Spread up 10% (1.2 thresholds) and turned 24° (2 thresholds).
    const angle = (24 * Math.PI) / 180;
    expect(classifyTwoFinger(start, spanOf({ x: 0, y: 0 }, { x: 110 * Math.cos(angle), y: 110 * Math.sin(angle) }))).toBe("twist");
  });

  it("measures a turn the short way across the half-turn", () => {
    expect(turnBetween(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(turnBetween(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });
});

describe("tapAction", () => {
  it("commits a mouse click at once", () => {
    expect(tapAction("mouse", "a", null, 3)).toBe("commit");
  });

  it("focuses on a finger's first tap, and commits on a tap of the focused choice", () => {
    expect(tapAction("touch", "a", "b", 3)).toBe("focus");
    expect(tapAction("touch", "a", "a", 3)).toBe("commit");
  });

  it("commits on one tap when there is only one choice", () => {
    expect(tapAction("touch", "a", null, 1)).toBe("commit");
  });
});

describe("panOnFloor", () => {
  const close = (got: { x: number; z: number }, x: number, z: number) => {
    expect(got.x).toBeCloseTo(x);
    expect(got.z).toBeCloseTo(z);
  };

  it("with the camera looking along -z, pushes up into the screen and right along +x", () => {
    close(panOnFloor(0, -1, 0), 0, -1);
    close(panOnFloor(1, 0, 0), 1, 0);
  });

  it("turns with the camera", () => {
    // From +x, looking along -x: up the screen is -x, and the screen's right is -z.
    close(panOnFloor(0, -1, Math.PI / 2), -1, 0);
    close(panOnFloor(1, 0, Math.PI / 2), 0, -1);
  });

  it("is always away from the camera for a push up", () => {
    for (const yaw of [0.3, 1.9, -2.4]) {
      const move = panOnFloor(0, -1, yaw);
      // The camera stands back along (sin yaw, cos yaw).
      expect(move.x * Math.sin(yaw) + move.z * Math.cos(yaw)).toBeCloseTo(-1);
    }
  });
});
