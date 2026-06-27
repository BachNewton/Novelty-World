// ===========================================================================
// search-v1 — POLICY DISPATCHER (the rollout-search bot).
//
// Plays EXACTLY like claude-v38 (the base policy, `base-policy.ts`) at every
// decision EXCEPT two high-leverage discrete decisions, where it runs a
// truncated-rollout search (`search.ts`) over a small candidate set — the base
// policy's own greedy move ALWAYS included — and plays the candidate with the
// best mean rollout value:
//
//   - buy-decision  : {the base choice} ∪ {buy, decline, raise-to-buy} (legal only)
//   - trade-pending : {the base vote}   ∪ {accept, decline}
//
// Both are irreversible, board-shaping commitments where 1-ply greed is most
// likely to misprice a deferred payoff (rent that only accrues over future turns,
// or a monopoly a rival completes against you later) — exactly what lookahead is
// for. Everything else (auctions, building, liquidation, jail, trade
// construction) delegates straight to the base policy: those are either cheap to
// get right greedily or too combinatorial to rollout-search cheaply, and search
// is bounded to where it earns its compute.
//
// SAFETY: because the base move is always a candidate and `searchBest` tie-breaks
// toward it (a non-base candidate must beat it by a margin), search-v1 can only
// MATCH or BEAT claude-v38 at these decisions — never lose capability.
// ===========================================================================
import { isLegal } from "../../../engine";
import { ownablePrice } from "../../../logic";
import type { GameState, Intent } from "../../../types";
import type { BotDecision } from "../../decision";
import { applyCandidate } from "../../candidates";
import { baseBot, spaceName } from "./base";
import {
  searchBest,
  ROLLOUT_SAMPLES,
  ROLLOUT_HORIZON,
  type SearchCandidate,
  type SearchResult,
} from "./search";

/** The search-v1 bot: rollout policy improvement over claude-v38. */
export function searchBot(state: GameState, playerId: string): BotDecision | null {
  switch (state.turn.phase) {
    case "buy-decision":
      return searchBuyDecision(state, playerId);
    case "trade-pending":
      return searchTradeVote(state, playerId);
    default:
      // Every other phase is the base policy verbatim.
      return baseBot(state, playerId);
  }
}

/** Build a `SearchCandidate` from an intent, marking whether it's the base
 *  policy's own greedy choice. Returns null if the intent isn't legal now (so a
 *  candidate set never contains an unplayable move). */
function toCandidate(
  state: GameState,
  intent: Intent,
  isBaseChoice: boolean,
  label: string,
): SearchCandidate | null {
  if (!isLegal(state, intent)) return null;
  return {
    intent,
    afterState: applyCandidate(state, { kind: "intent", intent }),
    isBaseChoice,
    label,
  };
}

/** Assemble the candidate set, guaranteeing the base policy's choice is in it
 *  (and flagged). The base choice is matched by intent KIND — for the decisions
 *  search targets, kind uniquely identifies the move (buy / decline-buy /
 *  raise-cash; accept-trade / decline-trade). */
function assemble(
  state: GameState,
  baseIntent: Intent | null,
  options: readonly { intent: Intent; label: string }[],
): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.intent.kind)) continue;
    const isBase = baseIntent !== null && o.intent.kind === baseIntent.kind;
    const cand = toCandidate(state, o.intent, isBase, o.label);
    if (cand) {
      out.push(cand);
      seen.add(o.intent.kind);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Buy-decision: search over {buy, decline, raise-to-buy}. The base policy's own
// pick (one of those three) is always present and flagged. Raise-to-buy is only a
// real option when the bot can't afford the lot outright (the engine gates it),
// so `isLegal` naturally drops it otherwise.
// ---------------------------------------------------------------------------
function searchBuyDecision(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const pos = state.turn.pendingBuy;
  if (pos === undefined) return null;
  if (ownablePrice(pos) === null) return null;

  const base = baseBot(state, pid);
  const baseIntent = base?.intent ?? null;

  const candidates = assemble(state, baseIntent, [
    { intent: { kind: "buy", playerId: pid }, label: "buy" },
    { intent: { kind: "decline-buy", playerId: pid }, label: "decline" },
    { intent: { kind: "raise-cash", playerId: pid }, label: "raise to buy" },
  ]);

  // Degenerate set (only one legal move, or none): nothing to search — defer to
  // the base policy so the note/behavior is identical to claude-v38.
  if (candidates.length <= 1) return base;

  const result = searchBest(candidates, pid);
  return decisionFrom(result, base, `${spaceName(pos)}`);
}

// ---------------------------------------------------------------------------
// Incoming trade vote: search over {accept, decline}. The base vote is flagged.
// ---------------------------------------------------------------------------
function searchTradeVote(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;

  const base = baseBot(state, pid);
  const baseIntent = base?.intent ?? null;

  const candidates = assemble(state, baseIntent, [
    {
      intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id },
      label: "accept",
    },
    {
      intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id },
      label: "decline",
    },
  ]);

  if (candidates.length <= 1) return base;

  const result = searchBest(candidates, pid);
  return decisionFrom(result, base, "this trade");
}

/** Turn a `SearchResult` into a `BotDecision`. When search confirms the base
 *  choice, we reuse the base policy's own (legible) note so the log reads exactly
 *  like claude-v38; when search OVERRIDES it, we note the lookahead verdict with
 *  the win-share margin so the override is visible in the play-by-play. */
function decisionFrom(
  result: SearchResult,
  base: BotDecision | null,
  subject: string,
): BotDecision {
  const overrode = !result.best.isBaseChoice;
  if (!overrode && base !== null) {
    // Search agreed with greedy — keep the base note verbatim.
    return base;
  }
  const pct = (result.bestScore * 100).toFixed(0);
  const basePct = (result.baseScore * 100).toFixed(0);
  const budget = `${ROLLOUT_SAMPLES.toString()} seeded ${ROLLOUT_HORIZON.toString()}-turn rollouts`;
  const note = overrode
    ? `Rollout search overrides greedy on ${subject}: "${result.best.label}" projects ` +
      `${pct}% position share vs the greedy ${basePct}% over ${budget}.`
    : `Rollout search confirms greedy on ${subject} ("${result.best.label}", ${pct}% projected share).`;
  return { intent: result.best.intent, note };
}
