import { Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { followTrail, recovery, TRAIL_LENGTH } from "./parting";

const fresh = () => Array.from({ length: TRAIL_LENGTH }, () => new Vector4());

describe("plants parting round Elliott", () => {
  it("spring back after Elliott passes, a little past upright, then settle", () => {
    expect(recovery(0)).toBe(1);
    expect(recovery(0.3)).toBeLessThan(1);
    expect(Math.min(...[0.8, 1, 1.2].map(recovery))).toBeLessThan(0);
    expect(recovery(3)).toBe(0);
  });

  it("bend round where Elliott stands, and leave a step behind each stride", () => {
    const trail: Parameters<typeof followTrail>[0] = [];
    const out = fresh();
    followTrail(trail, { x: 0, y: 0, z: 0 }, 0.016, out);
    expect(out[0].toArray()).toEqual([0, 0, 0, 1]);
    expect(out[1].w).toBe(1);
    // A short shuffle leaves no new step.
    followTrail(trail, { x: 0.2, y: 0, z: 0 }, 0.016, out);
    expect(trail).toHaveLength(1);
    for (let i = 1; i <= 20; i++) followTrail(trail, { x: i * 0.5, y: 0, z: 0 }, 0.1, out);
    expect(trail).toHaveLength(TRAIL_LENGTH - 1);
    expect(out[0].x).toBe(10);
    // Older steps have sprung further back.
    expect(Math.abs(out[TRAIL_LENGTH - 1].w)).toBeLessThan(out[1].w);
  });

  it("bend nothing where nobody walks", () => {
    const out = fresh();
    followTrail([], null, 0.016, out);
    for (const step of out) expect(step.w).toBe(0);
  });
});
