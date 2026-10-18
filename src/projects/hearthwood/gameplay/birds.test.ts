import { describe, expect, it } from "vitest";
import type { Perch } from "../engine/wildlife";
import { BIRD, birdAt, stepBird } from "./birds";

const perches: Perch[] = [
  { x: 0, y: 1, z: 0, kind: "rock" },
  { x: 1.5, y: 0, z: 0, kind: "ground" },
  { x: 12, y: 3, z: 0, kind: "crown" },
  { x: -10, y: 1.2, z: 3, kind: "bush" },
];
const far = { x: 100, z: 100, hurried: false };

describe("a songbird", () => {
  it("is flushed by Elliott coming close, off to the perch furthest from them, and lands there", () => {
    const bird = birdAt(perches, 0, 3);
    stepBird(bird, perches, { x: -2, z: 0, hurried: false }, 1, 0);
    expect(bird.mode).toBe("flying");
    expect(bird.perch).toBe(2);
    for (let t = 0; t < 4; t += 0.05) stepBird(bird, perches, far, 1, t);
    expect(bird.mode).toBe("perched");
    expect(Math.hypot(bird.x - 12, bird.y - 3, bird.z)).toBeLessThan(0.01);
  });

  it("is flushed from further off by someone running", () => {
    const calm = birdAt(perches, 0, 3);
    const hurried = birdAt(perches, 0, 3);
    // Both content where they are for now, but for Elliott.
    calm.until = hurried.until = 100;
    stepBird(calm, perches, { x: 5, z: 0, hurried: false }, 1, 0);
    stepBird(hurried, perches, { x: 5, z: 0, hurried: true }, 1, 0);
    expect(calm.mode).toBe("perched");
    expect(hurried.mode).toBe("flying");
    expect(BIRD.flush.hurried).toBeGreaterThan(BIRD.flush.calm);
  });

  it("goes about its day among its perches, now and then down to the ground, keeping near where it came down", () => {
    const bird = birdAt(perches, 0, 11);
    const modes = new Set<string>();
    for (let t = 0; t < 300; t += 0.05) {
      stepBird(bird, perches, far, 1, t);
      modes.add(bird.mode);
      if (bird.mode === "ground" && !bird.flight) expect(Math.hypot(bird.x - 1.5, bird.z)).toBeLessThan(1.6);
    }
    expect(modes.has("ground")).toBe(true);
    expect(modes.has("flying")).toBe(true);
  });

  it("sits tight while the birds are hardly about", () => {
    const bird = birdAt(perches, 0, 5);
    for (let t = 0; t < 120; t += 0.05) stepBird(bird, perches, far, 0, t);
    expect(bird.mode).toBe("perched");
    expect(bird.perch).toBe(0);
  });
});
