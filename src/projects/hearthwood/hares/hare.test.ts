import { describe, expect, it } from "vitest";
import { TRANSITION } from "../animals/motion";
import { smoothness, turnOf } from "../animals/pose-checks";
import { generateHare } from "./hare";
import { harePose, HARE_ACTIVITIES } from "./motion";
import { rigOf } from "./rig";

const animal = generateHare("motion");
const input = (changes: Record<string, unknown> = {}) => ({
  time: 10,
  travelled: 0,
  speed: 0.8,
  activity: "stand" as const,
  previous: "stand" as const,
  since: 0,
  greeting: 0,
  personality: animal.personality,
  rig: rigOf(animal.build),
  seed: 13,
  ...changes,
});

describe("a mountain hare's pose", () => {
  it("is the same every time it is generated, and a pure function of its input", () => {
    expect(generateHare("a mountain hare")).toEqual(generateHare("a mountain hare"));
    expect(harePose(input({ travelled: 1.2 }))).toEqual(harePose(input({ travelled: 1.2 })));
  });

  it("blends smoothly between everything it does", () => {
    for (let i = 1; i < HARE_ACTIVITIES.length; i++) {
      const change = { previous: HARE_ACTIVITIES[i - 1], activity: HARE_ACTIVITIES[i], since: 5 };
      const { coarse, fine } = smoothness((t) => harePose(input({ ...change, time: t, travelled: t * 0.8 })), 5, 5 + TRANSITION + 0.1);
      expect(coarse).toBeLessThan(0.1);
      expect(fine).toBeLessThan(coarse * 0.35);
    }
  });

  it("sits bolt upright to look round, and lays its ears back flat in its form", () => {
    expect(turnOf(harePose(input({ activity: "sit", previous: "sit" })), "pelvis")[0]).toBeLessThan(-0.9);
    expect(turnOf(harePose(input({ activity: "lie", previous: "lie" })), "earL")[0]).toBeLessThan(-1);
  });
});
