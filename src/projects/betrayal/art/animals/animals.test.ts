import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { clipping } from "../explorers/clipping";
import { burstsOf, cueBurst, walkingOf, type Gait } from "../explorers/figure";
import { partsOf } from "../figure-parts";
import { stubCanvas } from "../headless";
import { cat, dog } from ".";

/*
 * The four-legged companions: each draws within a figure's budget, poses as
 * a pure function of the clock, moves in its idle, and passes no part
 * through another through a long stretch of its idle, walking and running
 * (on the spot, at the house's pace, over several strides off the beat).
 */

beforeAll(stubCanvas);

/** The draws one figure may cost, as for the monsters. */
const DRAWS_PER_FIGURE = 36;

function draws(figure: THREE.Object3D): number {
  let count = 0;
  figure.traverse((object) => {
    if (object instanceof THREE.Mesh) count += Array.isArray(object.material) ? object.material.length : 1;
  });
  return count;
}

function poseAt(figure: THREE.Object3D, seconds: number): number[] {
  figure.traverse((object) => animationOf(object)?.(seconds));
  const matrices: number[] = [];
  figure.updateMatrixWorld(true);
  figure.traverse((object) => matrices.push(...object.matrixWorld.elements));
  return matrices;
}

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
/** On the spot at the house's middle pace, walking (1.5 m/s) or running (3.6 m/s), its phase on with the distance. */
const moving =
  (step: number, running: boolean): Gait =>
  (seconds) => ({ phase: ((seconds * (running ? 3.6 : 1.5)) / (running ? step * 2 : step)) * Math.PI, amount: 1, running });
const LIMIT = { timeout: 20_000 };

describe.each([
  ["the Dog", dog],
  ["the Cat", cat],
] as const)("%s", (_, build) => {
  // Meshing the parts is the slow step, done once a session: it belongs to no one test.
  beforeAll(() => {
    for (const parts of partsOf(build)) parts.get();
  });
  const step = () => walkingOf(build("step")).step;

  it(`draws in at most ${DRAWS_PER_FIGURE} calls`, () => {
    expect(draws(build())).toBeLessThanOrEqual(DRAWS_PER_FIGURE);
  });

  it("poses as a pure function of the clock", () => {
    const figure = build("seed", moving(step(), false));
    const at = poseAt(figure, 3.7);
    poseAt(figure, 11.2);
    expect(poseAt(figure, 3.7)).toEqual(at);
  });

  it("moves in its idle", () => {
    const idle = build("seed");
    expect(poseAt(idle, 1)).not.toEqual(poseAt(idle, 2.5));
  });

  it("passes no part through another in its idle", LIMIT, () => {
    expect(clipsThrough(build("clip"), moments(0, 0.45, 160))).toEqual([]);
  });

  it("passes no part through another through each of its gestures", LIMIT, () => {
    const figure = build("clip");
    for (const { name, lasts } of burstsOf(figure)) {
      cueBurst(figure, { name, at: 0, repeat: false });
      expect(clipsThrough(figure, moments(0, lasts / 40, 41)), name).toEqual([]);
    }
  });

  it("passes no part through another walking", LIMIT, () => {
    expect(clipsThrough(build("clip", moving(step(), false)), moments(0, 0.023, 60))).toEqual([]);
  });

  it("passes no part through another running", LIMIT, () => {
    expect(clipsThrough(build("clip", moving(step(), true)), moments(0, 0.017, 60))).toEqual([]);
  });
});
