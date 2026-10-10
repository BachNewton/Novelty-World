import { describe, expect, it } from "vitest";
import { isDrag, NO_PARTS, panOnFloor, partsUnderWay, spanOf, TAP_SLOP, tapAction } from "./gestures";

describe("isDrag", () => {
  it("is a tap within the slop, and a drag past it", () => {
    expect(isDrag({ x: 0, y: 0 }, { x: TAP_SLOP - 1, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: TAP_SLOP, y: 2 })).toBe(true);
  });
});

describe("partsUnderWay", () => {
  const start = spanOf({ x: 0, y: 0 }, { x: 100, y: 0 });
  const parts = (a: { x: number; y: number }, b: { x: number; y: number }) => partsUnderWay(start, spanOf(a, b), NO_PARTS);

  it("starts nothing while the fingers barely move", () => {
    expect(parts({ x: 0, y: 0 }, { x: 104, y: 5 })).toEqual(NO_PARTS);
  });

  it("zooms alone when the spread changes about a still middle, either way", () => {
    expect(parts({ x: -15, y: 0 }, { x: 115, y: 0 })).toEqual({ turn: false, tilt: false, zoom: true });
    expect(parts({ x: 15, y: 0 }, { x: 85, y: 0 })).toEqual({ turn: false, tilt: false, zoom: true });
  });

  it("turns alone when both fingers slide sideways together", () => {
    expect(parts({ x: 60, y: 0 }, { x: 160, y: 0 })).toEqual({ turn: true, tilt: false, zoom: false });
  });

  it("tilts alone when both fingers move up or down together", () => {
    expect(parts({ x: 0, y: -40 }, { x: 100, y: -40 })).toEqual({ turn: false, tilt: true, zoom: false });
  });

  it("turns and tilts on a diagonal drag", () => {
    expect(parts({ x: 30, y: 30 }, { x: 130, y: 30 })).toEqual({ turn: true, tilt: true, zoom: false });
  });

  it("does all three at once", () => {
    expect(parts({ x: 20, y: 30 }, { x: 180, y: 30 })).toEqual({ turn: true, tilt: true, zoom: true });
  });

  it("does nothing when the line between the fingers only turns", () => {
    const angle = (30 * Math.PI) / 180;
    expect(parts({ x: 50 - 50 * Math.cos(angle), y: -50 * Math.sin(angle) }, { x: 50 + 50 * Math.cos(angle), y: 50 * Math.sin(angle) })).toEqual(NO_PARTS);
  });

  it("turns too on a pinch with one finger still, once the middle has moved past its threshold", () => {
    // The moving finger's 30 px moves the middle 15 px: a zoom alone.
    expect(parts({ x: 0, y: 0 }, { x: 130, y: 0 })).toEqual({ turn: false, tilt: false, zoom: true });
    // At 40 px the middle has moved 20 px, so the turn begins too.
    expect(parts({ x: 0, y: 0 }, { x: 140, y: 0 })).toEqual({ turn: true, tilt: false, zoom: true });
  });

  it("keeps a part under way once begun, even back where it started", () => {
    expect(partsUnderWay(start, start, { turn: true, tilt: false, zoom: true })).toEqual({ turn: true, tilt: false, zoom: true });
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
