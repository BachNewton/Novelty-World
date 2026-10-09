import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { animationOf } from "../animate";
import { stubCanvas } from "../headless";
import { banshee, spider } from ".";

beforeAll(stubCanvas);

/** The draws one figure may cost. The house allows 300 a frame for a whole
 *  floor, rooms included, so a figure that stands beside others stays small. */
const DRAWS_PER_FIGURE = 36;

function draws(figure: THREE.Object3D): number {
  let count = 0;
  figure.traverse((object) => {
    if (object instanceof THREE.Mesh) count += Array.isArray(object.material) ? object.material.length : 1;
  });
  return count;
}

/** Every piece's transform after posing the figure at a moment. */
function poseAt(figure: THREE.Object3D, seconds: number): number[] {
  figure.traverse((object) => animationOf(object)?.(seconds));
  const matrices: number[] = [];
  figure.updateMatrixWorld(true);
  figure.traverse((object) => matrices.push(...object.matrixWorld.elements));
  return matrices;
}

describe.each([
  ["the Banshee", banshee],
  ["the Spider", spider],
])("%s", (_, build) => {
  it(`draws in at most ${DRAWS_PER_FIGURE} calls`, () => {
    expect(draws(build())).toBeLessThanOrEqual(DRAWS_PER_FIGURE);
    expect(draws(build("stunned", undefined, { stunned: true }))).toBeLessThanOrEqual(DRAWS_PER_FIGURE);
  });

  it("poses as a pure function of the clock", () => {
    const figure = build("seed");
    const at = poseAt(figure, 3.7);
    poseAt(figure, 11.2);
    expect(poseAt(figure, 3.7)).toEqual(at);
  });

  it("moves in its idle, and stands differently stunned", () => {
    const idle = build("seed");
    expect(poseAt(idle, 1)).not.toEqual(poseAt(idle, 2.5));
    expect(poseAt(build("seed", undefined, { stunned: true }), 1)).not.toEqual(poseAt(build("seed"), 1));
  });
});
