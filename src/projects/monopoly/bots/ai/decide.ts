import { appendEventToActiveTurn, apply, autoStep } from "../../engine";
import type { AiDecision, GameState, Intent } from "../../types";
import { DECISION_SPECS, type AiResolution, type DecisionSpec } from "./answers";
import { aiDecisionFor } from "./decisions";
import type { ModelAdapter } from "./model/adapter";
import { buildPrompt } from "./prompt";
import { turnStartFingerprint } from "./turn-start";
import { aiSeat, currentTurnNumber, withAiSeat } from "./seat";

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

export type AskResult = { ok: true; answer: Record<string, unknown> } | { ok: false; reason: string };

/** Ask the model for the decision. The prompt is built from the state the seat
 *  claimed on, so it is what the model decides against. */
export async function askModel(
  model: ModelAdapter,
  state: GameState,
  seat: string,
  decision: AiDecision,
): Promise<AskResult> {
  const spec = DECISION_SPECS[decision];
  if (!spec) return { ok: false, reason: `an AI seat can't make a "${decision}" decision yet` };
  const prompt = buildPrompt(state, seat, spec.question(state, seat));
  const result = await model.complete({
    system: prompt.system,
    user: prompt.user,
    schemaName: decision,
    schema: spec.schema(state, seat),
    think: spec.think,
  });
  if (!result.ok) return { ok: false, reason: `${result.kind}: ${result.message}` };
  if (!isRecord(result.answer) || Array.isArray(result.answer)) {
    return { ok: false, reason: "the answer wasn't a JSON object" };
  }
  return { ok: true, answer: result.answer };
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
): Settled {
  const spec = DECISION_SPECS[decision];
  if (!spec) return failed(latest, seat, decision, `an AI seat can't make a "${decision}" decision yet`);
  const read = spec.resolve(asked, seat, answer);
  if (!read.ok) return failed(latest, seat, decision, read.reason);
  const onAsked = play(asked, seat, decision, spec, read.resolution);
  if (!onAsked.ok) return failed(latest, seat, decision, onAsked.reason);

  const unclaimed = withAiSeat(latest, seat, { thinking: null });
  if (aiDecisionFor(unclaimed, seat) !== decision) return { kind: "stale", state: unclaimed };
  const onLatest = play(unclaimed, seat, decision, spec, read.resolution);
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
): Settled & { kind: "fail" } {
  const marked = withAiSeat(state, seat, { thinking: null, failure: { decision, reason } });
  const turns = appendEventToActiveTurn(marked.turns, {
    kind: "ai-failed",
    playerId: seat,
    decision,
    reason,
  });
  return { kind: "fail", state: { ...marked, turns }, reason };
}

type Played = { ok: true; state: GameState } | { ok: false; reason: string };

/** Apply an answer to a state: the public and private notes and the plan as one bot-note,
 *  then its ops in order; and record its plan, auction maximum and turn-start
 *  mark. All-or-nothing. */
function play(
  state: GameState,
  seat: string,
  decision: AiDecision,
  spec: DecisionSpec,
  r: AiResolution,
): Played {
  const note: Intent = { kind: "bot-note", playerId: seat, text: r.publicNote, privateText: r.privateNote, plan: r.plan };
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
  const problem = spec.verify?.(working, seat) ?? null;
  if (problem !== null) return { ok: false, reason: problem };
  const auctionMax =
    r.auctionMax === null || !state.turn.auction
      ? aiSeat(working, seat).auctionMax
      : { position: state.turn.auction.position, turn: currentTurnNumber(state), max: r.auctionMax };
  const turnStart =
    decision === "turn-start"
      ? { turn: currentTurnNumber(state), fingerprint: turnStartFingerprint(working, seat) }
      : aiSeat(working, seat).turnStart;
  return { ok: true, state: withAiSeat(working, seat, { plan: r.plan, auctionMax, turnStart }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
