import { describe, expect, it } from "vitest";
import { FEATURE_COUNT, MAX_SEATS } from "./features";
import { ACTION_COUNT } from "./actions";
import { MonoNet } from "./net";
import { collectRuleGame, playSelfPlayGame } from "./selfplay";

const sumsToOneOrZero = (a: Float32Array): boolean => {
  const s = a.reduce((x, v) => x + v, 0);
  return Math.abs(s - 1) < 1e-3 || s === 0;
};

describe("self-play recorder + bootstrap", () => {
  it("self-play produces well-formed training samples", () => {
    const net = MonoNet.create();
    const samples = playSelfPlayGame(net, "sp-1", {
      players: 2,
      maxTurns: 60,
      mcts: { simulations: 6 },
      explorationMoves: 5,
    });
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.encoding.length).toBe(FEATURE_COUNT);
      expect(s.policyTarget.length).toBe(ACTION_COUNT);
      expect(s.valueTarget.length).toBe(MAX_SEATS);
      // Policy target is a visit distribution (sums to 1); value is a one-hot
      // outcome (sums to 1) — or 0 in the degenerate empty-table case.
      expect(sumsToOneOrZero(s.policyTarget)).toBe(true);
      expect(sumsToOneOrZero(s.valueTarget)).toBe(true);
    }
  }, 120_000);

  it("rule-bot bootstrap produces value-labelled samples and trains", async () => {
    const samples = collectRuleGame("boot-1", "claude-v2", { players: 4, maxTurns: 120 });
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.encoding.length).toBe(FEATURE_COUNT);
      expect(sumsToOneOrZero(s.valueTarget)).toBe(true);
    }
    // The samples must actually drive a training step.
    const net = MonoNet.create();
    const loss = await net.train(samples);
    expect(Number.isFinite(loss)).toBe(true);
  }, 120_000);
});
