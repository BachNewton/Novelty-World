import { describe, expect, it } from "vitest";
import { TRANSITION } from "../animals/motion";
import { smoothness, turnOf } from "../animals/pose-checks";
import { generateSquirrel } from "./squirrel";
import { squirrelPose, SQUIRREL_ACTIVITIES } from "./motion";
import { rigOf } from "./rig";

const animal = generateSquirrel("motion");
const input = (changes: Record<string, unknown> = {}) => ({
  time: 10,
  travelled: 0,
  speed: 0.6,
  activity: "stand" as const,
  previous: "stand" as const,
  since: 0,
  greeting: 0,
  personality: animal.personality,
  rig: rigOf(animal.build),
  seed: 13,
  ...changes,
});

describe("a red squirrel's pose", () => {
  it("is the same every time it is generated, and a pure function of its input", () => {
    expect(generateSquirrel("a red squirrel")).toEqual(generateSquirrel("a red squirrel"));
    expect(squirrelPose(input({ travelled: 1.2 }))).toEqual(squirrelPose(input({ travelled: 1.2 })));
  });

  it("blends smoothly between everything it does", () => {
    for (let i = 1; i < SQUIRREL_ACTIVITIES.length; i++) {
      const change = { previous: SQUIRREL_ACTIVITIES[i - 1], activity: SQUIRREL_ACTIVITIES[i], since: 5 };
      const { coarse, fine } = smoothness((t) => squirrelPose(input({ ...change, time: t, travelled: t * 0.6 })), 5, 5 + TRANSITION + 0.1);
      expect(coarse).toBeLessThan(0.12);
      expect(fine).toBeLessThan(coarse * 0.35);
    }
  });

  it("carries its tail up over its back, and lays it flat to the bark on a trunk", () => {
    expect(turnOf(squirrelPose(input()), "tail0")[0]).toBeGreaterThan(1);
    expect(turnOf(squirrelPose(input({ activity: "cling", previous: "cling" })), "tail0")[0]).toBeLessThan(0.2);
  });
});
