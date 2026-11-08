import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import type { GameState } from "../types";
import { dumbBot } from "./dumb";

// freshGame seats p1..p4 with p1 active and $1500 each, no ownership.
const base = freshGame();

function withTurn(turn: Partial<GameState["turn"]>): GameState {
  return { ...base, turn: { ...base.turn, ...turn } };
}

// dumbBot returns a note-less BotDecision; these tests assert the raw intent it
// would submit (or null when it has no move).
function decide(state: GameState, playerId: string) {
  return dumbBot(state, playerId)?.intent ?? null;
}
function inTheRed(state: GameState, playerId: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, cash } : p)),
  };
}

describe("dumbBot — must-raise-cash", () => {
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
    expect(decide(state, "p1")).toEqual({
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
    expect(decide(state, "p2")).toBeNull();
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
    expect(decide(state, "p1")).toEqual({
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
    expect(decide(state, "p1")).toBeNull();
  });
});
describe("dumbBot — auction", () => {
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
    expect(decide(auctionTurn({ highBid: 40 }), "p1")).toEqual({
      kind: "bid",
      playerId: "p1",
      amount: 50,
    });
  });

  it("drops once the next bid would exceed the printed price", () => {
    expect(decide(auctionTurn({ highBid: 60 }), "p1")).toEqual({
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
    expect(decide(poor, "p1")).toEqual({ kind: "pass-bid", playerId: "p1" });
  });

  it("never jams its own standing lead", () => {
    expect(decide(auctionTurn({ highBid: 20, leaderId: "p1" }), "p1")).toBeNull();
  });

  it("returns null for a bot that has already dropped", () => {
    expect(decide(auctionTurn({ active: ["p2", "p3"] }), "p1")).toBeNull();
  });
});
