import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { burst, reach } from "./figure";

function handAt(from: THREE.Vector3, upper: number, lower: number, pose: ReturnType<typeof reach>): THREE.Vector3 {
  const down = new THREE.Vector3(0, -1, 0);
  const elbow = from.clone().addScaledVector(down.clone().applyQuaternion(pose.shoulder), upper);
  const forearm = down.clone().applyQuaternion(pose.elbow).applyQuaternion(pose.shoulder);
  return elbow.addScaledVector(forearm, lower);
}

describe("reach", () => {
  const from = new THREE.Vector3(0.2, 0.4, 0);

  it("puts the end of the limb on a target within reach", () => {
    const target = new THREE.Vector3(0, 0.7, 0.2);
    const pose = reach(from, target, 0.28, 0.28, new THREE.Vector3(1, -1, 0));
    expect(handAt(from, 0.28, 0.28, pose).distanceTo(target)).toBeLessThan(1e-6);
  });

  it("reaches as far as it can towards a target out of reach", () => {
    const target = new THREE.Vector3(0.2, -1, 0);
    const pose = reach(from, target, 0.28, 0.28, new THREE.Vector3(0, 0, -1));
    const hand = handAt(from, 0.28, 0.28, pose);
    expect(hand.distanceTo(from)).toBeCloseTo(0.56, 2);
    expect(hand.x).toBeCloseTo(0.2);
  });
});

describe("burst", () => {
  const timing = { every: 6, lasts: 2, chance: 0.6 };

  it("is a pure function of the clock", () => {
    for (let t = 0; t < 60; t += 0.7) expect(burst(t, "seed", timing)).toEqual(burst(t, "seed", timing));
  });

  it("stays between 0 and 1, happens sometimes, and rests otherwise", () => {
    const amounts = Array.from({ length: 600 }, (_, i) => burst(i / 10, "seed", timing).amount);
    expect(amounts.every((amount) => amount >= 0 && amount <= 1)).toBe(true);
    expect(amounts.some((amount) => amount === 1)).toBe(true);
    expect(amounts.filter((amount) => amount === 0).length).toBeGreaterThan(amounts.length / 2);
  });

  it("differs between seeds, so figures don't move in step", () => {
    const pattern = (seed: string) => Array.from({ length: 300 }, (_, i) => burst(i / 5, seed, timing).amount > 0);
    expect(pattern("one")).not.toEqual(pattern("two"));
  });
});
