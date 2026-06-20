import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, Player } from "../../../types";
import { claudeBot as v17Bot } from "../v17/claude";
import { claudeBot as v20Bot } from "./claude";

// v20's one change: a LOOSER buy-aggression gate (DIP_WORTH_MULT 1.4→1.15). When the
// bot can afford a lot but paying would dip below its rent reserve, it buys if the lot
// is worth ≥ DIP_WORTH_MULT × price. v17 demands 1.4× (well over face); v20 needs only
// 1.15×, so it acquires clear-value land more readily out of cash on hand.
//
// Setup: p1 owns one railroad (pos 5) and lands on a second (pos 15, price 200). The
// second rail is worth 270 (200 asset + 70 two-rail synergy) = 1.35× price — above
// v20's 1.15× bar but below v17's 1.4×. p1 holds 250 cash on a quiet board (reserve =
// BASE_FLOOR 120), so buying (250-200=50) dips below the reserve: exactly the DIP gate.

const base = freshGame();

function railBuyDecision(): GameState {
  return {
    ...base,
    players: base.players.map((p): Player => ({
      ...p,
      cash: p.id === "p1" ? 250 : 1500,
    })),
    ownership: { 5: "p1" },
    turn: { ...base.turn, phase: "buy-decision", playerId: "p1", pendingBuy: 15 },
  };
}

describe("v20 buy aggression — looser DIP gate buys clear-value land below the reserve", () => {
  it("v20 BUYS a second railroad (1.35× worth) that dips the reserve; v17 passes", () => {
    const state = railBuyDecision();
    expect(v20Bot(state, "p1")?.intent.kind).toBe("buy");
    expect(v17Bot(state, "p1")?.intent.kind).toBe("decline-buy");
  });
});
