import { describe, expect, it } from "vitest";
import { generateCat } from "./cat";
import { burst, catPose, reach, TRANSITION, type Activity, type MotionInput } from "./motion";
import { rigOf, type BoneName } from "./rig";

const cat = generateCat("motion");
const input = (changes: Partial<MotionInput> = {}): MotionInput => ({
  time: 10,
  travelled: 0,
  speed: 0.5,
  activity: "stand",
  previous: "stand",
  since: 0,
  greeting: 0,
  personality: cat.personality,
  rig: rigOf(cat.build),
  seed: 7,
  ...changes,
});

/** The biggest jump of any bone's turn, or the pelvis, between two poses. */
function jump(a: ReturnType<typeof catPose>, b: ReturnType<typeof catPose>): number {
  let most = Math.max(...a.pelvis.map((v, i) => Math.abs(v - b.pelvis[i])));
  for (const [bone, turn] of a.rotations) {
    const other = b.rotations.get(bone) as readonly number[];
    most = Math.max(most, ...turn.map((v, i) => Math.abs(v - other[i])));
  }
  return most;
}

describe("reach", () => {
  it("puts the end of two segments on a target in reach", () => {
    const [a1, a2] = reach([0, 0], [-0.15, 0.03], 0.1, 0.09, -1);
    const end = [-Math.cos(a1) * 0.1 - Math.cos(a2) * 0.09, -Math.sin(a1) * 0.1 - Math.sin(a2) * 0.09];
    expect(end[0]).toBeCloseTo(-0.15, 4);
    expect(end[1]).toBeCloseTo(0.03, 4);
  });

  it("bends a knee forward and an elbow back", () => {
    const [knee] = reach([0, 0], [-0.15, 0], 0.1, 0.09, -1);
    const [elbow] = reach([0, 0], [-0.15, 0], 0.1, 0.09, 1);
    expect(-Math.sin(knee)).toBeGreaterThan(0);
    expect(-Math.sin(elbow)).toBeLessThan(0);
  });
});

describe("a pose", () => {
  it("is a pure function of its input", () => {
    expect(catPose(input({ activity: "walk", travelled: 1.3 }))).toEqual(catPose(input({ activity: "walk", travelled: 1.3 })));
  });

  // A pop is a jump that doesn't shrink with the step: sampled five times
  // finer, a continuous movement turns each bone a fifth as far between
  // samples, while a pop stays the size it was.
  const worstStep = (pose: (t: number) => ReturnType<typeof catPose>, from: number, to: number, step: number) => {
    let worst = 0;
    let last = pose(from);
    for (let t = from + step; t < to; t += step) {
      const next = pose(t);
      worst = Math.max(worst, jump(last, next));
      last = next;
    }
    return worst;
  };
  const expectSmooth = (pose: (t: number) => ReturnType<typeof catPose>, from: number, to: number) => {
    const coarse = worstStep(pose, from, to, 0.001);
    const fine = worstStep(pose, from, to, 0.0002);
    expect(coarse).toBeLessThan(0.05);
    expect(fine).toBeLessThan(coarse * 0.35);
  };

  it("never jumps through a walk", () => {
    expectSmooth((t) => catPose(input({ activity: "walk", time: t, travelled: t * 0.5 })), 0, 1.5);
  });

  it("blends smoothly from one activity into the next", () => {
    const activities: Activity[] = ["stand", "walk", "sit", "loaf", "stand"];
    for (let i = 1; i < activities.length; i++) {
      const change = { previous: activities[i - 1], activity: activities[i], since: 5 };
      expectSmooth((t) => catPose(input({ ...change, time: t, travelled: t * 0.5 })), 5, 5 + TRANSITION + 0.1);
    }
  });

  it("keeps its eyes between open and shut", () => {
    for (let t = 0; t < 60; t += 0.05) {
      const { blink } = catPose(input({ time: t }));
      expect(blink).toBeGreaterThanOrEqual(0);
      expect(blink).toBeLessThanOrEqual(1);
    }
  });

  it("raises its tail in greeting", () => {
    const tailRoot = (greeting: number) => (catPose(input({ greeting })).rotations.get("tail0" as BoneName) as readonly number[])[0];
    expect(tailRoot(1)).toBeGreaterThan(tailRoot(0) + 1);
  });

  it("holds a bold cat's head higher than a shy one's", () => {
    const neck = (boldness: number) => (catPose(input({ personality: { ...cat.personality, boldness } })).rotations.get("neck") as readonly number[])[0];
    // A turn down is positive, so the bold cat's neck turns less down.
    expect(neck(1)).toBeLessThan(neck(-1));
  });
});

describe("a burst", () => {
  it("rises and falls within its window, and is seeded", () => {
    const samples = Array.from({ length: 2000 }, (_, i) => burst(3, 1, i * 0.01, 4, 0.5).amount);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    expect(samples.filter((v) => v > 0).length / samples.length).toBeLessThan(0.2);
    expect(burst(3, 1, 7.3, 4, 0.5)).toEqual(burst(3, 1, 7.3, 4, 0.5));
  });
});
