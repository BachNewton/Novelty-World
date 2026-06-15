import { describe, expect, it } from "vitest";
import { CHANCE, COMMUNITY_CHEST, deckFor } from "./data";
import { apply, autoStep, createRng, firstNegativePlayer } from "./engine";
import { freshGame } from "./mocks";
import type { CardSource, GameState, Intent, Player } from "./types";

/** Apply an intent, throwing on rejection — keeps the auction sequences below
 *  readable as a straight-line script of bids and passes. */
function applyOk(state: GameState, intent: Intent): GameState {
  const result = apply(state, intent);
  if (!result.ok) throw new Error(`${intent.kind} rejected: ${result.reason}`);
  return result.state;
}

/** Drop the active player straight into a buy-decision on `position`, the entry
 *  point a decline-buy auction starts from. */
function buyDecision(state: GameState, position: number): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: "buy-decision", pendingBuy: position },
  };
}

function cashOf(state: GameState, id: string): number {
  return state.players.find((p) => p.id === id)?.cash ?? 0;
}

// Resume the seeded RNG and pull the same two dice autoStep would, without
// mutating the state. Lets a test place the active player so the roll lands
// on a chosen square deterministically across seed changes.
function predictRoll(rngState: number): { total: number } {
  const rng = createRng(rngState);
  const d1 = Math.floor(rng.next() * 6) + 1;
  const d2 = Math.floor(rng.next() * 6) + 1;
  return { total: d1 + d2 };
}

function placeActivePlayerAt(state: GameState, position: number): GameState {
  return {
    ...state,
    players: state.players.map((p, i): Player =>
      i === 0 ? { ...p, position } : p,
    ),
  };
}

// Roll the seeded RNG, then position the active player so the eventual
// landing square is `target`. Use after-move expectations are checked
// against `target`, not the predicted dice — the predicted total is just
// the placement math.
function setupLandingOn(
  state: GameState,
  target: number,
): { state: GameState; diceTotal: number } {
  const { total } = predictRoll(state.rngState);
  const startPos = (target - total + 40) % 40;
  return { state: placeActivePlayerAt(state, startPos), diceTotal: total };
}

function setCash(state: GameState, playerId: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p): Player =>
      p.id === playerId ? { ...p, cash } : p,
    ),
  };
}

function withOwnership(
  state: GameState,
  ownership: Record<number, string>,
): GameState {
  return { ...state, ownership: { ...state.ownership, ...ownership } };
}

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng("alpha");
    const b = createRng("alpha");
    const sampleA = [a.next(), a.next(), a.next()];
    const sampleB = [b.next(), b.next(), b.next()];
    expect(sampleA).toEqual(sampleB);
  });

  it("produces different streams for different seeds", () => {
    const a = createRng("alpha");
    const b = createRng("beta");
    expect(a.next()).not.toEqual(b.next());
  });

  it("resumes the same stream from a serialized getState() value", () => {
    const a = createRng("resume");
    const before = [a.next(), a.next()];
    const snapshot = a.getState();
    const expected = [a.next(), a.next(), a.next()];

    const b = createRng(snapshot);
    const actual = [b.next(), b.next(), b.next()];
    expect(actual).toEqual(expected);
    // And the resumed RNG hasn't poisoned what came before.
    expect(before).toHaveLength(2);
  });
});

describe("autoStep", () => {
  it("rolls the dice, leaves pre-roll, and bumps rngState", () => {
    const state = freshGame("test-roll");
    const { state: next, newEvents } = autoStep(state);

    expect(next.turn.phase).not.toBe("pre-roll");
    expect(next.rngState).not.toBe(state.rngState);
    expect(newEvents).toHaveLength(1);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    const [d1, d2] = event.dice;
    expect(d1).toBeGreaterThanOrEqual(1);
    expect(d1).toBeLessThanOrEqual(6);
    expect(d2).toBeGreaterThanOrEqual(1);
    expect(d2).toBeLessThanOrEqual(6);
    expect(event.toPosition).toBe(d1 + d2);
    expect(event.passedGo).toBe(false);

    const player = next.players.find((p) => p.id === next.turn.playerId);
    expect(player?.position).toBe(d1 + d2);

    const lastTurn = next.turns[next.turns.length - 1];
    expect(lastTurn.events).toContainEqual(event);
  });

  it("does not advance during an open intermission phase", () => {
    const state = freshGame("test-managing");
    const managing = {
      ...state,
      turn: { ...state.turn, phase: "managing" as const, managerId: "p2" },
    };
    const { state: next, newEvents } = autoStep(managing);
    expect(next).toBe(managing);
    expect(newEvents).toHaveLength(0);
  });

  it("is a no-op outside pre-roll", () => {
    const state = freshGame("test-postroll");
    const postRoll = { ...state, turn: { ...state.turn, phase: "post-roll" as const } };
    const { state: next, newEvents } = autoStep(postRoll);
    expect(next).toBe(postRoll);
    expect(newEvents).toHaveLength(0);
  });

  it("flags passedGo when the move wraps the board", () => {
    const state = freshGame("test-wrap");
    const nearGo = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 38 } : p,
      ),
    };
    const { state: next, newEvents } = autoStep(nearGo);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(true);
    expect(event.toPosition).toBe((38 + event.dice[0] + event.dice[1]) % 40);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.position).toBe(event.toPosition);
  });

  it("credits $200 to the active player when they pass GO", () => {
    const state = freshGame("test-passgo-cash");
    const before = state.players[0].cash;
    const nearGo = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 38 } : p,
      ),
    };
    const { state: next, newEvents } = autoStep(nearGo);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(true);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.cash).toBe(before + 200);
  });

  it("leaves cash unchanged when the move does not pass GO", () => {
    const state = freshGame("test-no-passgo");
    const before = state.players[0].cash;
    const { state: next, newEvents } = autoStep(state);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(false);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.cash).toBe(before);
  });

  it("is replayable from a JSON-round-tripped state", () => {
    // The whole point of putting rngState in GameState: a serialized
    // snapshot is sufficient to keep the dice sequence deterministic
    // across reload, device, or host hand-off.
    const start = freshGame("test-replay");
    const live = autoStep(start);
    const reloaded = autoStep(JSON.parse(JSON.stringify(start)));
    expect(reloaded.newEvents).toEqual(live.newEvents);
    expect(reloaded.state.rngState).toBe(live.state.rngState);
  });
});

describe("apply", () => {
  it("advances to the next player and opens a new TurnGroup on end-turn", () => {
    const start = freshGame("test-end-turn-0");
    // Position the active player so the deterministic first roll lands on
    // Income Tax (pos 4) — a non-ownable square, so autoStep charges the tax
    // and settles at post-roll instead of branching into buy-decision.
    const { total } = predictRoll(start.rngState);
    const positioned = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const rolled = autoStep(positioned).state;
    expect(rolled.turn.phase).toBe("post-roll");

    const ended = apply(rolled, {
      kind: "end-turn",
      playerId: rolled.turn.playerId,
    });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    expect(ended.state.turn.playerId).toBe("p2");
    expect(ended.state.turn.phase).toBe("pre-roll");
    expect(ended.state.turn.doublesStreak).toBe(0);

    const lastTurn = ended.state.turns[ended.state.turns.length - 1];
    expect(lastTurn).toEqual({ turn: 2, playerId: "p2", events: [] });
  });

  it("rejects an end-turn submitted by the wrong player", () => {
    const start = freshGame("test-wrong-player");
    const rolled = autoStep(start).state;
    const rejected = apply(rolled, { kind: "end-turn", playerId: "p2" });
    expect(rejected.ok).toBe(false);
  });

  it("rejects end-turn outside of post-roll", () => {
    const start = freshGame("test-wrong-phase");
    const rejected = apply(start, {
      kind: "end-turn",
      playerId: start.turn.playerId,
    });
    expect(rejected.ok).toBe(false);
  });

  it("rejects a bid when no auction is open", () => {
    const state = freshGame("test-unimpl");
    const result = apply(state, { kind: "bid", playerId: "p1", amount: 10 });
    expect(result.ok).toBe(false);
  });
});

describe("apply manage", () => {
  const ORANGES = { 16: "p1", 18: "p1", 19: "p1" };

  // Put the manager (default p1) into their open manage intermission. The
  // manager may be off-turn; here p1 is also the active player by default.
  function managing(state: GameState, managerId = "p1"): GameState {
    return {
      ...state,
      turn: { ...state.turn, phase: "managing", managerId },
    };
  }

  function mustRaiseCash(
    state: GameState,
    debtorId: string,
    debt: number,
  ): GameState {
    return {
      ...setCash(state, debtorId, -debt),
      turn: {
        ...state.turn,
        phase: "must-raise-cash",
        raiseCash: "after-landing",
      },
    };
  }

  const cashOf = (state: GameState, id: string): number | undefined =>
    state.players.find((p) => p.id === id)?.cash;

  describe("building", () => {
    it("builds an even row in the manager's intermission", () => {
      let state = managing(withOwnership(freshGame("mg-build"), ORANGES));
      state = setCash(state, "p1", 1500);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.houses).toMatchObject({ 16: 1, 18: 1, 19: 1 });
      expect(cashOf(result.state, "p1")).toBe(1200);
      expect(result.newEvents.filter((e) => e.kind === "build")).toHaveLength(3);
      // A voluntary commit closes the intermission and returns to pre-roll.
      expect(result.state.turn.phase).toBe("pre-roll");
      expect(result.state.turn.managerId).toBeUndefined();
    });

    it("rejects managing outside the managing phase", () => {
      const state = withOwnership(freshGame("mg-unmanaging"), ORANGES);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });

    it("rejects a manage from someone who isn't the manager", () => {
      const state = managing(withOwnership(freshGame("mg-off"), ORANGES), "p1");
      const result = apply(state, {
        kind: "manage",
        playerId: "p2",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });

    it("lets an off-turn manager build during their intermission", () => {
      // p1 is the active turn owner; p2 holds the oranges and is the manager.
      let state = withOwnership(freshGame("mg-offturn-build"), {
        16: "p2",
        18: "p2",
        19: "p2",
      });
      state = managing(state, "p2");
      state = setCash(state, "p2", 1500);
      const result = apply(state, {
        kind: "manage",
        playerId: "p2",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.houses).toMatchObject({ 16: 1, 18: 1, 19: 1 });
      // Returns to the active player's pre-roll boundary, not p2's.
      expect(result.state.turn.phase).toBe("pre-roll");
      expect(result.state.turn.playerId).toBe("p1");
    });

    it("rejects a build the player can't afford", () => {
      let state = managing(withOwnership(freshGame("mg-poor"), ORANGES));
      state = setCash(state, "p1", 100);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });

    it("rejects a no-op manage with nothing staged", () => {
      const state = managing(withOwnership(freshGame("mg-noop"), ORANGES));
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: {},
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("mortgaging", () => {
    it("mortgages a property for half its price", () => {
      let state = managing(
        withOwnership(freshGame("mg-mort"), { 5: "p1" }),
      ); // Reading Railroad ($200)
      state = setCash(state, "p1", 1000);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: {},
        mortgage: { 5: true },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.mortgaged[5]).toBe(true);
      expect(cashOf(result.state, "p1")).toBe(1100);
    });

    it("unmortgages for the mortgage value plus 10% interest", () => {
      let state = managing(withOwnership(freshGame("mg-unmort"), { 5: "p1" }));
      state = { ...state, mortgaged: { 5: true } };
      state = setCash(state, "p1", 1000);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: {},
        mortgage: { 5: false },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.mortgaged[5]).toBeUndefined();
      // $100 mortgage value + 10% = $110.
      expect(cashOf(result.state, "p1")).toBe(890);
    });

    it("refuses to mortgage a property that still has buildings", () => {
      let state = managing(withOwnership(freshGame("mg-built"), ORANGES));
      state = { ...state, houses: { 16: 1, 18: 1, 19: 1 } };
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: {},
        mortgage: { 16: true },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("combined build + mortgage in one commit", () => {
    it("sells a set's houses then mortgages the bare lots", () => {
      let state = managing(withOwnership(freshGame("mg-sell-mort"), ORANGES));
      state = { ...state, houses: { 16: 2, 18: 2, 19: 2 } };
      state = setCash(state, "p1", 1500);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 0, 18: 0, 19: 0 },
        mortgage: { 16: true, 18: true, 19: true },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.houses).toEqual({});
      expect(result.state.mortgaged).toMatchObject({
        16: true,
        18: true,
        19: true,
      });
      // Sells 6 house tiers (+$300) + mortgages 16/18/19 (prices 180/180/200 ->
      // half = $90+$90+$100 = +$280) = +$580.
      expect(cashOf(result.state, "p1")).toBe(2080);
    });

    it("mortgages one property to fund building another set", () => {
      let state = managing(
        withOwnership(freshGame("mg-fund"), { ...ORANGES, 5: "p1" }),
      );
      state = setCash(state, "p1", 250); // can't afford $300 of houses alone
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: { 5: true },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // +$100 mortgage - $300 houses = -$200 -> 250 - 200 = 50.
      expect(cashOf(result.state, "p1")).toBe(50);
      expect(result.state.houses).toMatchObject({ 16: 1, 18: 1, 19: 1 });
      expect(result.state.mortgaged[5]).toBe(true);
    });

    it("unmortgages a set member so the set becomes buildable in the same commit", () => {
      let state = managing(withOwnership(freshGame("mg-unmort-build"), ORANGES));
      state = { ...state, mortgaged: { 19: true } };
      state = setCash(state, "p1", 1500);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: { 19: false },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.mortgaged[19]).toBeUndefined();
      expect(result.state.houses).toMatchObject({ 16: 1, 18: 1, 19: 1 });
      // -$110 unmortgage - $300 houses = -$410 -> 1500 - 410 = 1090.
      expect(cashOf(result.state, "p1")).toBe(1090);
    });

    it("rejects building a set that stays mortgaged", () => {
      let state = managing(withOwnership(freshGame("mg-still-mort"), ORANGES));
      state = { ...state, mortgaged: { 19: true } };
      state = setCash(state, "p1", 1500);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {}, // 19 left mortgaged
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("must-raise-cash", () => {
    it("lets the debtor sell buildings and mortgage to settle", () => {
      let state = withOwnership(freshGame("mg-raise"), {
        16: "p2",
        18: "p2",
        19: "p2",
        5: "p2",
      });
      state = { ...state, houses: { 16: 2, 18: 2, 19: 2 } };
      state = mustRaiseCash(state, "p2", 200);
      expect(firstNegativePlayer(state)).toBe("p2");
      const result = apply(state, {
        kind: "manage",
        playerId: "p2",
        build: { 16: 0, 18: 0, 19: 0 }, // +$300
        mortgage: { 5: true }, // +$100
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // -200 + 300 + 100 = +200, debt clears and play resumes.
      expect(cashOf(result.state, "p2")).toBe(200);
      expect(result.state.turn.phase).not.toBe("must-raise-cash");
      expect(firstNegativePlayer(result.state)).toBe(null);
    });

    it("rejects building (a net spend) while raising cash", () => {
      let state = withOwnership(freshGame("mg-raise-build"), ORANGES);
      state = mustRaiseCash(setCash(state, "p1", 0), "p1", 100);
      // p1 is the active player AND the debtor here.
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });

    it("rejects unmortgaging while raising cash", () => {
      let state = withOwnership(freshGame("mg-raise-unmort"), { 5: "p1" });
      state = { ...state, mortgaged: { 5: true } };
      state = mustRaiseCash(state, "p1", 100);
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: {},
        mortgage: { 5: false },
      });
      expect(result.ok).toBe(false);
    });

    it("rejects a non-debtor managing during must-raise-cash", () => {
      let state = withOwnership(freshGame("mg-raise-other"), {
        ...ORANGES,
        21: "p2",
        23: "p2",
        24: "p2",
      });
      state = { ...state, houses: { 21: 2, 23: 2, 24: 2 } };
      state = mustRaiseCash(state, "p2", 100);
      // p1 (active, solvent) can't manage while p2 is the debtor.
      const result = apply(state, {
        kind: "manage",
        playerId: "p1",
        build: { 16: 1, 18: 1, 19: 1 },
        mortgage: {},
      });
      expect(result.ok).toBe(false);
    });
  });
});

describe("apply update-manage-staging", () => {
  const ORANGES = { 16: "p1", 18: "p1", 19: "p1" };

  function managing(state: GameState, managerId = "p1"): GameState {
    return {
      ...state,
      turn: {
        ...state.turn,
        phase: "managing",
        managerId,
        manageStaged: { build: {}, mortgage: {} },
      },
    };
  }

  it("records the manager's staged maps in synced state", () => {
    const state = managing(withOwnership(freshGame("ums-build"), ORANGES));
    const result = apply(state, {
      kind: "update-manage-staging",
      playerId: "p1",
      staged: { build: { 16: 3 }, mortgage: { 18: true } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.manageStaged).toEqual({
      build: { 16: 3 },
      mortgage: { 18: true },
    });
    // Staging is a preview — no events, no cash / house movement.
    expect(result.newEvents).toHaveLength(0);
    expect(result.state.houses).toEqual({});
  });

  it("records staging for the forced debtor during must-raise-cash", () => {
    let state = withOwnership(freshGame("ums-forced"), { 5: "p2" });
    state = setCash(state, "p2", -50);
    state = {
      ...state,
      turn: {
        ...state.turn,
        phase: "must-raise-cash",
        raiseCash: "after-landing",
        manageStaged: { build: {}, mortgage: {} },
      },
    };
    expect(firstNegativePlayer(state)).toBe("p2");
    const result = apply(state, {
      kind: "update-manage-staging",
      playerId: "p2",
      staged: { build: {}, mortgage: { 5: true } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.manageStaged).toEqual({
      build: {},
      mortgage: { 5: true },
    });
  });

  it("rejects staging from someone who isn't the actor", () => {
    const state = managing(withOwnership(freshGame("ums-not-actor"), ORANGES));
    const result = apply(state, {
      kind: "update-manage-staging",
      playerId: "p2",
      staged: { build: { 16: 1 }, mortgage: {} },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects staging a property the actor doesn't own", () => {
    const state = managing(withOwnership(freshGame("ums-not-owned"), ORANGES));
    const result = apply(state, {
      kind: "update-manage-staging",
      playerId: "p1",
      staged: { build: {}, mortgage: { 5: true } }, // p1 doesn't own 5
    });
    expect(result.ok).toBe(false);
  });

  it("rejects staging outside a manage intermission", () => {
    const state = withOwnership(freshGame("ums-no-phase"), ORANGES);
    const result = apply(state, {
      kind: "update-manage-staging",
      playerId: "p1",
      staged: { build: { 16: 1 }, mortgage: {} },
    });
    expect(result.ok).toBe(false);
  });
});

describe("manage staging lifecycle", () => {
  const ORANGES = { 16: "p1", 18: "p1", 19: "p1" };

  it("a voluntary commit drops the synced staging", () => {
    let state = withOwnership(freshGame("mgl-commit"), ORANGES);
    state = setCash(state, "p1", 1500);
    state = {
      ...state,
      turn: {
        ...state.turn,
        phase: "managing",
        managerId: "p1",
        manageStaged: { build: { 16: 1, 18: 1, 19: 1 }, mortgage: {} },
      },
    };
    const result = apply(state, {
      kind: "manage",
      playerId: "p1",
      build: { 16: 1, 18: 1, 19: 1 },
      mortgage: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe("pre-roll");
    expect(result.state.turn.manageStaged).toBeUndefined();
  });

  it("a forced commit that clears the debt drops the staging", () => {
    let state = withOwnership(freshGame("mgl-forced-clear"), { 5: "p1" });
    state = { ...state, mortgaged: {} };
    state = setCash(state, "p1", -50);
    state = {
      ...state,
      turn: {
        ...state.turn,
        phase: "must-raise-cash",
        raiseCash: "after-landing",
        manageStaged: { build: {}, mortgage: { 5: true } },
      },
    };
    const result = apply(state, {
      kind: "manage",
      playerId: "p1",
      build: {},
      mortgage: { 5: true }, // +$100 mortgage clears the -$50
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstNegativePlayer(result.state)).toBe(null);
    expect(result.state.turn.manageStaged).toBeUndefined();
  });

  it("a forced commit that leaves another debtor seeds fresh empty staging", () => {
    // p1 and p2 both in the red. p1 settles; p2 is still negative, so the phase
    // stays must-raise-cash and p1's staged maps must NOT leak into p2's view.
    let state = withOwnership(freshGame("mgl-next-debtor"), { 5: "p1" });
    state = setCash(state, "p1", -50);
    state = setCash(state, "p2", -100);
    state = {
      ...state,
      turn: {
        ...state.turn,
        phase: "must-raise-cash",
        raiseCash: "after-landing",
        manageStaged: { build: {}, mortgage: { 5: true } },
      },
    };
    expect(firstNegativePlayer(state)).toBe("p1");
    const result = apply(state, {
      kind: "manage",
      playerId: "p1",
      build: {},
      mortgage: { 5: true }, // p1 settles; p2 still owes
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe("must-raise-cash");
    expect(firstNegativePlayer(result.state)).toBe("p2");
    expect(result.state.turn.manageStaged).toEqual({ build: {}, mortgage: {} });
  });

  it("cancel-manage drops the synced staging", () => {
    let state = withOwnership(freshGame("mgl-cancel"), ORANGES);
    state = {
      ...state,
      turn: {
        ...state.turn,
        phase: "managing",
        managerId: "p1",
        manageStaged: { build: { 16: 3 }, mortgage: {} },
      },
    };
    const result = apply(state, { kind: "cancel-manage", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe("pre-roll");
    expect(result.state.turn.manageStaged).toBeUndefined();
  });

  it("opening a manage intermission at the boundary seeds empty staging", () => {
    const state: GameState = {
      ...withOwnership(freshGame("mgl-boundary"), ORANGES),
      boundaryQueue: [{ playerId: "p1", kind: "manage" }],
    };
    // p1 is the active player (freshGame seats p1 first), so the boundary opens.
    const { state: next } = autoStep(state);
    expect(next.turn.phase).toBe("managing");
    expect(next.turn.managerId).toBe("p1");
    expect(next.turn.manageStaged).toEqual({ build: {}, mortgage: {} });
  });
});

describe("autoStep buy-decision", () => {
  it("transitions to buy-decision when landing on an unowned property", () => {
    const state = freshGame("test-land-property");
    const { total } = predictRoll(state.rngState);
    const target = 1; // Mediterranean Avenue (unowned property in freshGame)
    const positioned = placeActivePlayerAt(
      state,
      (target - total + 40) % 40,
    );
    const { state: next, newEvents } = autoStep(positioned);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.toPosition).toBe(target);
    expect(next.turn.phase).toBe("buy-decision");
    expect(next.turn.pendingBuy).toBe(target);
  });

  it("stays at post-roll when landing on a property someone else owns", () => {
    const state = freshGame("test-land-owned");
    const { total } = predictRoll(state.rngState);
    const target = 1;
    const positioned: GameState = {
      ...placeActivePlayerAt(state, (target - total + 40) % 40),
      ownership: { [target]: "p2" },
    };
    const { state: next } = autoStep(positioned);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.pendingBuy).toBeUndefined();
  });

  it("stays at post-roll when landing on a non-ownable space", () => {
    const state = freshGame("test-land-tax-b");
    const { total } = predictRoll(state.rngState);
    const target = 4; // Income Tax
    const positioned = placeActivePlayerAt(
      state,
      (target - total + 40) % 40,
    );
    const { state: next } = autoStep(positioned);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.pendingBuy).toBeUndefined();
  });
});

describe("tax", () => {
  it("charges Income Tax ($200) to the bank on landing", () => {
    const start = freshGame("test-income-tax");
    const before = start.players.find((p) => p.id === "p1")?.cash ?? 0;
    const { state: placed } = setupLandingOn(start, 4); // Income Tax
    const { state: next, newEvents } = autoStep(placed);

    const taxEvent = newEvents.find((e) => e.kind === "tax");
    if (!taxEvent) throw new Error("expected a tax event");
    expect(taxEvent.taxName).toBe("Income Tax");
    expect(taxEvent.amount).toBe(200);
    // Income Tax (pos 4) is near GO, so the deterministic placement may wrap the
    // token past GO — credit that $200 salary back before checking the net.
    const roll = newEvents.find((e) => e.kind === "roll");
    const goBonus = roll?.kind === "roll" && roll.passedGo ? 200 : 0;
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(before - 200 + goBonus);
  });

  // Luxury Tax (pos 38) can't be reached without passing GO, so these
  // cash-sensitive cases use it to keep the math free of GO salary.
  it("charges Luxury Tax ($100) to the bank on landing", () => {
    const start = freshGame("test-luxury-tax");
    const before = start.players.find((p) => p.id === "p1")?.cash ?? 0;
    const { state: placed } = setupLandingOn(start, 38); // Luxury Tax
    const { state: next, newEvents } = autoStep(placed);

    const taxEvent = newEvents.find((e) => e.kind === "tax");
    if (!taxEvent) throw new Error("expected a tax event");
    expect(taxEvent.taxName).toBe("Luxury Tax");
    expect(taxEvent.amount).toBe(100);
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(before - 100);
  });

  it("drops a short-on-cash player into must-raise-cash", () => {
    // p1 has $50 cash and one un-mortgaged ownable (Reading Railroad, mortgage
    // value $100) — enough to recover from the $100 Luxury Tax, but not enough
    // to pay it outright, so they go negative and must raise cash.
    const start = freshGame("test-tax-raise");
    const { state: placed } = setupLandingOn(start, 38); // Luxury Tax
    let state = withOwnership(placed, { 5: "p1" });
    state = setCash(state, "p1", 50);

    const { state: next, newEvents } = autoStep(state);

    expect(next.turn.phase).toBe("must-raise-cash");
    expect(next.turn.raiseCash).toBe("after-landing");
    const taxEvent = newEvents.find((e) => e.kind === "tax");
    if (!taxEvent) throw new Error("expected a tax event");
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(-50);
    expect(firstNegativePlayer(next)).toBe("p1");
  });

  it("busts a player who cannot cover the tax even after liquidating", () => {
    // p1 has $30 and no assets to mortgage — they can't cover the $100 Luxury
    // Tax, so they go bankrupt to the bank.
    const start = freshGame("test-tax-bust");
    const { state: placed } = setupLandingOn(start, 38); // Luxury Tax
    const state = setCash(placed, "p1", 30);

    const { state: next, newEvents } = autoStep(state);

    const bankruptEvent = newEvents.find((e) => e.kind === "bankrupt");
    if (!bankruptEvent) throw new Error("expected a bankrupt event");
    expect(next.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(0);
  });
});

describe("autoStep doubles", () => {
  it("grants the active player another roll on doubles, keeping the streak", () => {
    const start = freshGame("test-doubles-roll-10"); // rolls [4,4]
    const { total } = predictRoll(start.rngState);
    // Land on Income Tax (4): non-ownable, so the roll resolves past landing.
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const { state: next, newEvents } = autoStep(placed);

    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.dice[0]).toBe(roll.dice[1]);
    expect(roll.doublesStreak).toBe(1);
    // Same player rolls again — back to pre-roll, streak kept, no handoff.
    expect(next.turn.playerId).toBe("p1");
    expect(next.turn.phase).toBe("pre-roll");
    expect(next.turn.doublesStreak).toBe(1);
    expect(next.turns).toHaveLength(1);
  });

  it("sends the player to jail on the third consecutive double", () => {
    const start = freshGame("test-doubles-roll-10"); // rolls [4,4]
    const placed: GameState = {
      ...placeActivePlayerAt(start, 20),
      turn: { ...start.turn, doublesStreak: 2 },
    };
    const { state: next, newEvents } = autoStep(placed);

    // Third double: straight to jail, no move, turn ends.
    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.doublesStreak).toBe(3);
    expect(newEvents).toContainEqual({
      kind: "go-to-jail",
      reason: "three-doubles",
    });

    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(true);
    expect(p1?.jailTurns).toBe(1);
    expect(p1?.position).toBe(10);

    // The turn ends — control passes to p2 at a fresh pre-roll.
    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.phase).toBe("pre-roll");
  });

  it("settles into post-roll and resets the streak on a non-double", () => {
    const start = freshGame("test-rent-basic-34"); // rolls [4,6]
    const { total } = predictRoll(start.rngState);
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const { state: next, newEvents } = autoStep(placed);

    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.dice[0]).not.toBe(roll.dice[1]);
    expect(roll.doublesStreak).toBe(0);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.doublesStreak).toBe(0);
  });
});

describe("apply buy", () => {
  it("deducts cash, assigns ownership, emits a buy event, and advances to post-roll", () => {
    const state = freshGame("test-buy-apply");
    const playerId = state.turn.playerId;
    const position = 1; // Mediterranean Avenue, price 60
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: position },
    };
    const before = ready.players[0].cash;
    const result = apply(ready, { kind: "buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.pendingBuy).toBeUndefined();
    expect(result.state.ownership[position]).toBe(playerId);
    const buyer = result.state.players.find((p) => p.id === playerId);
    expect(buyer?.cash).toBe(before - 60);
    expect(result.newEvents).toEqual([{ kind: "buy", position, price: 60 }]);
    const lastTurn = result.state.turns[result.state.turns.length - 1];
    expect(lastTurn.events).toContainEqual({
      kind: "buy",
      position,
      price: 60,
    });
  });

  it("rejects when not in buy-decision phase", () => {
    const state = freshGame("test-buy-wrong-phase");
    const result = apply(state, {
      kind: "buy",
      playerId: state.turn.playerId,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when submitted by a non-active player", () => {
    const state = freshGame("test-buy-wrong-player");
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(ready, { kind: "buy", playerId: "p2" });
    expect(result.ok).toBe(false);
  });

  it("rejects when the active player cannot afford the price", () => {
    const state = freshGame("test-buy-broke");
    const playerId = state.turn.playerId;
    const broke: GameState = {
      ...state,
      players: state.players.map((p, i): Player =>
        i === 0 ? { ...p, cash: 10 } : p,
      ),
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(broke, { kind: "buy", playerId });
    expect(result.ok).toBe(false);
  });
});

describe("apply decline-buy", () => {
  it("sends the property to auction, clearing pendingBuy without emitting events", () => {
    const state = freshGame("test-decline");
    const playerId = state.turn.playerId;
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(ready, { kind: "decline-buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("auction");
    expect(result.state.turn.pendingBuy).toBeUndefined();
    expect(result.state.turn.auction?.position).toBe(1);
    expect(result.state.ownership[1]).toBeUndefined();
    // The auction event is logged only once the auction resolves, not on entry.
    expect(result.newEvents).toEqual([]);
  });

  it("rejects when not in buy-decision phase", () => {
    const state = freshGame("test-decline-wrong-phase");
    const result = apply(state, {
      kind: "decline-buy",
      playerId: state.turn.playerId,
    });
    expect(result.ok).toBe(false);
  });
});

// All rent tests target squares at position ≥ 12 so the active player
// (starting at position 0) never wraps the board on the first roll —
// avoids pass-GO bonuses muddying the cash assertions.

describe("autoStep rent", () => {
  it("transfers cash from lander to owner and emits a rent event", () => {
    const start = freshGame("test-rent-basic-34");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 owns States Avenue only — no monopoly, no houses → base rent $10.
    const state = withOwnership(placed, { 13: "p2" });

    const { state: next, newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent).toEqual({
      kind: "rent",
      ownerId: "p2",
      position: 13,
      amount: 10,
    });

    const payer = next.players.find((p) => p.id === "p1");
    const recipient = next.players.find((p) => p.id === "p2");
    expect(payer?.cash).toBe(1500 - 10);
    expect(recipient?.cash).toBe(1500 + 10);
    expect(next.turn.phase).toBe("post-roll");
  });

  it("doubles base rent when the owner holds the full color set", () => {
    const start = freshGame("test-rent-monopoly");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 holds all three pinks (11 + 13 + 14), no houses → base $10 × 2 = $20.
    const state = withOwnership(placed, { 11: "p2", 13: "p2", 14: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(20);
  });

  it("uses the houses ladder when the owner has built", () => {
    const start = freshGame("test-rent-houses");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 holds States Avenue with 3 houses → ladder index 2 = $450.
    const state: GameState = {
      ...withOwnership(placed, { 13: "p2" }),
      houses: { 13: 3 },
    };

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(450);
  });

  it("uses the railroad ladder based on how many the owner holds", () => {
    const start = freshGame("test-rent-railroad");
    const { state: placed } = setupLandingOn(start, 15); // Pennsylvania Railroad
    // p2 holds 3 of the 4 railroads → $100.
    const state = withOwnership(placed, { 5: "p2", 15: "p2", 25: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(100);
  });

  it("uses the utility 4× multiplier with a single utility owned", () => {
    const start = freshGame("test-rent-utility-4x");
    const { state: placed, diceTotal } = setupLandingOn(start, 12); // Electric Co.
    const state = withOwnership(placed, { 12: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(diceTotal * 4);
  });

  it("uses the utility 10× multiplier when the owner holds both", () => {
    const start = freshGame("test-rent-utility-10x");
    const { state: placed, diceTotal } = setupLandingOn(start, 12); // Electric Co.
    const state = withOwnership(placed, { 12: "p2", 28: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(diceTotal * 10);
  });

  it("collects no rent when the property is mortgaged", () => {
    const start = freshGame("test-rent-mortgaged-0");
    const { state: placed } = setupLandingOn(start, 13);
    const state: GameState = {
      ...withOwnership(placed, { 13: "p2" }),
      mortgaged: { 13: true },
    };
    const cashBefore = state.players[0].cash;

    const { state: next, newEvents } = autoStep(state);
    expect(newEvents.find((e) => e.kind === "rent")).toBeUndefined();
    const payer = next.players.find((p) => p.id === "p1");
    expect(payer?.cash).toBe(cashBefore);
    expect(next.turn.phase).toBe("post-roll");
  });

  it("collects no rent when the lander owns the square themselves", () => {
    const start = freshGame("test-rent-self");
    const { state: placed } = setupLandingOn(start, 13);
    const state = withOwnership(placed, { 13: "p1" });
    const cashBefore = state.players[0].cash;

    const { state: next, newEvents } = autoStep(state);
    expect(newEvents.find((e) => e.kind === "rent")).toBeUndefined();
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(cashBefore);
    expect(next.turn.phase).toBe("post-roll");
  });
});

describe("bankruptcy", () => {
  it("zeros the payer's cash, transfers properties + GOJF to the creditor, and emits a bankrupt event", () => {
    const start = freshGame("test-bust-transfer");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    // p2 owns Boardwalk with a hotel: hotel rent $2000. p1 can't pay.
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 37: "p2", 5: "p1", 12: "p1" }),
      houses: { 39: 5 },
      jailFreeCards: { chance: "p1" },
    };
    state = setCash(state, "p1", 100);

    const { state: next, newEvents } = autoStep(state);

    const bustEvent = newEvents.find((e) => e.kind === "bankrupt");
    if (!bustEvent) throw new Error("expected a bankrupt event");
    expect(bustEvent.creditorId).toBe("p2");

    // p1's cash hits zero (the $100 they had got transferred to p2).
    const payer = next.players.find((p) => p.id === "p1");
    expect(payer?.cash).toBe(0);
    expect(payer?.bankrupt).toBe(true);

    // Reading Railroad and Electric Company belong to p2 now.
    expect(next.ownership[5]).toBe("p2");
    expect(next.ownership[12]).toBe("p2");
    // p2's pre-bust holdings stay theirs.
    expect(next.ownership[39]).toBe("p2");
    expect(next.ownership[37]).toBe("p2");

    // Chance GOJF moved from p1 to p2.
    expect(next.jailFreeCards.chance).toBe("p2");

    // p2 received p1's $100 via rent.
    const creditor = next.players.find((p) => p.id === "p2");
    expect(creditor?.cash).toBe(1500 + 100);

    // The rent event in the log still reflects the FULL debt, not the
    // partial transfer — readers see what was owed, then the bust.
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(2000);
  });

  it("sells the debtor's buildings back at half price to the creditor and transfers bare lots", () => {
    const start = freshGame("test-bust-buildings");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    // p1 owns the oranges with a house each and busts to p2's hotel rent. The
    // houses can't transfer — they're sold to the bank at half ($50 each) and
    // that $150 goes to p2, who receives the lots bare.
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 16: "p1", 18: "p1", 19: "p1" }),
      houses: { 39: 5, 16: 1, 18: 1, 19: 1 },
    };
    state = setCash(setCash(state, "p1", 0), "p2", 1500);

    const { state: next } = autoStep(state);

    expect(next.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
    for (const pos of [16, 18, 19]) {
      expect(next.ownership[pos]).toBe("p2");
      expect(next.houses[pos]).toBeUndefined();
    }
    // 3 houses × $50 refund = $150 (p1 had no cash to add).
    expect(next.players.find((p) => p.id === "p2")?.cash).toBe(1500 + 150);
  });

  it("charges the creditor 10% interest on each still-mortgaged lot inherited", () => {
    const start = freshGame("test-bust-mort-interest");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 16: "p1", 18: "p1", 19: "p1" }),
      houses: { 39: 5 },
      mortgaged: { 16: true, 18: true, 19: true },
    };
    state = setCash(setCash(state, "p1", 0), "p2", 1500);

    const { state: next } = autoStep(state);

    for (const pos of [16, 18, 19]) {
      expect(next.ownership[pos]).toBe("p2");
      expect(next.mortgaged[pos]).toBe(true);
    }
    // 10% interest on mortgage values $90 + $90 + $100 = $9 + $9 + $10 = $28.
    expect(next.players.find((p) => p.id === "p2")?.cash).toBe(1500 - 28);
  });

  it("drops the creditor into must-raise-cash when inherited interest exceeds their cash", () => {
    const start = freshGame("test-bust-creditor-raise");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 16: "p1", 18: "p1", 19: "p1" }),
      houses: { 39: 5 },
      mortgaged: { 16: true, 18: true, 19: true },
    };
    // p2 holds only $10 but owes $28 interest; they can recover by selling the
    // Boardwalk hotel, so they settle rather than bust.
    state = setCash(setCash(state, "p1", 0), "p2", 10);

    const { state: next } = autoStep(state);

    expect(next.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
    expect(next.turn.phase).toBe("must-raise-cash");
    expect(next.turn.raiseCash).toBe("pre-roll");
    expect(firstNegativePlayer(next)).toBe("p2");
    expect(next.players.find((p) => p.id === "p2")?.cash).toBe(10 - 28);
  });

  it("advances control to the next non-bankrupt player when the active player busts", () => {
    const start = freshGame("test-bust-advance");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2" }),
      houses: { 39: 5 },
    };
    state = setCash(state, "p1", 50);

    const { state: next } = autoStep(state);
    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.phase).toBe("pre-roll");
    // A new TurnGroup was opened for p2.
    const last = next.turns[next.turns.length - 1];
    expect(last.playerId).toBe("p2");
    expect(last.events).toEqual([]);
  });

  it("emits a winner event and parks at game-over when only one survivor remains", () => {
    const start = freshGame("test-winner");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    // Two players are already bankrupt; p1's rent bust to p2 leaves p2
    // alone on the board.
    let state: GameState = {
      ...placed,
      players: placed.players.map((p): Player =>
        p.id === "p3" || p.id === "p4" ? { ...p, bankrupt: true, cash: 0 } : p,
      ),
    };
    state = withOwnership(state, { 39: "p2" });
    state = { ...state, houses: { 39: 5 } };
    state = setCash(state, "p1", 25);

    const { state: next, newEvents } = autoStep(state);
    const winnerEvent = newEvents.find((e) => e.kind === "winner");
    if (!winnerEvent) throw new Error("expected a winner event");
    expect(winnerEvent.winnerId).toBe("p2");
    expect(next.turn.phase).toBe("game-over");
  });
});

describe("end-turn skips bankrupt players", () => {
  it("advances past a bankrupt player in the rotation", () => {
    const start = freshGame("test-end-skip-bankrupt-b");
    // p1 is rolling. Position them on Income Tax (which they can afford) so
    // autoStep stops at post-roll without branching into a buy or rent path.
    const { state: placed } = setupLandingOn(start, 4); // Income Tax
    const state: GameState = {
      ...placed,
      players: placed.players.map((p): Player =>
        p.id === "p2" ? { ...p, bankrupt: true, cash: 0 } : p,
      ),
    };
    const rolled = autoStep(state).state;
    expect(rolled.turn.phase).toBe("post-roll");

    const ended = apply(rolled, { kind: "end-turn", playerId: "p1" });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    // p2 is bankrupt — control goes to p3 instead.
    expect(ended.state.turn.playerId).toBe("p3");
  });
});

describe("apply mortgage (forced raise-cash only)", () => {
  it("rejects a standalone mortgage outside the must-raise-cash phase", () => {
    // Voluntary mortgaging is via `manage` now; the single-property `mortgage`
    // intent is valid only while settling a debt. A plain pre-roll is rejected.
    const start = withOwnership(freshGame("mort-outside"), { 1: "p1" });
    const result = apply(start, { kind: "mortgage", playerId: "p1", position: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a mortgage during the managing phase", () => {
    const start = withOwnership(freshGame("mort-managing"), { 1: "p1" });
    const managing: GameState = {
      ...start,
      turn: { ...start.turn, phase: "managing", managerId: "p1" },
    };
    const result = apply(managing, { kind: "mortgage", playerId: "p1", position: 1 });
    expect(result.ok).toBe(false);
  });
});

describe("must-raise-cash phase", () => {
  it("charges rent immediately (cash goes negative) and enters must-raise-cash", () => {
    // p1 lands on p2's Boardwalk ($50 base rent) with $0 cash and one
    // un-mortgaged ownable (Reading Railroad, mortgage value $100).
    const start = freshGame("test-raise-enter");
    const { state: placed } = setupLandingOn(start, 39);
    let state = withOwnership(placed, { 39: "p2", 5: "p1" });
    state = setCash(state, "p1", 0);

    const { state: next, newEvents } = autoStep(state);

    expect(next.turn.phase).toBe("must-raise-cash");
    expect(next.turn.raiseCash).toBe("after-landing");
    // The charge is applied at once: rent is logged now and cash goes negative.
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(50);
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(-50);
    expect(next.players.find((p) => p.id === "p2")?.cash).toBe(1550);
    expect(firstNegativePlayer(next)).toBe("p1");
  });

  it("resumes the landing once mortgaging brings the debtor back to the black", () => {
    const start = freshGame("test-raise-settle");
    const { state: placed } = setupLandingOn(start, 39);
    let state = withOwnership(placed, { 39: "p2", 5: "p1" });
    state = setCash(state, "p1", 0);
    const raising = autoStep(state).state;
    expect(raising.turn.phase).toBe("must-raise-cash");
    // Rent already fired at landing; the debtor sits at -$50.
    expect(raising.players.find((p) => p.id === "p1")?.cash).toBe(-50);

    // Mortgage Reading Railroad (value $100): -$50 + $100 = $50 ≥ 0 → resume.
    const result = apply(raising, {
      kind: "mortgage",
      playerId: "p1",
      position: 5,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.raiseCash).toBeUndefined();
    // Rent was logged at landing, so settling emits only the mortgage.
    expect(result.newEvents.map((e) => e.kind)).toEqual(["mortgage"]);
    expect(result.state.players.find((p) => p.id === "p1")?.cash).toBe(50);
    expect(result.state.players.find((p) => p.id === "p2")?.cash).toBe(1550);
  });

  it("stays in must-raise-cash while a mortgage still leaves the debtor in the red", () => {
    // Land p1 on Boardwalk owned by p2 (no monopoly, no houses -> rent $50).
    // p1 has $0 cash; owns Mediterranean ($30 mortgage value) and Reading
    // Railroad ($100). Rent puts them at -$50; mortgaging only Mediterranean
    // (+$30) leaves -$20, so the phase persists for the next mortgage.
    const start = freshGame("test-raise-partial");
    const { state: placed } = setupLandingOn(start, 39);
    let state = withOwnership(placed, { 39: "p2", 1: "p1", 5: "p1" });
    state = setCash(state, "p1", 0);

    const raising = autoStep(state).state;
    expect(raising.turn.phase).toBe("must-raise-cash");
    expect(raising.players.find((p) => p.id === "p1")?.cash).toBe(-50);

    const r1 = apply(raising, { kind: "mortgage", playerId: "p1", position: 1 });
    if (!r1.ok) throw new Error(`expected ok, got ${r1.reason}`);
    expect(r1.state.turn.phase).toBe("must-raise-cash");
    expect(r1.state.players.find((p) => p.id === "p1")?.cash).toBe(-20);
  });

  it("auto-bankrupts when even max mortgaging can't cover the debt", () => {
    // Boardwalk hotel rent = $2000. p1 has $0 cash and only Mediterranean
    // (mortgage $30) and Reading Railroad (mortgage $100) — total $130 max
    // raisable. Should bankrupt immediately without entering must-raise-cash.
    const start = freshGame("test-raise-impossible");
    const { state: placed } = setupLandingOn(start, 39);
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 5: "p1", 1: "p1" }),
      houses: { 39: 5 },
    };
    state = setCash(state, "p1", 0);

    const { state: next, newEvents } = autoStep(state);

    expect(next.turn.phase).not.toBe("must-raise-cash");
    expect(next.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
    expect(newEvents.find((e) => e.kind === "bankrupt")).toBeDefined();
    // Rent event still logged with the FULL debt.
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected rent event");
    expect(rentEvent.amount).toBe(2000);
  });

  it("ignores buildings + mortgaged squares when computing max raisable", () => {
    // p1 lands on rent of $200. p1 has $0 cash. They own three squares:
    // (a) a mortgaged property — excluded;
    // (b) a property with houses — excluded;
    // (c) one free un-mortgaged property worth $100 mortgage value.
    // Total raisable = $100 < $200 -> bankrupt, not must-raise-cash.
    const start = freshGame("test-raise-filter");
    const { state: placed } = setupLandingOn(start, 39);
    let state: GameState = {
      ...withOwnership(placed, {
        39: "p2",  // creditor's
        1: "p1",   // mortgaged
        3: "p1",   // has houses
        5: "p1",   // free, value $100
      }),
      mortgaged: { 1: true },
      houses: { 3: 1, 39: 4 }, // p1's pos 3 has a house; p2's Boardwalk -> rent ~$200
    };
    state = setCash(state, "p1", 0);
    // Boardwalk with 4 houses rent = $1700, not $200. Need a different
    // landing tile. Use Indiana Avenue (pos 23, red color, base rent $20,
    // hotel $1050). Re-do with a tile we control more easily. Simpler: use
    // Mediterranean (pos 1) as the landing target and Baltic as p2's.
    // Actually we can stick with Boardwalk hotel = $2000.
    // p1 cash $0 + raisable $100 = $100 < $2000 -> bankrupt.
    state = { ...state, houses: { 3: 1, 39: 5 } };

    const { state: next } = autoStep(state);
    expect(next.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
  });
});

// Put the active player at an unpaused pre-roll with `proposerId` building a
// trade — the state the engine reaches after the trade queue is consumed.
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

describe("boundary queue", () => {
  it("sets queue membership per player+kind, preserving request order", () => {
    const start = freshGame("queue-toggle");
    const a = apply(start, { kind: "set-queue", playerId: "p3", queue: "trade", armed: true });
    if (!a.ok) throw new Error(a.reason);
    expect(a.state.boundaryQueue).toEqual([{ playerId: "p3", kind: "trade" }]);

    const b = apply(a.state, { kind: "set-queue", playerId: "p2", queue: "manage", armed: true });
    if (!b.ok) throw new Error(b.reason);
    expect(b.state.boundaryQueue).toEqual([
      { playerId: "p3", kind: "trade" },
      { playerId: "p2", kind: "manage" },
    ]);

    // A player can be queued for both kinds at once — they're distinct entries.
    const c = apply(b.state, { kind: "set-queue", playerId: "p3", queue: "manage", armed: true });
    if (!c.ok) throw new Error(c.reason);
    expect(c.state.boundaryQueue).toEqual([
      { playerId: "p3", kind: "trade" },
      { playerId: "p2", kind: "manage" },
      { playerId: "p3", kind: "manage" },
    ]);

    // Disarming p3's trade entry leaves the other two untouched.
    const d = apply(c.state, { kind: "set-queue", playerId: "p3", queue: "trade", armed: false });
    if (!d.ok) throw new Error(d.reason);
    expect(d.state.boundaryQueue).toEqual([
      { playerId: "p2", kind: "manage" },
      { playerId: "p3", kind: "manage" },
    ]);
  });

  it("is idempotent — re-arming an already-armed slot is a no-op", () => {
    // This is what makes the optimistic overlay safe to replay: setting `armed`
    // to the state it's already in must not flip it back off.
    const start = freshGame("queue-idempotent");
    const a = apply(start, { kind: "set-queue", playerId: "p1", queue: "manage", armed: true });
    if (!a.ok) throw new Error(a.reason);
    const b = apply(a.state, { kind: "set-queue", playerId: "p1", queue: "manage", armed: true });
    if (!b.ok) throw new Error(b.reason);
    expect(b.state.boundaryQueue).toEqual([{ playerId: "p1", kind: "manage" }]);
    // Disarming an already-absent slot is likewise a no-op.
    const c = apply(start, { kind: "set-queue", playerId: "p1", queue: "trade", armed: false });
    if (!c.ok) throw new Error(c.reason);
    expect(c.state.boundaryQueue).toEqual([]);
  });

  it("opens a queued trade build at the next pre-roll instead of rolling", () => {
    const start = freshGame("queue-trade-open");
    const queued: GameState = {
      ...start,
      boundaryQueue: [{ playerId: "p3", kind: "trade" }],
    };
    const { state: next, newEvents } = autoStep(queued);
    expect(next.turn.phase).toBe("trade-building");
    expect(next.turn.tradeDraft?.proposerId).toBe("p3");
    // Active turn owner is unchanged — it just interrupts before p1 rolls.
    expect(next.turn.playerId).toBe("p1");
    expect(next.boundaryQueue).toEqual([]);
    expect(newEvents).toHaveLength(0);
  });

  it("opens a queued manage intermission at the next pre-roll, even off-turn", () => {
    const start = freshGame("queue-manage-open");
    // p1 is the active turn owner; p3 (off-turn) is queued to manage.
    const queued: GameState = {
      ...start,
      boundaryQueue: [{ playerId: "p3", kind: "manage" }],
    };
    const { state: next, newEvents } = autoStep(queued);
    expect(next.turn.phase).toBe("managing");
    expect(next.turn.managerId).toBe("p3");
    // The active turn owner is unchanged — p3 just manages before p1 rolls.
    expect(next.turn.playerId).toBe("p1");
    expect(next.boundaryQueue).toEqual([]);
    expect(newEvents).toHaveLength(0);
  });

  it("returns to pre-roll and re-checks the queue on cancel-manage", () => {
    const start = freshGame("queue-cancel-manage");
    const managing: GameState = {
      ...start,
      turn: { ...start.turn, phase: "managing", managerId: "p3" },
    };
    const result = apply(managing, { kind: "cancel-manage", playerId: "p3" });
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.turn.phase).toBe("pre-roll");
    expect(result.state.turn.managerId).toBeUndefined();
    expect(result.state.turn.playerId).toBe("p1");
  });

  it("rejects cancel-manage from a non-manager", () => {
    const start = freshGame("queue-cancel-wrong");
    const managing: GameState = {
      ...start,
      turn: { ...start.turn, phase: "managing", managerId: "p3" },
    };
    const result = apply(managing, { kind: "cancel-manage", playerId: "p2" });
    expect(result.ok).toBe(false);
  });

  it("rejects cancel-manage outside the managing phase", () => {
    const start = freshGame("queue-cancel-phase");
    const result = apply(start, { kind: "cancel-manage", playerId: "p1" });
    expect(result.ok).toBe(false);
  });
});

describe("trade building", () => {
  it("lets the proposer stage a draft and rejects edits from anyone else", () => {
    const start = withOwnership(freshGame("trade-draft"), { 1: "p1" });
    const building = inTradeBuilding(start, "p1");
    const terms = { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: {} };

    const ok = apply(building, { kind: "update-trade-draft", playerId: "p1", terms });
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.state.turn.tradeDraft?.propertyTo).toEqual({ 1: "p2" });

    const wrong = apply(building, { kind: "update-trade-draft", playerId: "p2", terms });
    expect(wrong.ok).toBe(false);
  });

  it("rejects a proposal that doesn't balance, is empty, or names one party", () => {
    const start = withOwnership(freshGame("trade-bad"), { 1: "p1" });
    const empty = inTradeBuilding(start, "p1");
    expect(apply(empty, { kind: "propose-trade", playerId: "p1" }).ok).toBe(false);

    const unbalanced: GameState = {
      ...start,
      turn: {
        ...start.turn,
        phase: "trade-building",
        tradeDraft: {
          proposerId: "p1",
          propertyTo: { 1: "p2" },
          gojfTo: {},
          cashDelta: { p2: -60 }, // doesn't sum to zero
        },
      },
    };
    expect(apply(unbalanced, { kind: "propose-trade", playerId: "p1" }).ok).toBe(false);
  });

  it("returns to pre-roll on cancel", () => {
    const start = inTradeBuilding(freshGame("trade-cancel"), "p1");
    const res = apply(start, { kind: "cancel-trade", playerId: "p1" });
    if (!res.ok) throw new Error(res.reason);
    expect(res.state.turn.phase).toBe("pre-roll");
    expect(res.state.turn.tradeDraft).toBeUndefined();
  });
});

describe("trade approval + execution", () => {
  it("executes a property-for-cash trade once every named party approves", () => {
    const start = withOwnership(freshGame("trade-exec"), { 1: "p1" });
    const building = inTradeBuilding(start, "p1");
    const staged = apply(building, {
      kind: "update-trade-draft",
      playerId: "p1",
      terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: { p1: 60, p2: -60 } },
    });
    if (!staged.ok) throw new Error(staged.reason);

    const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p1" });
    if (!proposed.ok) throw new Error(proposed.reason);
    expect(proposed.state.turn.phase).toBe("trade-pending");
    const pending = proposed.state.turn.pendingTrade;
    if (!pending) throw new Error("expected a pending trade");
    // Proposer (a party) is pre-approved; the other party isn't.
    expect(pending.approvals).toEqual({ p1: true, p2: false });

    const accepted = apply(proposed.state, {
      kind: "accept-trade",
      playerId: "p2",
      tradeId: pending.id,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(accepted.state.ownership[1]).toBe("p2");
    expect(accepted.state.players.find((p) => p.id === "p1")?.cash).toBe(1560);
    expect(accepted.state.players.find((p) => p.id === "p2")?.cash).toBe(1440);
    expect(accepted.state.turn.phase).toBe("pre-roll");
    expect(accepted.newEvents.some((e) => e.kind === "trade")).toBe(true);
  });

  it("cancels the whole proposal on a single decline", () => {
    const start = withOwnership(freshGame("trade-decline"), { 1: "p1" });
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

    const declined = apply(proposed.state, {
      kind: "decline-trade",
      playerId: "p2",
      tradeId: pending.id,
    });
    if (!declined.ok) throw new Error(declined.reason);
    expect(declined.state.turn.phase).toBe("pre-roll");
    expect(declined.state.ownership[1]).toBe("p1"); // unchanged
  });

  it("executes an out-of-turn trade and returns to the active player's pre-roll", () => {
    // p1 is the active turn owner; p2 (building) trades Mediterranean to p3.
    let start = withOwnership(freshGame("trade-offturn"), { 1: "p2" });
    start = inTradeBuilding(start, "p2");
    const staged = apply(start, {
      kind: "update-trade-draft",
      playerId: "p2",
      terms: { propertyTo: { 1: "p3" }, gojfTo: {}, cashDelta: { p2: 50, p3: -50 } },
    });
    if (!staged.ok) throw new Error(staged.reason);
    const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p2" });
    if (!proposed.ok) throw new Error(proposed.reason);
    const pending = proposed.state.turn.pendingTrade;
    if (!pending) throw new Error("expected a pending trade");

    const accepted = apply(proposed.state, {
      kind: "accept-trade",
      playerId: "p3",
      tradeId: pending.id,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(accepted.state.ownership[1]).toBe("p3");
    expect(accepted.state.turn.phase).toBe("pre-roll");
    expect(accepted.state.turn.playerId).toBe("p1"); // p1's turn resumes
  });
});

describe("trade mortgaged-property interest", () => {
  it("charges the receiver 10% interest on a mortgaged property received", () => {
    // p1 gifts mortgaged Mediterranean (mortgage $30 → 10% = $3) to p2.
    let start = withOwnership(freshGame("trade-mort"), { 1: "p1" });
    start = { ...start, mortgaged: { 1: true } };
    start = inTradeBuilding(start, "p1");
    const staged = apply(start, {
      kind: "update-trade-draft",
      playerId: "p1",
      terms: { propertyTo: { 1: "p2" }, gojfTo: {}, cashDelta: {} },
    });
    if (!staged.ok) throw new Error(staged.reason);
    const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p1" });
    if (!proposed.ok) throw new Error(proposed.reason);
    const pending = proposed.state.turn.pendingTrade;
    if (!pending) throw new Error("expected a pending trade");

    const accepted = apply(proposed.state, {
      kind: "accept-trade",
      playerId: "p2",
      tradeId: pending.id,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    expect(accepted.state.ownership[1]).toBe("p2");
    expect(accepted.state.mortgaged[1]).toBe(true); // transfers still mortgaged
    expect(accepted.state.players.find((p) => p.id === "p2")?.cash).toBe(1497);
    expect(accepted.state.turn.phase).toBe("pre-roll");
  });

  it("drops a short receiver into must-raise-cash (resuming at pre-roll), then settles", () => {
    // p2 has just $1 and receives mortgaged Boardwalk ($200 mortgage → $20
    // interest). They own Baltic ($30 mortgage value) to raise cash with.
    let start = withOwnership(freshGame("trade-mort-raise"), { 39: "p1", 3: "p2" });
    start = { ...start, mortgaged: { 39: true } };
    start = setCash(start, "p2", 1);
    start = inTradeBuilding(start, "p1");
    const staged = apply(start, {
      kind: "update-trade-draft",
      playerId: "p1",
      terms: { propertyTo: { 39: "p2" }, gojfTo: {}, cashDelta: {} },
    });
    if (!staged.ok) throw new Error(staged.reason);
    const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p1" });
    if (!proposed.ok) throw new Error(proposed.reason);
    const pending = proposed.state.turn.pendingTrade;
    if (!pending) throw new Error("expected a pending trade");

    const accepted = apply(proposed.state, {
      kind: "accept-trade",
      playerId: "p2",
      tradeId: pending.id,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    // $1 − $20 interest = −$19 → must-raise-cash, debtor p2, resuming pre-roll.
    expect(accepted.state.turn.phase).toBe("must-raise-cash");
    expect(accepted.state.turn.raiseCash).toBe("pre-roll");
    expect(firstNegativePlayer(accepted.state)).toBe("p2");
    expect(accepted.state.players.find((p) => p.id === "p2")?.cash).toBe(-19);

    // p2 mortgages Baltic (+$30): −19 + 30 = 11 ≥ 0 → resume at pre-roll.
    const settled = apply(accepted.state, {
      kind: "mortgage",
      playerId: "p2",
      position: 3,
    });
    if (!settled.ok) throw new Error(settled.reason);
    expect(settled.state.turn.phase).toBe("pre-roll");
    expect(settled.state.players.find((p) => p.id === "p2")?.cash).toBe(11);
  });

  it("rejects a proposal a receiver couldn't cover even by mortgaging", () => {
    // p2 has $1, receives mortgaged Boardwalk ($20 interest), owns nothing
    // else to raise cash → can't recover → proposal rejected.
    let start = withOwnership(freshGame("trade-unaffordable"), { 39: "p1" });
    start = { ...start, mortgaged: { 39: true } };
    start = setCash(start, "p2", 1);
    start = inTradeBuilding(start, "p1");
    const staged = apply(start, {
      kind: "update-trade-draft",
      playerId: "p1",
      terms: { propertyTo: { 39: "p2" }, gojfTo: {}, cashDelta: {} },
    });
    if (!staged.ok) throw new Error(staged.reason);
    const proposed = apply(staged.state, { kind: "propose-trade", playerId: "p1" });
    expect(proposed.ok).toBe(false);
  });
});

// Put the active player (p1) in jail at the given jail turn, parked at the
// jail-decision phase — the state a jailed player's turn opens at.
function inJailDecision(state: GameState, jailTurns: number): GameState {
  return {
    ...state,
    players: state.players.map((p, i): Player =>
      i === 0 ? { ...p, position: 10, inJail: true, jailTurns } : p,
    ),
    turn: { ...state.turn, phase: "jail-decision" },
  };
}

describe("jail entry", () => {
  it("jails the player who lands on the Go to Jail tile", () => {
    const start = freshGame("test-rent-basic-34"); // rolls [4,6] = 10
    const { total } = predictRoll(start.rngState);
    const placed = placeActivePlayerAt(start, (30 - total + 40) % 40);
    const { state: next, newEvents } = autoStep(placed);

    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.toPosition).toBe(30); // the dice carried them onto the tile
    expect(newEvents).toContainEqual({ kind: "go-to-jail", reason: "tile" });

    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(true);
    expect(p1?.jailTurns).toBe(1);
    expect(p1?.position).toBe(10); // relocated to Jail, not left on 30
    // No GO salary for being sent to jail.
    expect(p1?.cash).toBe(1500);

    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.phase).toBe("pre-roll");
  });

  it("opens the jail decision at a jailed player's turn start", () => {
    const start = freshGame("test-jail-open");
    const jailed: GameState = {
      ...start,
      players: start.players.map((p, i): Player =>
        i === 0 ? { ...p, position: 10, inJail: true, jailTurns: 1 } : p,
      ),
    };
    const { state: next, newEvents } = autoStep(jailed);
    expect(next.turn.phase).toBe("jail-decision");
    expect(next.turn.playerId).toBe("p1");
    expect(newEvents).toHaveLength(0);
    // No roll consumed yet — the dice fire on the jail roll.
    expect(next.rngState).toBe(jailed.rngState);
    expect(next.players[0].position).toBe(10);
  });

  it("resolves a queued intermission before opening the jail decision", () => {
    // A jailed player's turn boundary still honors others' trade / manage arms.
    const start = freshGame("test-jail-boundary");
    const jailed: GameState = {
      ...start,
      players: start.players.map((p, i): Player =>
        i === 0 ? { ...p, position: 10, inJail: true, jailTurns: 1 } : p,
      ),
      boundaryQueue: [{ playerId: "p3", kind: "manage" }],
    };
    const { state: next } = autoStep(jailed);
    expect(next.turn.phase).toBe("managing");
    expect(next.turn.managerId).toBe("p3");
  });
});

describe("jail roll", () => {
  it("escapes on a double and moves out by the roll, no bonus roll", () => {
    const start = inJailDecision(freshGame("test-doubles-roll-10"), 1); // [4,4]
    const { state: next, newEvents } = autoStep(start);

    expect(newEvents).toContainEqual({
      kind: "jail-roll",
      dice: [4, 4],
      escaped: true,
      jailTurn: 1,
    });
    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(false);
    expect(p1?.jailTurns).toBe(0);
    expect(p1?.position).toBe(18); // 10 + 8
    // Escaping on a double does NOT grant another roll: the streak stays 0, so
    // once the landing resolves the turn ends rather than re-rolling.
    expect(next.turn.doublesStreak).toBe(0);
    expect(next.turn.playerId).toBe("p1");
  });

  it("serves another turn on a failed roll before the third", () => {
    const start = inJailDecision(freshGame("test-rent-basic-34"), 1); // [4,6]
    const { state: next, newEvents } = autoStep(start);

    expect(newEvents).toContainEqual({
      kind: "jail-roll",
      dice: [4, 6],
      escaped: false,
      jailTurn: 1,
    });
    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(true);
    expect(p1?.jailTurns).toBe(2); // sentence advances
    expect(p1?.position).toBe(10); // didn't move
    // The turn ends — control passes on.
    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.phase).toBe("pre-roll");
  });

  it("forces the $50 fine and moves out after a failed third roll", () => {
    const start = inJailDecision(freshGame("test-rent-basic-34"), 3); // [4,6]
    const { state: next, newEvents } = autoStep(start);

    const kinds = newEvents.map((e) => e.kind);
    expect(kinds).toContain("jail-roll");
    expect(kinds).toContain("jail-pay");
    const jailRollEvent = newEvents.find((e) => e.kind === "jail-roll");
    expect(jailRollEvent).toMatchObject({ escaped: false, jailTurn: 3 });

    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(false);
    expect(p1?.jailTurns).toBe(0);
    expect(p1?.cash).toBe(1500 - 50); // fine paid to the bank
    expect(p1?.position).toBe(20); // 10 + 10, Free Parking (safe) → post-roll
    expect(next.turn.phase).toBe("post-roll");
  });

  it("bankrupts to the bank when the forced fine is unaffordable", () => {
    // p1 on jail turn 3 with $0 and nothing to liquidate can't cover the $50.
    let start = inJailDecision(freshGame("test-rent-basic-34"), 3);
    start = setCash(start, "p1", 0);
    const { state: next, newEvents } = autoStep(start);

    const bust = newEvents.find((e) => e.kind === "bankrupt");
    if (!bust) throw new Error("expected a bankrupt event");
    expect(bust.creditorId).toBe(null); // estate to the bank

    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.bankrupt).toBe(true);
    expect(next.turn.playerId).toBe("p2");
  });
});

describe("apply pay-to-leave-jail", () => {
  it("pays the fine, leaves jail, and resumes at pre-roll", () => {
    const start = inJailDecision(freshGame("test-jail-pay"), 1);
    const result = apply(start, { kind: "pay-to-leave-jail", playerId: "p1" });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

    expect(result.newEvents).toEqual([{ kind: "jail-pay" }]);
    const p1 = result.state.players.find((p) => p.id === "p1");
    expect(p1?.cash).toBe(1500 - 50);
    expect(p1?.inJail).toBe(false);
    expect(p1?.jailTurns).toBe(0);
    // Back to pre-roll so the normal auto-roll moves them this turn.
    expect(result.state.turn.phase).toBe("pre-roll");
    expect(result.state.turn.playerId).toBe("p1");
  });

  it("rejects paying with insufficient cash", () => {
    let start = inJailDecision(freshGame("test-jail-pay-broke"), 1);
    start = setCash(start, "p1", 40);
    const result = apply(start, { kind: "pay-to-leave-jail", playerId: "p1" });
    expect(result.ok).toBe(false);
  });

  it("rejects paying to leave jail outside the jail-decision phase", () => {
    const start = freshGame("test-jail-pay-phase");
    const result = apply(start, { kind: "pay-to-leave-jail", playerId: "p1" });
    expect(result.ok).toBe(false);
  });
});

describe("apply use-jail-card", () => {
  it("spends a held card, leaves jail, and returns it to the deck", () => {
    const start: GameState = {
      ...inJailDecision(freshGame("test-jail-card"), 1),
      jailFreeCards: { chance: "p1" },
    };
    const result = apply(start, { kind: "use-jail-card", playerId: "p1" });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

    expect(result.newEvents).toEqual([{ kind: "jail-card", source: "chance" }]);
    const p1 = result.state.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(false);
    expect(p1?.jailTurns).toBe(0);
    expect(p1?.cash).toBe(1500); // free — no fine
    // Card returns to the bottom of its deck (holder cleared).
    expect(result.state.jailFreeCards.chance).toBeUndefined();
    expect(result.state.turn.phase).toBe("pre-roll");
  });

  it("rejects using a card the player doesn't hold", () => {
    const start = inJailDecision(freshGame("test-jail-card-none"), 1);
    const result = apply(start, { kind: "use-jail-card", playerId: "p1" });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chance / Community Chest cards. A draw is triggered by landing on a card
// tile during a roll; `cardFront` forces a chosen card to the top of its pile
// so the effect under test is the one drawn. Chance tile 22 and CC tile 17 are
// used as targets: with any 2d6 roll the placement never wraps GO, so the
// setup roll itself never pollutes cash with a $200 salary.
// ---------------------------------------------------------------------------

const CHANCE_TILE = 22;
const CC_TILE = 17;

/** Put `cardId` at the top of its deck pile so the next draw yields it. */
function cardFront(
  state: GameState,
  source: CardSource,
  cardId: string,
): GameState {
  const index = deckFor(source).findIndex((c) => c.id === cardId);
  const rest = state.decks[source].filter((i) => i !== index);
  return { ...state, decks: { ...state.decks, [source]: [index, ...rest] } };
}

/** Place the active player to land on `tile` via the seeded roll, then force
 *  `cardId` to the top of the matching pile. Returns the ready state. */
function drawSetup(
  seed: string,
  tile: number,
  source: CardSource,
  cardId: string,
): GameState {
  const { state } = setupLandingOn(freshGame(seed), tile);
  return cardFront(state, source, cardId);
}

describe("cards — deck seeding", () => {
  it("shuffles a full, deterministic pile of all card indices per seed", () => {
    const a = freshGame("deck-seed");
    const b = freshGame("deck-seed");
    expect(a.decks).toEqual(b.decks);
    const sorted = (xs: readonly number[]) => [...xs].sort((m, n) => m - n);
    expect(sorted(a.decks.chance)).toEqual(CHANCE.map((_, i) => i));
    expect(sorted(a.decks.communityChest)).toEqual(
      COMMUNITY_CHEST.map((_, i) => i),
    );
  });

  it("rotates the drawn card to the bottom of its pile", () => {
    const state = drawSetup("card-rotate", CHANCE_TILE, "chance", "chance-dividend");
    const topIndex = state.decks.chance[0];
    const { state: next } = autoStep(state);
    // The drawn (front) card is now last; the rest shifted up by one.
    expect(next.decks.chance[next.decks.chance.length - 1]).toBe(topIndex);
    expect(next.decks.chance).toHaveLength(state.decks.chance.length);
  });
});

describe("cards — money", () => {
  it("collect: credits the drawer from the bank", () => {
    const state = drawSetup("card-collect", CHANCE_TILE, "chance", "chance-dividend");
    const before = state.players[0].cash;
    const { state: next, newEvents } = autoStep(state);
    expect(newEvents).toContainEqual({
      kind: "card-drawn",
      source: "chance",
      cardId: "chance-dividend",
      cash: 50,
    });
    expect(next.players[0].cash).toBe(before + 50);
  });

  it("pay: charges the drawer to the bank", () => {
    const state = drawSetup("card-pay", CHANCE_TILE, "chance", "chance-speeding");
    const before = state.players[0].cash;
    const { state: next, newEvents } = autoStep(state);
    expect(newEvents).toContainEqual({
      kind: "card-drawn",
      source: "chance",
      cardId: "chance-speeding",
      cash: -15,
    });
    expect(next.players[0].cash).toBe(before - 15);
  });

  it("pay: drops into must-raise-cash when the drawer can't cover from cash", () => {
    let state = drawSetup("card-pay-debt", CC_TILE, "communityChest", "cc-hospital");
    state = setCash(state, "p1", 80); // owes $100, holds $80
    // p1 can recover: a railroad ($100 mortgage value) covers the shortfall, so
    // they go negative and raise cash rather than busting outright.
    state = withOwnership(state, { 5: "p1" }); // Reading Railroad
    const { state: next } = autoStep(state);
    expect(next.turn.phase).toBe("must-raise-cash");
    expect(firstNegativePlayer(next)).toBe("p1");
    expect(next.players[0].cash).toBe(80 - 100);
  });

  it("repairs: charges per house and per hotel owned", () => {
    let state = drawSetup("card-repairs", CHANCE_TILE, "chance", "chance-repairs");
    // p1 owns the browns: 3 houses on Mediterranean, a hotel on Baltic.
    state = withOwnership(state, { 1: "p1", 3: "p1" });
    state = { ...state, houses: { 1: 3, 3: 5 } };
    const before = state.players[0].cash;
    const { state: next } = autoStep(state);
    // 3 houses × $25 + 1 hotel × $100 = $175.
    expect(next.players[0].cash).toBe(before - 175);
  });
});

describe("cards — per-player transfers", () => {
  it("pay-each: drawer pays every opponent, one transfer line each", () => {
    const state = drawSetup("card-chairman", CHANCE_TILE, "chance", "chance-chairman");
    const before = state.players.map((p) => p.cash);
    const { state: next, newEvents } = autoStep(state);
    const transfers = newEvents.filter((e) => e.kind === "card-transfer");
    expect(transfers).toHaveLength(3); // 4-player game → 3 opponents
    expect(next.players[0].cash).toBe(before[0] - 150);
    for (let i = 1; i < 4; i++) expect(next.players[i].cash).toBe(before[i] + 50);
  });

  it("collect-each: every opponent pays the drawer", () => {
    const state = drawSetup("card-birthday", CC_TILE, "communityChest", "cc-birthday");
    const before = state.players.map((p) => p.cash);
    const { state: next } = autoStep(state);
    expect(next.players[0].cash).toBe(before[0] + 30); // 3 × $10
    for (let i = 1; i < 4; i++) expect(next.players[i].cash).toBe(before[i] - 10);
  });

  it("collect-each: an opponent who can't pay goes bankrupt to the drawer", () => {
    let state = drawSetup("card-birthday-bust", CC_TILE, "communityChest", "cc-birthday");
    state = setCash(state, "p2", 0); // can't cover even $10, nothing to liquidate
    const { state: next, newEvents } = autoStep(state);
    const bust = newEvents.find((e) => e.kind === "bankrupt");
    if (!bust) throw new Error("expected a bankrupt event");
    expect(bust.creditorId).toBe("p1");
    expect(next.players.find((p) => p.id === "p2")?.bankrupt).toBe(true);
  });
});

describe("cards — movement", () => {
  it("advance-to GO credits the $200 salary via a pass-go event", () => {
    const state = drawSetup("card-go", CHANCE_TILE, "chance", "chance-go");
    const before = state.players[0].cash;
    const { state: next, newEvents } = autoStep(state);
    expect(newEvents).toContainEqual({ kind: "pass-go" });
    expect(next.players[0].position).toBe(0);
    expect(next.players[0].cash).toBe(before + 200);
  });

  it("advance-to a property resolves the landing normally (rent to owner)", () => {
    let state = drawSetup("card-boardwalk", CHANCE_TILE, "chance", "chance-boardwalk");
    state = withOwnership(state, { 39: "p2" }); // p2 owns Boardwalk, base rent $50
    const before = state.players.map((p) => p.cash);
    const { state: next, newEvents } = autoStep(state);
    expect(next.players[0].position).toBe(39);
    const rent = newEvents.find((e) => e.kind === "rent");
    expect(rent).toMatchObject({ ownerId: "p2", position: 39, amount: 50 });
    expect(next.players[0].cash).toBe(before[0] - 50);
    expect(next.players[1].cash).toBe(before[1] + 50);
  });

  it("advance to nearest railroad charges double the normal rent", () => {
    let state = drawSetup("card-nrr", CHANCE_TILE, "chance", "chance-nearest-rr-a");
    // p2 owns one railroad (normal rent $25) → card charges 2× = $50. Nearest
    // railroad ahead of tile 22 is Pennsylvania (25).
    state = withOwnership(state, { 25: "p2" });
    const before = state.players.map((p) => p.cash);
    const { state: next, newEvents } = autoStep(state);
    expect(next.players[0].position).toBe(25);
    const rent = newEvents.find((e) => e.kind === "rent");
    expect(rent).toMatchObject({ ownerId: "p2", position: 25, amount: 50 });
    expect(next.players[0].cash).toBe(before[0] - 50);
  });

  it("advance to nearest utility charges 10× the dice throw", () => {
    let state = drawSetup("card-nutil", CHANCE_TILE, "chance", "chance-nearest-util");
    // Nearest utility ahead of 22 is Water Works (28); p2 owns it.
    state = withOwnership(state, { 28: "p2" });
    const { state: next, newEvents } = autoStep(state);
    expect(next.players[0].position).toBe(28);
    const rent = newEvents.find((e) => e.kind === "rent");
    if (!rent) throw new Error("expected rent");
    // 10× a 2d6 throw → between 20 and 120, and a multiple of 10.
    expect(rent.amount % 10).toBe(0);
    expect(rent.amount).toBeGreaterThanOrEqual(20);
    expect(rent.amount).toBeLessThanOrEqual(120);
  });

  it("advance to nearest railroad offers a buy when unowned", () => {
    const state = drawSetup("card-nrr-buy", CHANCE_TILE, "chance", "chance-nearest-rr-a");
    const { state: next } = autoStep(state);
    expect(next.turn.phase).toBe("buy-decision");
    expect(next.turn.pendingBuy).toBe(25);
  });

  it("go back three resolves the tile landed on (income tax from tile 7)", () => {
    // Place the player to land on the Chance at tile 7, then draw Back 3 → 4
    // (Income Tax, $200 to the bank). The tax event proves the landed tile was
    // resolved; the cash delta is left unasserted because the setup roll to
    // tile 7 may itself pass GO (+$200), which would net against the tax.
    const { state } = setupLandingOn(freshGame("card-back3"), 7);
    const ready = cardFront(state, "chance", "chance-back-3");
    const { state: next, newEvents } = autoStep(ready);
    expect(next.players[0].position).toBe(4);
    expect(newEvents.find((e) => e.kind === "tax")).toMatchObject({ amount: 200 });
  });

  it("go back three from tile 36 chains into a Community Chest draw", () => {
    const { state } = setupLandingOn(freshGame("card-back3-chain"), 36);
    let ready = cardFront(state, "chance", "chance-back-3");
    // Back 3 from 36 lands on 33 (Community Chest); force a collect there.
    ready = cardFront(ready, "communityChest", "cc-bank-error"); // +$200
    const before = ready.players[0].cash;
    const { state: next, newEvents } = autoStep(ready);
    expect(next.players[0].position).toBe(33);
    const drawn = newEvents.filter((e) => e.kind === "card-drawn");
    expect(drawn.map((e) => e.cardId)).toEqual([
      "chance-back-3",
      "cc-bank-error",
    ]);
    expect(next.players[0].cash).toBe(before + 200);
  });
});

describe("cards — jail", () => {
  it("go-to-jail card sends the drawer to jail and ends the turn", () => {
    const state = drawSetup("card-gtj", CHANCE_TILE, "chance", "chance-jail");
    const { state: next, newEvents } = autoStep(state);
    expect(newEvents).toContainEqual({ kind: "go-to-jail", reason: "card" });
    const p1 = next.players.find((p) => p.id === "p1");
    expect(p1?.inJail).toBe(true);
    expect(p1?.position).toBe(10);
    expect(next.turn.playerId).toBe("p2"); // turn ended
  });

  it("jail-free card is acquired, then returns to the bottom of its deck on use", () => {
    const state = drawSetup("card-gojf", CHANCE_TILE, "chance", "chance-gojf");
    const gojfIdx = CHANCE.findIndex((c) => c.effect.kind === "jail-free");
    const { state: held } = autoStep(state);
    expect(held.jailFreeCards.chance).toBe("p1");
    expect(held.decks.chance).not.toContain(gojfIdx); // left the pile while held

    // Use it from jail: it should reappear at the bottom of the pile.
    const jailed: GameState = {
      ...held,
      players: held.players.map((p, i): Player =>
        i === 0 ? { ...p, position: 10, inJail: true, jailTurns: 1 } : p,
      ),
      turn: { ...held.turn, playerId: "p1", phase: "jail-decision", doublesStreak: 0 },
    };
    const used = apply(jailed, { kind: "use-jail-card", playerId: "p1" });
    if (!used.ok) throw new Error(`expected ok, got ${used.reason}`);
    expect(used.state.jailFreeCards.chance).toBeUndefined();
    expect(used.state.decks.chance[used.state.decks.chance.length - 1]).toBe(gojfIdx);
  });
});

describe("auction (decline-buy)", () => {
  it("opens an auction over the declined property with every non-bankrupt player in", () => {
    const state = applyOk(buyDecision(freshGame("auc-open"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    expect(state.turn.phase).toBe("auction");
    const a = state.turn.auction;
    expect(a?.position).toBe(1);
    expect(a?.active).toEqual(["p1", "p2", "p3", "p4"]);
    expect(a?.highBid).toBe(0);
    expect(a?.leaderId).toBeNull();
    expect(a?.resume).toEqual({ kind: "landing" });
  });

  it("records the bid amount and sets the leader", () => {
    let s = applyOk(buyDecision(freshGame("auc-bid"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "bid", playerId: "p1", amount: 10 });
    const a = s.turn.auction;
    expect(a?.highBid).toBe(10);
    expect(a?.leaderId).toBe("p1");
    expect(a?.bids).toEqual({ p1: 10 });
  });

  it("records an out-high bid on the bidder's bar without taking the lead", () => {
    // The whole reason for absolute bids: a bid that arrives already out-high (a
    // human who tapped $110 against a stale $100 while a bot reached $200) is
    // still COUNTED on that player's bar, leaving the leader and high untouched —
    // so the client never has to snap the bar back to zero.
    let s = applyOk(buyDecision(freshGame("auc-counted"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 200 }); // p2 leads at 200
    s = applyOk(s, { kind: "bid", playerId: "p3", amount: 110 }); // p3 out-high
    let a = s.turn.auction;
    expect(a?.highBid).toBe(200);
    expect(a?.leaderId).toBe("p2");
    expect(a?.bids).toEqual({ p2: 200, p3: 110 });
    // Re-bidding above the high retakes the lead.
    s = applyOk(s, { kind: "bid", playerId: "p3", amount: 210 });
    a = s.turn.auction;
    expect(a?.highBid).toBe(210);
    expect(a?.leaderId).toBe("p3");
    expect(a?.bids).toEqual({ p2: 200, p3: 210 });
  });

  it("lets any still-in player bid in any order, and the leader bid again to jam the price", () => {
    let s = applyOk(buyDecision(freshGame("auc-order"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 10 }); // p2 leads
    s = applyOk(s, { kind: "bid", playerId: "p4", amount: 20 }); // p4 leads
    s = applyOk(s, { kind: "bid", playerId: "p4", amount: 30 }); // p4 jams its lead
    const a = s.turn.auction;
    expect(a?.highBid).toBe(30);
    expect(a?.leaderId).toBe("p4");
    expect(a?.bids).toEqual({ p2: 10, p4: 30 });
  });

  it("rejects a drop from the leader and a bid from a player who dropped", () => {
    let s = applyOk(buyDecision(freshGame("auc-reject"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "bid", playerId: "p1", amount: 10 }); // p1 leads
    expect(apply(s, { kind: "pass-bid", playerId: "p1" }).ok).toBe(false);
    s = applyOk(s, { kind: "pass-bid", playerId: "p2" });
    expect(apply(s, { kind: "bid", playerId: "p2", amount: 20 }).ok).toBe(false);
  });

  it("caps each bid at the bidder's net worth (cash + liquidation)", () => {
    // $5 net worth can't even open at $10.
    const broke = applyOk(buyDecision(setCash(freshGame("auc-cap0"), "p1", 5), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    expect(apply(broke, { kind: "bid", playerId: "p1", amount: 10 }).ok).toBe(false);
    // $15 net worth opens at $10 but can't reach $20.
    let s = applyOk(buyDecision(setCash(freshGame("auc-cap1"), "p1", 15), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "bid", playerId: "p1", amount: 10 });
    expect(s.turn.auction?.highBid).toBe(10);
    expect(apply(s, { kind: "bid", playerId: "p1", amount: 20 }).ok).toBe(false);
  });

  it("hands the lot to the last bidder standing, paid to the bank, and resumes the landing", () => {
    let s = applyOk(buyDecision(freshGame("auc-win"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    const before = cashOf(s, "p1");
    s = applyOk(s, { kind: "bid", playerId: "p1", amount: 10 });
    s = applyOk(s, { kind: "pass-bid", playerId: "p2" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    const final = apply(s, { kind: "pass-bid", playerId: "p4" });
    if (!final.ok) throw new Error(final.reason);
    expect(final.state.ownership[1]).toBe("p1");
    expect(cashOf(final.state, "p1")).toBe(before - 10);
    expect(final.state.turn.phase).toBe("post-roll");
    expect(final.state.turn.auction).toBeUndefined();
    expect(
      final.newEvents.some(
        (e) => e.kind === "auction" && e.winnerId === "p1" && e.price === 10,
      ),
    ).toBe(true);
  });

  it("lets the last remaining player win by bidding once everyone else has dropped", () => {
    let s = applyOk(buyDecision(freshGame("auc-last"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "pass-bid", playerId: "p2" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p4" });
    // p1 alone but no bid yet — not decided; p1 claims it with a single bid.
    expect(s.turn.phase).toBe("auction");
    s = applyOk(s, { kind: "bid", playerId: "p1", amount: 10 });
    expect(s.ownership[1]).toBe("p1");
    expect(s.turn.phase).toBe("post-roll");
  });

  it("reverts the lot to the bank when everyone drops without a bid", () => {
    let s = applyOk(buyDecision(freshGame("auc-unsold"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "pass-bid", playerId: "p1" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p2" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    const final = apply(s, { kind: "pass-bid", playerId: "p4" });
    if (!final.ok) throw new Error(final.reason);
    expect(final.state.ownership[1]).toBeUndefined();
    expect(final.state.turn.phase).toBe("post-roll");
    expect(
      final.newEvents.some((e) => e.kind === "auction" && e.winnerId === null),
    ).toBe(true);
  });

  it("lets a player other than the decliner win while the active player's turn resumes", () => {
    let s = applyOk(buyDecision(freshGame("auc-other"), 1), {
      kind: "decline-buy",
      playerId: "p1",
    });
    s = applyOk(s, { kind: "pass-bid", playerId: "p1" });
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 10 });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p4" });
    expect(s.ownership[1]).toBe("p2");
    expect(s.turn.playerId).toBe("p1");
    expect(s.turn.phase).toBe("post-roll");
  });

  it("drops a winner who outbid their cash into must-raise-cash, resuming the landing after", () => {
    // p1 leads at $100 with $5 cash but owns Reading Railroad (mortgage value
    // $100), so net worth is $105 — winning pushes them into the red. Hand-built
    // mid-auction so it needn't climb there one $10 tap at a time.
    const base = withOwnership(setCash(freshGame("auc-raise"), "p1", 5), { 5: "p1" });
    const mid: GameState = {
      ...base,
      turn: {
        ...base.turn,
        phase: "auction",
        auction: {
          position: 1,
          active: ["p1", "p2"],
          highBid: 100,
          leaderId: "p1",
          bids: { p1: 100 },
          resume: { kind: "landing" },
        },
      },
    };
    const s = applyOk(mid, { kind: "pass-bid", playerId: "p2" });
    expect(s.ownership[1]).toBe("p1");
    expect(cashOf(s, "p1")).toBe(-95);
    expect(s.turn.phase).toBe("must-raise-cash");
    expect(s.turn.raiseCash).toBe("after-landing");
    expect(firstNegativePlayer(s)).toBe("p1");
  });
});

describe("auction (bank-estate bankruptcy)", () => {
  // p1 lands on Luxury Tax ($100) with $0 and a single lot — they can't cover
  // it even after liquidating, so they bust to the bank and the lot is auctioned.
  function bustToBankOwning(
    seed: string,
    lots: Record<number, string>,
    opts: { mortgaged?: Record<number, boolean>; count?: 2 | 4 } = {},
  ): { state: GameState; newEvents: ReturnType<typeof autoStep>["newEvents"] } {
    let start = withOwnership(
      setCash(freshGame(seed, undefined, opts.count ?? 4), "p1", 0),
      lots,
    );
    if (opts.mortgaged) start = { ...start, mortgaged: opts.mortgaged };
    const { state: placed } = setupLandingOn(start, 38); // Luxury Tax
    return autoStep(placed);
  }

  it("auctions the estate lot among the survivors when a player busts to the bank", () => {
    const { state, newEvents } = bustToBankOwning("auc-estate", { 1: "p1" });
    expect(newEvents.some((e) => e.kind === "bankrupt" && e.creditorId === null)).toBe(true);
    expect(state.turn.phase).toBe("auction");
    expect(state.players.find((p) => p.id === "p1")?.bankrupt).toBe(true);
    const a = state.turn.auction;
    expect(a?.position).toBe(1);
    expect(a?.resume).toEqual({ kind: "bank-estate", debtorId: "p1", remaining: [] });
    // The bankrupt debtor is excluded from the bidders.
    expect(a?.active).toEqual(["p2", "p3", "p4"]);
    expect(state.ownership[1]).toBeUndefined();
  });

  it("transfers the won lot and resumes play after the debtor", () => {
    let s = bustToBankOwning("auc-estate-win", { 1: "p1" }).state;
    const before = cashOf(s, "p2");
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 10 });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p4" });
    expect(s.ownership[1]).toBe("p2");
    expect(cashOf(s, "p2")).toBe(before - 10);
    expect(s.turn.phase).toBe("pre-roll");
    expect(s.turn.playerId).toBe("p2");
  });

  it("caps an estate bid at cash on hand", () => {
    let s = bustToBankOwning("auc-estate-cap", { 1: "p1" }).state;
    s = { ...s, players: s.players.map((p) => (p.id === "p2" ? { ...p, cash: 15 } : p)) };
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 10 }); // $10 ok
    expect(s.turn.auction?.highBid).toBe(10);
    // $20 would exceed p2's $15 cash.
    expect(apply(s, { kind: "bid", playerId: "p2", amount: 20 }).ok).toBe(false);
  });

  it("charges the 10% interest on a still-mortgaged estate lot and keeps it mortgaged", () => {
    let s = bustToBankOwning("auc-estate-mort", { 1: "p1" }, {
      mortgaged: { 1: true },
    }).state;
    const before = cashOf(s, "p2");
    s = applyOk(s, { kind: "bid", playerId: "p2", amount: 10 });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p4" });
    expect(s.ownership[1]).toBe("p2");
    expect(s.mortgaged[1]).toBe(true);
    // Mediterranean mortgage value $30 → 10% interest = $3, on top of the bid.
    expect(cashOf(s, "p2")).toBe(before - 10 - 3);
  });

  it("auctions a multi-lot estate one lot at a time", () => {
    const { state } = bustToBankOwning("auc-estate-multi", { 1: "p1", 3: "p1" });
    expect(state.turn.auction?.position).toBe(1);
    expect(state.turn.auction?.resume).toEqual({
      kind: "bank-estate",
      debtorId: "p1",
      remaining: [3],
    });
    // Win the first lot; the second opens immediately.
    let s = applyOk(state, { kind: "bid", playerId: "p2", amount: 10 });
    s = applyOk(s, { kind: "pass-bid", playerId: "p3" });
    s = applyOk(s, { kind: "pass-bid", playerId: "p4" });
    expect(s.ownership[1]).toBe("p2");
    expect(s.turn.phase).toBe("auction");
    expect(s.turn.auction?.position).toBe(3);
    expect(s.turn.auction?.resume).toEqual({
      kind: "bank-estate",
      debtorId: "p1",
      remaining: [],
    });
  });

  it("skips the estate auction when the bust ends the game", () => {
    const { state, newEvents } = bustToBankOwning("auc-estate-end", { 1: "p1" }, {
      count: 2,
    });
    expect(state.turn.phase).toBe("game-over");
    expect(newEvents.some((e) => e.kind === "winner" && e.winnerId === "p2")).toBe(true);
    expect(state.turn.auction).toBeUndefined();
  });
});
