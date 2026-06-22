// ===========================================================================
// jane-v2 SNAPSHOT — fork of jane-v1's trades.ts (see EVOLUTION.md).
// One constant changed from jane-v1: SURVIVAL_FACTOR 0.4→1.5 — each dollar of
// cash is worth up to $2.50 in positionValue to a fully distressed seller.
// The phantom-denial gate from v14 is carried verbatim.
// ===========================================================================
import { projectTrade, tradeParticipants } from "../../../engine";
import { builtLotsInGroup, colorAt, developmentLevel, groupPositions } from "../../../development";
import { hasMonopoly } from "../../../logic";
import type { GameState, TradeTerms } from "../../../types";
import {
  acquisitionValue,
  activeOpponents,
  colorName,
  COLORS_BY_WEIGHT,
  DENY_FACTOR,
  monopolyBonus,
  ownedInColor,
  positionValue,
  sellerDistress,
  spaceName,
} from "./valuation";

// ===========================================================================
// v28 SNAPSHOT — fork of v17 (the champion; see EVOLUTION.md).
// v28 adds DESPERATION-PRICING to the trade engine: a distressed seller values
// incoming cash above face value (survival bonus), so construction needs less
// sweetening to clear their break-even — the buyer acquires set-completers at a
// DISCOUNT. The phantom-denial gate from v14 is carried verbatim. — fork of the champion v5's `trades.ts` (see EVOLUTION.md). v5's
// trade-to-deny construction is carried VERBATIM except ONE correctness gate that
// fixes a PHANTOM-DENIAL bug (live-game Finding 1).
//
// THE BUG: v5's Offer C books the denial premium (`DENY_FACTOR×bonus`) for buying a
// rival's set-completer from a third-party holdout, gated ONLY on the rival owning
// N-1 of the set — never on whether the rival can ACTUALLY ACQUIRE the last lot. When
// the completer already sits with a non-rival (e.g. another claude bot, which prices
// `RIVAL_THREAT_FACTOR` and won't hand the rival a monopoly), the rival is ALREADY
// blocked: the marginal denial of moving the lot holdout→me is ~zero, yet each bot
// independently re-books the full premium, so a weak lot (brown: round(84×0.6)=$50,
// above the ~$30 net cost of a hop) HOT-POTATOES forever (observed: Baltic traded 29×
// in a perfect bot→bot ring, net-zero cash, zero progress). The existing guards
// (`proposedThisTurn`, `declinedWithoutImprovement`) only stop re-pitched DECLINES,
// not an accepted no-progress cycle.
//
// THE FIX (`rivalCanAcquire`): gate Offer C on the rival's ACTUAL ability to acquire
// the completer now. The rival could only get it by paying the holder's
// threat-adjusted break-even, and would only BOTHER if completing the set is
// comfortably worth that cost. For a weak set the rival's own gain barely exceeds
// (or trails) the price, so it never would — the denial is phantom; for a strong set
// the rival clearly would, so the denial is real and still fires. This also restores
// v5's STATED intent ("weak sets self-gate"), which the flat premium violated.
//
// Everything else is v5 verbatim: `evaluateTrade`, completion search, the
// counterparty model, the incoming vote, and the denial pricing for sets that DO
// pass the gate. `acquisitionValue`'s landing/auction deny is already reachability-
// gated (it only fires on an UNOWNED lot, which is open-market reachable), so it is
// untouched.
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

/** v28: How much extra value each dollar of cash carries for a fully distressed
 *  seller (survival value beyond face). 0.4 means each dollar of cash is worth
 *  $1.40 in positionValue to a seller on the brink — they'd sell a lot worth
 *  $100 in positionValue for ~$72 in cash. */
const SURVIVAL_FACTOR = 1.5;

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

/** What `pid` should price for the rival monopolies THIS trade creates — v3's
 *  N-way generalization of v2's flat per-seller premium. A new monopoly is ONE
 *  denial premium (`RIVAL_THREAT_FACTOR` × its bonus); when several sellers each
 *  hand a rival a lot of the same completing set, that single premium is SPLIT
 *  among them by how many lots each contributed, so `pid` bears only its own
 *  share. With a single contributor that share is the whole premium, so this
 *  reduces EXACTLY to v2. The split is what makes N-way completion viable: without
 *  it a buyer assembling a set from two holdouts is charged the denial premium
 *  twice for one monopoly, which makes every 1-1-1 / two-short completion
 *  permanently unprofitable — the residual deadlock v3 targets. The worst single
 *  rival is the threat, mirroring v2's `max` over rivals. */
function rivalThreatCost(
  state: GameState,
  after: GameState,
  pid: string,
  terms: TradeTerms,
): number {
  let worst = 0;
  for (const opp of activeOpponents(state, pid)) {
    let share = 0;
    for (const color of COLORS_BY_WEIGHT) {
      if (!hasMonopoly(after, color, opp.id) || hasMonopoly(state, color, opp.id)) continue;
      let received = 0;
      let fromPid = 0;
      for (const [posStr, to] of Object.entries(terms.propertyTo)) {
        const pos = Number(posStr);
        if (to !== opp.id || colorAt(pos) !== color) continue;
        received += 1;
        if (state.ownership[pos] === pid) fromPid += 1;
      }
      if (received === 0) continue; // rival completed it without my lots — not my threat
      share += monopolyBonus(color) * RIVAL_THREAT_FACTOR * (fromPid / received);
    }
    worst = Math.max(worst, share);
  }
  return Math.round(worst);
}

/** Evaluate `terms` from `pid`'s seat: accept iff it raises my position value
 *  NET of the priced rival-monopoly threat, and doesn't leave me cash-negative
 *  (unless the gain is transformative). The same function models the
 *  counterparty during construction and answers incoming offers.
 *
 *  The rival-monopoly threat is PRICED into `delta`, not vetoed: handing the
 *  strongest rival a new monopoly subtracts a `RIVAL_THREAT_FACTOR` premium from
 *  my valuation, so I'll still make the deal when the cash on the table outweighs
 *  it. v3 apportions that premium across the sellers who jointly hand it over
 *  (see `rivalThreatCost`); for a single-seller deal it's v2's full premium. */
export function evaluateTrade(
  state: GameState,
  pid: string,
  terms: TradeTerms,
): TradeVerdict {
  const after = postTradeState(state, terms);
  const rawDelta = positionValue(after, pid) - positionValue(state, pid);
  const postCash = after.players.find((p) => p.id === pid)?.cash ?? 0;

  const myMono = monopolyGain(state, after, pid);
  const threatCost = rivalThreatCost(state, after, pid, terms);
  const delta = rawDelta - threatCost;

  // v28: DESPERATION-PRICING — a distressed seller values incoming cash above
  //  face value because it defers forced liquidation at half-price. Each dollar
  //  of cash received carries a survival bonus proportional to distress.
  const cashIn = (terms.cashDelta[pid] ?? 0) > 0 ? (terms.cashDelta[pid] ?? 0) : 0;
  const effectiveDelta = cashIn > 0
    ? delta + Math.round(cashIn * sellerDistress(state, pid) * SURVIVAL_FACTOR)
    : delta;

  if (effectiveDelta <= ACCEPT_MIN) {
    return {
      accept: false,
      delta: effectiveDelta,
      reason:
        threatCost > 0
          ? "the rival monopoly it creates outweighs what I get"
          : "it doesn't improve my position",
    };
  }
  if (postCash < 0 && effectiveDelta < LIQUIDITY_RISK_GAIN) {
    return { accept: false, delta: effectiveDelta, reason: "it would leave me short of cash" };
  }
  const reason =
    myMono > 0
      ? "it completes a monopoly for me"
      : threatCost > 0
        ? "the cash outweighs the monopoly I'm handing over"
        : "it nets me real value";
  return { accept: true, delta: effectiveDelta, reason };
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

/** v14 — could `rivalId` REALISTICALLY acquire `pos` (the completer of a set it's
 *  one lot short of) from its current `holder` right now? The denial premium is only
 *  real if the answer is yes; otherwise the rival is already blocked and a denial buy
 *  is a phantom relocation among non-rivals (Finding 1). The rival's only route is to
 *  pay the holder its threat-adjusted break-even (the same sweetening the rival's own
 *  completion Offer B would compute), and it would only do so if it can AFFORD it AND
 *  completing the set is comfortably worth that cost. Weak sets fail the second test
 *  (the rival's own gain barely clears the price), which is what self-gates the brown
 *  hot-potato; strong sets pass, so real denials still fire. */
function rivalCanAcquire(
  state: GameState,
  rivalId: string,
  pos: number,
  holder: string,
): boolean {
  // What the holder would need, in cash, to part with `pos` to the rival: enough to
  // clear its break-even (which prices the rival-monopoly it would be handing over)
  // by ACCEPT_MARGIN — exactly the rival's own Offer B sweetening.
  const giveToRival: TradeTerms = { propertyTo: { [pos]: rivalId }, gojfTo: {}, cashDelta: {} };
  const holderDelta = evaluateTrade(state, holder, giveToRival).delta;
  const need = Math.ceil(ACCEPT_MARGIN - holderDelta);
  const rival = state.players.find((p) => p.id === rivalId);
  if ((rival?.cash ?? 0) < need) return false; // can't fund the extraction in cash
  // ...and only bothers if completing the set is comfortably worth that outlay.
  return acquisitionValue(state, rivalId, pos) - need >= ACCEPT_MARGIN;
}

interface Candidate {
  terms: TradeTerms;
  delta: number;
  reason: string;
  /** For a denial candidate (v5): the `DENY_FACTOR` premium on the rival set this
   *  trade blocks. Added to the proposer's plain delta in its go/no-go (and in the
   *  best-candidate ranking), because the lot doesn't complete my own set so plain
   *  `evaluateTrade` would never accept it. Zero/absent for completion candidates,
   *  which keep v3's standard accept gate. */
  denyBonus?: number;
}

/** The best trade `pid` should propose right now — to COMPLETE one of its
 *  near-monopolies, or (v5) to DENY a rival theirs — or null if none is worth
 *  (and acceptable to every other party, and not a re-pitch of a fresh decline).
 *  Considers, per color I hold a stake in: a mutual-completion swap (only when I'm
 *  exactly one lot short and the seller is too — each side gets a monopoly), and a
 *  single N-party purchase of EVERY lot I'm missing (from one owner or several),
 *  which closes the 1-1-1 / two-short boards no 2-way deal can; and, per rival one
 *  lot short of a set whose completer sits with a third-party holdout, a denial buy
 *  of that lot (Offer C). At most one attempt per turn group; the highest
 *  denial-augmented delta wins. */

// ─── Observation-based sweetening helpers ────────────────────────────────────

import { OpponentModel } from "./opponent-model";

/**
 * Add cash to make a trade acceptable to a specific opponent, based on our
 * OpponentModel of their threshold. We compute OUR positionValue delta for
 * THEM, then add cash until it exceeds their learned threshold.
 */
function sweetenForOpponent(
  state: GameState,
  pid: string,
  oppId: string,
  baseTerms: TradeTerms,
  model: OpponentModel,
): TradeTerms | null {
  const after = postTradeState(state, baseTerms);
  const oppDelta = positionValue(after, oppId) - positionValue(state, oppId);
  const threshold = model.getThreshold(oppId);
  if (oppDelta >= threshold) return baseTerms;
  const gap = threshold - oppDelta;
  if (gap <= 0) return baseTerms;
  const myCash = state.players.find((p) => p.id === pid)?.cash ?? 0;
  if (myCash < gap) return null;
  return {
    ...baseTerms,
    cashDelta: {
      ...baseTerms.cashDelta,
      [pid]: (baseTerms.cashDelta[pid] ?? 0) - gap,
      [oppId]: (baseTerms.cashDelta[oppId] ?? 0) + gap,
    },
  };
}

function sweetenForAllOpponents(
  state: GameState,
  pid: string,
  sellers: string[],
  baseTerms: TradeTerms,
  model: OpponentModel,
): TradeTerms | null {
  let terms: TradeTerms | null = { ...baseTerms, cashDelta: { ...baseTerms.cashDelta } };
  for (const sId of sellers) {
    terms = sweetenForOpponent(state, pid, sId, terms!, model);
    if (terms === null) return null;
  }
  return terms;
}

// ─── Observation-based proposeBestTrade ──────────────────────────────────────

export function proposeBestTrade(
  state: GameState,
  pid: string,
): { terms: TradeTerms; reason: string } | null {
  if (proposedThisTurn(state, pid)) return null;

  const model = new OpponentModel();
  model.reconstruct(state, pid);

  const candidates: Candidate[] = [];

  for (const color of COLORS_BY_WEIGHT) {
    const positions = groupPositions(color);
    const owned = ownedInColor(state, pid, color);
    if (owned === 0 || owned === positions.length) continue;

    const missingLots: { pos: number; owner: string }[] = [];
    let tradable = true;
    for (const pos of positions) {
      if (state.ownership[pos] === pid) continue;
      const owner = state.ownership[pos];
      if (!owner || owner === pid) { tradable = false; break; }
      if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
        tradable = false; break;
      }
      missingLots.push({ pos, owner });
    }
    if (!tradable || missingLots.length === 0) continue;

    if (missingLots.length === 1) {
      const single = missingLots[0];
      const oppId = single.owner;
      for (const d of COLORS_BY_WEIGHT) {
        if (d === color) continue;
        const dPos = groupPositions(d);
        if (ownedInColor(state, oppId, d) !== dPos.length - 1) continue;
        const oppMissing = dPos.find((pos) => state.ownership[pos] !== oppId);
        if (oppMissing === undefined || state.ownership[oppMissing] !== pid) continue;
        if (builtLotsInGroup(oppMissing, (p) => developmentLevel(state, p)).length > 0) continue;
        const swapBase: TradeTerms = {
          propertyTo: { [single.pos]: pid, [oppMissing]: oppId }, gojfTo: {}, cashDelta: {},
        };
        const swap = sweetenForOpponent(state, pid, oppId, swapBase, model);
        if (swap !== null && isProposable(state, swap)) {
          const mine = evaluateTrade(state, pid, swap);
          if (mine.accept) {
            candidates.push({ terms: swap, delta: mine.delta,
              reason: `Swapping my ${colorName(d)} for ${spaceName(single.pos)} — both complete a monopoly.` });
          }
        }
      }
    }

    const propertyTo: Record<number, string> = {};
    for (const m of missingLots) propertyTo[m.pos] = pid;
    const sellers = [...new Set(missingLots.map((m) => m.owner))];
    const buyBase: TradeTerms = { propertyTo, gojfTo: {}, cashDelta: {} };
    const buy = sweetenForAllOpponents(state, pid, sellers, buyBase, model);
    if (buy !== null && isProposable(state, buy)) {
      const mine = evaluateTrade(state, pid, buy);
      if (mine.accept) {
        const reason = missingLots.length === 1
          ? `Buying ${spaceName(missingLots[0].pos)} to complete my ${colorName(color)} monopoly.`
          : `Buying ${missingLots.length} ${colorName(color)} lots to complete the set.`;
        candidates.push({ terms: buy, delta: mine.delta, reason });
      }
    }
  }

  for (const opp of activeOpponents(state, pid)) {
    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      if (ownedInColor(state, opp.id, color) !== positions.length - 1) continue;
      const missing = positions.filter((pos) => state.ownership[pos] !== opp.id);
      if (missing.length !== 1) continue;
      const pos = missing[0];
      const holder = state.ownership[pos];
      if (!holder || holder === pid || holder === opp.id) continue;
      if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
      if (!rivalCanAcquire(state, opp.id, pos, holder)) continue;
      const denyBase: TradeTerms = { propertyTo: { [pos]: pid }, gojfTo: {}, cashDelta: {} };
      const deny = sweetenForOpponent(state, pid, holder, denyBase, model);
      if (deny !== null && isProposable(state, deny)) {
        const mine = evaluateTrade(state, pid, deny);
        candidates.push({ terms: deny, delta: mine.delta,
          denyBonus: Math.round(monopolyBonus(color) * DENY_FACTOR),
          reason: `Buying ${spaceName(pos)} to deny ${opp.name} the ${colorName(color)} monopoly.` });
      }
    }
  }

  let best: { cand: Candidate; effective: number } | null = null;
  for (const cand of candidates) {
    if (declinedWithoutImprovement(state, pid, cand.terms)) continue;
    const denyBonus = cand.denyBonus ?? 0;
    const effective = cand.delta + denyBonus;
    if (effective <= ACCEPT_MIN) continue;
    const others = [...tradeParticipants(state, cand.terms)].filter((id) => id !== pid);
    let allAccept = true;
    for (const oppId of others) {
      const after = postTradeState(state, cand.terms);
      const oppDelta = positionValue(after, oppId) - positionValue(state, oppId);
      if (!model.wouldAccept(oppId, oppDelta)) { allAccept = false; break; }
    }
    if (!allAccept) continue;
    if (best === null || effective > best.effective) {
      best = { cand, effective };
    }
  }
  return best === null ? null : { terms: best.cand.terms, reason: best.cand.reason };
}
