import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { policy } from "./policy";
import { distressCompletionNeedingCash, proposeBestTrade } from "./trades";
import { isDistressed } from "./valuation";

// v32 — MORTGAGE-TO-FUND a DISTRESS COMPLETION. These pins cover the detector's
// hard gate and the cross-turn arm: the bot pre-mortgages idle land ONLY for a
// genuinely distressed completion blocked SOLELY by cash and within mortgage reach.
//
// Board geometry (shared with distress.test.ts): oranges = {16,18,19}; greens =
// {31,32,34}. p3 holds a HOTELED green monopoly → a deadly developed rent on the
// board. p1 (buyer) is one orange short holding {16,18} PLUS idle railroads {5,15}
// (mortgageable $100 each). p2 (seller) holds the orange completer 19; whether it
// is distressed is purely its cash vs that deadly rent. The completer's sweetener
// is ~$230, so p1 at $200 cash is short by ~$30 — reachable by mortgaging.

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

/** p1: one orange short {16,18} + idle railroads {5,15}; p2: distressed, holds 19. */
function distressBoard(p1Cash: number, p2Cash: number): GameState {
  const owned = withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2", 5: "p1", 15: "p1" });
  return setCash(setCash(owned, "p1", p1Cash), "p2", p2Cash);
}

describe("v32 detector — distressCompletionNeedingCash", () => {
  it("fires when a distress completion is short on cash but within mortgage reach", () => {
    // p1 cash $200 (sweetener ~$230 → ~$30 short), $200 mortgageable in railroads.
    const state = distressBoard(200, 5);
    expect(isDistressed(state, "p2")).toBe(true);
    const opp = distressCompletionNeedingCash(state, "p1");
    expect(opp).not.toBeNull();
    expect(opp?.color).toBe("oranges");
    expect(opp?.need).toBeGreaterThan(0);
  });

  it("does NOT fire when cash already covers the completion (Offer B proposes it)", () => {
    // p1 cash $400 covers the ~$230 sweetener outright — no mortgage needed, so
    // the regular proposal path (not the pre-mortgage) handles it.
    const state = distressBoard(400, 5);
    expect(distressCompletionNeedingCash(state, "p1")).toBeNull();
    // ...and the completion IS proposable directly.
    const proposal = proposeBestTrade(state, "p1");
    expect(proposal?.terms.propertyTo[19]).toBe("p1");
  });

  it("self-gates on a COMFORTABLE seller — no distress, no pre-mortgage", () => {
    // p2 flush → not distressed → the completer isn't underpriced → don't mortgage
    // to fund a fair-price grab (that is v24's washed positive-sum buy).
    const state = distressBoard(200, 3000);
    expect(isDistressed(state, "p2")).toBe(false);
    expect(distressCompletionNeedingCash(state, "p1")).toBeNull();
  });

  it("self-gates when unaffordable even after mortgaging out", () => {
    // p1 broke ($5) with NO idle lots to mortgage → the completion is genuinely
    // out of reach; don't bleed interest on a raise that still can't fund it.
    const noIdle = setCash(
      setCash(withDeadlyBoard({ 16: "p1", 18: "p1", 19: "p2" }), "p1", 5),
      "p2",
      5,
    );
    expect(distressCompletionNeedingCash(noIdle, "p1")).toBeNull();
  });

  it("self-gates on a board with no developed rent (no distress at all)", () => {
    const bare = setCash(
      setCash(
        { ...base, ownership: { 16: "p1", 18: "p1", 19: "p2", 5: "p1", 15: "p1" } },
        "p1",
        200,
      ),
      "p2",
      5,
    );
    expect(isDistressed(bare, "p2")).toBe(false);
    expect(distressCompletionNeedingCash(bare, "p1")).toBeNull();
  });
});

describe("v32 cross-turn arm — pre-mortgage at pre-roll", () => {
  it("arms a manage to mortgage idle land for the distress completion", () => {
    // p1 is the active player at pre-roll, short on cash for the distress completer.
    const state: GameState = {
      ...distressBoard(200, 5),
      turn: { ...base.turn, phase: "pre-roll", playerId: "p1" },
    };
    const decision = policy(state, "p1");
    expect(decision).not.toBeNull();
    expect(decision?.intent.kind).toBe("set-queue");
    if (decision?.intent.kind === "set-queue") {
      expect(decision.intent.queue).toBe("manage");
    }
    expect((decision?.note ?? "").toLowerCase()).toContain("cash-strapped");
  });

  it("commits a mortgage-only raise in the managing intermission", () => {
    const state: GameState = {
      ...distressBoard(200, 5),
      turn: { ...base.turn, phase: "managing", managerId: "p1", playerId: "p1" },
    };
    const decision = policy(state, "p1");
    expect(decision?.intent.kind).toBe("manage");
    if (decision?.intent.kind === "manage") {
      // Mortgage-only: no builds, at least one idle lot mortgaged.
      expect(Object.keys(decision.intent.build)).toHaveLength(0);
      expect(Object.values(decision.intent.mortgage).some((v) => v)).toBe(true);
    }
  });

  it("does NOT pre-mortgage when the seller is comfortable (no firing at all)", () => {
    const state: GameState = {
      ...distressBoard(200, 3000),
      turn: { ...base.turn, phase: "pre-roll", playerId: "p1" },
    };
    const decision = policy(state, "p1");
    // Either nothing to do, or a normal build/trade arm — never the distress raise.
    expect(decision?.note?.toLowerCase() ?? "").not.toContain("cash-strapped");
  });
});
