import { describe, expect, it } from "vitest";
import { TRANSITION, type Pose } from "../animals/motion";
import type { BoneName } from "../animals/rig";
import { generateDog, type TailType } from "./dog";
import { dogPose, type DogActivity, type DogMotionInput } from "./motion";
import { rigOf } from "./rig";

const dog = generateDog("motion");
const input = (changes: Partial<DogMotionInput> = {}): DogMotionInput => ({
  time: 10,
  travelled: 0,
  speed: 0.8,
  activity: "stand",
  previous: "stand",
  since: 0,
  greeting: 0,
  personality: dog.personality,
  rig: rigOf(dog.build),
  tail: "sabre",
  ears: "prick",
  seed: 7,
  ...changes,
});

const turn = (pose: Pose, bone: BoneName) => pose.rotations.get(bone) as readonly number[];

/** The biggest jump of any bone's turn, or the pelvis, between two poses. */
function jump(a: Pose, b: Pose): number {
  let most = Math.max(...a.pelvis.map((v, i) => Math.abs(v - b.pelvis[i])));
  for (const [bone, value] of a.rotations) most = Math.max(most, ...value.map((v, i) => Math.abs(v - turn(b, bone)[i])));
  return most;
}

// A pop is a jump that doesn't shrink with the step: sampled five times finer, a continuous movement
// turns each bone a fifth as far between samples, while a pop stays the size it was.
const worstStep = (pose: (t: number) => Pose, from: number, to: number, step: number) => {
  let worst = 0;
  let last = pose(from);
  for (let t = from + step; t < to; t += step) {
    const next = pose(t);
    worst = Math.max(worst, jump(last, next));
    last = next;
  }
  return worst;
};
const expectSmooth = (pose: (t: number) => Pose, from: number, to: number) => {
  const coarse = worstStep(pose, from, to, 0.001);
  const fine = worstStep(pose, from, to, 0.0002);
  expect(coarse).toBeLessThan(0.06);
  expect(fine).toBeLessThan(coarse * 0.35);
};

describe("a dog's pose", () => {
  it("is a pure function of its input", () => {
    expect(dogPose(input({ activity: "trot", travelled: 1.3 }))).toEqual(dogPose(input({ activity: "trot", travelled: 1.3 })));
  });

  it.each(["walk", "trot", "run"] as const)("never jumps through a %s", (gait) => {
    const speed = { walk: 0.5, trot: 1, run: 2 }[gait];
    expectSmooth((t) => dogPose(input({ activity: gait, previous: gait, time: t, travelled: t * speed, speed })), 0, 1.2);
  });

  it("blends smoothly from one activity into the next", () => {
    const activities: DogActivity[] = ["stand", "walk", "trot", "run", "sit", "lie", "stand"];
    for (let i = 1; i < activities.length; i++) {
      const change = { previous: activities[i - 1], activity: activities[i], since: 5 };
      expectSmooth((t) => dogPose(input({ ...change, time: t, travelled: t * 0.8 })), 5, 5 + TRANSITION + 0.1);
    }
  });

  it("wags harder in greeting, and its hips wiggle with it", () => {
    const swing = (greeting: number) => {
      const yaws = Array.from({ length: 60 }, (_, i) => turn(dogPose(input({ greeting, time: 10 + i * 0.013 })), "tail0")[1]);
      return Math.max(...yaws) - Math.min(...yaws);
    };
    expect(swing(1)).toBeGreaterThan(swing(0) * 2);
    const hips = Array.from({ length: 60 }, (_, i) => turn(dogPose(input({ greeting: 1, time: 10 + i * 0.013 })), "pelvis")[1]);
    expect(Math.max(...hips) - Math.min(...hips)).toBeGreaterThan(0.05);
  });

  it("whips a straight tail but swings a curled one stiffly from its root", () => {
    const along = (tail: TailType) => {
      const tips = Array.from({ length: 60 }, (_, i) => turn(dogPose(input({ tail, greeting: 1, time: 10 + i * 0.013 })), "tail4")[1]);
      return Math.max(...tips) - Math.min(...tips);
    };
    expect(along("straight")).toBeGreaterThan(along("curled") * 3);
  });

  it("carries a curled tail up over its back and a sabre tail down", () => {
    expect(turn(dogPose(input({ tail: "curled" })), "tail0")[0]).toBeGreaterThan(1.2);
    expect(turn(dogPose(input({ tail: "sabre" })), "tail0")[0]).toBeLessThan(-0.6);
  });

  it("pants as it runs, its jaw open and tongue out", () => {
    const pose = dogPose(input({ activity: "run", previous: "run", travelled: 3, speed: 2 }));
    expect(pose.tongue).toBeGreaterThan(0.9);
    expect(turn(pose, "jaw")[0]).toBeGreaterThan(0.2);
  });

  it("holds a bold dog's head higher than a shy one's", () => {
    const neck = (boldness: number) => turn(dogPose(input({ personality: { ...dog.personality, boldness } })), "neck")[0];
    expect(neck(1)).toBeLessThan(neck(-1));
  });

  it("keeps its eyes between open and shut, and its tongue in or out", () => {
    for (let t = 0; t < 60; t += 0.05) {
      const pose = dogPose(input({ time: t }));
      expect(pose.blink).toBeGreaterThanOrEqual(0);
      expect(pose.blink).toBeLessThanOrEqual(1);
      expect(pose.tongue).toBeGreaterThanOrEqual(0);
      expect(pose.tongue).toBeLessThanOrEqual(1);
    }
  });

  it("tilts its head, noses the ground and pants now and then while it stands", () => {
    const poses = Array.from({ length: 1200 }, (_, i) => dogPose(input({ time: i * 0.1 })));
    expect(Math.max(...poses.map((p) => Math.abs(turn(p, "head")[2])))).toBeGreaterThan(0.25);
    expect(Math.max(...poses.map((p) => turn(p, "neck")[0]))).toBeGreaterThan(0.6);
    expect(Math.max(...poses.map((p) => p.tongue))).toBeGreaterThan(0.8);
  });
});
