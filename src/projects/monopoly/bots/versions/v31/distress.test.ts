import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { evaluateTrade, proposeBestTrade } from "./trades";
import { isDistressed } from "./valuation";

// v28 — DESPERATION-ACQUISITION (lead b), the coupled hypothesis. These pins cover
// both halves on a board where the discount is LIVE and where it self-gates.
//
// Board geometry: oranges = {16,18,19}; greens = {31,32,34}. p3 holds a HOTELED
// green monopoly, so a deadly developed rent (hotel green ≈ $1400, well above the
// ~$350 DEADLY_RENT gate) sits on the board for everyone else. p1 (buyer) is one
// orange short holding {16,18}; p2 (seller) holds the orange completer 19. Whether
// p2 is "distressed" is then purely a function of p2's cash + mortgageable vs that
// deadly rent — exactly what the test dials.

const base = freshGame();

/** p3 owns a hoteled green monopoly → a deadly developed rent on the board. */
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

describe("v28 distress model — isDistressed", () => {
  it("flags a seat that can't cover the deadly rent even after mortgaging out", () => {
    // p2 holds only the bare orange completer 19; cash $5, ~$50 mortgageable —
    // nowhere near the hotel-green rent. One landing busts it: distressed.
    const state = setCash(withDeadlyBoard({ 19: "p2" }), "p2", 5);
    expect(isDistressed(state, "p2")).toBe(true);
  });

  it("does NOT flag a comfortable seat (cash covers the deadly rent)", () => {
    const state = setCash(withDeadlyBoard({ 19: "p2" }), "p2", 3000);
    expect(isDistressed(state, "p2")).toBe(false);
  });

  it("does NOT flag on a board with no DEVELOPED rent, even when broke", () => {
    // Same ownership but no houses anywhere → no deadly rent → never distressed,
    // however thin the seat is.
    const bare = setCash({ ...base, ownership: { 16: "p1", 18: "p1", 19: "p2" } }, "p2", 5);
    expect(isDistressed(bare, "p2")).toBe(false);
  });
});

describe("v28 seller half — distressed sellers accept below normal break-even", () => {
  it("a distressed seller's threat premium is discounted, lowering its break-even", () => {
    // p2, one short of nothing, holds 19 which would COMPLETE p1's orange. Handing
    // it to p1 hands p1 a monopoly, so p2 normally prices the full rival-threat
    // premium. The cash p1 must add to clear p2's break-even is therefore LOWER
    // when p2 is distressed than when it is comfortable.
    const buy = { propertyTo: { 19: "p1" }, gojfTo: {}, cashDelta: {} };

    const comfy = setCash(withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2" }), "p2", 3000);
    const desperate = setCash(withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2" }), "p2", 5);

    expect(isDistressed(comfy, "p2")).toBe(false);
    expect(isDistressed(desperate, "p2")).toBe(true);

    // The bare cash-free buy is a loss to p2 (gives a lot, gets nothing). The
    // distressed delta must be STRICTLY HIGHER (less negative) — the discount —
    // so p2 needs less sweetener to reach break-even.
    const comfyDelta = evaluateTrade(comfy, "p2", buy).delta;
    const desperateDelta = evaluateTrade(desperate, "p2", buy).delta;
    expect(desperateDelta).toBeGreaterThan(comfyDelta);
  });
});

describe("v28 buyer half — buy a distressed rival's completer cheap (and self-gate)", () => {
  it("constructs the underpriced completion off a distressed seller, with the cheap note", () => {
    // p1 healthy and one orange short; p2 distressed, holding the completer 19.
    const state = setCash(
      setCash(withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2" }), "p1", 3000),
      "p2",
      5,
    );
    expect(isDistressed(state, "p2")).toBe(true);
    const proposal = proposeBestTrade(state, "p1");
    expect(proposal).not.toBeNull();
    expect(proposal?.terms.propertyTo[19]).toBe("p1"); // p1 acquires the completer
    expect(proposal?.reason.toLowerCase()).toContain("cheap");
  });

  it("self-gates: no distress note when the seller is comfortable (matches v17 framing)", () => {
    const state = setCash(
      setCash(withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2" }), "p1", 3000),
      "p2",
      3000,
    );
    expect(isDistressed(state, "p2")).toBe(false);
    const proposal = proposeBestTrade(state, "p1");
    expect(proposal?.reason.toLowerCase()).not.toContain("cheap");
  });
});
