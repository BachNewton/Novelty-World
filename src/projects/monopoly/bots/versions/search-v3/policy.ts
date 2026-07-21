// ===========================================================================
// search-v3 — POLICY DISPATCHER (rollout-search bot on the TUNED champion).
//
// Same truncated-rollout machinery as search-v1/v2, but searches the FULL
// monte-carlo-v1 decision set — FOUR high-leverage discrete decisions — on top of
// the claude-v45 base (`./base`), the base policy's own greedy move ALWAYS a
// candidate (so search can only MATCH or BEAT it; `searchBest` tie-breaks to base):
//
//   - buy-decision  : {base} ∪ {buy, decline, raise-to-buy}   (legal only)
//   - trade-pending : {base} ∪ {accept, decline}
//   - auction       : {base} ∪ {bid next, pass}               (legal only)
//   - jail-decision : {base} ∪ {card, pay, roll}              (legal only)
//
// WHY ADD AUCTION + JAIL (vs search-v2's buy+trade-vote only). search-v2 measured
// EVEN vs claude-v45: the champion's ES-tuned buy/trade-vote are already near-
// optimal, so search just matches them. Auctions and jail, by contrast, are where
// a 1-ply tuned eval is STRUCTURALLY blind — both turn on DEFERRED payoff (an
// auction price paid now for rent that lands over future turns; staying in jail to
// dodge a developed board) that `positionValue` can't see at depth 1 but a rollout
// can (RL-DESIGN.md flags auction willingness-to-pay as the canonical 1-ply blind
// spot). This is the hypothesis search-v3 tests.
//
// Everything else (building, liquidation, trade construction) delegates to the
// base policy: cheap to get right greedily, or too combinatorial to rollout-search.
// ===========================================================================
import { BID_INCREMENT, isLegal } from "../../../engine";
import { heldJailCard, ownablePrice } from "../../../logic";
import type { GameState, Intent } from "../../../types";
import type { BotDecision } from "../../decision";
import { applyCandidate } from "../../rl/candidates";
import { baseBot, spaceName } from "./base";
import {
  searchBest,
  ROLLOUT_SAMPLES,
  ROLLOUT_HORIZON,
  type SearchCandidate,
  type SearchResult,
} from "./search";

/** The search-v3 bot: rollout policy improvement over claude-v45 at four decisions. */
export function searchBot(state: GameState, playerId: string): BotDecision | null {
  switch (state.turn.phase) {
    case "buy-decision":
      return searchBuyDecision(state, playerId);
    case "trade-pending":
      return searchTradeVote(state, playerId);
    case "auction":
      return searchAuction(state, playerId);
    case "jail-decision":
      return searchJail(state, playerId);
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
 *  search targets, kind uniquely identifies the move. */
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
// Buy-decision: search over {buy, decline, raise-to-buy}. Raise-to-buy is only
// legal when the bot can't afford the lot outright, so `isLegal` drops it otherwise.
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

  if (candidates.length <= 1) return base;
  const result = searchBest(candidates, pid);
  return decisionFrom(result, base, spaceName(pos));
}

// ---------------------------------------------------------------------------
// Incoming trade vote: search over {accept, decline}.
// ---------------------------------------------------------------------------
function searchTradeVote(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;

  const base = baseBot(state, pid);
  const baseIntent = base?.intent ?? null;

  const candidates = assemble(state, baseIntent, [
    { intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id }, label: "accept" },
    { intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id }, label: "decline" },
  ]);

  if (candidates.length <= 1) return base;
  const result = searchBest(candidates, pid);
  return decisionFrom(result, base, "this trade");
}

// ---------------------------------------------------------------------------
// Auction: search over {bid the next increment, pass}. The bid is only legal when
// it's within the bot's cap (`isLegal` gates it), so when bidding is unaffordable
// the set collapses to {pass} and we defer to the base. When bidding IS legal,
// search can choose to bid HIGHER than the base's 1-ply willingness if the rollout
// payoff justifies it — the deferred-payoff blind spot lookahead is for.
// ---------------------------------------------------------------------------
function searchAuction(state: GameState, pid: string): BotDecision | null {
  const a = state.turn.auction;
  if (!a || !a.active.includes(pid) || a.leaderId === pid) return null;

  const base = baseBot(state, pid);
  const baseIntent = base?.intent ?? null;
  const next = a.highBid + BID_INCREMENT;

  const candidates = assemble(state, baseIntent, [
    { intent: { kind: "bid", playerId: pid, amount: next }, label: `bid $${next.toString()}` },
    { intent: { kind: "pass-bid", playerId: pid }, label: "pass" },
  ]);

  if (candidates.length <= 1) return base;
  const result = searchBest(candidates, pid);
  return decisionFrom(result, base, spaceName(a.position));
}

// ---------------------------------------------------------------------------
// Jail: search over {use card (if held), pay $50 (if affordable), roll}. "Roll" is
// a STEP the pacer performs (no intent) — staying to roll for doubles. The base's
// stay/roll choice surfaces as a bot-note or null, so it maps to the roll candidate.
// ---------------------------------------------------------------------------
function searchJail(state: GameState, pid: string): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  const player = state.players.find((q) => q.id === pid);
  if (!player || !player.inJail) return null;

  const base = baseBot(state, pid);
  // base.intent kind: "use-jail-card" | "pay-to-leave-jail" | "bot-note" (stay) ;
  // null means the base already noted its stay this turn — both mean "roll".
  const baseKind = base?.intent.kind ?? null;
  const baseIsRoll = baseKind === null || baseKind === "bot-note";

  const candidates: SearchCandidate[] = [];
  if (heldJailCard(state, pid) !== null) {
    const intent: Intent = { kind: "use-jail-card", playerId: pid };
    if (isLegal(state, intent)) {
      candidates.push({
        intent,
        afterState: applyCandidate(state, { kind: "intent", intent }),
        isBaseChoice: baseKind === "use-jail-card",
        label: "card",
      });
    }
  }
  const payIntent: Intent = { kind: "pay-to-leave-jail", playerId: pid };
  if (isLegal(state, payIntent)) {
    candidates.push({
      intent: payIntent,
      afterState: applyCandidate(state, { kind: "intent", intent: payIntent }),
      isBaseChoice: baseKind === "pay-to-leave-jail",
      label: "pay $50",
    });
  }
  // Roll: a step the pacer performs (autoStep rolls for the jailed player).
  candidates.push({
    intent: null,
    afterState: applyCandidate(state, { kind: "step" }),
    isBaseChoice: baseIsRoll,
    label: "roll",
  });

  if (candidates.length <= 1) return base;
  const result = searchBest(candidates, pid);
  return jailDecisionFrom(result, state, pid, base);
}

/** Has `pid` already logged this exact note in the current turn group? Dedup so a
 *  bot-note doesn't spin the jail phase (the pacer re-consults until a move lands). */
function alreadyNoted(state: GameState, pid: string, text: string): boolean {
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some((e) => e.kind === "bot-note" && e.playerId === pid && e.text === text);
}

/** Resolve a jail search. A non-roll winner (card/pay) returns its intent like any
 *  other decision; the ROLL winner has no intent — we let the pacer roll (return
 *  null), noting an override once so the lookahead verdict is visible in the log. */
function jailDecisionFrom(
  result: SearchResult,
  state: GameState,
  pid: string,
  base: BotDecision | null,
): BotDecision | null {
  if (result.best.intent !== null) return decisionFrom(result, base, "jail");
  // Roll chosen.
  if (result.best.isBaseChoice) return base; // base also rolls — verbatim (note or null).
  const note =
    `Rollout search overrides greedy at jail: "roll" (stay) projects ` +
    `${(result.bestScore * 100).toFixed(0)}% position share vs leaving's ` +
    `${(result.baseScore * 100).toFixed(0)}% over ` +
    `${ROLLOUT_SAMPLES.toString()} seeded ${ROLLOUT_HORIZON.toString()}-turn rollouts.`;
  if (alreadyNoted(state, pid, note)) return null;
  return { intent: { kind: "bot-note", playerId: pid, text: note } };
}

/** Turn a `SearchResult` into a `BotDecision`. When search confirms the base
 *  choice, reuse the base policy's own (legible) note so the log reads exactly like
 *  the champion; when search OVERRIDES it, note the lookahead verdict + margin. */
function decisionFrom(
  result: SearchResult,
  base: BotDecision | null,
  subject: string,
): BotDecision | null {
  const intent = result.best.intent;
  if (intent === null) return base; // defensive — only the jail-roll path yields null.
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
  return { intent, note };
}
