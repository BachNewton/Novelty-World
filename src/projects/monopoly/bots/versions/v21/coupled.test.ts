import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, Player } from "../../../types";
import { policy as v17Bot } from "../v17/policy";
import { liquidityFloor as v17Floor } from "../v17/valuation";
import { policy as v21Bot } from "./policy";
import { liquidityFloor as v21Floor } from "./valuation";

// v21 COUPLES two liquid-deployment loosenings, each pinned here against v17:
//   (1) the thinner reserve (v18's floor constants) — strictly lower on a developed
//       board, so more cash is free for offense;
//   (2) the looser buy-dip gate (v20's DIP_WORTH_MULT 1.15) — buys clear-value land
//       below the reserve that v17 passes.

const base = freshGame();

describe("v21 reserve half — thinner liquidity floor than v17", () => {
  it("reserves strictly less on a developed board", () => {
    // p2 owns a hotelled orange monopoly — a big worst-case rent on p1's board.
    const state: GameState = {
      ...base,
      ownership: { 16: "p2", 18: "p2", 19: "p2" },
      houses: { 16: 5, 18: 5, 19: 5 },
    };
    expect(v21Floor(state, "p1")).toBeLessThan(v17Floor(state, "p1"));
  });
});

describe("v21 buy-dip half — looser DIP gate buys clear-value land below the reserve", () => {
  it("v21 BUYS a second railroad (1.35× worth) that dips the reserve; v17 passes", () => {
    // p1 owns one railroad (pos 5) and lands on a second (pos 15, price 200, worth 270
    // = 1.35× via two-rail synergy). 250 cash on a quiet board → buying dips the reserve.
    const state: GameState = {
      ...base,
      players: base.players.map((p): Player => ({
        ...p,
        cash: p.id === "p1" ? 250 : 1500,
      })),
      ownership: { 5: "p1" },
      turn: { ...base.turn, phase: "buy-decision", playerId: "p1", pendingBuy: 15 },
    };
    expect(v21Bot(state, "p1")?.intent.kind).toBe("buy");
    expect(v17Bot(state, "p1")?.intent.kind).toBe("decline-buy");
  });
});
