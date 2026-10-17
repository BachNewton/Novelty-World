import { describe, expect, it } from "vitest";
import { observeGame } from "./opponent-model";

// The tool scores beliefs against what turns did; a game it watches is the game the bots play.

describe("scoring opponent models", () => {
  const result = observeGame({ index: 0, seed: "opp-test", labels: ["rule-v3", "greedy", "greedy"], models: ["v3", "v4"], maxTurns: 120 });

  it("scores every model on the same turns", () => {
    expect(result.error).toBeUndefined();
    const n = (model: string) => result.sums[`${model}|3p|greedy|all|n`];
    expect(n("v3")).toBeGreaterThan(0);
    expect(n("v4")).toBe(n("v3"));
  });

  it("keeps v3's beliefs: everyone hits the common threat", () => {
    const leader = result.sums["v3|3p|greedy|leader|n"];
    if (leader > 0) expect(result.sums["v3|3p|greedy|leader|aim"]).toBe(leader);
  });
});
