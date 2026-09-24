import { describe, expect, it } from "vitest";
import {
  STICK_DEADZONE,
  STICK_RADIUS_PX,
  stickDeflection,
  stickToKeys,
} from "./virtual-stick";

const R = STICK_RADIUS_PX;

function keysFor(dx: number, dy: number): string[] {
  return stickToKeys(stickDeflection(dx, dy, R));
}

describe("stickDeflection", () => {
  it("reads centered inside the deadzone", () => {
    const d = stickDeflection(R * STICK_DEADZONE * 0.5, 0, R);
    expect(d).toEqual({ nx: 0, ny: 0, mag: 0 });
  });

  it("reads centered for a zero vector", () => {
    expect(stickDeflection(0, 0, R)).toEqual({ nx: 0, ny: 0, mag: 0 });
  });

  it("normalizes direction and scales magnitude with tilt", () => {
    const d = stickDeflection(R / 2, 0, R);
    expect(d.nx).toBeCloseTo(1);
    expect(d.ny).toBeCloseTo(0);
    expect(d.mag).toBeCloseTo(0.5);
  });

  it("clamps magnitude at full tilt", () => {
    expect(stickDeflection(R * 3, 0, R).mag).toBe(1);
  });
});

describe("stickToKeys", () => {
  it("maps cardinals to single keys", () => {
    expect(keysFor(0, -R)).toEqual(["KeyW"]);
    expect(keysFor(0, R)).toEqual(["KeyS"]);
    expect(keysFor(-R, 0)).toEqual(["KeyA"]);
    expect(keysFor(R, 0)).toEqual(["KeyD"]);
  });

  it("maps diagonals to both keys, dominant axis last", () => {
    expect(keysFor(R, -R / 2)).toEqual(["KeyW", "KeyD"]);
    expect(keysFor(R / 2, -R)).toEqual(["KeyD", "KeyW"]);
    expect(keysFor(-R, R)).toEqual(["KeyS", "KeyA"]);
  });

  it("produces no keys inside the deadzone", () => {
    expect(keysFor(1, 1)).toEqual([]);
  });
});
