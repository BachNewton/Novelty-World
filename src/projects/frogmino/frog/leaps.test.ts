import { describe, expect, it } from "vitest";
import { FROG_THICKNESS } from "../run";
import { DECK_LENGTH, DECK_TOP } from "../world/structures";
import { FULL_TURN, dropPose, finishLeapPose, finishLeapSpin, gantryStand, leapProgress } from "./leaps";

const STEPS = Array.from({ length: 101 }, (_, k) => k / 100);

describe("leapProgress", () => {
  it("runs from 0 to 1 over the duration and stays at 1 after it", () => {
    expect(leapProgress(0, 0.5)).toBe(0);
    expect(leapProgress(0.25, 0.5)).toBe(0.5);
    expect(leapProgress(0.5, 0.5)).toBe(1);
    expect(leapProgress(2, 0.5)).toBe(1);
  });
});

describe("the drop", () => {
  const start = { fromDepth: -1, fromLevel: DECK_TOP };

  it("starts on the deck where the frog stood", () => {
    expect(dropPose(start, 0.5, 0)).toEqual({ depth: -1, level: DECK_TOP, height: DECK_TOP, spin: 0 });
  });

  it("lands on the road at the rules' depth", () => {
    const end = dropPose(start, 0.5, 1);
    expect(end.depth).toBeCloseTo(0.5);
    expect(end.level).toBeCloseTo(0);
    expect(end.height).toBeCloseTo(0);
  });

  it("leaps well up off the deck before it falls, and never turns", () => {
    expect(Math.max(...STEPS.map((p) => dropPose(start, 0.5, p).height))).toBeGreaterThan(DECK_TOP + 1);
    STEPS.forEach((p) => {
      expect(dropPose(start, 0.5, p).spin).toBe(0);
    });
  });

  it("only ever moves forward, and the camera's level never rises above the frog", () => {
    STEPS.slice(1).forEach((p, k) => {
      expect(dropPose(start, 0.5, p).depth).toBeGreaterThanOrEqual(dropPose(start, 0.5, STEPS[k]).depth);
      const pose = dropPose(start, 0.5, p);
      expect(pose.level).toBeLessThanOrEqual(pose.height + 1e-9);
    });
  });
});

describe("the finish leap", () => {
  const finishLine = 200;
  const start = { fromDepth: finishLine, fromLevel: 0 };

  it("starts on the road where the frog stood, unturned", () => {
    expect(finishLeapPose(start, finishLine, 0)).toEqual({ depth: finishLine, level: 0, height: 0, spin: 0 });
  });

  it("lands on the gantry's deck, within it, a full turn round", () => {
    const end = finishLeapPose(start, finishLine, 1);
    expect(end.depth).toBe(gantryStand(finishLine));
    expect(end.depth - FROG_THICKNESS).toBeGreaterThanOrEqual(finishLine);
    expect(end.depth).toBeLessThanOrEqual(finishLine + DECK_LENGTH);
    expect(end.level).toBe(DECK_TOP);
    expect(end.height).toBe(DECK_TOP);
    expect(end.spin).toBe(FULL_TURN);
  });

  it("is above the deck whenever the frog is past its near face", () => {
    STEPS.forEach((p) => {
      const pose = finishLeapPose(start, finishLine, p);
      if (pose.depth > finishLine) expect(pose.height).toBeGreaterThanOrEqual(DECK_TOP);
    });
  });

  it("spins one way only, from none to a full turn", () => {
    expect(finishLeapSpin(0)).toBe(0);
    expect(finishLeapSpin(1)).toBe(FULL_TURN);
    STEPS.slice(1).forEach((p, k) => {
      expect(finishLeapSpin(p)).toBeGreaterThanOrEqual(finishLeapSpin(STEPS[k]));
    });
  });
});
