import { describe, expect, it, vi } from "vitest";
import { freshGame } from "../../mocks";
import { driveOp, type BotResolver } from "../../pacing";
import type { AuctionState, GameEvent, GameState, Player, TurnState } from "../../types";
import { apply } from "../../engine";
import type { AiDecisionRecord } from "../../types";
import { aiConsoleLines } from "./console";
import { askModel, claimAi, settleAnswer, type Settled } from "./decide";
import { aiDecisionFor, auctionProxyIntent } from "./decisions";
import type { CallMetrics, ModelAdapter, ModelResult } from "./model/adapter";
import { aiSeat, withAiSeat } from "./seat";
import { DECISION_SPECS } from "./versions/llm-v1/answers";
import { buildPrompt } from "./versions/llm-v1/prompt";
import { negotiationLines } from "./versions/llm-v1/trade-terms";
import { turnStartFingerprint, turnStartOwed } from "./versions/llm-v1/turn-start";

// The shared AI machinery (claim, ask, settle, pacer, console), exercised
// through llm-v1, whose own behavior these tests also pin: a registered version
// never changes. p1 is the human, p2 the AI seat, p3/p4 rule-based bots (the
// dumb baseline, so these tests exercise the AI wiring, not a strategy).
const AI = "p2";
const base: GameState = (() => {
  const game = freshGame("ai-test");
  return {
    ...game,
    players: game.players.map((p) =>
      p.id === AI ? { ...p, botStrategy: "ai:local@llm-v1" } : p.botStrategy !== null ? { ...p, botStrategy: "dumb" } : p,
    ),
  };
})();

function withTurn(state: GameState, patch: Partial<TurnState>): GameState {
  return { ...state, turn: { ...state.turn, ...patch } };
}

function withPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

const NOTES = { privateNote: "private thoughts", publicNote: "Public words.", plan: "Collect the dark blues." };

// The AI seat landed on Boardwalk ($400) with $1,500.
const atBoardwalk = withTurn(withPlayer(base, AI, { position: 39 }), {
  playerId: AI,
  phase: "buy-decision",
  pendingBuy: 39,
});

function auctionState(patch: Partial<AuctionState> = {}): GameState {
  const auction: AuctionState = {
    position: 39,
    active: ["p1", "p2", "p3", "p4"],
    highBid: 0,
    leaderId: null,
    bids: {},
    resume: { kind: "landing" },
    ...patch,
  };
  return withTurn(base, { playerId: "p1", phase: "auction", auction });
}

const METRICS: CallMetrics = {
  ms: 4100,
  thinkMs: null,
  answerMs: 4100,
  promptTokens: 2000,
  completionTokens: 90,
  thinkHitBudget: null,
};

function recordFor(decision: AiDecisionRecord["decision"]): AiDecisionRecord {
  return { decision, version: "llm-v1", model: "test-model.gguf", ...METRICS };
}

/** Claim the seat's decision and settle an answer against the same state. */
function decide(state: GameState, answer: Record<string, unknown>): Settled {
  const claim = claimAi(state, AI);
  if (!claim) throw new Error("expected a decision to claim");
  return settleAnswer(claim.state, claim.state, AI, claim.decision, answer, recordFor(claim.decision));
}

function events(state: GameState): GameEvent[] {
  return state.turns.flatMap((t) => t.events);
}

function fakeModel(result: ModelResult): ModelAdapter & { complete: ReturnType<typeof vi.fn> } {
  return { complete: vi.fn(() => Promise.resolve(result)), identify: () => Promise.resolve("test-model.gguf") };
}

describe("aiDecisionFor", () => {
  it("asks the AI seat for its own buy, and never a human or rule-based seat", () => {
    expect(aiDecisionFor(atBoardwalk, AI)).toBe("buy");
    const humanBuy = withTurn(atBoardwalk, { playerId: "p1" });
    expect(aiDecisionFor(humanBuy, "p1")).toBeNull();
    expect(aiDecisionFor(withTurn(atBoardwalk, { playerId: "p3" }), "p3")).toBeNull();
  });

  it("asks the AI seat its turn-start question at its own pre-roll", () => {
    expect(aiDecisionFor(withTurn(base, { playerId: AI }), AI)).toBe("turn-start");
    expect(aiDecisionFor(base, AI)).toBeNull();
  });

  it("asks a jailed AI seat to choose, unless a boundary is waiting to open first", () => {
    const jailed = withTurn(withPlayer(base, AI, { inJail: true, jailTurns: 1, position: 10 }), {
      playerId: AI,
      phase: "jail-decision",
    });
    expect(aiDecisionFor(jailed, AI)).toBe("turn-start");
    const answered = withAiSeat(jailed, AI, {
      turnStart: { turn: jailed.turns.length, fingerprint: "" },
    });
    expect(aiDecisionFor(answered, AI)).toBe("jail");
    const armed: GameState = { ...jailed, boundaryQueue: [{ playerId: "p1", kind: "trade" }] };
    expect(aiDecisionFor(armed, AI)).toBeNull();
  });

  it("asks for an auction maximum once, then owes nothing more", () => {
    const auction = auctionState();
    expect(aiDecisionFor(auction, AI)).toBe("auction");
    const answered = withAiSeat(auction, AI, {
      auctionMax: { position: 39, turn: auction.turns.length, max: 300 },
    });
    expect(aiDecisionFor(answered, AI)).toBeNull();
  });

  it("names the decisions it can't make yet, so reaching one fails loudly", () => {
    const managing = withTurn(base, { phase: "managing", managerId: AI });
    expect(aiDecisionFor(managing, AI)).toBe("manage");
  });
});

describe("auctionProxyIntent", () => {
  const withMax = (state: GameState, max: number): GameState =>
    withAiSeat(state, AI, { auctionMax: { position: 39, turn: state.turns.length, max } });

  it("bids one increment over the high bid while under its maximum", () => {
    const state = withMax(auctionState({ highBid: 100, leaderId: "p1", bids: { p1: 100 } }), 300);
    expect(auctionProxyIntent(state, AI)).toEqual({ kind: "bid", playerId: AI, amount: 110 });
  });

  it("bids its maximum exactly when one increment would pass it", () => {
    const state = withMax(auctionState({ highBid: 295, leaderId: "p1", bids: { p1: 295 } }), 300);
    expect(auctionProxyIntent(state, AI)).toEqual({ kind: "bid", playerId: AI, amount: 300 });
  });

  it("drops out once outbid past its maximum", () => {
    const state = withMax(auctionState({ highBid: 300, leaderId: "p1", bids: { p1: 300 } }), 300);
    expect(auctionProxyIntent(state, AI)).toEqual({ kind: "pass-bid", playerId: AI });
  });

  it("does nothing while leading, or for an auction it wasn't asked about", () => {
    const leading = withMax(auctionState({ highBid: 110, leaderId: AI, bids: { p2: 110 } }), 300);
    expect(auctionProxyIntent(leading, AI)).toBeNull();
    const stale = withAiSeat(auctionState(), AI, { auctionMax: { position: 1, turn: 1, max: 300 } });
    expect(auctionProxyIntent(stale, AI)).toBeNull();
  });
});

describe("settling an answer", () => {
  it("commits a buy with its public note, private note and plan in one write", () => {
    const settled = decide(atBoardwalk, { ...NOTES, choice: "buy", mortgage: [] });
    expect(settled.kind).toBe("commit");
    const state = settled.state;
    expect(state.ownership[39]).toBe(AI);
    expect(aiSeat(state, AI)).toMatchObject({ thinking: null, failure: null, plan: NOTES.plan });
    expect(events(state)).toContainEqual({
      kind: "bot-note",
      playerId: AI,
      text: NOTES.publicNote,
      privateText: NOTES.privateNote,
      plan: NOTES.plan,
      ai: recordFor("buy"),
    });
  });

  it("sends a declined lot to auction", () => {
    const settled = decide(atBoardwalk, { ...NOTES, choice: "auction", mortgage: [] });
    expect(settled.kind).toBe("commit");
    expect(settled.state.turn.phase).toBe("auction");
  });

  it("mortgages the named lots to buy when short", () => {
    const short = {
      ...withPlayer(atBoardwalk, AI, { cash: 350 }),
      ownership: { 37: AI },
    };
    const settled = decide(short, { ...NOTES, choice: "buy", mortgage: [37] });
    expect(settled.kind).toBe("commit");
    expect(settled.state.ownership[39]).toBe(AI);
    expect(settled.state.mortgaged[37]).toBe(true);
  });

  it("fails loudly, and stalls the seat, when a short buyer names nothing to mortgage", () => {
    const short = withPlayer(atBoardwalk, AI, { cash: 350 });
    const settled = decide(short, { ...NOTES, choice: "buy", mortgage: [] });
    expect(settled.kind).toBe("fail");
    expect(settled.state.ownership[39]).toBeUndefined();
    expect(aiSeat(settled.state, AI).failure?.decision).toBe("buy");
    expect(aiSeat(settled.state, AI).thinking).toBeNull();
    expect(events(settled.state).at(-1)).toMatchObject({ kind: "ai-failed", playerId: AI, decision: "buy" });
    expect(claimAi(settled.state, AI)).toBeNull();
  });

  it("fails an answer missing its notes", () => {
    expect(decide(atBoardwalk, { choice: "buy", mortgage: [] }).kind).toBe("fail");
  });

  it("records an auction maximum, and the pacer then bids for it without asking again", () => {
    const settled = decide(auctionState(), { ...NOTES, maxBid: 250 });
    expect(settled.kind).toBe("commit");
    expect(aiSeat(settled.state, AI).auctionMax?.max).toBe(250);
    expect(driveOp(settled.state, true, "p1")).toEqual({
      kind: "intent",
      intent: { kind: "bid", playerId: AI, amount: 10 },
    });
  });

  it("rolls for a jailed seat that chose to roll", () => {
    const jailed = withAiSeat(
      withTurn(withPlayer(base, AI, { inJail: true, jailTurns: 1, position: 10 }), {
        playerId: AI,
        phase: "jail-decision",
      }),
      AI,
      { turnStart: { turn: base.turns.length, fingerprint: "" } },
    );
    const settled = decide(jailed, { ...NOTES, choice: "roll" });
    expect(settled.kind).toBe("commit");
    expect(events(settled.state).some((e) => e.kind === "jail-roll")).toBe(true);
  });

  it("votes on a trade", () => {
    const trade: GameState = withTurn(
      { ...base, ownership: { 1: "p1" } },
      {
        playerId: "p1",
        phase: "trade-pending",
        pendingTrade: {
          id: "t1",
          proposerId: "p1",
          propertyTo: { 1: AI },
          gojfTo: {},
          cashDelta: { p1: 100, [AI]: -100 },
          approvals: { p1: true, [AI]: false },
        },
      },
    );
    expect(aiDecisionFor(trade, AI)).toBe("trade-vote");
    const accepted = decide(trade, { ...NOTES, vote: "accept" });
    expect(accepted.kind).toBe("commit");
    expect(accepted.state.ownership[1]).toBe(AI);
    const declined = decide(trade, { ...NOTES, vote: "decline" });
    expect(declined.state.ownership[1]).toBe("p1");
  });

  describe("settling a debt", () => {
    const debtor: GameState = withTurn(
      { ...withPlayer(base, AI, { cash: -100 }), ownership: { 1: AI, 39: AI } },
      { playerId: AI, phase: "must-raise-cash", raiseCash: "after-landing" },
    );

    it("commits a plan that clears the debt", () => {
      const settled = decide(debtor, { ...NOTES, mortgage: [39], sellBuildings: [] });
      expect(settled.kind).toBe("commit");
      expect(settled.state.players.find((p) => p.id === AI)?.cash).toBe(100);
    });

    it("fails a legal plan that leaves the seat in debt", () => {
      const settled = decide(debtor, { ...NOTES, mortgage: [1], sellBuildings: [] });
      expect(settled.kind).toBe("fail");
      if (settled.kind === "fail") expect(settled.reason).toMatch(/still/);
    });
  });

  it("calls an answer stale, not failed, when the game moved on under it", () => {
    const auction = auctionState();
    const claim = claimAi(auction, AI);
    if (!claim) throw new Error("expected a claim");
    // Meanwhile every other bidder dropped and p1 won the lot.
    const moved = withTurn(claim.state, { phase: "post-roll", auction: undefined });
    const settled = settleAnswer(claim.state, moved, AI, claim.decision, { ...NOTES, maxBid: 200 }, recordFor("auction"));
    expect(settled.kind).toBe("stale");
    expect(aiSeat(settled.state, AI)).toMatchObject({ thinking: null, failure: null });
  });
});

describe("claimAi", () => {
  it("marks the seat as thinking, and won't claim it twice", () => {
    const claim = claimAi(atBoardwalk, AI);
    expect(claim?.decision).toBe("buy");
    if (!claim) return;
    expect(aiSeat(claim.state, AI).thinking).toBe("buy");
    expect(claimAi(claim.state, AI)).toBeNull();
  });

  it("claims nothing when the seat owes nothing", () => {
    expect(claimAi(base, AI)).toBeNull();
  });
});

describe("askModel", () => {
  it("sends the decision's prompt and schema, and reads the answer", async () => {
    const model = fakeModel({ ok: true, answer: { ...NOTES, choice: "buy", mortgage: [] }, thoughts: "", metrics: METRICS });
    const asked = await askModel(model, atBoardwalk, AI, "buy");
    expect(asked).toEqual({ ok: true, answer: { ...NOTES, choice: "buy", mortgage: [] }, record: recordFor("buy") });
    const request = model.complete.mock.calls[0][0] as { user: string; schemaName: string; thinkTokens: number; sampling: unknown };
    expect(request.schemaName).toBe("buy");
    expect(request.user).toContain("#39 Boardwalk");
    // llm-v1 leaves sampling to the server and thinks on 1,200 tokens.
    expect(request.sampling).toBeNull();
    expect(request.thinkTokens).toBe(1200);
  });

  it("reports a network failure as the reason", async () => {
    const model = fakeModel({ ok: false, kind: "unreachable", message: "connection refused", metrics: { ...METRICS, ms: 30 } });
    expect(await askModel(model, atBoardwalk, AI, "buy")).toEqual({
      ok: false,
      reason: "unreachable: connection refused",
      record: { ...recordFor("buy"), ms: 30 },
    });
  });

  it("refuses a decision the seat can't make yet without calling the model", async () => {
    const model = fakeModel({ ok: true, answer: {}, thoughts: "", metrics: METRICS });
    const asked = await askModel(model, base, AI, "manage");
    expect(asked.ok).toBe(false);
    expect(model.complete).not.toHaveBeenCalled();
  });
});

describe("buildPrompt", () => {
  it("is a pure function of the state, the seat and the question", () => {
    const planned = withAiSeat(atBoardwalk, AI, { plan: "Buy every railroad." });
    const a = buildPrompt(planned, AI, "Buy it?");
    const b = buildPrompt(structuredClone(planned), AI, "Buy it?");
    expect(a).toEqual(b);
    expect(a.user).toContain("Your plan from last time: Buy every railroad.");
    expect(a.user).toContain("Alex (you)");
  });

  it("keeps the rules in a system message that never changes", () => {
    expect(buildPrompt(atBoardwalk, AI, "x").system).toBe(buildPrompt(base, "p3", "y").system);
  });
});

describe("driveOp for AI seats", () => {
  it("asks the route when the AI seat owes a decision", () => {
    expect(driveOp(atBoardwalk, true, "p1")).toEqual({ kind: "ai", seat: AI });
  });

  it("drives nothing while any model call is in flight", () => {
    const thinking = withAiSeat(withTurn(base, { playerId: "p3" }), AI, { thinking: "trade-vote" });
    expect(driveOp(thinking, true, "p1")).toBeNull();
  });

  it("never drives a failed seat again", () => {
    const failed = withAiSeat(atBoardwalk, AI, { failure: { decision: "buy", reason: "x" } });
    expect(driveOp(failed, true, "p1")).toBeNull();
  });

  it("never consults a synchronous policy for an AI seat when arming at pre-roll", () => {
    const resolver = vi.fn<BotResolver>(() => null);
    expect(driveOp(base, true, "p1", resolver)).toEqual({ kind: "step" });
    expect(resolver.mock.calls.map(([, id]) => id)).not.toContain(AI);
  });
});

describe("aiConsoleLines", () => {
  it("logs new private notes and failures, and nothing already seen", () => {
    const settled = decide(atBoardwalk, { ...NOTES, choice: "buy", mortgage: [] });
    expect(aiConsoleLines(atBoardwalk, settled.state)).toEqual([
      { level: "info", text: `[AI] Alex: ${NOTES.privateNote} Plan: ${NOTES.plan} (llm-v1, 4.1s)` },
    ]);
    expect(aiConsoleLines(settled.state, settled.state)).toEqual([]);
  });
});

describe("the turn-start window", () => {
  // The AI seat's own pre-roll, owning the browns outright and Baltic's
  // neighbour Oriental (6); p1 owns Vermont (8).
  const start: GameState = withTurn({ ...base, ownership: { 1: AI, 3: AI, 6: AI, 8: "p1" } }, { playerId: AI });
  const NOTHING = { ...NOTES, build: [], mortgage: [], unmortgage: [], proposeTrade: false, trade: { properties: [], jailCards: [], cash: [] } };

  it("records the answer and leaves the roll to the pacer when the seat does nothing", () => {
    const settled = decide(start, NOTHING);
    expect(settled.kind).toBe("commit");
    expect(settled.state.turn.phase).toBe("pre-roll");
    expect(aiSeat(settled.state, AI).turnStart?.turn).toBe(start.turns.length);
    expect(driveOp(settled.state, true, "p1")).toEqual({ kind: "step" });
  });

  it("builds through the manage window in the same write", () => {
    const settled = decide(start, {
      ...NOTHING,
      build: [
        { position: 1, level: 1 },
        { position: 3, level: 1 },
      ],
    });
    expect(settled.kind).toBe("commit");
    expect(settled.state.houses).toMatchObject({ 1: 1, 3: 1 });
    expect(settled.state.turn.phase).toBe("pre-roll");
    expect(settled.state.turn.boundaryServed).toContainEqual({ playerId: AI, kind: "manage" });
  });

  it("proposes a trade through the trade window, and the other side then votes", () => {
    const settled = decide(start, {
      ...NOTHING,
      proposeTrade: true,
      trade: {
        properties: [{ position: 8, to: AI }],
        jailCards: [],
        cash: [
          { player: AI, delta: -150 },
          { player: "p1", delta: 150 },
        ],
      },
    });
    expect(settled.kind).toBe("commit");
    expect(settled.state.turn.phase).toBe("trade-pending");
    expect(settled.state.turn.pendingTrade).toMatchObject({ proposerId: AI, propertyTo: { 8: AI } });
  });

  it("fails a trade that doesn't balance", () => {
    const settled = decide(start, {
      ...NOTHING,
      proposeTrade: true,
      trade: { properties: [{ position: 8, to: AI }], jailCards: [], cash: [{ player: AI, delta: -150 }] },
    });
    expect(settled.kind).toBe("fail");
  });

  describe("skipping the call", () => {
    // Asked last turn, on this very board, owning no set it could build on.
    const plain: GameState = withTurn({ ...base, ownership: { 6: AI, 8: "p1" } }, { playerId: AI });
    const askedBefore = (state: GameState): GameState =>
      withAiSeat(state, AI, {
        turnStart: { turn: state.turns.length - 1, fingerprint: turnStartFingerprint(state, AI) },
      });

    it("skips when nothing relevant changed and the seat can't build or unmortgage", () => {
      const state = askedBefore(plain);
      expect(turnStartOwed(state, AI)).toBe(false);
      expect(driveOp(state, true, "p1")).toEqual({ kind: "step" });
    });

    it("asks again once ownership changes", () => {
      const state = { ...askedBefore(plain), ownership: { 6: AI, 8: AI } };
      expect(turnStartOwed(state, AI)).toBe(true);
    });

    it("asks again when the seat's cash crosses into another band, but not over pocket change", () => {
      const state = askedBefore(plain);
      expect(turnStartOwed(withPlayer(state, AI, { cash: 1560 }), AI)).toBe(false);
      expect(turnStartOwed(withPlayer(state, AI, { cash: 1000 }), AI)).toBe(true);
    });

    it("asks every turn while the seat could build", () => {
      expect(turnStartOwed(askedBefore(start), AI)).toBe(true);
    });

    it("asks at most once per turn-group", () => {
      const state = withAiSeat(start, AI, { turnStart: { turn: start.turns.length, fingerprint: "" } });
      expect(turnStartOwed(state, AI)).toBe(false);
    });
  });
});

describe("counters and the negotiation", () => {
  // p1 offers $100 for the AI seat's Oriental Avenue.
  const offered: GameState = withTurn(
    { ...base, ownership: { 6: AI, 8: "p1" } },
    {
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
    },
  );
  const COUNTER = {
    ...NOTES,
    publicNote: "Oriental is worth more than that: $180.",
    vote: "counter",
    counter: {
      properties: [{ position: 6, to: "p1" }],
      jailCards: [],
      cash: [
        { player: "p1", delta: -180 },
        { player: AI, delta: 180 },
      ],
    },
  };

  it("counters in one write: the old offer dies and the AI's terms go to a vote", () => {
    const settled = decide(offered, COUNTER);
    expect(settled.kind).toBe("commit");
    const state = settled.state;
    expect(state.turn.phase).toBe("trade-pending");
    expect(state.turn.pendingTrade).toMatchObject({
      proposerId: AI,
      cashDelta: { p1: -180, [AI]: 180 },
    });
    expect(events(state)).toContainEqual(
      expect.objectContaining({ kind: "trade-declined", declinedBy: AI, countered: true }),
    );
  });

  it("shows the back-and-forth, with what each side said, when the AI votes again", () => {
    const countered = decide(offered, COUNTER).state;
    // p1 counters back at $140, and the AI is asked again.
    const back = apply(countered, { kind: "counter-trade", playerId: "p1", tradeId: countered.turn.pendingTrade?.id ?? "" });
    if (!back.ok) throw new Error(back.reason);
    const drafted = apply(back.state, {
      kind: "update-trade-draft",
      playerId: "p1",
      terms: { propertyTo: { 6: "p1" }, gojfTo: {}, cashDelta: { p1: -140, [AI]: 140 } },
    });
    if (!drafted.ok) throw new Error(drafted.reason);
    const proposed = apply(drafted.state, { kind: "propose-trade", playerId: "p1" });
    if (!proposed.ok) throw new Error(proposed.reason);

    expect(aiDecisionFor(proposed.state, AI)).toBe("trade-vote");
    const history = negotiationLines(proposed.state).join("\n");
    expect(history).toContain("countered by Alex");
    expect(history).toContain("countered by Kyle");
    expect(history).toContain("Oriental is worth more than that: $180.");

    const question = DECISION_SPECS["trade-vote"]?.question(proposed.state, AI) ?? "";
    expect(question).toContain("Negotiation so far");
    expect(question).toContain("you receives $140");
    expect(question).toContain("After this trade Kyle would own 2 of 3 Light blue.");
  });

  it("still accepts and declines", () => {
    expect(decide(offered, { ...COUNTER, vote: "accept" }).state.ownership[6]).toBe("p1");
    expect(decide(offered, { ...COUNTER, vote: "decline" }).state.turn.phase).not.toBe("trade-pending");
  });
});
