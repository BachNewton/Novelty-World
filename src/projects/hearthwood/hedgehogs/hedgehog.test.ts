import { describe, expect, it } from "vitest";
import { TRANSITION } from "../animals/motion";
import { smoothness, turnOf } from "../animals/pose-checks";
import { generateHedgehog } from "./hedgehog";
import { hedgehogPose, type HedgehogActivity, type HedgehogMotionInput } from "./motion";
import { rigOf } from "./rig";

const hedgehog = generateHedgehog("motion");
const input = (changes: Partial<HedgehogMotionInput> = {}): HedgehogMotionInput => ({
  time: 10,
  travelled: 0,
  speed: 0.3,
  activity: "stand",
  previous: "stand",
  since: 0,
  greeting: 0,
  personality: hedgehog.personality,
  rig: rigOf(hedgehog.build),
  seed: 5,
  ...changes,
});

describe("a hedgehog", () => {
  it("is the same every time it is generated", () => {
    expect(generateHedgehog("a hedgehog")).toEqual(generateHedgehog("a hedgehog"));
  });

  it("blends smoothly between everything it does", () => {
    const activities: HedgehogActivity[] = ["stand", "walk", "run", "sit", "lie", "peek", "lie", "stand"];
    for (let i = 1; i < activities.length; i++) {
      const change = { previous: activities[i - 1], activity: activities[i], since: 5 };
      const { coarse, fine } = smoothness((t) => hedgehogPose(input({ ...change, time: t, travelled: t * 0.3 })), 5, 5 + TRANSITION + 0.1);
      // Its legs are short and quick, so they turn further each millisecond than a cat's; continuous all the same.
      expect(coarse).toBeLessThan(0.12);
      expect(fine).toBeLessThan(coarse * 0.35);
    }
  });

  it("curls into a ball: its back bent right round, its head tucked", () => {
    const ball = hedgehogPose(input({ activity: "lie", previous: "lie" }));
    expect(turnOf(ball, "chest")[0]).toBeGreaterThan(2);
    expect(turnOf(ball, "neck")[0]).toBeGreaterThan(0.5);
    expect(ball.blink).toBeGreaterThan(0.8);
  });

  it("peeks out of the ball with its head up and its eyes open", () => {
    const ball = hedgehogPose(input({ activity: "lie", previous: "lie" }));
    const peek = hedgehogPose(input({ activity: "peek", previous: "peek", time: 10.03 }));
    expect(turnOf(peek, "neck")[0]).toBeLessThan(turnOf(ball, "neck")[0] - 1);
    expect(peek.blink).toBeLessThan(0.5);
  });
});
