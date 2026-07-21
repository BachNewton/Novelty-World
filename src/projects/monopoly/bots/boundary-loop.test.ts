import { describe, expect, it } from "vitest";
import { dumbBot } from "./dumb";
import type { Bot } from "./registry";
import { simulateGame } from "./eval/simulate";

// A pathological policy that exercises the boundary loop directly: it tries to
// (re)arm a trade at EVERY pre-roll, and the moment its trade intermission opens
// it cancels — the canonical arm -> open -> resolve -> re-arm cycle. Without the
// once-per-kind-per-turn-group boundary bound, this freezes the very first turn
// forever (the active player's pre-roll never reaches its roll). With the bound,
// the bot gets one trade window per turn-group and then the turn rolls on, so the
// game can never be stalled by it — at worst the bot is a bad player.
const looper: Bot = (state, id) => {
  const { phase, tradeDraft } = state.turn;
  if (phase === "pre-roll") {
    return {
      intent: { kind: "set-queue", playerId: id, queue: "trade", armed: true },
    };
  }
  if (phase === "trade-building" && tradeDraft?.proposerId === id) {
    return { intent: { kind: "cancel-trade", playerId: id } };
  }
  return null;
};

describe("boundary loop guard (end-to-end)", () => {
  it("a relentlessly re-arming bot can't freeze the game — turns keep advancing", () => {
    const result = simulateGame({
      seed: "loop-guard-1",
      // The looper acts first, so without the bound the game would freeze on
      // turn 1 (result.turns === 1, step cap hit). With it, the turn count climbs
      // normally.
      seats: [
        { label: "looper", bot: looper },
        { label: "dumb", bot: dumbBot },
        { label: "dumb", bot: dumbBot },
        { label: "dumb", bot: dumbBot },
      ],
      maxTurns: 400,
    });
    // The single assertion that distinguishes "advancing" from "frozen on turn 1".
    expect(result.turns).toBeGreaterThan(50);
  });
});
