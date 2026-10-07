import type {
  AiDecision,
  AiDecisionRecord,
  AiDecisionRef,
  GameState,
  HeldAnswer,
} from "../../types";
import { failed, settleAnswer, type Settled } from "./decide";
import { isAiStrategy } from "./strategy";
import { aiSeat, withAiSeat } from "./seat";

// Players reviewing an AI decision mid-game: opening one pauses the table and
// shows it to every seated human, a flag records what each of them thought of
// it, and resuming carries on. Pure; the route does the reads, the writes and
// the flag/reveal rows.

/** What a player can say about an AI decision. Several may apply at once. */
export const AI_FLAG_CATEGORIES = [
  { id: "misread-board", label: "Misread the board", on: "other" },
  { id: "invented-rule", label: "Invented a rule", on: "any" },
  { id: "bad-strategy", label: "Bad strategy", on: "other" },
  // A trade can be good for the bot and still be one no person would take, so
  // trades are judged from both sides rather than as one "bad strategy".
  { id: "trade-bad-for-bot", label: "Bad for the bot", on: "trade" },
  { id: "trade-no-human-would-take", label: "No human would take this", on: "trade" },
  { id: "trade-misread", label: "Misread the deal", on: "trade" },
  { id: "leaked-info", label: "Gave info away", on: "any" },
  { id: "exploitable", label: "Exploitable", on: "any" },
  { id: "broke-plan", label: "Broke its plan", on: "any" },
  { id: "too-slow", label: "Too slow", on: "any" },
  { id: "trade-fair", label: "Fair offer", on: "trade" },
  { id: "trade-tempting", label: "Tempting", on: "trade" },
  { id: "good-move", label: "Good move", on: "any" },
] as const;

export type AiFlagCategory = (typeof AI_FLAG_CATEGORIES)[number]["id"];

export function isAiFlagCategory(value: unknown): value is AiFlagCategory {
  return AI_FLAG_CATEGORIES.some((c) => c.id === value);
}

const TRADE_DECISIONS: readonly AiDecision[] = ["trade-vote", "trade-build"];

/** The categories offered for a decision: trade ones for a trade, the general
 *  ones otherwise, and those that fit both always. A decision with no record
 *  (logged before records existed) gets every category. */
export function aiFlagCategoriesFor(decision: AiDecision | null): (typeof AI_FLAG_CATEGORIES)[number][] {
  if (decision === null) return [...AI_FLAG_CATEGORIES];
  const scope = TRADE_DECISIONS.includes(decision) ? "trade" : "other";
  return AI_FLAG_CATEGORIES.filter((c) => c.on === "any" || c.on === scope);
}

/** One AI decision as the review dialog shows it, read from its log entry: a
 *  BOT note, or the failure that stalled the seat. */
export interface AiDecisionView {
  seat: string;
  publicNote: string;
  privateNote: string | null;
  plan: string | null;
  /** Null only for a note logged before decisions were recorded. */
  record: AiDecisionRecord | null;
  /** The failure's reason, when the decision failed. */
  failure: string | null;
}

/** The AI decision at `ref`, or null when there is none there (a rule bot's
 *  note, any other event, or nothing at all). */
export function aiDecisionAt(state: GameState, ref: AiDecisionRef): AiDecisionView | null {
  const event = state.turns.find((group) => group.turn === ref.turn)?.events[ref.index];
  if (!event) return null;
  if (event.kind === "ai-failed") {
    return {
      seat: event.playerId,
      publicNote: "",
      privateNote: null,
      plan: null,
      record: event.ai ?? null,
      failure: event.reason,
    };
  }
  if (event.kind !== "bot-note") return null;
  const player = state.players.find((p) => p.id === event.playerId);
  if (!player || !isAiStrategy(player.botStrategy)) return null;
  return {
    seat: event.playerId,
    publicNote: event.text,
    privateNote: event.privateText ?? null,
    plan: event.plan ?? null,
    record: event.ai ?? null,
    failure: null,
  };
}

/** Where the decision made with `record` landed in the log: its note or its
 *  failure carries that very record. Null when it put nothing in the log (an
 *  answer overtaken by the game, or one held during a pause). */
export function decisionRefOf(state: GameState, record: AiDecisionRecord): AiDecisionRef | null {
  for (let g = state.turns.length - 1; g >= 0; g--) {
    const group = state.turns[g];
    for (let i = group.events.length - 1; i >= 0; i--) {
      const event = group.events[i];
      if ((event.kind === "bot-note" || event.kind === "ai-failed") && event.ai === record) {
        return { turn: group.turn, index: i };
      }
    }
  }
  return null;
}

export type Paused = { ok: true; state: GameState } | { ok: false; reason: string };

/** Where the failure a seat is stalled on sits in the log: the seat's latest
 *  `ai-failed` event, while the seat is still failed. Null when it isn't. */
export function stalledAt(state: GameState, seat: string): AiDecisionRef | null {
  if (aiSeat(state, seat).failure === null) return null;
  for (let g = state.turns.length - 1; g >= 0; g--) {
    const group = state.turns[g];
    for (let i = group.events.length - 1; i >= 0; i--) {
      const event = group.events[i];
      if (event.kind === "ai-failed" && event.playerId === seat) return { turn: group.turn, index: i };
    }
  }
  return null;
}

/** A seated player asks a stalled AI seat to try again: the seat's failure
 *  clears, so the normal drive path asks the model afresh. It must still be
 *  stalled on the failure at `ref`, the one the player saw, so a double tap, or
 *  a second player's tap after the seat has moved on (or failed again), changes
 *  nothing. The failure stays in the log. A person's call, never automatic. */
export function retryFailed(state: GameState, by: string, seat: string, ref: AiDecisionRef): Paused {
  if (state.status !== "active") return { ok: false, reason: "the game isn't in play" };
  const player = state.players.find((p) => p.id === by);
  if (!player || player.botStrategy !== null) {
    return { ok: false, reason: "only a seated player can ask an AI to try again" };
  }
  const at = stalledAt(state, seat);
  if (at === null) return { ok: false, reason: "that AI isn't stalled" };
  if (at.turn !== ref.turn || at.index !== ref.index) {
    return { ok: false, reason: "that AI is stalled on a different decision now" };
  }
  return { ok: true, state: withAiSeat(state, seat, { failure: null }) };
}

/** Pause the table while `by` reviews the AI decision at `ref`. Only a seated
 *  human can, and only during play. Already paused, the table stays paused as
 *  it is: a second reviewer just reads, and either one's resume carries on. */
export function pauseForReview(state: GameState, by: string, ref: AiDecisionRef): Paused {
  if (state.status !== "active") return { ok: false, reason: "the game isn't in play" };
  const player = state.players.find((p) => p.id === by);
  if (!player || player.botStrategy !== null) {
    return { ok: false, reason: "only a seated player can pause to review" };
  }
  if (aiDecisionAt(state, ref) === null) return { ok: false, reason: "no AI decision there" };
  if (state.pause !== null) return { ok: true, state };
  return { ok: true, state: { ...state, pause: { by, ref } } };
}

/** The decision `viewer`'s screen shows while the table is paused: the paused
 *  one, for every seated human, so the whole table reads it together. Null for
 *  a spectator or a bot, and when nothing is paused. */
export function sharedReviewFor(state: GameState, viewer: string | null): AiDecisionRef | null {
  if (state.pause === null || viewer === null) return null;
  const seated = state.players.some((p) => p.id === viewer && p.botStrategy === null);
  return seated ? state.pause.ref : null;
}

/** After `by` has flagged a decision. The opener's flag ends their review, so
 *  it resumes the table as their "close & resume" does; anyone else's flag is
 *  one voice among the table's and leaves the pause as it is, so it never
 *  resumes play out from under the opener. */
export function afterFlag(state: GameState, by: string): GameState {
  return state.pause?.by === by ? resumeAfterReview(state) : state;
}

/** Carry on after a review: lift the pause and settle any answer that came back
 *  while it held (see `HeldAnswer`). Nothing moved during the pause, so the
 *  board the answer is settled against is the one it was held on. Unpaused, the
 *  state is returned as it is. */
export function resumeAfterReview(state: GameState): GameState {
  if (state.pause === null) return state;
  let working: GameState = { ...state, pause: null };
  for (const player of state.players) {
    const held = aiSeat(working, player.id).held;
    if (held === null) continue;
    working = settleHeld(withAiSeat(working, player.id, { held: null }), player.id, held).state;
  }
  return working;
}

function settleHeld(state: GameState, seat: string, held: HeldAnswer): Settled {
  return held.kind === "answer"
    ? settleAnswer(state, state, seat, held.decision, held.answer, held.record)
    : failed(state, seat, held.decision, held.reason, held.record);
}

/** What becomes of a model's answer that arrives while the table is paused:
 *  weighed now, against the state the model saw, so an answer the game has
 *  already overtaken is `stale` (the claim clears, nothing else changes, and
 *  the seat is asked afresh once play resumes); anything else is kept on the
 *  seat until the pause lifts. */
export function holdDuringPause(
  asked: GameState,
  latest: GameState,
  seat: string,
  decision: AiDecision,
  outcome: { ok: true; answer: Record<string, unknown> } | { ok: false; reason: string },
  record: AiDecisionRecord,
): { kind: "stale" | "held"; state: GameState } {
  const pause = latest.pause;
  if (outcome.ok) {
    const settled = settleAnswer(asked, { ...latest, pause: null }, seat, decision, outcome.answer, record);
    if (settled.kind === "stale") return { kind: "stale", state: { ...settled.state, pause } };
    const held: HeldAnswer =
      settled.kind === "fail"
        ? { kind: "fail", decision, reason: settled.reason, record }
        : { kind: "answer", decision, answer: outcome.answer, record };
    return { kind: "held", state: withAiSeat(latest, seat, { held }) };
  }
  return {
    kind: "held",
    state: withAiSeat(latest, seat, { held: { kind: "fail", decision, reason: outcome.reason, record } }),
  };
}
