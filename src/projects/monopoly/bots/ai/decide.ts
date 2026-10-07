import { appendEventToActiveTurn, apply, autoStep } from "../../engine";
import type { AiDecision, AiDecisionRecord, GameState, Intent } from "../../types";
import { aiDecisionFor } from "./decisions";
import type { CallMetrics, ModelAdapter } from "./model/adapter";
import { aiSeat, currentTurnNumber, withAiSeat } from "./seat";
import { isRecord, type AiResolution, type AiVersion, type DecisionSpec } from "./spec";
import { aiVersionOf } from "./strategy";

// The route's side of an AI seat, as pure steps around the one async call:
//   claim → ask the model → settle (commit, stale, or fail).
// The route owns the reads and version-guarded writes between them.

/** Mark the seat as thinking about the decision it owes, or null when it owes
 *  none (already answered, already thinking, or failed — a failed seat is never
 *  asked again). Written before the model call, so no other client starts one. */
export function claimAi(
  state: GameState,
  seat: string,
): { state: GameState; decision: AiDecision } | null {
  const own = aiSeat(state, seat);
  if (own.thinking !== null || own.failure !== null) return null;
  const decision = aiDecisionFor(state, seat);
  if (decision === null) return null;
  return { state: withAiSeat(state, seat, { thinking: decision }), decision };
}

/** The model's answer, or why there is none, with the record of how the call
 *  was made either way. */
export type AskResult =
  | { ok: true; answer: Record<string, unknown>; record: AiDecisionRecord }
  | { ok: false; reason: string; record: AiDecisionRecord };

const NO_CALL: CallMetrics = {
  ms: 0,
  thinkMs: null,
  answerMs: null,
  promptTokens: null,
  completionTokens: null,
  thinkHitBudget: null,
};

/** Ask the model for the decision, the way the seat's AI version asks it. The
 *  prompt is built from the state the seat claimed on, so it is what the model
 *  decides against. */
export async function askModel(
  model: ModelAdapter,
  state: GameState,
  seat: string,
  decision: AiDecision,
): Promise<AskResult> {
  const version = seatVersion(state, seat);
  const record = (metrics: CallMetrics, modelName: string | null): AiDecisionRecord => ({
    decision,
    version: version.label,
    model: modelName,
    ...metrics,
  });
  const spec = version.specs[decision];
  if (!spec) {
    return {
      ok: false,
      reason: `an AI seat can't make a "${decision}" decision yet`,
      record: record(NO_CALL, null),
    };
  }
  const prompt = version.buildPrompt(state, seat, spec.question(state, seat));
  const [result, modelName] = await Promise.all([
    model.complete({
      system: prompt.system,
      user: prompt.user,
      schemaName: decision,
      schema: spec.schema(state, seat),
      think: spec.think,
      thinkTokens: version.call.thinkTokens,
      sampling: version.call.sampling,
    }),
    model.identify(),
  ]);
  const made = record(result.metrics, modelName);
  if (!result.ok) return { ok: false, reason: `${result.kind}: ${result.message}`, record: made };
  if (!isRecord(result.answer) || Array.isArray(result.answer)) {
    return { ok: false, reason: "the answer wasn't a JSON object", record: made };
  }
  return { ok: true, answer: result.answer, record: made };
}

/** What becomes of an answer once it is weighed against the latest state:
 *  - `commit`: it holds; the state carries its intents, notes and plan.
 *  - `stale`: it was sound when asked, but the game moved on under it (another
 *    seat acted meanwhile); the marker is cleared and the seat is asked afresh.
 *  - `fail`: the answer itself was unusable or illegal; the seat is stalled. */
export type Settled =
  | { kind: "commit"; state: GameState }
  | { kind: "stale"; state: GameState }
  | { kind: "fail"; state: GameState; reason: string };

/** Weigh the model's answer. It is judged against `asked`, the state the model
 *  saw, so a bad answer fails even if the game has since moved; a sound one is
 *  then applied to `latest`, the state the route will write over. */
export function settleAnswer(
  asked: GameState,
  latest: GameState,
  seat: string,
  decision: AiDecision,
  answer: Record<string, unknown>,
  record: AiDecisionRecord,
): Settled {
  const version = seatVersion(asked, seat);
  const spec = version.specs[decision];
  if (!spec) {
    return failed(latest, seat, decision, `an AI seat can't make a "${decision}" decision yet`, record);
  }
  const read = spec.resolve(asked, seat, answer);
  if (!read.ok) return failed(latest, seat, decision, read.reason, record);
  const played: Played = { version, spec, decision, record, resolution: read.resolution };
  const onAsked = play(asked, seat, played);
  if (!onAsked.ok) return failed(latest, seat, decision, onAsked.reason, record);

  const unclaimed = withAiSeat(latest, seat, { thinking: null });
  if (aiDecisionFor(unclaimed, seat) !== decision) return { kind: "stale", state: unclaimed };
  const onLatest = play(unclaimed, seat, played);
  if (!onLatest.ok) return { kind: "stale", state: unclaimed };
  return { kind: "commit", state: onLatest.state };
}

/** Record a failure: the reason goes in the log, the seat is marked failed, and
 *  the marker clears. No fallback and no retry; the game stalls on this seat. */
export function failed(
  state: GameState,
  seat: string,
  decision: AiDecision,
  reason: string,
  record: AiDecisionRecord,
): Settled & { kind: "fail" } {
  const marked = withAiSeat(state, seat, { thinking: null, failure: { decision, reason } });
  const turns = appendEventToActiveTurn(marked.turns, {
    kind: "ai-failed",
    playerId: seat,
    decision,
    reason,
    ai: record,
  });
  return { kind: "fail", state: { ...marked, turns }, reason };
}

/** An answer read and ready to apply, with what made it. */
interface Played {
  version: AiVersion;
  spec: DecisionSpec;
  decision: AiDecision;
  record: AiDecisionRecord;
  resolution: AiResolution;
}

type PlayResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Apply an answer to a state: its notes, plan and decision record as one
 *  bot-note, then its ops in order; and record its plan, auction maximum and
 *  turn-start mark. All-or-nothing. */
function play(state: GameState, seat: string, p: Played): PlayResult {
  const r = p.resolution;
  const heldFor =
    p.version.holdAuctionNotes && p.decision === "auction" ? state.turn.auction?.position : undefined;
  const note: Intent = {
    kind: "bot-note",
    playerId: seat,
    text: r.publicNote,
    privateText: r.privateNote,
    plan: r.plan,
    ai: p.record,
    ...(heldFor === undefined ? {} : { heldForAuction: heldFor }),
  };
  let working = state;
  for (const op of [{ kind: "intent", intent: note } as const, ...r.ops]) {
    if (op.kind === "step") {
      const stepped = autoStep(working).state;
      if (stepped === working) return { ok: false, reason: `the game couldn't advance at ${working.turn.phase}` };
      working = stepped;
      continue;
    }
    const result = apply(working, op.intent);
    if (!result.ok) return { ok: false, reason: `${op.intent.kind} was refused: ${result.reason}` };
    working = result.state;
  }
  const problem = p.spec.verify?.(working, seat) ?? null;
  if (problem !== null) return { ok: false, reason: problem };
  const auctionMax =
    r.auctionMax === null || !state.turn.auction
      ? aiSeat(working, seat).auctionMax
      : { position: state.turn.auction.position, turn: currentTurnNumber(state), max: r.auctionMax };
  const turnStart =
    p.decision === "turn-start"
      ? { turn: currentTurnNumber(state), fingerprint: p.version.turnStartFingerprint(working, seat) }
      : aiSeat(working, seat).turnStart;
  return { ok: true, state: withAiSeat(working, seat, { plan: r.plan, auctionMax, turnStart }) };
}

function seatVersion(state: GameState, seat: string): AiVersion {
  const version = aiVersionOf(state, seat);
  if (version === null) throw new Error(`${seat} isn't an AI seat`);
  return version;
}
