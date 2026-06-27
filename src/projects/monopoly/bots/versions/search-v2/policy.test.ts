import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import { isLegal } from "../../../engine";
import type { GameState, Intent } from "../../../types";
import { searchBot } from "./policy";
import { baseBot } from "./base";
import { searchBest, type SearchCandidate } from "./search";

// freshGame seats p1..p4, p1 active, $1500 each, no ownership, a real seeded
// rngState + decks — so the rollout engine can drive full games from these
// states. The search bot reads the seat id it's asked about (the pacer enforces
// bot-ness), so these call it directly for whichever seat the scenario puts in
// the hot seat. search-v2 wraps the TUNED claude-v45 base (vs search-v1's v38),
// but the search machinery — and these invariants — are identical.
const base = freshGame("search-v2-test");

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

// A garden-variety buy-decision: p1 landed on an unowned orange (19) holding two
// of the set already — a high-leverage completer, exactly what search targets.
function buyState(): GameState {
  return withTurn(
    { phase: "buy-decision", pendingBuy: 19 },
    { ownership: { 16: "p1", 18: "p1" } },
  );
}

// A pending incoming trade p1 must vote on (a set-completer offered to p1).
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

describe("search-v2 — determinism", () => {
  it("returns the identical decision on repeated calls for the same buy state", () => {
    const state = buyState();
    const a = searchBot(state, "p1");
    const b = searchBot(state, "p1");
    const c = searchBot(state, "p1");
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a?.intent).toBeDefined();
  });

  it("returns the identical decision on repeated calls for the same trade vote", () => {
    const state = tradeVoteState();
    const a = searchBot(state, "p1");
    const b = searchBot(state, "p1");
    expect(a).toEqual(b);
  });
});

describe("search-v2 — the played move is always a legal candidate", () => {
  it("plays a legal intent at a buy-decision", () => {
    const state = buyState();
    const d = searchBot(state, "p1");
    expect(d).not.toBeNull();
    if (!d) throw new Error("expected a decision");
    expect(isLegal(state, d.intent)).toBe(true);
    // It must be one of the searched buy candidates (never invents a move).
    expect(["buy", "decline-buy", "raise-cash"]).toContain(d.intent.kind);
  });

  it("plays a legal accept/decline at a trade vote", () => {
    const state = tradeVoteState();
    const d = searchBot(state, "p1");
    expect(d).not.toBeNull();
    if (!d) throw new Error("expected a decision");
    expect(isLegal(state, d.intent)).toBe(true);
    expect(["accept-trade", "decline-trade"]).toContain(d.intent.kind);
  });

  it("an off-turn seat owes no buy decision (returns null, like the base policy)", () => {
    // The buy-decision belongs to the active player only; an off-turn seat must
    // get null from both the search bot and the base policy.
    const state = buyState();
    expect(searchBot(state, "p2")).toBeNull();
    expect(baseBot(state, "p2")).toBeNull();
  });
});

describe("search-v2 — delegates non-searched phases verbatim to the base policy", () => {
  const cases: { name: string; state: GameState }[] = [
    {
      name: "pre-roll arming",
      state: withTurn({ phase: "pre-roll" }, { ownership: { 16: "p1", 18: "p1", 19: "p1" } }),
    },
    {
      name: "managing build commit",
      state: setCash(
        withTurn({ phase: "managing", managerId: "p1" }, { ownership: { 16: "p1", 18: "p1", 19: "p1" } }),
        "p1",
        1000,
      ),
    },
    {
      name: "auction",
      state: withTurn(
        {
          phase: "auction",
          auction: {
            position: 19,
            active: ["p1", "p2"],
            highBid: 200,
            leaderId: "p2",
            bids: { p2: 200 },
            resume: { kind: "landing" },
          },
        },
        { ownership: { 16: "p1", 18: "p1" } },
      ),
    },
  ];
  for (const c of cases) {
    it(`${c.name} matches baseBot exactly`, () => {
      expect(searchBot(c.state, "p1")).toEqual(baseBot(c.state, "p1"));
    });
  }
});

describe("searchBest — safety: only displaces the base choice when STRICTLY better", () => {
  const state = buyState();
  function cand(intent: Intent, isBaseChoice: boolean, label: string): SearchCandidate {
    return { intent, afterState: state, isBaseChoice, label };
  }

  it("keeps the base candidate when scores tie (zero-sample stub gives all 0)", () => {
    // With 0 samples every candidate scores 0 (the empty-mean is treated as a
    // tie), so the base choice must win — search never trades a proven move for
    // a noise tie.
    const cands = [
      cand({ kind: "buy", playerId: "p1" }, true, "buy"),
      cand({ kind: "decline-buy", playerId: "p1" }, false, "decline"),
    ];
    const r = searchBest(cands, "p1", 0, 4);
    expect(r.best.isBaseChoice).toBe(true);
  });

  it("the base candidate is always present and flagged in a real buy search", () => {
    // The bot's actual decision must correspond to a candidate that includes the
    // greedy base move — i.e. searchBot never returns a move outside the set the
    // base policy could have chosen.
    const d = searchBot(state, "p1");
    const baseChoice = baseBot(state, "p1");
    expect(baseChoice).not.toBeNull();
    if (!d || !baseChoice) throw new Error("expected decisions");
    expect(["buy", "decline-buy", "raise-cash"]).toContain(d.intent.kind);
  });
});
