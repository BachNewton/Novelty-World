import { describe, expect, it } from "vitest";
import { apply, autoStep } from "../../engine";
import { freshGame } from "../../mocks";
import { driveOp } from "../../pacing";
import type { AiDecisionRecord, GameState } from "../../types";
import { aiCallRow } from "./calls";
import type { AiCallRecord } from "./eval/record";
import {
  aiDecisionAt,
  decisionRefOf,
  holdDuringPause,
  pauseForReview,
  resumeAfterReview,
} from "./review";
import { aiSeat, withAiSeat } from "./seat";

const AI = "p2";
const RECORD: AiDecisionRecord = {
  decision: "buy",
  version: "llm-v1",
  model: "m.gguf",
  ms: 900,
  thinkMs: null,
  answerMs: 900,
  promptTokens: 10,
  completionTokens: 5,
  thinkHitBudget: null,
};
const ANSWER = { privateNote: "Worth it.", choice: "buy", mortgage: [], publicNote: "Mine.", plan: "Dark blues." };

const base: GameState = (() => {
  const game = freshGame("review-test", undefined, 4);
  return {
    ...game,
    players: game.players.map((p) => (p.id === AI ? { ...p, botStrategy: "ai:local@llm-v1", position: 39 } : p)),
  };
})();
const HUMAN = base.players.find((p) => p.botStrategy === null)?.id ?? "p1";

// The AI seat has spoken once: its note is event 0 of turn group 1.
const noted: GameState = {
  ...base,
  turns: [
    {
      ...base.turns[0],
      events: [{ kind: "bot-note", playerId: AI, text: "Mine.", privateText: "Worth it.", plan: "Dark blues.", ai: RECORD }],
    },
    ...base.turns.slice(1),
  ],
};
const REF = { turn: base.turns[0].turn, index: 0 };

// The AI seat has landed on Boardwalk and is thinking about buying it.
const thinking: GameState = withAiSeat(
  { ...base, turn: { ...base.turn, playerId: AI, phase: "buy-decision", pendingBuy: 39 } },
  AI,
  { thinking: "buy" },
);

describe("aiDecisionAt / decisionRefOf", () => {
  it("reads an AI seat's note, and finds a decision by its record", () => {
    expect(aiDecisionAt(noted, REF)).toEqual({
      seat: AI,
      publicNote: "Mine.",
      privateNote: "Worth it.",
      plan: "Dark blues.",
      record: RECORD,
      failure: null,
    });
    expect(decisionRefOf(noted, RECORD)).toEqual(REF);
  });

  it("is null for anything that isn't an AI decision", () => {
    expect(aiDecisionAt(noted, { turn: REF.turn, index: 3 })).toBeNull();
    const ruleBot = base.players.find((p) => p.botStrategy !== null && p.id !== AI)?.id ?? "p3";
    const ruleNoted: GameState = {
      ...base,
      turns: [{ ...base.turns[0], events: [{ kind: "bot-note", playerId: ruleBot, text: "Building." }] }],
    };
    expect(aiDecisionAt(ruleNoted, REF)).toBeNull();
  });
});

describe("pauseForReview", () => {
  it("pauses for a seated human reviewing an AI decision", () => {
    const paused = pauseForReview(noted, HUMAN, REF);
    expect(paused).toEqual({ ok: true, state: { ...noted, pause: { by: HUMAN, ref: REF } } });
  });

  it("refuses a bot, a stranger, and a ref with no AI decision", () => {
    expect(pauseForReview(noted, AI, REF)).toMatchObject({ ok: false });
    expect(pauseForReview(noted, "nobody", REF)).toMatchObject({ ok: false });
    expect(pauseForReview(noted, HUMAN, { turn: REF.turn, index: 9 })).toMatchObject({ ok: false });
  });

  it("leaves an existing pause as it is", () => {
    const paused: GameState = { ...noted, pause: { by: "someone", ref: REF } };
    expect(pauseForReview(paused, HUMAN, REF)).toEqual({ ok: true, state: paused });
  });
});

describe("while paused", () => {
  const paused: GameState = { ...noted, pause: { by: HUMAN, ref: REF } };

  it("the engine plays nothing", () => {
    expect(apply(paused, { kind: "set-queue", playerId: HUMAN, queue: "manage", armed: true })).toEqual({
      ok: false,
      reason: "the game is paused",
    });
    expect(autoStep(paused).state).toBe(paused);
  });

  it("the pacer drives nothing, for anyone", () => {
    expect(driveOp(paused, true, HUMAN)).toBeNull();
    expect(driveOp({ ...thinking, ai: {}, pause: paused.pause }, true, HUMAN)).toBeNull();
  });
});

describe("answers that arrive during a pause", () => {
  const pausedThinking: GameState = { ...thinking, pause: { by: HUMAN, ref: REF } };

  it("are held on the seat, then settled when play resumes", () => {
    const hold = holdDuringPause(thinking, pausedThinking, AI, "buy", { ok: true, answer: ANSWER }, RECORD);
    expect(hold.kind).toBe("held");
    expect(hold.state.ownership[39]).toBeUndefined();
    expect(aiSeat(hold.state, AI)).toMatchObject({ thinking: "buy", held: { kind: "answer" } });

    const resumed = resumeAfterReview(hold.state);
    expect(resumed.pause).toBeNull();
    expect(resumed.ownership[39]).toBe(AI);
    expect(aiSeat(resumed, AI)).toMatchObject({ thinking: null, held: null, plan: "Dark blues." });
  });

  it("keep a failure the same way, stalling the seat on resume", () => {
    const hold = holdDuringPause(thinking, pausedThinking, AI, "buy", { ok: false, reason: "timeout" }, RECORD);
    const resumed = resumeAfterReview(hold.state);
    expect(aiSeat(resumed, AI)).toMatchObject({ thinking: null, failure: { decision: "buy", reason: "timeout" } });
    expect(resumed.turns.at(-1)?.events.at(-1)).toMatchObject({ kind: "ai-failed", reason: "timeout" });
  });

  it("are stale when the game had already moved on before the pause", () => {
    // Someone else's turn now: the buy the model answered is no longer owed.
    const moved: GameState = { ...pausedThinking, turn: { ...base.turn } };
    const hold = holdDuringPause(thinking, moved, AI, "buy", { ok: true, answer: ANSWER }, RECORD);
    expect(hold.kind).toBe("stale");
    expect(hold.state.pause).toEqual(moved.pause);
    expect(aiSeat(hold.state, AI)).toMatchObject({ thinking: null, held: null });
  });

  it("resuming an unpaused game changes nothing", () => {
    expect(resumeAfterReview(noted)).toBe(noted);
  });
});

describe("aiCallRow", () => {
  it("indexes the shared call record by game, seat, decision and log place", () => {
    const record: AiCallRecord = {
      source: { kind: "game", game: "g", turn: 4 },
      at: "2026-10-07T00:00:00.000Z",
      seat: AI,
      decision: "buy",
      version: "llm-v1",
      server: { model: "m.gguf", contextPerSlot: 16384, slots: 4, defaults: {} },
      request: null,
      result: null,
      metrics: { ms: 900, thinkMs: null, answerMs: 900, promptTokens: 1, completionTokens: 1, thinkHitBudget: null },
      settle: { kind: "commit", reason: null },
    };
    expect(aiCallRow("g", record, REF, "commit", null)).toEqual({
      game_id: "g",
      seat: AI,
      decision: "buy",
      version: "llm-v1",
      model: "m.gguf",
      turn: REF.turn,
      event_index: 0,
      outcome: "commit",
      outcome_reason: null,
      ms: 900,
      record,
    });
  });
});
