import { builtLotsInGroup, developmentLevel, groupPositions } from "../../../development";
import { projectTrade, tradeParticipants } from "../../../engine";
import { hasMonopoly } from "../../../logic";
import type { GameState, TradeTerms } from "../../../types";
import {
  activeOpponents,
  colorName,
  COLORS_BY_WEIGHT,
  DENY_FACTOR,
  monopolyBonus,
  ownedInColor,
  positionValue,
  spaceName,
} from "./valuation";

// ===========================================================================
// v2 SNAPSHOT — self-contained fork of `bots/trades.ts` (see EVOLUTION.md).
//
// v2 HYPOTHESIS: price the rival-monopoly threat instead of vetoing it. The v1
// champion rejects any deal that hands a rival a stronger monopoly than the
// seller gets (`rivalMono > myMono · RIVAL_TOLERANCE`). With `myMono = 0` that
// vetoes EVERY clean "cash for the completer" sale, which is the documented
// 4-handed no-trade deadlock: nobody will sell a rival the last lot of a set at
// any price. v2 replaces the veto with a PRICE — handing a rival a new monopoly
// costs the seller a fraction of that set's bonus (the mirror of the DENY_FACTOR
// premium a buyer pays to BLOCK a set) — folded into the seller's valuation. A
// seller will now part with the completer if the cash on the table outweighs the
// priced threat, so the buyer's `sweetenFor` automatically funds that premium and
// "cash for the completer" becomes a live deal. Everything else is v1 verbatim.
// ---------------------------------------------------------------------------
// Trade reasoning. The Claude bot trades to COMPLETE monopolies — the engine of
// the mid-game — and only proposes deals it believes the other party will take.
// Both construction and acceptance run off `positionValue`: a deal is good for a
// player exactly when it raises their position value (now net of the priced
// rival-monopoly threat). Construction models the counterparty (would THEY
// accept?) and remembers declines (a "no" means the offer wasn't good enough —
// don't re-pitch the identical terms; sweeten or wait for the board to change),
// so it always terminates.
// ===========================================================================

/** A trade must lift my value by at least this to be worth doing — filters out
 *  break-even noise. */
const ACCEPT_MIN = 1;

/** When sweetening an offer so the counterparty accepts, clear their break-even
 *  by this cushion so the "yes" is comfortable, not marginal. */
const ACCEPT_MARGIN = 30;

/** Going cash-negative for a trade is a liquidity risk; only stomach it for a
 *  clearly transformative gain (a strong monopoly). */
const LIQUIDITY_RISK_GAIN = 250;

/** What handing the strongest rival a NEW monopoly costs me, as a fraction of
 *  that set's bonus — the v2 replacement for v1's hard `RIVAL_TOLERANCE` veto.
 *  Deliberately the mirror of `DENY_FACTOR`: if blocking a rival's set is worth
 *  +DENY_FACTOR×bonus to a buyer, then *handing* one over is worth the same
 *  cost to a seller. Folded into the seller's valuation so the deal can still
 *  clear if the cash outweighs it — a balanced mutual-completion swap (where I
 *  also gain a comparable set) nets out positive and still passes. */
const RIVAL_THREAT_FACTOR = DENY_FACTOR;

export interface TradeVerdict {
  accept: boolean;
  /** Position-value change for the evaluated player (signed), NET of the priced
   *  rival-monopoly threat. Because the threat is independent of any cash
   *  sweetener, construction's `sweetenFor` can clear it by adding cash against
   *  exactly this number. */
  delta: number;
  reason: string;
}

/** The board as it would be after `terms` execute — ownership, GOJF holders, and
 *  every player's cash (negotiated delta minus mortgage interest), via the same
 *  pure projection the trade panel uses. Houses/mortgage flags are unchanged by
 *  a trade. */
function postTradeState(state: GameState, terms: TradeTerms): GameState {
  const proj = projectTrade(state, terms);
  return {
    ...state,
    ownership: proj.ownership,
    jailFreeCards: proj.jailFreeCards,
    players: state.players.map((p) => ({ ...p, cash: proj.cashById[p.id] ?? p.cash })),
  };
}

/** Value of the monopolies `pid` newly completes going from `before` to `after`. */
function monopolyGain(before: GameState, after: GameState, pid: string): number {
  let gain = 0;
  for (const color of COLORS_BY_WEIGHT) {
    if (hasMonopoly(after, color, pid) && !hasMonopoly(before, color, pid)) {
      gain += monopolyBonus(color);
    }
  }
  return gain;
}

/** Evaluate `terms` from `pid`'s seat: accept iff it raises my position value
 *  NET of the priced rival-monopoly threat, and doesn't leave me cash-negative
 *  (unless the gain is transformative). The same function models the
 *  counterparty during construction and answers incoming offers.
 *
 *  v2: the rival-monopoly threat is PRICED into `delta`, not vetoed (see header).
 *  Handing the strongest rival a new monopoly subtracts `RIVAL_THREAT_FACTOR` of
 *  that set's bonus from my valuation, so I'll still make the deal when the cash
 *  on the table outweighs it. */
export function evaluateTrade(
  state: GameState,
  pid: string,
  terms: TradeTerms,
): TradeVerdict {
  const after = postTradeState(state, terms);
  const rawDelta = positionValue(after, pid) - positionValue(state, pid);
  const postCash = after.players.find((p) => p.id === pid)?.cash ?? 0;

  const myMono = monopolyGain(state, after, pid);
  let rivalMono = 0;
  for (const opp of activeOpponents(state, pid)) {
    rivalMono = Math.max(rivalMono, monopolyGain(state, after, opp.id));
  }
  const threatCost = Math.round(rivalMono * RIVAL_THREAT_FACTOR);
  const delta = rawDelta - threatCost;

  if (delta <= ACCEPT_MIN) {
    return {
      accept: false,
      delta,
      reason:
        threatCost > 0
          ? "the rival monopoly it creates outweighs what I get"
          : "it doesn't improve my position",
    };
  }
  if (postCash < 0 && delta < LIQUIDITY_RISK_GAIN) {
    return { accept: false, delta, reason: "it would leave me short of cash" };
  }
  const reason =
    myMono > 0
      ? "it completes a monopoly for me"
      : threatCost > 0
        ? "the cash outweighs the monopoly I'm handing over"
        : "it nets me real value";
  return { accept: true, delta, reason };
}

/** Stable signature of a trade's ASSET moves (cash excluded) — used to recognize
 *  a previously-declined offer regardless of its cash sweetener. */
function assetSignature(terms: TradeTerms): string {
  const props = Object.entries(terms.propertyTo)
    .map(([pos, to]) => `${pos}:${to}`)
    .sort()
    .join(",");
  const cards = Object.entries(terms.gojfTo)
    .map(([src, to]) => `${src}:${to}`)
    .sort()
    .join(",");
  return `p[${props}]g[${cards}]`;
}

/** Has `pid` already attempted a trade in the CURRENT turn group? Bounds the
 *  off-turn cascade and any decline loop to one proposal per turn boundary. */
function proposedThisTurn(state: GameState, pid: string): boolean {
  // Active play always has at least one turn group (the current player's).
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some(
    (e) =>
      (e.kind === "trade" || e.kind === "trade-declined") && e.proposerId === pid,
  );
}

/** Did `pid` previously propose this exact asset signature and get declined,
 *  WITHOUT the new offer being sweetened for whoever declined it? A "no" means
 *  the offer wasn't good enough — only re-pitch with more cash on the table for
 *  the decliner (or once the board has shifted enough to change the terms). */
function declinedWithoutImprovement(
  state: GameState,
  pid: string,
  terms: TradeTerms,
): boolean {
  const sig = assetSignature(terms);
  for (let i = state.turns.length - 1; i >= 0; i--) {
    const events = state.turns[i].events;
    for (let j = events.length - 1; j >= 0; j--) {
      const e = events[j];
      if (e.kind !== "trade-declined" || e.proposerId !== pid) continue;
      if (assetSignature(e) !== sig) continue;
      const oldCash = e.cashDelta[e.declinedBy] ?? 0;
      const newCash = terms.cashDelta[e.declinedBy] ?? 0;
      return newCash <= oldCash; // not sweetened for the decliner → don't re-pitch
    }
  }
  return false;
}

/** Add the minimal cash sweetener (to whoever's short) that makes `oppId` accept
 *  the base asset moves, or return the base terms unchanged if they already gain.
 *  Returns null if I can't afford the sweetener without going cash-negative. */
function sweetenFor(
  state: GameState,
  pid: string,
  oppId: string,
  base: TradeTerms,
): TradeTerms | null {
  const oppDelta = evaluateTrade(state, oppId, base).delta;
  if (oppDelta >= ACCEPT_MARGIN) return base; // they already want it
  const cash = Math.ceil(ACCEPT_MARGIN - oppDelta);
  const myCash = state.players.find((p) => p.id === pid)?.cash ?? 0;
  if (myCash - cash < 0) return null; // can't fund it in cash (v1: no mortgage-to-fund)
  return { ...base, cashDelta: { [pid]: -cash, [oppId]: cash } };
}

/** Strict proposability check — mirrors the engine's propose validation so a
 *  built offer is NEVER rejected by the route (a rejected drive would stall the
 *  trade-building phase). Requires: every moved lot owned, building-free, and
 *  reassigned to a different active player; cash balances to zero; ≥2 parties;
 *  and — stricter than the engine on purpose — everyone stays cash-non-negative,
 *  so the bot only proposes deals all parties can pay outright. */
function isProposable(state: GameState, terms: TradeTerms): boolean {
  const active = (id: string): boolean => {
    const p = state.players.find((pl) => pl.id === id);
    return p !== undefined && !p.bankrupt;
  };
  let moves = 0;
  for (const [posStr, to] of Object.entries(terms.propertyTo)) {
    const pos = Number(posStr);
    const owner = state.ownership[pos];
    if (!owner || owner === to || !active(to)) return false;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) return false;
    moves += 1;
  }
  if (Object.values(terms.cashDelta).reduce((a, b) => a + b, 0) !== 0) return false;
  if (Object.values(terms.cashDelta).some((v) => v !== 0)) moves += 1;
  if (moves === 0) return false;
  if (tradeParticipants(state, terms).size < 2) return false;
  const after = postTradeState(state, terms);
  return after.players.every((p) => p.cash >= 0);
}

interface Candidate {
  terms: TradeTerms;
  delta: number;
  reason: string;
}

/** The best trade `pid` should propose right now to complete one of its
 *  near-monopolies, or null if none is worth (and acceptable to the other side,
 *  and not a re-pitch of a fresh decline). Considers, per set I'm one lot from:
 *  a mutual-completion swap (each side gets a monopoly) and a cash purchase of
 *  the missing lot. At most one attempt per turn group. */
export function proposeBestTrade(
  state: GameState,
  pid: string,
): { terms: TradeTerms; reason: string } | null {
  if (proposedThisTurn(state, pid)) return null;

  const candidates: Candidate[] = [];

  for (const color of COLORS_BY_WEIGHT) {
    const positions = groupPositions(color);
    if (ownedInColor(state, pid, color) !== positions.length - 1) continue;
    const missing = positions.find((pos) => state.ownership[pos] !== pid);
    if (missing === undefined) continue;
    const oppId = state.ownership[missing];
    if (!oppId || oppId === pid) continue; // unowned → just buy it
    if (builtLotsInGroup(missing, (p) => developmentLevel(state, p)).length > 0) continue;

    const consider = (base: TradeTerms, reason: string): void => {
      const terms = sweetenFor(state, pid, oppId, base);
      if (terms !== null) candidates.push({ terms, delta: 0, reason });
    };

    // Offer A — mutual completion: a color where the opponent is one lot short
    // and I hold the lot they need. Both sides walk away with a monopoly.
    for (const d of COLORS_BY_WEIGHT) {
      if (d === color) continue;
      const dPos = groupPositions(d);
      if (ownedInColor(state, oppId, d) !== dPos.length - 1) continue;
      const oppMissing = dPos.find((pos) => state.ownership[pos] !== oppId);
      if (oppMissing === undefined || state.ownership[oppMissing] !== pid) continue;
      if (builtLotsInGroup(oppMissing, (p) => developmentLevel(state, p)).length > 0) continue;
      consider(
        { propertyTo: { [missing]: pid, [oppMissing]: oppId }, gojfTo: {}, cashDelta: {} },
        `Proposing a swap — my ${colorName(d)} lot for ${spaceName(missing)}, so we each complete a monopoly.`,
      );
    }

    // Offer B — cash for the missing lot.
    consider(
      { propertyTo: { [missing]: pid }, gojfTo: {}, cashDelta: {} },
      `Offering cash for ${spaceName(missing)} to complete my ${colorName(color)} monopoly.`,
    );
  }

  let best: Candidate | null = null;
  for (const cand of candidates) {
    if (!isProposable(state, cand.terms)) continue;
    const mine = evaluateTrade(state, pid, cand.terms);
    if (!mine.accept) continue;
    // Counterparty model: every other named party must plausibly accept too.
    const others = [...tradeParticipants(state, cand.terms)].filter((id) => id !== pid);
    if (!others.every((id) => evaluateTrade(state, id, cand.terms).accept)) continue;
    if (declinedWithoutImprovement(state, pid, cand.terms)) continue;
    if (best === null || mine.delta > best.delta) {
      best = { ...cand, delta: mine.delta };
    }
  }
  return best === null ? null : { terms: best.terms, reason: best.reason };
}
