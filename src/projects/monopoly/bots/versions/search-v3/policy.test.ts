import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import { isLegal } from "../../../engine";
import type { GameState } from "../../../types";
import { searchBot } from "./policy";
import { baseBot } from "./base";

// freshGame seats p1..p4, p1 active, $1500 each, a real seeded rngState + decks —
// so the rollout engine can drive full games from these states. search-v3 wraps
// the TUNED claude-v45 base and searches FOUR decisions (buy, trade-vote, auction,
// jail); these assert determinism + that every played move is legal and in-set.
const base = freshGame("search-v3-test");

function withTurn(
  turn: Partial<GameState["turn"]>,
  patch: Partial<GameState> = {},
): GameState {
  return { ...base, ...patch, turn: { ...base.turn, ...turn } };
}

function setPlayer(state: GameState, id: string, patch: Partial<GameState["players"][number]>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

function buyState(): GameState {
  return withTurn({ phase: "buy-decision", pendingBuy: 19 }, { ownership: { 16: "p1", 18: "p1" } });
}

function tradeVoteState(): GameState {
  const pending = {
    id: "t1",
    proposerId: "p3",
    propertyTo: { 19: "p1" },
    gojfTo: {},
    cashDelta: { p1: -100, p3: 100 },
    approvals: { p3: true, p1: false },
  };
  return withTurn(
    { phase: "trade-pending", pendingTrade: pending },
    { ownership: { 16: "p1", 18: "p1", 19: "p3" } },
  );
}

function auctionState(): GameState {
  return withTurn(
    {
      phase: "auction",
      auction: {
        position: 19,
        active: ["p1", "p2"],
        highBid: 100,
        leaderId: "p2",
        bids: { p2: 100 },
        resume: { kind: "landing" },
      },
    },
    { ownership: { 16: "p1", 18: "p1" } },
  );
}

function jailState(): GameState {
  // p1 jailed at its jail decision, holding a developed-board threat (p2 has an
  // orange monopoly with houses) so the choice is non-trivial.
  const s = withTurn(
    { phase: "jail-decision" },
    { ownership: { 16: "p2", 18: "p2", 19: "p2" }, houses: { 16: 3, 18: 3, 19: 3 } },
  );
  return setPlayer(s, "p1", { inJail: true, jailTurns: 1 });
}

describe("search-v3 — determinism (identical decision on repeated calls)", () => {
  for (const [name, make] of [
    ["buy", buyState],
    ["trade vote", tradeVoteState],
    ["auction", auctionState],
    ["jail", jailState],
  ] as const) {
    it(`is deterministic at ${name}`, () => {
      const state = make();
      const a = searchBot(state, "p1");
      const b = searchBot(state, "p1");
      const c = searchBot(state, "p1");
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });
  }
});

describe("search-v3 — the played move is always legal and in-set", () => {
  it("plays a legal buy candidate", () => {
    const d = searchBot(buyState(), "p1");
    if (!d) throw new Error("expected a decision");
    expect(isLegal(buyState(), d.intent)).toBe(true);
    expect(["buy", "decline-buy", "raise-cash"]).toContain(d.intent.kind);
  });

  it("plays a legal trade vote", () => {
    const s = tradeVoteState();
    const d = searchBot(s, "p1");
    if (!d) throw new Error("expected a decision");
    expect(isLegal(s, d.intent)).toBe(true);
    expect(["accept-trade", "decline-trade"]).toContain(d.intent.kind);
  });

  it("plays a legal auction move (bid or pass)", () => {
    const s = auctionState();
    const d = searchBot(s, "p1");
    if (!d) throw new Error("expected a decision");
    expect(isLegal(s, d.intent)).toBe(true);
    expect(["bid", "pass-bid"]).toContain(d.intent.kind);
  });

  it("at jail, plays a legal move or defers the roll to the pacer (null / bot-note)", () => {
    const s = jailState();
    const d = searchBot(s, "p1");
    // A non-null decision must be a legal jail move or a (no-op-legal) bot-note.
    if (d && d.intent.kind !== "bot-note") {
      expect(isLegal(s, d.intent)).toBe(true);
      expect(["use-jail-card", "pay-to-leave-jail"]).toContain(d.intent.kind);
    }
  });

  it("an off-turn seat owes no buy decision (null, like the base policy)", () => {
    const s = buyState();
    expect(searchBot(s, "p2")).toBeNull();
    expect(baseBot(s, "p2")).toBeNull();
  });
});

describe("search-v3 — delegates non-searched phases verbatim to the base policy", () => {
  it("pre-roll matches baseBot exactly", () => {
    const s = withTurn({ phase: "pre-roll" }, { ownership: { 16: "p1", 18: "p1", 19: "p1" } });
    expect(searchBot(s, "p1")).toEqual(baseBot(s, "p1"));
  });
});
