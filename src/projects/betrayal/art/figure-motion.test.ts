import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { coursePose, FIGURE_STATES } from "./figure-motion";
import { RUN_SPEED } from "./house-walk";

const COURSES = FIGURE_STATES.filter((state) => state.endsWith("-line") || state === "turns" || state === "start-stop");

describe("the figure viewer's courses", () => {
  it.each(COURSES)("%s loops without a jump in place, heading or stride", (state) => {
    const dt = 1 / 600;
    let last = coursePose(state, 0);
    for (let t = dt; t < 40; t += dt) {
      const pose = coursePose(state, t);
      expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(RUN_SPEED * dt * 1.5);
      const turned = Math.abs(THREE.MathUtils.euclideanModulo(pose.heading - last.heading + Math.PI, Math.PI * 2) - Math.PI);
      expect(turned).toBeLessThan(0.05);
      expect(Math.abs(pose.stride.amount - last.stride.amount)).toBeLessThan(0.02);
      last = pose;
    }
  });

  it("moves and stands in turn", () => {
    const amounts = Array.from({ length: 400 }, (_, i) => coursePose("start-stop", i / 20).stride.amount);
    expect(amounts.some((amount) => amount === 1)).toBe(true);
    expect(amounts.some((amount) => amount === 0)).toBe(true);
  });
});
