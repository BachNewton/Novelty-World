import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import type { GameState } from "../types";
import { claudeBot } from "./claude";

// freshGame seats p1..p4, p1 active, $1500 each, no ownership. claudeBot reads
// the seat id it's asked about (the pacer enforces bot-ness), so these call it
// directly for whichever seat the scenario puts in the hot seat.
const base = freshGame();

function withTurn(
  turn: Partial<GameState["turn"]>,
  patch: Partial<GameState> = {},
): GameState {
  return { ...base, ...patch, turn: { ...base.turn, ...turn } };
}

function setCash(state: GameState, id: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, cash } : p)),
  };
}

// Board references used below (orange 16/18/19, red 21/23/24, brown 1/3,
// Reading RR 5, Electric Co 12, Boardwalk 39).

describe("claudeBot — buy / raise-to-buy", () => {
  it("buys a property that completes a monopoly, and says why", () => {
    const state = withTurn(
      { phase: "buy-decision", pendingBuy: 19 },
      { ownership: { 16: "p1", 18: "p1" } },
    );
    const d = claudeBot(state, "p1");
    expect(d?.intent).toEqual({ kind: "buy", playerId: "p1" });
    expect(d?.note).toContain("complete");
  });

  it("passes on a low-value buy that would breach its rent reserve", () => {
    // p2 has a hotel on Boardwalk → huge worst-case rent → high liquidity floor.
    const state = setCash(
      withTurn(
        { phase: "buy-decision", pendingBuy: 12 }, // Electric Company, $150
        { ownership: { 39: "p2" }, houses: { 39: 5 } },
      ),
      "p1",
      200, // can afford $150, but spending it dips below the floor
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "decline-buy",
      playerId: "p1",
    });
  });

  it("raises cash to buy a set-completer it can't afford outright", () => {
    const state = setCash(
      withTurn({ phase: "buy-decision", pendingBuy: 19 }, { ownership: { 16: "p1", 18: "p1" } }),
      "p1",
      100,
    );
    const d = claudeBot(state, "p1");
    expect(d?.intent).toEqual({ kind: "raise-cash", playerId: "p1" });
    expect(d?.note).toContain("raising cash");
  });

  it("stages the mortgage raise, then commits the buy, in raising-cash", () => {
    const staging = setCash(
      withTurn(
        { phase: "raising-cash", pendingBuy: 19, manageStaged: { build: {}, mortgage: {} } },
        { ownership: { 16: "p1", 18: "p1" } },
      ),
      "p1",
      100,
    );
    expect(claudeBot(staging, "p1")?.intent).toEqual({
      kind: "update-manage-staging",
      playerId: "p1",
      staged: { build: {}, mortgage: { 16: true, 18: true } },
    });

    const ready: GameState = {
      ...staging,
      turn: { ...staging.turn, manageStaged: { build: {}, mortgage: { 16: true, 18: true } } },
    };
    expect(claudeBot(ready, "p1")?.intent).toEqual({ kind: "buy", playerId: "p1" });
  });
});

describe("claudeBot — auction", () => {
  it("bids above face for a set-completer", () => {
    const state = withTurn(
      {
        phase: "auction",
        auction: {
          position: 19,
          active: ["p1", "p2"],
          highBid: 200, // already at the printed price
          leaderId: "p2",
          bids: { p2: 200 },
          resume: { kind: "landing" },
        },
      },
      { ownership: { 16: "p1", 18: "p1" } },
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "bid",
      playerId: "p1",
      amount: 210,
    });
  });

  it("drops out once the bid exceeds the property's value to it", () => {
    const state = withTurn({
      phase: "auction",
      auction: {
        position: 12, // Electric Company — low value, no synergy
        active: ["p1", "p2"],
        highBid: 200,
        leaderId: "p2",
        bids: { p2: 200 },
        resume: { kind: "landing" },
      },
    });
    const d = claudeBot(state, "p1");
    expect(d?.intent).toEqual({ kind: "pass-bid", playerId: "p1" });
    expect(d?.note).toContain("worth");
  });
});

describe("claudeBot — must-raise-cash (value-preserving)", () => {
  it("mortgages a railroad before breaking a monopoly", () => {
    // p1 owns the brown monopoly (1, 3) and Reading Railroad (5), and is in the
    // red. The value-preserving choice mortgages the railroad, sparing the set —
    // the opposite of the dumb bot's cheapest-deed-first (which would mortgage a
    // brown and break the monopoly).
    const state = setCash(
      withTurn(
        { phase: "must-raise-cash", raiseCash: "after-landing" },
        { ownership: { 1: "p1", 3: "p1", 5: "p1" } },
      ),
      "p1",
      -50,
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "mortgage",
      playerId: "p1",
      position: 5,
    });
  });
});

describe("claudeBot — jail as a haven", () => {
  function jailed(patch: Partial<GameState> = {}): GameState {
    return {
      ...withTurn({ phase: "jail-decision" }, patch),
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, inJail: true, jailTurns: 1, position: 10 } : p,
      ),
    };
  }

  it("stays in jail (rolls) when developed boards make leaving dangerous", () => {
    // p2 has 3 houses on New York Avenue → ~$600 rent out there.
    const state = jailed({ ownership: { 19: "p2" }, houses: { 19: 3 } });
    expect(claudeBot(state, "p1")).toBeNull(); // null → the pacer rolls
  });

  it("leaves with a free card on a safe board", () => {
    const state: GameState = { ...jailed(), jailFreeCards: { chance: "p1" } };
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "use-jail-card",
      playerId: "p1",
    });
  });
});

describe("claudeBot — trade evaluation", () => {
  it("accepts a trade that completes its monopoly", () => {
    const pending = {
      id: "t1",
      proposerId: "p3",
      propertyTo: { 19: "p1" },
      gojfTo: {},
      cashDelta: { p1: -100, p3: 100 },
      approvals: { p3: true, p1: false },
    };
    const state = withTurn(
      { phase: "trade-pending", pendingTrade: pending },
      { ownership: { 16: "p1", 18: "p1", 19: "p3" } },
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "accept-trade",
      playerId: "p1",
      tradeId: "t1",
    });
  });

  it("declines a trade that would break its monopoly for too little", () => {
    const pending = {
      id: "t2",
      proposerId: "p3",
      propertyTo: { 19: "p3" },
      gojfTo: {},
      cashDelta: { p1: 50, p3: -50 },
      approvals: { p3: true, p1: false },
    };
    const state = withTurn(
      { phase: "trade-pending", pendingTrade: pending },
      { ownership: { 16: "p1", 18: "p1", 19: "p1" } },
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "decline-trade",
      playerId: "p1",
      tradeId: "t2",
    });
  });
});

describe("claudeBot — proactive arming at pre-roll", () => {
  it("arms a build when it holds a developable monopoly", () => {
    const state = withTurn(
      { phase: "pre-roll" },
      { ownership: { 16: "p1", 18: "p1", 19: "p1" } },
    );
    const d = claudeBot(state, "p1");
    expect(d?.intent).toEqual({
      kind: "set-queue",
      playerId: "p1",
      queue: "manage",
      armed: true,
    });
    expect(d?.note).toContain("Developing");
  });

  it("arms a trade when a mutual set-completing deal exists", () => {
    // p1 one lot from oranges (16, 18; p3 holds 19). p3 one lot from reds
    // (21, 23; p1 holds 24). A swap completes a monopoly for each.
    const state = withTurn(
      { phase: "pre-roll" },
      { ownership: { 16: "p1", 18: "p1", 24: "p1", 19: "p3", 21: "p3", 23: "p3" } },
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "set-queue",
      playerId: "p1",
      queue: "trade",
      armed: true,
    });
  });

  it("does nothing at pre-roll with no monopoly to build and no trade to make", () => {
    expect(claudeBot(withTurn({ phase: "pre-roll" }), "p1")).toBeNull();
  });
});

describe("claudeBot — unmortgage and redeploy", () => {
  // p1 holds the whole red set (21, 23, 24) but Kentucky (21) is mortgaged, so
  // the set is dead weight — it can't be built and earns nothing. A flush bot
  // should lift the mortgage and develop in one commit. This is the gap the
  // 491-turn dev game exposed: a bot that wins monopolies (often inheriting
  // mortgaged lots) and then sits on cash without ever switching them on.
  const reds = { 21: "p1", 23: "p1", 24: "p1" };

  it("commits a manage that unmortgages the set and builds, when flush", () => {
    const state = setCash(
      withTurn(
        { phase: "managing", managerId: "p1" },
        { ownership: reds, mortgaged: { 21: true } },
      ),
      "p1",
      1000,
    );
    expect(claudeBot(state, "p1")?.intent).toEqual({
      kind: "manage",
      playerId: "p1",
      build: { 21: 1, 23: 1, 24: 1 },
      mortgage: { 21: false },
    });
  });

  it("arms a manage at pre-roll for the mortgaged set, and says it will unmortgage", () => {
    const state = setCash(
      withTurn({ phase: "pre-roll" }, { ownership: reds, mortgaged: { 21: true } }),
      "p1",
      1000,
    );
    const d = claudeBot(state, "p1");
    expect(d?.intent).toEqual({
      kind: "set-queue",
      playerId: "p1",
      queue: "manage",
      armed: true,
    });
    expect(d?.note?.toLowerCase()).toContain("unmortgag");
  });

  it("does NOT unmortgage when it isn't comfortably above its rent reserve", () => {
    // Same mortgaged monopoly, but cash near the floor — unmortgaging pays 10%
    // interest and undoes a past raise, so a thin bot leaves it alone.
    const preRoll = setCash(
      withTurn({ phase: "pre-roll" }, { ownership: reds, mortgaged: { 21: true } }),
      "p1",
      500,
    );
    expect(claudeBot(preRoll, "p1")).toBeNull();

    const managing = setCash(
      withTurn(
        { phase: "managing", managerId: "p1" },
        { ownership: reds, mortgaged: { 21: true } },
      ),
      "p1",
      500,
    );
    expect(claudeBot(managing, "p1")).toBeNull();
  });
});

describe("claudeBot — trade-building drive", () => {
  it("populates an empty draft, then proposes once it matches the plan", () => {
    const ownership = { 16: "p1", 18: "p1", 24: "p1", 19: "p3", 21: "p3", 23: "p3" };
    const empty = withTurn(
      {
        phase: "trade-building",
        tradeDraft: { proposerId: "p1", propertyTo: {}, gojfTo: {}, cashDelta: {} },
      },
      { ownership },
    );
    const first = claudeBot(empty, "p1");
    expect(first?.intent.kind).toBe("update-trade-draft");

    // Re-open with the draft already set to the planned terms → it proposes.
    if (first?.intent.kind !== "update-trade-draft") throw new Error("expected a draft update");
    const ready = withTurn(
      {
        phase: "trade-building",
        tradeDraft: { proposerId: "p1", ...first.intent.terms },
      },
      { ownership },
    );
    expect(claudeBot(ready, "p1")?.intent).toEqual({ kind: "propose-trade", playerId: "p1" });
  });
});
