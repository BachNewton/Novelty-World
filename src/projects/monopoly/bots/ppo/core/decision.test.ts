import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { buildCorpus, phaseHistogram } from "./corpus.testkit";
import { headFor } from "./encode-rl";
import { pendingDecision } from "./decision";

// `pendingDecision` is an extraction: where it came from it is module-private and
// only ever exercised through the surrounding loop. These pin its contract
// standalone, so the shipped copy is covered on its own terms.

const CORPUS = buildCorpus({ seeds: 20, maxSnaps: 900, perPhaseCap: 90 });

describe("pendingDecision", () => {
  it("names a live seat and the head that seat's observation will carry", () => {
    let checked = 0;
    for (const snap of CORPUS) {
      const decision = pendingDecision(snap.state);
      if (decision === null) continue;
      checked++;
      const player = snap.state.players.find((p) => p.id === decision.seatId);
      expect(player, `${snap.phase}: unknown seat ${decision.seatId}`).toBeDefined();
      expect(player?.bankrupt).toBe(false);
      // The head the observation builder independently derives must match.
      expect(headFor(snap.state, decision.seatId)).toBe(decision.head);
    }
    expect(checked).toBeGreaterThan(300);
  }, 120_000);

  it("is null for the phases with no policy head, non-null for the phases with one", () => {
    const seen = new Map<string, Set<boolean>>();
    for (const snap of CORPUS) {
      const owed = pendingDecision(snap.state) !== null;
      const set = seen.get(snap.phase) ?? new Set<boolean>();
      set.add(owed);
      seen.set(snap.phase, set);
    }
    // Phases with a head always owe a decision; the headless ones never do.
    for (const phase of ["pre-roll", "post-roll", "buy-decision", "jail-decision"]) {
      expect([...(seen.get(phase) ?? [])], phase).toEqual([true]);
    }
    for (const phase of ["must-raise-cash", "raising-cash", "managing"]) {
      const states = [...(seen.get(phase) ?? [])];
      if (states.length > 0) expect(states, phase).toEqual([false]);
    }
    // Coverage evidence for the assertions above.
    expect(Object.keys(phaseHistogram(CORPUS)).length).toBeGreaterThan(6);
  }, 120_000);

  it("returns null once the game is over, whatever the turn says", () => {
    const base = freshGame("decision-done", undefined, 4);
    const done: GameState = { ...base, status: "finished" };
    expect(pendingDecision(done)).toBeNull();
    // …and non-null on the same turn while active.
    expect(pendingDecision(base)).not.toBeNull();
  });

  it("trade-building with no draft, auction with no auction, trade-pending with no offer are all null", () => {
    const base = freshGame("decision-empty", undefined, 4);
    const playerId = base.turn.playerId;
    for (const phase of ["trade-building", "auction", "trade-pending"] as const) {
      const state: GameState = { ...base, turn: { ...base.turn, phase, playerId } };
      expect(pendingDecision(state), phase).toBeNull();
    }
  });

  it("auction skips the leader and picks the first still-active non-leader", () => {
    const base = freshGame("decision-auction", undefined, 4);
    const [a, b, c] = base.players.map((p) => p.id);
    const state: GameState = {
      ...base,
      turn: {
        ...base.turn,
        phase: "auction",
        auction: {
          position: 1,
          active: [a, b, c],
          highBid: 10,
          leaderId: a,
          bids: { [a]: 10 },
          resume: { kind: "landing" },
        },
      },
    };
    const decision = pendingDecision(state);
    expect(decision).toEqual({ seatId: b, head: "global" });
  });

  it("trade-pending picks the first NAMED party that has not yet approved", () => {
    const base = freshGame("decision-pending", undefined, 4);
    const [a, b, c] = base.players.map((p) => p.id);
    const state: GameState = {
      ...base,
      turn: {
        ...base.turn,
        phase: "trade-pending",
        pendingTrade: {
          id: "t1",
          proposerId: a,
          propertyTo: {},
          gojfTo: {},
          cashDelta: {},
          // `a` has approved; `b` is named and has not. `c` is not a party.
          approvals: { [a]: true, [b]: false },
        },
      },
    };
    expect(pendingDecision(state)).toEqual({ seatId: b, head: "global" });
    // Everyone approved ⇒ nothing owed (the engine executes it mechanically).
    const pending = state.turn.pendingTrade;
    expect(pending).toBeDefined();
    if (pending === undefined) return;
    const allYes: GameState = {
      ...state,
      turn: {
        ...state.turn,
        pendingTrade: { ...pending, approvals: { [a]: true, [b]: true } },
      },
    };
    expect(pendingDecision(allYes)).toBeNull();
    expect(c).toBeDefined();
  });
});
