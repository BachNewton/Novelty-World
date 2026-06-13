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

describe("botIntent — must-raise-cash", () => {
  it("mortgages the cheapest building-free, un-mortgaged property", () => {
    // p1 owns Mediterranean (1, mortgaged), Baltic (3, has a house) and
    // Reading Railroad (5, free). Only the railroad is mortgageable.
    const state: GameState = {
      ...withTurn({
        phase: "must-raise-cash",
        pendingDebt: { amount: 200, creditorId: "p2" },
      }),
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

  it("returns null when nothing can be mortgaged", () => {
    const state = withTurn({
      phase: "must-raise-cash",
      pendingDebt: { amount: 200, creditorId: "p2" },
    });
    expect(botIntent(state, "p1")).toBeNull();
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
