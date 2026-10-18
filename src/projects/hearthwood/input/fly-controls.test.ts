import { describe, expect, it } from "vitest";
import { FLY_SPEED, keyboardRise, steppedSpeed, wheelSteps } from "./fly-controls";

describe("the free camera's controls", () => {
  it("rises on E or Space and sinks on Q or C", () => {
    expect(keyboardRise(new Set(["KeyE"]))).toBe(1);
    expect(keyboardRise(new Set(["Space"]))).toBe(1);
    expect(keyboardRise(new Set(["KeyQ"]))).toBe(-1);
    expect(keyboardRise(new Set(["KeyE", "KeyC"]))).toBe(0);
  });

  it("speeds up as the wheel rolls away, and slows as it rolls back", () => {
    expect(steppedSpeed(20, wheelSteps(-100))).toBeGreaterThan(20);
    expect(steppedSpeed(20, wheelSteps(100))).toBeLessThan(20);
    expect(steppedSpeed(20, wheelSteps(-100) + wheelSteps(100))).toBeCloseTo(20);
  });

  it("keeps the speed within its bounds", () => {
    expect(steppedSpeed(FLY_SPEED.start, 1000)).toBe(FLY_SPEED.max);
    expect(steppedSpeed(FLY_SPEED.start, -1000)).toBe(FLY_SPEED.min);
  });
});
