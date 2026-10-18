import { describe, expect, it } from "vitest";
import { TRANSITION } from "../animals/motion";
import { smoothness, turnOf } from "../animals/pose-checks";
import { generateDeer } from "./deer";
import { deerPose, DEER_ACTIVITIES } from "./motion";
import { rigOf } from "./rig";

const animal = generateDeer("motion");
const input = (changes: Record<string, unknown> = {}) => ({
  time: 10,
  travelled: 0,
  speed: 1,
  activity: "stand" as const,
  previous: "stand" as const,
  since: 0,
  greeting: 0,
  personality: animal.personality,
  rig: rigOf(animal.build),
  seed: 13,
  ...changes,
});

describe("a roe deer's pose", () => {
  it("is the same every time it is generated, and a pure function of its input", () => {
    expect(generateDeer("a roe deer")).toEqual(generateDeer("a roe deer"));
    expect(deerPose(input({ travelled: 1.2 }))).toEqual(deerPose(input({ travelled: 1.2 })));
  });

  it("blends smoothly between everything it does", () => {
    for (let i = 1; i < DEER_ACTIVITIES.length; i++) {
      const change = { previous: DEER_ACTIVITIES[i - 1], activity: DEER_ACTIVITIES[i], since: 5 };
      const { coarse, fine } = smoothness((t) => deerPose(input({ ...change, time: t, travelled: t * 1 })), 5, 5 + TRANSITION + 0.1);
      expect(coarse).toBeLessThan(0.08);
      expect(fine).toBeLessThan(coarse * 0.35);
    }
  });

  it("puts its head down to the grass to graze", () => {
    expect(turnOf(deerPose(input({ activity: "graze", previous: "graze" })), "neck")[0]).toBeGreaterThan(1);
  });
});
