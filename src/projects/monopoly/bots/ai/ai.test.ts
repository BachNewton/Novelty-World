import { describe, expect, it, vi } from "vitest";
import { freshGame } from "../../mocks";
import { driveOp, type BotResolver } from "../../pacing";
import type { AuctionState, GameEvent, GameState, Player, TurnState } from "../../types";
import { aiConsoleLines } from "./console";
import { askModel, claimAi, settleAnswer, type Settled } from "./decide";
import { aiDecisionFor, auctionProxyIntent } from "./decisions";
import type { ModelAdapter, ModelResult } from "./model/adapter";
import { buildPrompt } from "./prompt";
import { aiSeat, withAiSeat } from "./seat";

// p1 is the human, p2 the AI seat, p3/p4 rule-based bots (the dumb baseline, so
// these tests exercise the AI wiring, not a strategy).
const AI = "p2";
const base: GameState = (() => {
  const game = freshGame("ai-test");
  return {
    ...game,
    players: game.players.map((p) =>
      p.id === AI ? { ...p, botStrategy: "ai:local" } : p.botStrategy !== null ? { ...p, botStrategy: "dumb" } : p,
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

/** Claim the seat's decision and settle an answer against the same state. */
function decide(state: GameState, answer: Record<string, unknown>): Settled {
  const claim = claimAi(state, AI);
  if (!claim) throw new Error("expected a decision to claim");
  return settleAnswer(claim.state, claim.state, AI, claim.decision, answer);
}

function events(state: GameState): GameEvent[] {
  return state.turns.flatMap((t) => t.events);
}

function fakeModel(result: ModelResult): ModelAdapter & { complete: ReturnType<typeof vi.fn> } {
  return { complete: vi.fn(() => Promise.resolve(result)) };
}

describe("aiDecisionFor", () => {
  it("asks the AI seat for its own buy, and never a human or rule-based seat", () => {
    expect(aiDecisionFor(atBoardwalk, AI)).toBe("buy");
    const humanBuy = withTurn(atBoardwalk, { playerId: "p1" });
    expect(aiDecisionFor(humanBuy, "p1")).toBeNull();
    expect(aiDecisionFor(withTurn(atBoardwalk, { playerId: "p3" }), "p3")).toBeNull();
  });

  it("asks nothing at pre-roll: the turn-start window isn't offered yet", () => {
    expect(aiDecisionFor(withTurn(base, { playerId: AI }), AI)).toBeNull();
  });

  it("asks a jailed AI seat to choose, unless a boundary is waiting to open first", () => {
    const jailed = withTurn(withPlayer(base, AI, { inJail: true, jailTurns: 1, position: 10 }), {
      playerId: AI,
      phase: "jail-decision",
    });
    expect(aiDecisionFor(jailed, AI)).toBe("jail");
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
    const jailed = withTurn(withPlayer(base, AI, { inJail: true, jailTurns: 1, position: 10 }), {
      playerId: AI,
      phase: "jail-decision",
    });
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
    const settled = settleAnswer(claim.state, moved, AI, claim.decision, { ...NOTES, maxBid: 200 });
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
    const model = fakeModel({ ok: true, answer: { ...NOTES, choice: "buy", mortgage: [] }, thoughts: "", ms: 5 });
    const asked = await askModel(model, atBoardwalk, AI, "buy");
    expect(asked).toEqual({ ok: true, answer: { ...NOTES, choice: "buy", mortgage: [] } });
    const request = model.complete.mock.calls[0][0] as { user: string; schemaName: string; think: boolean };
    expect(request.schemaName).toBe("buy");
    expect(request.user).toContain("#39 Boardwalk");
  });

  it("reports a network failure as the reason", async () => {
    const model = fakeModel({ ok: false, kind: "unreachable", message: "connection refused" });
    expect(await askModel(model, atBoardwalk, AI, "buy")).toEqual({
      ok: false,
      reason: "unreachable: connection refused",
    });
  });

  it("refuses a decision the seat can't make yet without calling the model", async () => {
    const model = fakeModel({ ok: true, answer: {}, thoughts: "", ms: 1 });
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
      { level: "info", text: `[AI] Alex: ${NOTES.privateNote}` },
    ]);
    expect(aiConsoleLines(settled.state, settled.state)).toEqual([]);
  });
});
