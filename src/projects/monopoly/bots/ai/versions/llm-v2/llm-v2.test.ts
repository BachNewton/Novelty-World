import { describe, expect, it, vi } from "vitest";
import { freshGame } from "../../../../mocks";
import type { AiDecisionRecord, AuctionState, GameEvent, GameState, Player, TurnState } from "../../../../types";
import { askModel, claimAi, settleAnswer, type Settled } from "../../decide";
import { aiDecisionFor } from "../../decisions";
import { isNoteHeld } from "../../held";
import type { ModelAdapter } from "../../model/adapter";
import { withAiSeat } from "../../seat";
import { DECISION_SPECS } from "./answers";
import { logLines } from "./events";
import { tableNames } from "./format";
import { acquisitionLines, buildPrompt } from "./prompt";
import { readTrade } from "./trade-terms";

// p1 is a human, p2 the llm-v2 seat, p3/p4 rule-based bots.
const AI = "p2";
const base: GameState = (() => {
  const game = freshGame("llm-v2-test");
  return {
    ...game,
    players: game.players.map((p) =>
      p.id === AI ? { ...p, botStrategy: "ai:local@llm-v2" } : p.botStrategy !== null ? { ...p, botStrategy: "dumb" } : p,
    ),
  };
})();

const NOTES = { privateNote: "thinking", publicNote: "Hello.", plan: "Get the oranges." };

function withTurn(state: GameState, patch: Partial<TurnState>): GameState {
  return { ...state, turn: { ...state.turn, ...patch } };
}

function withPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

function record(decision: AiDecisionRecord["decision"]): AiDecisionRecord {
  return {
    decision,
    version: "llm-v2",
    model: "m.gguf",
    ms: 900,
    thinkMs: null,
    answerMs: 900,
    promptTokens: 100,
    completionTokens: 10,
    thinkHitBudget: null,
  };
}

function decide(state: GameState, answer: Record<string, unknown>): Settled {
  const claim = claimAi(state, AI);
  if (!claim) throw new Error("expected a decision to claim");
  return settleAnswer(claim.state, claim.state, AI, claim.decision, answer, record(claim.decision));
}

function events(state: GameState): GameEvent[] {
  return state.turns.flatMap((t) => t.events);
}

/** The AI holds Oriental (6) and St. James (16); p1 holds Vermont (8). */
const holdings: GameState = { ...base, ownership: { 6: AI, 16: AI, 8: "p1" } };

describe("llm-v2 trades: written from the seat's own side", () => {
  const trade = (patch: Record<string, unknown>): Record<string, unknown> => ({
    counterparty: "p1",
    youGive: { properties: [6], jailCards: [] },
    youGet: { properties: [8], jailCards: [] },
    cashYouReceive: -50,
    yourCashAfter: 1450,
    ...patch,
  });

  it("turns give / get / cash received into the engine's terms", () => {
    expect(readTrade(holdings, AI, trade({}))).toEqual({
      ok: true,
      terms: { propertyTo: { 6: "p1", 8: AI }, gojfTo: {}, cashDelta: { [AI]: -50, p1: 50 } },
    });
  });

  it("fails a trade whose stated cash doesn't add up, the sign slip that once gave a lot away and paid on top", () => {
    // Meant to sell St. James for $180; wrote the cash the wrong way round.
    const slipped = trade({
      youGive: { properties: [16], jailCards: [] },
      youGet: { properties: [], jailCards: [] },
      cashYouReceive: -18,
      yourCashAfter: 1680,
    });
    const read = readTrade(holdings, AI, slipped);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("doesn't add up");
  });

  it("fails asking for a lot the counterparty doesn't own", () => {
    const read = readTrade(holdings, AI, trade({ youGet: { properties: [16], jailCards: [] } }));
    expect(read.ok).toBe(false);
  });

  it("counters a pending trade in one write, from its own side", () => {
    const pending = withTurn(holdings, {
      playerId: "p1",
      phase: "trade-pending",
      pendingTrade: {
        id: "t1",
        proposerId: "p1",
        propertyTo: { 6: "p1" },
        gojfTo: {},
        cashDelta: { p1: -100, [AI]: 100 },
        approvals: { p1: true, [AI]: false },
      },
    });
    const settled = decide(pending, {
      ...NOTES,
      vote: "counter",
      counter: trade({ youGet: { properties: [], jailCards: [] }, cashYouReceive: 160, yourCashAfter: 1660 }),
    });
    expect(settled.kind).toBe("commit");
    expect(settled.state.turn.pendingTrade).toMatchObject({
      proposerId: AI,
      propertyTo: { 6: "p1" },
      cashDelta: { [AI]: 160, p1: -160 },
    });
  });
});

describe("llm-v2 auctions", () => {
  const auction: AuctionState = {
    position: 39,
    active: ["p1", "p2", "p3", "p4"],
    highBid: 0,
    leaderId: null,
    bids: {},
    resume: { kind: "landing" },
  };
  const running = withTurn(base, { playerId: "p1", phase: "auction", auction });

  it("asks with the lot's stakes and a rule of thumb, never the most the seat could pay", () => {
    const question = DECISION_SPECS.auction?.question(running, AI) ?? "";
    expect(question).toContain("Owning Boardwalk would give you 1 of 2 Dark blue");
    expect(question).toContain("Rule of thumb");
    expect(question).toContain("Winning at a bid of B leaves you $1,500 minus B");
    expect(question).not.toContain("could pay at most");
  });

  it("holds its public note off the board until the auction closes, from players and from other AI seats", () => {
    const settled = decide(running, { ...NOTES, publicNote: "I'll go to $900.", maxBid: 900 });
    expect(settled.kind).toBe("commit");
    const note = events(settled.state).find((e) => e.kind === "bot-note");
    expect(note).toMatchObject({ heldForAuction: 39 });
    if (!note) return;
    expect(isNoteHeld(settled.state, note, true)).toBe(true);
    expect(logLines(settled.state, tableNames(settled.state)).join("\n")).not.toContain("$900");

    const closed = withTurn(settled.state, { phase: "post-roll", auction: undefined });
    expect(isNoteHeld(closed, note, true)).toBe(false);
    expect(logLines(closed, tableNames(closed)).join("\n")).toContain("I'll go to $900.");
  });
});

describe("llm-v2 buys", () => {
  it("states what owning the lot completes, beside the choice", () => {
    // Connecticut with the other two light blues unowned: not a full set.
    const atConnecticut = withTurn(holdings, { playerId: AI, phase: "buy-decision", pendingBuy: 9 });
    const question = DECISION_SPECS.buy?.question(atConnecticut, AI) ?? "";
    expect(question).toContain("would give you 2 of 3 Light blue; still not a full set");
    expect(question).toContain("Oriental Avenue: you");
  });

  it("names a rival whose set the lot decides", () => {
    const rivalHolds: GameState = { ...base, ownership: { 6: "p1", 8: "p1" } };
    expect(acquisitionLines(rivalHolds, AI, 9).join("\n")).toContain("whoever gets Connecticut Avenue decides");
  });

  it("states railroad counts and rent", () => {
    expect(acquisitionLines({ ...base, ownership: { 5: AI } }, AI, 15)).toEqual([
      "Owning Pennsylvania Railroad would give you 2 of 4 railroads; each of yours would then charge $50 rent.",
    ]);
  });
});

describe("llm-v2 turn start", () => {
  const preRoll = (state: GameState): GameState => withTurn(state, { playerId: AI, phase: "pre-roll" });

  it("isn't asked when the seat can't build, lift a mortgage, or trade toward a shared set", () => {
    const alone: GameState = { ...base, ownership: { 6: AI, 39: "p1" } };
    expect(aiDecisionFor(preRoll(alone), AI)).toBeNull();
  });

  it("is asked when it shares a set, and not again over the same board", () => {
    const first = preRoll(holdings);
    expect(aiDecisionFor(first, AI)).toBe("turn-start");
    const settled = decide(first, {
      ...NOTES,
      build: [],
      mortgage: [],
      unmortgage: [],
      proposeTrade: false,
      trade: {
        counterparty: "p1",
        youGive: { properties: [], jailCards: [] },
        youGet: { properties: [], jailCards: [] },
        cashYouReceive: 0,
        yourCashAfter: 1500,
      },
    });
    expect(settled.kind).toBe("commit");
    // A turn start that did nothing logs no public line; its thinking is kept.
    expect(events(settled.state).find((e) => e.kind === "bot-note")).toMatchObject({
      text: "",
      privateText: NOTES.privateNote,
    });
    // A later turn over the same board: nothing to ask about.
    const later = { ...settled.state, turns: [...settled.state.turns, { turn: 99, playerId: AI, events: [] }] };
    expect(aiDecisionFor(preRoll(later), AI)).toBeNull();
  });

  it("is asked every turn while the seat could build", () => {
    const browns = preRoll(withAiSeat({ ...base, ownership: { 1: AI, 3: AI } }, AI, { turnStart: { turn: 0, fingerprint: "x" } }));
    expect(aiDecisionFor(browns, AI)).toBe("turn-start");
  });
});

describe("llm-v2 prompt and call", () => {
  it("frames the plan as a note that may be wrong, and reads the board set by set", () => {
    const planned = withAiSeat(holdings, AI, { plan: "Build on Yellow." });
    const { user } = buildPrompt(planned, AI, "Buy it?");
    expect(user).toContain("Your plan from last time (your own note; it may be wrong, so check it against the board above): Build on Yellow.");
    expect(user).toContain("Orange (houses $100 each): you own 1 of 3, so you can't build here yet; held by: you 1, unowned 2");
    expect(user).toContain("Railroads: you own 0 of 4");
    expect(buildPrompt(structuredClone(planned), AI, "Buy it?")).toEqual(buildPrompt(planned, AI, "Buy it?"));
  });

  it("calls the model at a pinned low temperature", async () => {
    const complete = vi.fn<ModelAdapter["complete"]>(() =>
      Promise.resolve({
        ok: true,
        answer: { ...NOTES, choice: "buy", mortgage: [] },
        raw: "{}",
        thoughts: "",
        metrics: { ms: 1, thinkMs: null, answerMs: 1, promptTokens: null, completionTokens: null, thinkHitBudget: null },
      }),
    );
    const atBoardwalk = withTurn(withPlayer(base, AI, { position: 39 }), { playerId: AI, phase: "buy-decision", pendingBuy: 39 });
    const asked = await askModel({ complete, identify: () => Promise.resolve(null) }, atBoardwalk, AI, "buy");
    expect(asked.record).toMatchObject({ version: "llm-v2", model: null });
    expect(complete.mock.calls[0][0].sampling).toEqual({ temperature: 0.3 });
  });
});
