import { describe, expect, it, vi } from "vitest";
import { freshGame } from "../../../../mocks";
import type { AiDecisionRecord, AuctionState, GameEvent, GameState, Player, TurnState } from "../../../../types";
import { askModel, claimAi, settleAnswer, type Settled } from "../../decide";
import { aiDecisionFor } from "../../decisions";
import { isNoteHeld } from "../../held";
import type { ModelAdapter } from "../../model/adapter";
import { withAiSeat } from "../../seat";
import { built, inDebt, mortgaging, owning, table } from "../../eval/board";
import { buildEvenly, DECISION_SPECS, sellEvenly } from "./answers";
import { logLines } from "./events";
import { tableNames } from "./format";
import { acquisitionLines, buildPrompt } from "./prompt";
import { readCounter, readTrade } from "./trade-terms";

// p1 is a human, p2 the llm-v7 seat, p3/p4 rule-based bots.
const AI = "p2";
const base: GameState = (() => {
  const game = freshGame("llm-v7-test");
  return {
    ...game,
    players: game.players.map((p) =>
      p.id === AI ? { ...p, botStrategy: "ai:local@llm-v7" } : p.botStrategy !== null ? { ...p, botStrategy: "dumb" } : p,
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
    version: "llm-v7",
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

describe("llm-v7 trades: written from the seat's own side", () => {
  const trade = (patch: Record<string, unknown>): Record<string, unknown> => ({
    counterparty: "p1",
    youGive: { properties: [6], jailCards: [] },
    youGet: { properties: [8], jailCards: [] },
    dealInWords: "I give Oriental; I get Vermont; I pay $50",
    cashYouPay: 50,
    cashYouReceive: 0,
    yourCashAfter: 1450,
    ...patch,
  });

  it("turns give / get / cash paid into the engine's terms", () => {
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
      cashYouPay: 18,
      cashYouReceive: 0,
      yourCashAfter: 1680,
    });
    const read = readTrade(holdings, AI, slipped);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("doesn't add up");
  });

  it("turns cash received into a positive delta for the seat", () => {
    const read = readTrade(holdings, AI, trade({ cashYouPay: 0, cashYouReceive: 75, yourCashAfter: 1575 }));
    expect(read).toMatchObject({ ok: true, terms: { cashDelta: { [AI]: 75, p1: -75 } } });
  });

  it("fails a trade that both pays and receives cash", () => {
    const read = readTrade(holdings, AI, trade({ cashYouPay: 50, cashYouReceive: 20, yourCashAfter: 1470 }));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("both pays");
  });

  it("fails a negative cash amount", () => {
    const read = readTrade(holdings, AI, trade({ cashYouPay: -50, cashYouReceive: 0, yourCashAfter: 1550 }));
    expect(read.ok).toBe(false);
  });

  it("fails asking for a lot the counterparty doesn't own", () => {
    const read = readTrade(holdings, AI, trade({ youGet: { properties: [16], jailCards: [] } }));
    expect(read.ok).toBe(false);
  });
});

describe("llm-v7 counters: the vote first, then the terms", () => {
  // p1 offers $100 for Oriental; p1 holds Vermont.
  const pending = withTurn(holdings, {
    playerId: "p1",
    phase: "trade-pending",
    pendingTrade: {
      id: "trade-1-0-test",
      proposerId: "p1",
      propertyTo: { 6: "p1" },
      gojfTo: {},
      cashDelta: { p1: -100, [AI]: 100 },
      approvals: { p1: true, [AI]: false },
    },
  });
  const spec = DECISION_SPECS["trade-vote"];
  const terms = (patch: Record<string, unknown>): Record<string, unknown> => ({
    yourLots: { "#6 Oriental Avenue": "keep", "#16 St. James Place": "keep" },
    theirLots: { "#8 Vermont Avenue": "leave" },
    cashYouPay: 0,
    cashYouReceive: 0,
    yourCashAfter: 1500,
    ...patch,
  });

  it("asks the vote alone, beside what each side could trade", () => {
    const question = spec?.question(pending, AI) ?? "";
    expect(question).toContain("- You: #6 Oriental Avenue, #16 St. James Place; $1,500 in cash.");
    expect(question).toContain("- Kyle: #8 Vermont Avenue; $1,500 in cash.");
    expect(Object.keys((spec?.schema(pending, AI).properties ?? {}) as object)).toEqual(["privateNote", "vote", "publicNote", "plan"]);
  });

  it("asks a follow-up for the terms only once it counters, with its own notes in it", () => {
    expect(spec?.followUp?.(pending, AI, { ...NOTES, vote: "decline" })).toBeNull();
    const followUp = spec?.followUp?.(pending, AI, { ...NOTES, vote: "counter" });
    expect(followUp?.key).toBe("counter");
    expect(followUp?.question).toContain(`Your message to Kyle: "Hello."`);
    expect(followUp?.schema).toMatchObject({
      properties: {
        yourLots: { required: ["#6 Oriental Avenue", "#16 St. James Place"] },
        theirLots: { required: ["#8 Vermont Avenue"] },
      },
    });
  });

  it("asks for the counter in words first, from the message, before any lot or cash", () => {
    const followUp = spec?.followUp?.(pending, AI, { ...NOTES, vote: "counter" });
    expect(followUp?.question).toContain(`"termsInWords": first, your counter in one sentence of this form, matching your message`);
    expect(Object.keys((followUp?.schema.properties ?? {}) as object)).toEqual([
      "termsInWords",
      "yourLots",
      "theirLots",
      "cashYouPay",
      "cashYouReceive",
      "yourCashAfter",
    ]);
  });

  it("counters in one write with the lots it chose, from its own side", () => {
    const settled = decide(pending, {
      ...NOTES,
      vote: "counter",
      counter: terms({ yourLots: { "#6 Oriental Avenue": "hand over", "#16 St. James Place": "keep" }, cashYouReceive: 160, yourCashAfter: 1660 }),
    });
    expect(settled.kind).toBe("commit");
    expect(settled.state.turn.pendingTrade).toMatchObject({
      proposerId: AI,
      propertyTo: { 6: "p1" },
      cashDelta: { [AI]: 160, p1: -160 },
    });
  });

  it("swaps a lot for one the other side holds", () => {
    const read = readCounter(pending, AI, "p1", terms({ yourLots: { "#6 Oriental Avenue": "hand over", "#16 St. James Place": "keep" }, theirLots: { "#8 Vermont Avenue": "take" } }));
    expect(read).toEqual({ ok: true, terms: { propertyTo: { 6: "p1", 8: AI }, gojfTo: {}, cashDelta: {} } });
  });

  it("fails a counter that gives a lot away and asks nothing back", () => {
    const read = readCounter(pending, AI, "p1", terms({ yourLots: { "#6 Oriental Avenue": "hand over", "#16 St. James Place": "keep" } }));
    expect(read).toEqual({ ok: false, reason: "the counter gives #6 Oriental Avenue away and asks nothing back" });
  });

  it("fails a counter naming a lot that isn't that side's", () => {
    const read = readCounter(pending, AI, "p1", terms({ theirLots: { "#8 Vermont Avenue": "leave", "#16 St. James Place": "take" } }));
    expect(read.ok).toBe(false);
  });

  it("fails a counter whose stated cash doesn't add up", () => {
    const read = readCounter(pending, AI, "p1", terms({ cashYouReceive: 100, yourCashAfter: 1500 }));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("doesn't add up");
  });

  it("asks the model twice for a counter, the follow-up without thinking, and adds up its cost", async () => {
    const metrics = { ms: 30_000, thinkMs: 25_000, answerMs: 5000, promptTokens: 2000, completionTokens: 900, thinkHitBudget: true };
    const counter = terms({ cashYouReceive: 100, yourCashAfter: 1600 });
    const complete = vi
      .fn<ModelAdapter["complete"]>()
      .mockResolvedValueOnce({ ok: true, answer: { ...NOTES, vote: "counter" }, raw: "{}", thoughts: "", metrics })
      .mockResolvedValueOnce({ ok: true, answer: counter, raw: "{}", thoughts: "", metrics: { ...metrics, ms: 3000, thinkMs: null, answerMs: 3000, thinkHitBudget: null } });
    const asked = await askModel({ complete, identify: () => Promise.resolve(null) }, pending, AI, "trade-vote");
    expect(asked).toMatchObject({ ok: true, answer: { ...NOTES, vote: "counter", counter } });
    expect(asked.record).toMatchObject({ ms: 33_000, thinkMs: 25_000, answerMs: 8000, promptTokens: 4000, thinkHitBudget: true });
    expect(complete.mock.calls[1][0]).toMatchObject({ think: false, schemaName: "trade-vote-counter" });
  });

  it("fails a counter with no terms", () => {
    expect(decide(pending, { ...NOTES, vote: "counter" }).kind).toBe("fail");
  });
});

describe("llm-v7 trades: what keeping a lot would raise", () => {
  const offer = withTurn(holdings, {
    playerId: "p1",
    phase: "trade-pending",
    pendingTrade: {
      id: "trade-1-0-test",
      proposerId: "p1",
      propertyTo: { 16: "p1" },
      gojfTo: {},
      cashDelta: { p1: -50, [AI]: 50 },
      approvals: { p1: true, [AI]: false },
    },
  });

  it("shows beside a lot the seat would give away what mortgaging it instead would raise", () => {
    const question = DECISION_SPECS["trade-vote"]?.question(offer, AI) ?? "";
    expect(question).toContain("#16 St. James Place (you could mortgage it instead for $90 and keep it): you -> Kyle");
    expect(question).toContain("Mortgaging raises: #6 Oriental Avenue $50; #16 St. James Place $90.");
  });
});

describe("llm-v7 auctions", () => {
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

describe("llm-v7 buys", () => {
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

describe("llm-v7 turn start", () => {
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
      buildHouses: [],
      sellHouses: [],
      mortgage: [],
      unmortgage: [],
      proposeTrade: false,
      trade: {
        dealInWords: "no trade",
        counterparty: "p1",
        youGive: { properties: [], jailCards: [] },
        youGet: { properties: [], jailCards: [] },
        cashYouPay: 0,
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

describe("llm-v7 prompt and call", () => {
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
    expect(asked.record).toMatchObject({ version: "llm-v7", model: null });
    expect(complete.mock.calls[0][0].sampling).toEqual({ temperature: 0.3 });
  });
});

describe("llm-v7 debt plans: houses to sell per set, levels worked out in code", () => {
  // The AI owes $150, with three oranges at 3 houses each, Reading Railroad and Water Works.
  const indebted = inDebt(built(owning(table("ai:local@llm-v7"), { p2: [5, 16, 18, 19, 28] }), { 16: 3, 18: 3, 19: 3 }), -150);

  it("sells houses evenly off the most-built lots", () => {
    expect(sellEvenly(indebted, [16, 18, 19], 4)).toEqual({ 16: 1, 18: 2, 19: 2 });
    expect(sellEvenly(indebted, [16, 18, 19], 0)).toEqual({});
  });

  it("lists each option with the cash it raises", () => {
    const question = DECISION_SPECS["settle-debt"]?.question(indebted, "p2") ?? "";
    expect(question).toContain("#5 Reading Railroad: +$100");
    expect(question).toContain("+$50 per house sold, up to 9 houses for +$450");
  });

  it("states what each option loses beside its cash", () => {
    const question = DECISION_SPECS["settle-debt"]?.question(indebted, "p2") ?? "";
    expect(question).toContain("lifting the mortgage later costs $110, so mortgaging loses you $10 in all");
    expect(question).toContain("Each house cost $100, so each one sold loses $50 for good");
    expect(question).toContain("Mortgaging all of them raises $175, enough on its own.");
  });

  it("says how far all the mortgages fall short when they can't cover the debt alone", () => {
    const deeper = inDebt(indebted, -275);
    const question = DECISION_SPECS["settle-debt"]?.question(deeper, "p2") ?? "";
    expect(question).toContain("Mortgaging all of them raises $175, $100 short of the debt; house sales can make up the rest.");
  });

  it("carries out a plan that mortgages and keeps the houses", () => {
    const claim = claimAi(indebted, "p2");
    if (!claim) throw new Error("expected a debt decision");
    const settled = settleAnswer(claim.state, claim.state, "p2", claim.decision, { ...NOTES, mortgage: [5, 28], sellHouses: { orange: 0 } }, record("settle-debt"));
    expect(settled.kind).toBe("commit");
    expect(settled.state.houses).toMatchObject({ 16: 3, 18: 3, 19: 3 });
    expect(settled.state.mortgaged[5]).toBe(true);
  });

  it("turns houses to sell into the set's levels", () => {
    const claim = claimAi(indebted, "p2");
    if (!claim) throw new Error("expected a debt decision");
    const settled = settleAnswer(
      claim.state,
      claim.state,
      "p2",
      claim.decision,
      { ...NOTES, mortgage: [], sellHouses: { orange: 3 } },
      record("settle-debt"),
    );
    expect(settled.kind).toBe("commit");
    expect(settled.state.houses).toMatchObject({ 16: 2, 18: 2, 19: 2 });
  });

  it("fails selling more houses than a set has", () => {
    const resolved = DECISION_SPECS["settle-debt"]?.resolve(indebted, "p2", {
      ...NOTES,
      mortgage: [],
      sellHouses: { orange: 10 },
    });
    expect(resolved?.ok).toBe(false);
  });

  it("fails a house count for a set the seat hasn't built on", () => {
    const resolved = DECISION_SPECS["settle-debt"]?.resolve(indebted, "p2", { ...NOTES, mortgage: [], sellHouses: { red: 1 } });
    expect(resolved?.ok).toBe(false);
  });

  it("asks for the mortgages, then what they leave owed, then the sales, and the notes last", () => {
    const schema = DECISION_SPECS["settle-debt"]?.schema(indebted, "p2");
    expect(Object.keys((schema?.properties ?? {}) as object)).toEqual(["mortgage", "stillOwed", "sellHouses", "privateNote", "publicNote", "plan"]);
    expect(schema?.required).toEqual(["mortgage", "stillOwed", "sellHouses", "privateNote", "publicNote", "plan"]);
    expect(DECISION_SPECS["settle-debt"]?.question(indebted, "p2")).toContain(`then "stillOwed", what remains of the debt after those mortgages`);
  });

  it("asks for a count for every built set", () => {
    const schema = DECISION_SPECS["settle-debt"]?.schema(indebted, "p2");
    expect(schema?.properties).toMatchObject({
      sellHouses: { type: "object", required: ["orange"], properties: { orange: { minimum: 0, maximum: 9 } } },
    });
  });
});

describe("llm-v7 turn-start building: houses per set, levels worked out in code", () => {
  // The AI holds the reds, mortgaged, with $1,500.
  const reds = mortgaging(owning(table("ai:local@llm-v7"), { p2: [21, 23, 24] }), [21, 23, 24]);

  it("adds houses evenly onto the least-built lots, up to a hotel", () => {
    expect(buildEvenly(reds, [21, 23, 24], 4)).toEqual({ 21: 2, 23: 1, 24: 1 });
    const nearlyFull = built(reds, { 21: 5, 23: 4, 24: 4 });
    expect(buildEvenly(nearlyFull, [21, 23, 24], 2)).toEqual({ 23: 5, 24: 5 });
  });

  it("states each set's cost per house and the seat's cash", () => {
    const question = DECISION_SPECS["turn-start"]?.question(reds, "p2") ?? "";
    expect(question).toContain("$150 per house, so building K houses costs $150 x K");
    expect(question).toContain("You have $1,500.");
  });

  it("fails building more houses than a set has room for", () => {
    const resolved = DECISION_SPECS["turn-start"]?.resolve(reds, "p2", {
      ...NOTES,
      buildHouses: { red: 16 },
      sellHouses: { red: 0 },
      mortgage: [],
      unmortgage: [],
      proposeTrade: false,
      trade: {},
    });
    expect(resolved?.ok).toBe(false);
  });
});

describe("llm-v7 view: each player's position in one line", () => {
  it("states every player's full sets and what they can build on", () => {
    const state = built(
      mortgaging(owning(table("ai:local@llm-v7"), { p2: [16, 18, 19], p3: [1, 3, 37, 39] }), [37]),
      { 16: 3, 18: 3, 19: 2 },
    );
    const { user } = buildPrompt(state, AI, "Q");
    expect(user).toContain("- Alex (you), $1,500, on #0 GO; full set: Orange (houses 3/3/2); can build on Orange");
    expect(user).toContain("- Sam, $1,500, on #0 GO; full sets: Brown (unbuilt), Dark blue (unbuilt, a lot mortgaged); can build on Brown");
    expect(user).toContain("- Kyle, $1,500, on #0 GO; no full set");
  });

  it("says what a player controls, and asks for a plan made of choices", () => {
    const { system } = buildPrompt(base, AI, "Q");
    expect(system).toContain("Where you land is the dice. No player chooses, avoids or steers toward a square");
    expect(system).toContain(`"plan": one short sentence to your future self about the next few turns, made of your choices`);
  });
});

describe("llm-v7 trade votes: the proposer's message and what a set costs", () => {
  // Sam (p3) holds Kentucky and Indiana and offers $300 for the seat's
  // Illinois, with a message logged just before the proposal.
  const offer = (note: string | null): GameState => {
    const board = owning(table("ai:local@llm-v7"), { p3: [21, 23], [AI]: [24] });
    const events: GameEvent[] = note === null ? [] : [{ kind: "bot-note", playerId: "p3", text: note, privateText: "secret", plan: "hidden" }];
    const turns = [{ turn: 1, playerId: "p3", events }];
    return withTurn(
      { ...board, turns },
      {
        playerId: "p3",
        phase: "trade-pending",
        pendingTrade: {
          id: `trade-1-${String(events.length)}-test`,
          proposerId: "p3",
          propertyTo: { 24: "p3" },
          gojfTo: {},
          cashDelta: { p3: -300, [AI]: 300 },
          approvals: { p3: true, [AI]: false },
        },
      },
    );
  };
  const question = (state: GameState): string => DECISION_SPECS["trade-vote"]?.question(state, AI) ?? "";

  it("shows the proposer's public note beside the terms, never its private reasoning or plan", () => {
    const text = question(offer("Alex, $300 for Illinois is a fair price."));
    expect(text).toContain(`Sam's message with this offer: "Alex, $300 for Illinois is a fair price."`);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("hidden");
    expect(question(offer(null))).toContain("Sam sent no message with this offer.");
  });

  it("states what the rival's cash after the trade builds on the set it completes, and the largest rent", () => {
    const text = question(offer(null));
    expect(text).toContain("Sam would have $1,200 after this trade: enough for 8 houses on Red at $150 each.");
    expect(text).toContain("The largest rent you could land on now is $18, on #21 Kentucky Avenue (Sam's).");
  });

  it("states what building costs when the seat completes a set", () => {
    const state = offer(null);
    const reversed = withTurn(owning(state, { [AI]: [21, 23], p3: [24] }), {
      pendingTrade: { ...state.turn.pendingTrade!, propertyTo: { 24: AI }, cashDelta: { p3: 300, [AI]: -300 } },
    });
    expect(question(reversed)).toContain("Building on Red costs $150 a house: three houses on each lot is $1,350, and you would start with $1,200.");
  });
});
