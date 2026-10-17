import { describe, expect, it } from "vitest";
import { sampleBelief } from "./sample";
import { SCENARIOS } from "./scenarios";
import { beliefGap, bruteForceBelief } from "./test-kit";
import { buildTimeline } from "./timeline";

describe("sampleBelief", () => {
  for (const [name, s] of Object.entries(SCENARIOS)) {
    it(`matches the brute force: ${name}`, () => {
      const timeline = buildTimeline(s);
      if (!timeline) throw new Error("the viewer is in the game");
      const sampled = sampleBelief(timeline, 20_000, name);
      // 4 standard errors of a chance near a half.
      const tolerance = 4 * 0.5 / Math.sqrt(sampled.effective);
      expect(sampled.effective).toBeGreaterThan(2_000);
      expect(beliefGap(sampled.belief, bruteForceBelief(s))).toBeLessThan(tolerance);
    });
  }
});
