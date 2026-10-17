import { describe, expect, it } from "vitest";
import { generateCat } from "./cat";
import { TRANSITION } from "../animals/motion";
import type { BoneName } from "../animals/rig";
import { catPose, type Activity, type MotionInput } from "./motion";
import { rigOf } from "./rig";

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
