import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import type { GameState } from "../types";
import { botIntent } from "./policy";

// freshGame seats p1..p4 with p1 active and $1500 each, no ownership.
const base = freshGame();

function withTurn(turn: Partial<GameState["turn"]>): GameState {
  return { ...base, turn: { ...base.turn, ...turn } };
}

describe("botIntent — buy-decision", () => {
  it("buys an affordable property", () => {
    // Position 1 (Mediterranean Avenue) costs $60; p1 holds $1500.
    const state = withTurn({ phase: "buy-decision", pendingBuy: 1 });
    expect(botIntent(state, "p1")).toEqual({ kind: "buy", playerId: "p1" });
  });

  it("declines when it can't afford the property", () => {
    const broke: GameState = {
      ...withTurn({ phase: "buy-decision", pendingBuy: 1 }),
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, cash: 10 } : p,
      ),
    };
    expect(botIntent(broke, "p1")).toEqual({ kind: "decline-buy", playerId: "p1" });
  });
});

function inTheRed(state: GameState, playerId: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, cash } : p)),
  };
}

describe("botIntent — must-raise-cash", () => {
  it("mortgages the cheapest building-free, un-mortgaged property of the debtor", () => {
    // p1 is in the red and owns Mediterranean (1, mortgaged), Baltic (3, has a
    // house) and Reading Railroad (5, free). Only the railroad is mortgageable.
    const state: GameState = {
      ...inTheRed(
        withTurn({ phase: "must-raise-cash", raiseCash: "after-landing" }),
        "p1",
        -200,
      ),
      ownership: { 1: "p1", 3: "p1", 5: "p1" },
      mortgaged: { 1: true },
      houses: { 3: 1 },
    };
    expect(botIntent(state, "p1")).toEqual({
      kind: "mortgage",
      playerId: "p1",
      position: 5,
    });
  });

  it("returns null for a bot who isn't the current debtor", () => {
    // p1 is the one in the red; p2 has nothing to settle.
    const state = inTheRed(
      withTurn({ phase: "must-raise-cash", raiseCash: "after-landing" }),
      "p1",
      -200,
    );
    expect(botIntent(state, "p2")).toBeNull();
  });

  it("sells a built set's buildings once nothing is left to mortgage", () => {
    // p1 is in the red and owns only developed property: oranges ($100 houses)
    // and greens ($200). With nothing mortgageable, the bot liquidates the
    // cheaper set (oranges) back to bare lots.
    const state: GameState = {
      ...inTheRed(
        withTurn({ phase: "must-raise-cash", raiseCash: "after-landing" }),
        "p1",
        -400,
      ),
      ownership: { 16: "p1", 18: "p1", 19: "p1", 31: "p1", 32: "p1", 34: "p1" },
      houses: { 16: 1, 18: 1, 19: 1, 31: 1, 32: 1, 34: 1 },
    };
    expect(botIntent(state, "p1")).toEqual({
      kind: "manage",
      playerId: "p1",
      build: { 16: 0, 18: 0, 19: 0 },
      mortgage: {},
    });
  });

  it("returns null when the debtor has nothing to liquidate at all", () => {
    const state = inTheRed(
      withTurn({ phase: "must-raise-cash", raiseCash: "after-landing" }),
      "p1",
      -200,
    );
    expect(botIntent(state, "p1")).toBeNull();
  });
});

describe("botIntent — trade-pending", () => {
  const pending = {
    id: "t1",
    proposerId: "p1",
    propertyTo: { 1: "p2" },
    gojfTo: {},
    cashDelta: {},
    approvals: { p1: true, p2: false },
  };

  it("accepts when the bot is a named party that hasn't voted", () => {
    const state = withTurn({ phase: "trade-pending", pendingTrade: pending });
    expect(botIntent(state, "p2")).toEqual({
      kind: "accept-trade",
      playerId: "p2",
      tradeId: "t1",
    });
  });

  it("returns null once the bot has approved", () => {
    const state = withTurn({
      phase: "trade-pending",
      pendingTrade: { ...pending, approvals: { p1: true, p2: true } },
    });
    expect(botIntent(state, "p2")).toBeNull();
  });

  it("returns null for a player who isn't a party", () => {
    const state = withTurn({ phase: "trade-pending", pendingTrade: pending });
    expect(botIntent(state, "p3")).toBeNull();
  });
});

describe("botIntent — jail-decision", () => {
  it("uses a held Get-Out-of-Jail-Free card first (it's free)", () => {
    const state: GameState = {
      ...withTurn({ phase: "jail-decision" }),
      jailFreeCards: { chance: "p1" },
    };
    expect(botIntent(state, "p1")).toEqual({
      kind: "use-jail-card",
      playerId: "p1",
    });
  });

  it("prefers a held card over paying even with cash on hand", () => {
    // Card → cash → roll: a held card is spent before $50 even when affordable.
    const state: GameState = {
      ...withTurn({ phase: "jail-decision" }),
      jailFreeCards: { communityChest: "p1" },
    };
    expect(botIntent(state, "p1")).toEqual({
      kind: "use-jail-card",
      playerId: "p1",
    });
  });

  it("pays the fine when it has no card but can afford $50", () => {
    const state = withTurn({ phase: "jail-decision" });
    expect(botIntent(state, "p1")).toEqual({
      kind: "pay-to-leave-jail",
      playerId: "p1",
    });
  });

  it("rolls (returns null) when it has neither a card nor the fine", () => {
    const broke: GameState = {
      ...withTurn({ phase: "jail-decision" }),
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, cash: 40 } : p,
      ),
    };
    expect(botIntent(broke, "p1")).toBeNull();
  });

  it("returns null when it isn't that player's jail turn", () => {
    expect(botIntent(withTurn({ phase: "jail-decision" }), "p2")).toBeNull();
  });
});

describe("botIntent — auction", () => {
  function auctionTurn(
    overrides: Partial<NonNullable<GameState["turn"]["auction"]>> = {},
  ): GameState {
    return withTurn({
      phase: "auction",
      auction: {
        position: 1, // Mediterranean Avenue, printed price $60
        active: ["p1", "p2", "p3", "p4"],
        highBid: 0,
        leaderId: null,
        bids: {},
        resume: { kind: "landing" },
        ...overrides,
      },
    });
  }

  it("raises by the increment when the next bid is affordable and below the price", () => {
    expect(botIntent(auctionTurn({ highBid: 40 }), "p1")).toEqual({
      kind: "bid",
      playerId: "p1",
      amount: 50,
    });
  });

  it("drops once the next bid would exceed the printed price", () => {
    expect(botIntent(auctionTurn({ highBid: 60 }), "p1")).toEqual({
      kind: "pass-bid",
      playerId: "p1",
    });
  });

  it("drops when the next bid would exceed cash (estate cap incl. mortgage interest)", () => {
    // p1 has $5 cash; the lot is a still-mortgaged estate lot, so the $3
    // interest leaves only $2 — below the $10 opening bid.
    const poor: GameState = {
      ...auctionTurn({ resume: { kind: "bank-estate", debtorId: "p2", remaining: [] } }),
      players: base.players.map((p) => (p.id === "p1" ? { ...p, cash: 5 } : p)),
      mortgaged: { 1: true },
    };
    expect(botIntent(poor, "p1")).toEqual({ kind: "pass-bid", playerId: "p1" });
  });

  it("never jams its own standing lead", () => {
    expect(botIntent(auctionTurn({ highBid: 20, leaderId: "p1" }), "p1")).toBeNull();
  });

  it("returns null for a bot that has already dropped", () => {
    expect(botIntent(auctionTurn({ active: ["p2", "p3"] }), "p1")).toBeNull();
  });
});

describe("botIntent — no decision to make", () => {
  it("returns null for a mechanical phase", () => {
    expect(botIntent(withTurn({ phase: "pre-roll" }), "p1")).toBeNull();
    expect(botIntent(withTurn({ phase: "post-roll" }), "p1")).toBeNull();
  });

  it("returns null when it isn't that player's turn", () => {
    const state = withTurn({ phase: "buy-decision", pendingBuy: 1 });
    expect(botIntent(state, "p2")).toBeNull();
  });
});
