import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { burst, burstsOf, CUE_REST, cueBurst, idleBursts, reach } from "./figure";

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

describe("idleBursts", () => {
  const timings = { coin: { every: 10, lasts: 4, chance: 0.75 }, glance: { every: 7, lasts: 2, chance: 0.55 } };
  const declare = () => {
    const figure = new THREE.Group();
    const holder = new THREE.Group().add(figure);
    return { holder, play: idleBursts(figure, "ox", 12, timings) };
  };

  it("plays each burst on the seeded schedule, on the figure's own time", () => {
    const { play } = declare();
    for (let t = 0; t < 60; t += 0.37) {
      expect(play(t).coin).toEqual(burst(t + 12, "ox:coin", timings.coin));
      expect(play(t).glance).toEqual(burst(t + 12, "ox:glance", timings.glance));
    }
  });

  it("lists the figure's bursts by name, wherever it stands", () => {
    expect(burstsOf(declare().holder)).toEqual([
      { name: "coin", lasts: 4 },
      { name: "glance", lasts: 2 },
    ]);
    expect(burstsOf(new THREE.Group())).toEqual([]);
  });

  it("plays a cued burst from its moment, alone, and once", () => {
    const { holder, play } = declare();
    cueBurst(holder, { name: "coin", at: 5, repeat: false });
    expect(play(4.9).coin.amount).toBe(0);
    expect(play(5).coin.amount).toBe(0);
    expect(play(7).coin).toMatchObject({ amount: 1, progress: 0.5 });
    expect(play(9.5).coin.amount).toBe(0);
    for (let t = 0; t < 40; t += 0.37) expect(play(t).glance.amount).toBe(0);
  });

  it("repeats a cue after a rest, and is a pure function of the clock", () => {
    const { holder, play } = declare();
    cueBurst(holder, { name: "glance", at: 1, repeat: true });
    const period = 2 + CUE_REST;
    expect(play(1 + period + 1).glance).toMatchObject({ amount: 1, progress: 0.5 });
    expect(play(1 + period * 3 + 1).glance.amount).toBe(1);
    expect(play(1 + 2.5).glance.amount).toBe(0);
    const forward = Array.from({ length: 100 }, (_, i) => play(i / 7));
    const backward = Array.from({ length: 100 }, (_, i) => play((99 - i) / 7)).reverse();
    expect(forward).toEqual(backward);
  });

  it("hands the idle back to the schedule, and refuses a burst the figure lacks", () => {
    const { holder, play } = declare();
    cueBurst(holder, { name: "coin", at: 0, repeat: true });
    cueBurst(holder, null);
    expect(play(33).coin).toEqual(burst(45, "ox:coin", timings.coin));
    expect(() => cueBurst(holder, { name: "twirl", at: 0, repeat: false })).toThrow(/no burst "twirl"/);
    expect(() => cueBurst(new THREE.Group(), null)).toThrow();
  });
});
