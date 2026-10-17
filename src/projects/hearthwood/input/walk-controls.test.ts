import { describe, expect, it } from "vitest";
import { keyboardMove, keyboardTurn, moveInWorld, RUN_SPEED, stickMove, STICK_RADIUS, WALK_SPEED, walkSpeed } from "./walk-controls";

describe("walk controls", () => {
  it("moves ahead on W and the arrow, at the same speed on a diagonal", () => {
    expect(keyboardMove(new Set(["KeyW"]))).toEqual({ x: 0, y: 1 });
    expect(keyboardMove(new Set(["ArrowUp"]))).toEqual({ x: 0, y: 1 });
    const diagonal = keyboardMove(new Set(["KeyW", "KeyD"]));
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(keyboardMove(new Set(["KeyW", "KeyS"]))).toEqual({ x: 0, y: 0 });
  });

  it("turns the camera on Q and E", () => {
    expect(keyboardTurn(new Set(["KeyQ"]))).toBe(-1);
    expect(keyboardTurn(new Set(["KeyE"]))).toBe(1);
  });

  it("reads a touch stick up the screen as ahead, reaching full at its rim", () => {
    expect(stickMove({ x: 100, y: 100 }, { x: 100, y: 100 - STICK_RADIUS / 2 })).toEqual({ x: 0, y: 0.5 });
    const far = stickMove({ x: 100, y: 100 }, { x: 100 + STICK_RADIUS * 3, y: 100 });
    expect(far.x).toBeCloseTo(1);
  });

  it("walks at the push of the stick, and runs", () => {
    expect(walkSpeed({ x: 0, y: 0.5 }, false)).toBeCloseTo(WALK_SPEED / 2);
    expect(walkSpeed({ x: 0, y: 1 }, true)).toBe(RUN_SPEED);
  });

  it("walks the way the camera looks", () => {
    const ahead = moveInWorld({ x: 0, y: 1 }, Math.PI / 2);
    expect(ahead.x).toBeCloseTo(1);
    expect(ahead.z).toBeCloseTo(0);
    const right = moveInWorld({ x: 1, y: 0 }, 0);
    expect(right.x).toBeCloseTo(-1);
    expect(right.z).toBeCloseTo(0);
  });
});
