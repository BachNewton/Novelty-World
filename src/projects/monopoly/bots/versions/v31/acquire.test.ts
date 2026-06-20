import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { evaluateTrade, proposeBestTrade } from "./trades";
import { isDistressed } from "./valuation";

// v31 — FROM-SCRATCH DISTRESS GRAB (Offer E, corner A). Buy a WHOLE bare monopoly
// off a GENUINELY DISTRESSED owner for a color the bot holds NONE of, at the
// distress-discounted price.
//
// KEY STRUCTURAL FINDING (pinned below): even at MAXIMAL distress this grab is
// -EV and SELF-REJECTS at the accept gate. The distress discount only erases the
// seller's rival-THREAT premium (the cost of arming the buyer); it does NOT
// discount the set's own `monopolyBonus`. When the buyer takes a WHOLE monopoly,
// that bonus transfers ~1:1 — the seller loses exactly what the buyer gains — so
// the buyer's gain never clears the seller's (discounted) break-even plus the
// accept margin. This is v24's "intact-monopoly buy is -EV and self-rejects"
// lesson; distress does not change it, because the only thing distress discounts
// (the threat premium) is precisely what cancels the buyer's completion gain. The
// asymmetry that made v29's Offer B win — buy the LAST lot and bank the WHOLE
// bonus for one lot's price — has no analogue for a whole-set buy.
//
// Board geometry: oranges = {16,18,19} (target — p1 holds none); greens =
// {31,32,34} hoteled by p3, so a deadly developed rent sits on the board.

const base = freshGame();

function withDeadlyBoard(ownership: Record<number, string>): GameState {
  return {
    ...base,
    ownership: { 31: "p3", 32: "p3", 34: "p3", ...ownership },
    houses: { 31: 5, 32: 5, 34: 5 },
  };
}

function setCash(state: GameState, id: string, cash: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)) };
}

const ALL_ORANGES_P2 = { 16: "p2", 18: "p2", 19: "p2" } as const;

describe("v31 from-scratch distress grab — Offer E (structurally -EV, self-rejects)", () => {
  it("the distress discount lowers the whole-set break-even but not below the buyer's gain", () => {
    // p1 flush, holds no orange; p2 owns all three bare oranges. Selling the whole
    // set, p2's distressed break-even is HIGHER (less negative) than comfortable —
    // the discount is real — but still no smaller in magnitude than the bonus p1
    // gains, so the buyer cannot profit.
    const grab = { propertyTo: { 16: "p1", 18: "p1", 19: "p1" }, gojfTo: {}, cashDelta: {} };
    const desperate = setCash(setCash(withDeadlyBoard({ ...ALL_ORANGES_P2 }), "p1", 3000), "p2", 5);
    const comfy = setCash(setCash(withDeadlyBoard({ ...ALL_ORANGES_P2 }), "p1", 3000), "p2", 3000);

    expect(isDistressed(desperate, "p2")).toBe(true);
    expect(isDistressed(comfy, "p2")).toBe(false);

    const desperateLoss = evaluateTrade(desperate, "p2", grab).delta; // seller's signed delta
    const comfyLoss = evaluateTrade(comfy, "p2", grab).delta;
    const buyerGain = evaluateTrade(desperate, "p1", grab).delta; // buyer's gain, no cash

    // Distress discount is live: the desperate seller loses LESS than the comfy one.
    expect(desperateLoss).toBeGreaterThan(comfyLoss);
    // But the buyer's gain does NOT exceed the magnitude of the seller's discounted
    // loss — so there is no surplus for the buyer (the grab is -EV).
    expect(buyerGain).toBeLessThanOrEqual(-desperateLoss);
  });

  it("self-rejects: no from-scratch grab is proposed even off a distressed owner", () => {
    // Because the grab is -EV, the accept gate rejects it; with p1 holding no
    // near-monopoly to complete, there is nothing to propose.
    const state = setCash(setCash(withDeadlyBoard({ ...ALL_ORANGES_P2 }), "p1", 3000), "p2", 5);
    expect(isDistressed(state, "p2")).toBe(true);
    const proposal = proposeBestTrade(state, "p1");
    expect(proposal).toBeNull();
  });

  it("does not fire on a comfortable owner either (it is gated on distress anyway)", () => {
    const state = setCash(setCash(withDeadlyBoard({ ...ALL_ORANGES_P2 }), "p1", 3000), "p2", 3000);
    expect(isDistressed(state, "p2")).toBe(false);
    const proposal = proposeBestTrade(state, "p1");
    expect(proposal).toBeNull();
  });
});
