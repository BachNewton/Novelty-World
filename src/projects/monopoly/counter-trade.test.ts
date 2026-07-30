import { describe, expect, it } from "vitest";
import { apply } from "./engine";
import { freshGame } from "./mocks";
import type { GameState, Intent } from "./types";

function withOwnership(
  state: GameState,
  ownership: Record<number, string>,
): GameState {
  return { ...state, ownership: { ...state.ownership, ...ownership } };
}

function inTradeBuilding(state: GameState, proposerId: string): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: "trade-building",
      tradeDraft: { proposerId, propertyTo: {}, gojfTo: {}, cashDelta: {} },
    },
  };
}

function applyOk(state: GameState, intent: Intent): GameState {
  const result = apply(state, intent);
  if (!result.ok) throw new Error(`${intent.kind} rejected: ${result.reason}`);
  return result.state;
}

/** Stage a trade proposal: p1 offers property 1 to p2 for $60. Returns the
 *  state in trade-pending with the pending trade available. */
function stagePendingTrade(gameId: string): {
  state: GameState;
  tradeId: string;
} {
  const start = withOwnership(freshGame(gameId), { 1: "p1" });
  const building = inTradeBuilding(start, "p1");
  const staged = apply(building, {
    kind: "update-trade-draft",
    playerId: "p1",
    terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: { p1: 60, p2: -60 } },
  });
  if (!staged.ok) throw new Error(staged.reason);
  const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p1" });
  if (!proposed.ok) throw new Error(proposed.reason);
  const pending = proposed.state.turn.pendingTrade;
  if (!pending) throw new Error("expected a pending trade");
  return { state: proposed.state, tradeId: pending.id };
}

describe("counter-trade", () => {
  it("transitions from trade-pending to trade-building with counterer as proposer", () => {
    const { state, tradeId } = stagePendingTrade("counter-basic");

    const countered = apply(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    if (!countered.ok) throw new Error(countered.reason);

    expect(countered.state.turn.phase).toBe("trade-building");
    expect(countered.state.turn.pendingTrade).toBeUndefined();
    const draft = countered.state.turn.tradeDraft;
    expect(draft).toBeDefined();
    expect(draft!.proposerId).toBe("p2"); // counterer becomes new proposer
  });

  it("pre-fills the draft with the pending trade's terms", () => {
    const { state, tradeId } = stagePendingTrade("counter-prefill");

    const countered = apply(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    if (!countered.ok) throw new Error(countered.reason);
    const draft = countered.state.turn.tradeDraft!;
    expect(draft.propertyTo).toEqual({ 1: "p2" });
    expect(draft.cashDelta).toEqual({ p1: 60, p2: -60 });
  });

  it("sets parentId to the prior trade id and chainDepth to 1", () => {
    const { state, tradeId } = stagePendingTrade("counter-chain");

    const countered = apply(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    if (!countered.ok) throw new Error(countered.reason);
    const draft = countered.state.turn.tradeDraft!;
    expect(draft.parentId).toBe(tradeId);
    expect(draft.chainDepth).toBe(1);
  });

  it("rejects counter from a non-party", () => {
    const { state, tradeId } = stagePendingTrade("counter-nonparty");

    const countered = apply(state, {
      kind: "counter-trade",
      playerId: "p3",
      tradeId,
    });
    expect(countered.ok).toBe(false);
    if (!countered.ok) expect(countered.reason).toContain("not a party");
  });

  it("rejects counter with a stale trade id", () => {
    const { state } = stagePendingTrade("counter-stale");

    const countered = apply(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId: "nonexistent-id",
    });
    expect(countered.ok).toBe(false);
    if (!countered.ok) expect(countered.reason).toContain("stale");
  });

  it("rejects counter when not in trade-pending phase", () => {
    const start = withOwnership(freshGame("counter-no-phase"), { 1: "p1" });
    const building = inTradeBuilding(start, "p1");

    const countered = apply(building, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId: "fake",
    });
    expect(countered.ok).toBe(false);
  });

  it("preserves chain linkage through counter → re-propose cycle", () => {
    const { state, tradeId } = stagePendingTrade("counter-repropose");

    // p2 counters
    const countered = applyOk(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    expect(countered.turn.tradeDraft!.chainDepth).toBe(1);
    expect(countered.turn.tradeDraft!.parentId).toBe(tradeId);

    // p2 modifies the terms and re-proposes
    const modified = apply(countered, {
      kind: "update-trade-draft",
      playerId: "p2",
      terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: { p1: 100, p2: -100 } },
    });
    if (!modified.ok) throw new Error(modified.reason);

    const reProposed = apply(modified.state, {
      kind: "propose-trade",
      playerId: "p2",
    });
    if (!reProposed.ok) throw new Error(reProposed.reason);

    expect(reProposed.state.turn.phase).toBe("trade-pending");
    const pending = reProposed.state.turn.pendingTrade!;
    expect(pending.chainDepth).toBe(1); // carried into PendingTrade
    expect(pending.parentId).toBe(tradeId); // link preserved
    expect(pending.proposerId).toBe("p2"); // counterer is the new proposer
    expect(pending.cashDelta.p1).toBe(100); // modified terms
  });

  it("allows counter-counter (chainDepth 2) when the original proposer counters back", () => {
    const { state, tradeId } = stagePendingTrade("counter-counter");

    // p2 counters → chainDepth 1
    const c1 = applyOk(state, { kind: "counter-trade", playerId: "p2", tradeId });
    const c1Proposed = applyOk(c1, { kind: "propose-trade", playerId: "p2" });
    const pending1 = c1Proposed.turn.pendingTrade!;

    // p1 counter-counters → chainDepth 2
    const c2 = apply(c1Proposed, {
      kind: "counter-trade",
      playerId: "p1",
      tradeId: pending1.id,
    });
    if (!c2.ok) throw new Error(c2.reason);
    expect(c2.state.turn.tradeDraft!.chainDepth).toBe(2);
    expect(c2.state.turn.tradeDraft!.parentId).toBe(pending1.id);
    expect(c2.state.turn.tradeDraft!.proposerId).toBe("p1");
  });

  it("accepting a counter executes the trade normally", () => {
    const { state, tradeId } = stagePendingTrade("counter-accept");

    // p2 counters with modified terms
    const countered = applyOk(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    const modified = applyOk(countered, {
      kind: "update-trade-draft",
      playerId: "p2",
      terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: { p1: 80, p2: -80 } },
    });
    const reProposed = applyOk(modified, { kind: "propose-trade", playerId: "p2" });
    const pending = reProposed.turn.pendingTrade!;

    // p1 accepts the counter
    const accepted = apply(reProposed, {
      kind: "accept-trade",
      playerId: "p1",
      tradeId: pending.id,
    });
    if (!accepted.ok) throw new Error(accepted.reason);

    expect(accepted.state.ownership[1]).toBe("p2");
    expect(
      accepted.state.players.find((p) => p.id === "p1")?.cash,
    ).toBe(1580); // 1500 + 80
    expect(
      accepted.state.players.find((p) => p.id === "p2")?.cash,
    ).toBe(1420); // 1500 - 80
    expect(accepted.state.turn.phase).toBe("pre-roll");
  });

  it("declining a counter returns to pre-roll (chain terminates, no revert)", () => {
    const { state, tradeId } = stagePendingTrade("counter-decline");

    // p2 counters
    const countered = applyOk(state, {
      kind: "counter-trade",
      playerId: "p2",
      tradeId,
    });
    const reProposed = applyOk(countered, { kind: "propose-trade", playerId: "p2" });
    const pending = reProposed.turn.pendingTrade!;

    // p1 declines the counter
    const declined = apply(reProposed, {
      kind: "decline-trade",
      playerId: "p1",
      tradeId: pending.id,
    });
    if (!declined.ok) throw new Error(declined.reason);

    expect(declined.state.turn.phase).toBe("pre-roll");
    expect(declined.state.ownership[1]).toBe("p1"); // unchanged
    expect(declined.state.turn.pendingTrade).toBeUndefined();
    expect(declined.state.turn.tradeDraft).toBeUndefined();
  });
});
