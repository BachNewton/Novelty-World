import { describe, expect, it } from "vitest";
import { TRANSITION } from "../animals/motion";
import { smoothness, turnOf } from "../animals/pose-checks";
import { generateFox, type FoxPhase } from "./fox";
import { foxPose, type FoxActivity, type FoxMotionInput } from "./motion";
import { rigOf } from "./rig";

const foxes = Array.from({ length: 600 }, (_, i) => generateFox(`fox ${i}`));

describe("a generated fox", () => {
  it("is the same every time", () => {
    expect(generateFox("a fox")).toEqual(generateFox("a fox"));
  });

  it("is mostly red, now and then a cross fox, and rarely silver", () => {
    const share = (phase: FoxPhase) => foxes.filter((f) => f.coat.phase === phase).length / foxes.length;
    expect(share("red")).toBeGreaterThan(0.75);
    expect(share("cross")).toBeGreaterThan(0.04);
    expect(share("silver")).toBeGreaterThan(0.005);
    expect(share("silver")).toBeLessThan(share("cross"));
  });

  it("leans shy", () => {
    const mean = foxes.reduce((sum, f) => sum + f.personality.boldness, 0) / foxes.length;
    expect(mean).toBeLessThan(-0.2);
  });
});

const fox = generateFox("motion");
const input = (changes: Partial<FoxMotionInput> = {}): FoxMotionInput => ({
  time: 10,
  travelled: 0,
  speed: 1,
  activity: "stand",
  previous: "stand",
  since: 0,
  greeting: 0,
  personality: fox.personality,
  rig: rigOf(fox.build),
  seed: 11,
  ...changes,
});
const expectSmooth = (pose: Parameters<typeof smoothness>[0], from: number, to: number) => {
  const { coarse, fine } = smoothness(pose, from, to);
  expect(coarse).toBeLessThan(0.08);
  expect(fine).toBeLessThan(coarse * 0.35);
};

describe("a fox's pose", () => {
  it("is a pure function of its input", () => {
    expect(foxPose(input({ activity: "trot", travelled: 1.3 }))).toEqual(foxPose(input({ activity: "trot", travelled: 1.3 })));
  });

  it.each(["walk", "trot", "run"] as const)("never jumps through a %s", (gait) => {
    const speed = { walk: 0.5, trot: 1.2, run: 2.4 }[gait];
    expectSmooth((t) => foxPose(input({ activity: gait, previous: gait, time: t, travelled: t * speed, speed })), 0, 1.2);
  });

  it("never jumps through a pounce, nor as one comes round again", () => {
    expectSmooth((t) => foxPose(input({ activity: "pounce", previous: "pounce", time: t })), 0, 7);
  });

  it("blends smoothly from one activity into the next", () => {
    const activities: FoxActivity[] = ["stand", "walk", "trot", "run", "sit", "lie", "pounce", "stand"];
    for (let i = 1; i < activities.length; i++) {
      const change = { previous: activities[i - 1], activity: activities[i], since: 5 };
      expectSmooth((t) => foxPose(input({ ...change, time: t, travelled: t * 0.8 })), 5, 5 + TRANSITION + 0.1);
    }
  });

  it("leaps clear of the ground in a pounce, and dives nose-first", () => {
    const poses = Array.from({ length: 340 }, (_, i) => foxPose(input({ activity: "pounce", previous: "pounce", time: i * 0.01 })));
    const standing = foxPose(input()).pelvis[1];
    expect(Math.max(...poses.map((p) => p.pelvis[1]))).toBeGreaterThan(standing * 1.5);
    expect(Math.max(...poses.map((p) => turnOf(p, "pelvis")[0]))).toBeGreaterThan(0.6);
  });

  it("streams its brush out level at a trot, and holds it low standing", () => {
    const standing = turnOf(foxPose(input()), "tail0")[0];
    const trotting = turnOf(foxPose(input({ activity: "trot", previous: "trot", travelled: 2 })), "tail0")[0];
    expect(standing).toBeLessThan(-0.4);
    expect(trotting).toBeGreaterThan(standing + 0.3);
  });
});
