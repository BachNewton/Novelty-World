import { describe, expect, it } from "vitest";
import { apply } from "./engine";
import { freshGame } from "./mocks";
import { rebuildOverlay } from "./reconcile";
import type { AuctionState, GameState, Intent } from "./types";

/** A head whose active player's turn is past the roll — used to prove an armed
 *  intent rebases onto a boundary it wasn't predicted against. */
function postRoll(seed: string): GameState {
  const base = freshGame(seed);
  return { ...base, turn: { ...base.turn, phase: "post-roll" } };
}

/** A head with an open auction: p2 leads at $200, nobody else has bid. */
function auctionHead(seed: string): GameState {
  const base = freshGame(seed);
  const auction: AuctionState = {
    position: 1,
    active: ["p1", "p2", "p3", "p4"],
    highBid: 200,
    leaderId: "p2",
    bids: { p2: 200 },
    resume: { kind: "landing" },
  };
  return { ...base, turn: { ...base.turn, phase: "auction", auction } };
}

describe("rebuildOverlay", () => {
  it("re-arms a set-queue onto a head it wasn't predicted against", () => {
    // The Manage-flicker regression: the arm was predicted at pre-roll, but the
    // auto-roll won the version race and advanced the head to post-roll. Rebasing
    // the arm onto the new head keeps the checkbox armed (for the next boundary)
    // instead of dropping it.
    const head = postRoll("rc-arm");
    const arm: Intent = { kind: "set-queue", playerId: "p1", queue: "manage", armed: true };
    const { state, outbox } = rebuildOverlay(head, [arm]);
    expect(state.boundaryQueue).toEqual([{ playerId: "p1", kind: "manage" }]);
    expect(outbox).toEqual([arm]);
  });

  it("keeps the arm when replayed on a head that ALREADY reflects it", () => {
    // The "removed every time" regression: once the arm is confirmed (or echoed
    // back) the overlay replays the intent on a head that already has it. A
    // relative toggle would flip it back off; the absolute set-queue is
    // idempotent, so the arm stays.
    const base = postRoll("rc-idem");
    const arm: Intent = { kind: "set-queue", playerId: "p1", queue: "manage", armed: true };
    const armedHead: GameState = {
      ...base,
      boundaryQueue: [{ playerId: "p1", kind: "manage" }],
    };
    const { state, outbox } = rebuildOverlay(armedHead, [arm]);
    expect(state.boundaryQueue).toEqual([{ playerId: "p1", kind: "manage" }]);
    expect(outbox).toEqual([arm]);
  });

  it("drops an intent that no longer applies on the head", () => {
    // A bid with no auction open can't apply — it's dropped and the display
    // falls back to authoritative truth (the head, unchanged).
    const head = freshGame("rc-stale");
    const { state, outbox } = rebuildOverlay(head, [
      { kind: "bid", playerId: "p1", amount: 10 },
    ]);
    expect(state).toBe(head);
    expect(outbox).toEqual([]);
  });

  it("re-records an out-high bid without dropping it or escalating", () => {
    // The auction-bar regression: a $110 bid replayed onto a head where the high
    // is already $200 re-records $110 on the bidder's bar (counted) and leaves
    // the leader untouched — no snap-to-zero, no auto-escalation.
    const head = auctionHead("rc-bid");
    const bid: Intent = { kind: "bid", playerId: "p3", amount: 110 };
    const { state, outbox } = rebuildOverlay(head, [bid]);
    const auction = state.turn.auction;
    expect(auction?.bids).toEqual({ p2: 200, p3: 110 });
    expect(auction?.highBid).toBe(200);
    expect(auction?.leaderId).toBe("p2");
    expect(outbox).toEqual([bid]);
  });

  it("keeps surviving intents and prunes a stale one in the middle", () => {
    const head = freshGame("rc-mixed");
    const armManage: Intent = { kind: "set-queue", playerId: "p1", queue: "manage", armed: true };
    const staleBid: Intent = { kind: "bid", playerId: "p1", amount: 10 };
    const armTrade: Intent = { kind: "set-queue", playerId: "p1", queue: "trade", armed: true };
    const { state, outbox } = rebuildOverlay(head, [armManage, staleBid, armTrade]);
    expect(outbox).toEqual([armManage, armTrade]);
    expect(state.boundaryQueue).toEqual([
      { playerId: "p1", kind: "manage" },
      { playerId: "p1", kind: "trade" },
    ]);
  });

  it("returns the head untouched for an empty outbox", () => {
    const head = freshGame("rc-empty");
    const { state, outbox } = rebuildOverlay(head, []);
    expect(state).toBe(head);
    expect(outbox).toEqual([]);
  });
});

describe("predict-path intents are replay-safe", () => {
  // The invariant the whole rebase model rests on: replaying a pending intent on
  // a head that ALREADY incorporates it must be a no-op on state — either it's
  // idempotent (re-applies to the same state) or it cleanly fails and is dropped.
  // The original relative `toggle-queue` violated this (replay removed its own
  // arm); any future relative intent that slips into the predict path fails here.
  function auction(seed: string): GameState {
    const base = freshGame(seed);
    const a: AuctionState = {
      position: 1,
      active: ["p1", "p2", "p3", "p4"],
      highBid: 40,
      leaderId: "p2",
      bids: { p2: 40 },
      resume: { kind: "landing" },
    };
    return { ...base, turn: { ...base.turn, phase: "auction", auction: a } };
  }
  function managing(seed: string): GameState {
    const base = freshGame(seed);
    return {
      ...base,
      ownership: { ...base.ownership, 16: "p1", 18: "p1", 19: "p1" },
      turn: {
        ...base.turn,
        phase: "managing",
        managerId: "p1",
        manageStaged: { build: {}, mortgage: {} },
      },
    };
  }
  function tradeBuilding(seed: string): GameState {
    const base = freshGame(seed);
    return {
      ...base,
      ownership: { ...base.ownership, 1: "p1" },
      turn: {
        ...base.turn,
        phase: "trade-building",
        tradeDraft: { proposerId: "p1", propertyTo: {}, gojfTo: {}, cashDelta: {} },
      },
    };
  }
  function buyDecision(seed: string): GameState {
    const base = freshGame(seed);
    return { ...base, turn: { ...base.turn, phase: "buy-decision", pendingBuy: 1 } };
  }

  const cases: { name: string; base: GameState; intent: Intent }[] = [
    {
      name: "set-queue (idempotent)",
      base: freshGame("rs-arm"),
      intent: { kind: "set-queue", playerId: "p1", queue: "manage", armed: true },
    },
    {
      name: "bid (idempotent)",
      base: auction("rs-bid"),
      intent: { kind: "bid", playerId: "p1", amount: 50 },
    },
    {
      name: "update-manage-staging (idempotent snapshot)",
      base: managing("rs-stage"),
      intent: {
        kind: "update-manage-staging",
        playerId: "p1",
        staged: { build: { 16: 1, 18: 1, 19: 1 }, mortgage: {} },
      },
    },
    {
      name: "update-trade-draft (idempotent snapshot)",
      base: tradeBuilding("rs-draft"),
      intent: {
        kind: "update-trade-draft",
        playerId: "p1",
        terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: {} },
      },
    },
    {
      name: "buy (drops cleanly on replay)",
      base: buyDecision("rs-buy"),
      intent: { kind: "buy", playerId: "p1" },
    },
  ];

  for (const { name, base, intent } of cases) {
    it(`${name}: replaying on an already-applied head is a state no-op`, () => {
      const applied = apply(base, intent);
      if (!applied.ok) throw new Error(`setup intent rejected: ${applied.reason}`);
      // Replaying the same intent on the head it produced must not change state.
      const replayed = rebuildOverlay(applied.state, [intent]);
      expect(replayed.state).toEqual(applied.state);
    });
  }
});
