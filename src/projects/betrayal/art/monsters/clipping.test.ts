import type * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { clipping } from "../explorers/clipping";
import type { Gait } from "../explorers/figure";
import { stubCanvas } from "../headless";
import { banshee, spider } from ".";

/*
 * No monster's parts pass through each other: the Spider's legs against its
 * body and each other, the Banshee's arms against her robe and her hair
 * against her head, through a long stretch of the idle, stunned, and moving
 * over several strides.
 */

beforeAll(stubCanvas);

function clipsThrough(figure: THREE.Object3D, times: readonly number[]): string[] {
  const found = new Map<string, string>();
  for (const at of times) {
    figure.traverse((object) => animationOf(object)?.(at));
    for (const finding of clipping(figure)) {
      const pair = finding.split(" pass through")[0];
      if (!found.has(pair)) found.set(pair, `at ${at.toFixed(2)} s: ${finding}`);
    }
  }
  return [...found.values()];
}

const moments = (from: number, every: number, count: number) => Array.from({ length: count }, (_, i) => from + i * every);
const IDLE = moments(0, 0.45, 160);
/** A monster moving at about the house's walking pace, its stride's phase on with the distance. */
const moving =
  (step: number): Gait =>
  (seconds) => ({ phase: ((seconds * 1.5) / step) * Math.PI, amount: 1 });
const LIMIT = { timeout: 15_000 };

describe.each([
  ["the Banshee", banshee, 0.9],
  ["the Spider", spider, 0.54],
] as const)("%s", (_, build, step) => {
  it("passes no part through another in its idle", LIMIT, () => {
    expect(clipsThrough(build("clip"), IDLE)).toEqual([]);
  });

  it("passes no part through another stunned", LIMIT, () => {
    expect(clipsThrough(build("clip", undefined, { stunned: true }), IDLE.slice(0, 40))).toEqual([]);
  });

  it("passes no part through another moving", LIMIT, () => {
    expect(clipsThrough(build("clip", moving(step)), moments(0, 0.053, 80))).toEqual([]);
  });
});
