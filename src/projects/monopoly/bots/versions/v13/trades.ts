import { builtLotsInGroup, colorAt, developmentLevel, groupPositions } from "../../../development";
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
// v13 SNAPSHOT — fork of the champion v5's `trades.ts` (see EVOLUTION.md). v5's
// trade-to-deny construction is carried VERBATIM; v13 adds ONE standings-keyed
// lever on the SELLER/APPROVER side — the ANTI-KINGMAKER rule.
//
// v13 HYPOTHESIS: "shaping the board against whoever is closest to winning transfers
// win share." Every prior denial lever (v5–v11) is PROPOSER-side — it acts when the
// bot constructs a trade. The untouched surface is the bot's own ACCEPTANCE vote:
// v5 prices handing ANY rival a new monopoly at a flat `RIVAL_THREAT_FACTOR×bonus`,
// blind to WHO that rival is. v13 scales that threat by the recipient's STANDING —
// `kingmakerWeight`: be more loath to feed the bot's STRONGEST opponent (the leader /
// a close pursuer, weight → `KM_HI`), more willing to feed a harmless TRAILER (weight
// → `KM_LO`). Whether the bot leads or trails, the strongest opponent is the real
// threat to its win; refusing to be that rival's kingmaker is a negative-sum move
// keyed off the WHOLE board's standings, not a single set.
//
// SCOPE (mirrors v5's discipline): the weight is applied ONLY to the bot's own
// incoming-trade vote (`evaluateTrade` called with `kingmakerThreatCost`). The
// COUNTERPARTY MODEL and CONSTRUCTION keep the FLAT `rivalThreatCost` — modeling a
// v2/v3/v5 opponent (which has no anti-kingmaker logic) with the weighted threat
// would mis-predict their acceptances and distort the bot's own proposals. So
// construction is byte-for-byte v5; only WHICH incoming offers the bot accepts moves.
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

/** v13 ANTI-KINGMAKER weights: the multiplier on the flat rival-monopoly threat for
 *  the bot's STRONGEST opponent (`KM_HI` — extra loath to feed the real threat) and
 *  its WEAKEST (`KM_LO` — a harmless trailer is cheaper to feed, and feeding it can
 *  pressure the leader). Centred so a mid-field rival lands near v5's 1.0; the spread
 *  is deliberately modest — the lever reprioritizes WHICH rival to starve, it doesn't
 *  blanket-refuse trades (v9's over-caution lesson). */
const KM_LO = 0.6;
const KM_HI = 1.4;

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

/** The rival-monopoly threat THIS trade creates, as a per-opponent share `pid` is
 *  responsible for — v3's N-way generalization of v2's flat per-seller premium. A
 *  new monopoly is ONE denial premium (`RIVAL_THREAT_FACTOR` × its bonus); when
 *  several sellers each hand a rival a lot of the same completing set, that single
 *  premium is SPLIT among them by how many lots each contributed, so `pid` bears
 *  only its own share. With a single contributor that share is the whole premium,
 *  so this reduces EXACTLY to v2. The split is what makes N-way completion viable:
 *  without it a buyer assembling a set from two holdouts is charged the denial
 *  premium twice for one monopoly, which makes every 1-1-1 / two-short completion
 *  permanently unprofitable — the residual deadlock v3 targets. Returned per-opp so
 *  the caller can take the worst (`rivalThreatCost`, v5) or reweight by standing
 *  (`kingmakerThreatCost`, v13). */
function rivalThreatShares(
  state: GameState,
  after: GameState,
  pid: string,
  terms: TradeTerms,
): { opp: string; share: number }[] {
  const shares: { opp: string; share: number }[] = [];
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
    if (share > 0) shares.push({ opp: opp.id, share });
  }
  return shares;
}

/** v5's flat threat: the worst single rival's share, blind to who that rival is.
 *  The DEFAULT for `evaluateTrade`, so construction and the counterparty model are
 *  byte-for-byte v5. */
function rivalThreatCost(
  state: GameState,
  after: GameState,
  pid: string,
  terms: TradeTerms,
): number {
  let worst = 0;
  for (const { share } of rivalThreatShares(state, after, pid, terms)) {
    worst = Math.max(worst, share);
  }
  return Math.round(worst);
}

/** How loath `pid` is to hand `oppId` a new monopoly, as a multiplier on the flat
 *  threat — the ANTI-KINGMAKER weight (v13). Scales LINEARLY with the recipient's
 *  STANDING across the OPPONENT field: the strongest opponent (closest to winning,
 *  the most dangerous to feed) maps to `KM_HI`, the weakest to `KM_LO`, a mid-field
 *  rival to ~1.0 (≈ v5). Keyed off opponents only (not `pid`), so it points at the
 *  real threat whether the bot leads or trails. Degenerate fields — one opponent,
 *  or all opponents level — collapse to 1.0, i.e. exactly v5. */
function kingmakerWeight(state: GameState, pid: string, oppId: string): number {
  const opps = activeOpponents(state, pid);
  if (opps.length < 2) return 1; // no kingmaker dynamics with a single opponent
  let lo = Infinity;
  let hi = -Infinity;
  for (const o of opps) {
    const v = positionValue(state, o.id);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 1) return 1; // a level field is v5
  const frac = (positionValue(state, oppId) - lo) / (hi - lo);
  return KM_LO + (KM_HI - KM_LO) * frac;
}

/** v13's standings-weighted threat: each rival's share scaled by `kingmakerWeight`,
 *  then the worst taken (so the reweighting can change WHICH rival-feed is feared
 *  most). Used ONLY for the bot's own incoming-trade vote — never the counterparty
 *  model. */
export function kingmakerThreatCost(
  state: GameState,
  after: GameState,
  pid: string,
  terms: TradeTerms,
): number {
  let worst = 0;
  for (const { opp, share } of rivalThreatShares(state, after, pid, terms)) {
    worst = Math.max(worst, share * kingmakerWeight(state, pid, opp));
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
  // v13: the threat-pricing function. Defaults to v5's FLAT `rivalThreatCost`, so
  // construction and the counterparty model are exactly v5; the bot's own incoming
  // vote passes `kingmakerThreatCost` to apply the anti-kingmaker standings weight.
  threatFn: (s: GameState, a: GameState, p: string, t: TradeTerms) => number = rivalThreatCost,
): TradeVerdict {
  const after = postTradeState(state, terms);
  const rawDelta = positionValue(after, pid) - positionValue(state, pid);
  const postCash = after.players.find((p) => p.id === pid)?.cash ?? 0;

  const myMono = monopolyGain(state, after, pid);
  const threatCost = threatFn(state, after, pid, terms);
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

/** N-way generalization of `sweetenFor`: pay EVERY seller their break-even on the
 *  base asset moves in one deal, funded by `pid`. Each seller's minimum is
 *  computed independently on the cash-free base — a seller's valuation depends
 *  only on the property moves and ITS OWN cash, and no seller gains a monopoly
 *  from this deal (only `pid` does), so one seller's sweetener never shifts
 *  another's break-even; the per-seller minima compose into one payable trade.
 *  Returns the base unchanged when no seller needs cash, or null if `pid` can't
 *  fund the total in cash without going negative (v3, like v2, has no
 *  mortgage-to-fund path — that's a separate roadmap item). */
function sweetenForAll(
  state: GameState,
  pid: string,
  sellers: readonly string[],
  base: TradeTerms,
): TradeTerms | null {
  const sweeteners: Record<string, number> = {};
  let total = 0;
  for (const sId of sellers) {
    const delta = evaluateTrade(state, sId, base).delta;
    if (delta >= ACCEPT_MARGIN) continue; // already a gain for them, no cash needed
    const cash = Math.ceil(ACCEPT_MARGIN - delta);
    sweeteners[sId] = cash;
    total += cash;
  }
  if (total === 0) return base;
  const myCash = state.players.find((p) => p.id === pid)?.cash ?? 0;
  if (myCash - total < 0) return null; // can't fund it in cash (no mortgage-to-fund)
  return { ...base, cashDelta: { ...sweeteners, [pid]: -total } };
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
export function proposeBestTrade(
  state: GameState,
  pid: string,
): { terms: TradeTerms; reason: string } | null {
  if (proposedThisTurn(state, pid)) return null;

  const candidates: Candidate[] = [];

  for (const color of COLORS_BY_WEIGHT) {
    const positions = groupPositions(color);
    const owned = ownedInColor(state, pid, color);
    // Only complete a set I already have a STAKE in (a near-monopoly); buying a
    // whole color from scratch isn't this engine's job.
    if (owned === 0 || owned === positions.length) continue;

    // Gather every lot I'm missing. Each must be owned by an active opponent and
    // building-free, or the set can't be completed by a trade right now (an
    // unowned lot is a normal buy; a built lot can't be reassigned).
    const missingLots: { pos: number; owner: string }[] = [];
    let tradable = true;
    for (const pos of positions) {
      if (state.ownership[pos] === pid) continue;
      const owner = state.ownership[pos];
      if (!owner || owner === pid) { tradable = false; break; } // unowned → just buy it
      if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
        tradable = false;
        break;
      }
      missingLots.push({ pos, owner });
    }
    if (!tradable || missingLots.length === 0) continue;
    const sellers = new Set(missingLots.map((m) => m.owner));
    const single = missingLots.length === 1 ? missingLots[0] : undefined;

    // Offer A — mutual completion (only when I'm exactly one lot short): a color
    // where the single seller is themselves one short and I hold the lot they
    // need. Both sides walk away with a monopoly, no cash required.
    if (single !== undefined) {
      const oppId = single.owner;
      for (const d of COLORS_BY_WEIGHT) {
        if (d === color) continue;
        const dPos = groupPositions(d);
        if (ownedInColor(state, oppId, d) !== dPos.length - 1) continue;
        const oppMissing = dPos.find((pos) => state.ownership[pos] !== oppId);
        if (oppMissing === undefined || state.ownership[oppMissing] !== pid) continue;
        if (builtLotsInGroup(oppMissing, (p) => developmentLevel(state, p)).length > 0) continue;
        const swap = sweetenFor(
          state,
          pid,
          oppId,
          { propertyTo: { [single.pos]: pid, [oppMissing]: oppId }, gojfTo: {}, cashDelta: {} },
        );
        if (swap !== null) {
          candidates.push({
            terms: swap,
            delta: 0,
            reason: `Proposing a swap — my ${colorName(d)} lot for ${spaceName(single.pos)}, so we each complete a monopoly.`,
          });
        }
      }
    }

    // Offer B — buy EVERY missing lot in one deal, paying each seller their
    // v2-priced break-even. One seller / one lot is v2's "cash for the completer";
    // two-plus missing lots (held by one owner or several) is v3's N-way
    // completion — the shape that closes a 1-1-1 split or a two-short set, which
    // no single 2-way deal can resolve.
    const propertyTo: Record<number, string> = {};
    for (const m of missingLots) propertyTo[m.pos] = pid;
    const buy = sweetenForAll(state, pid, [...sellers], {
      propertyTo,
      gojfTo: {},
      cashDelta: {},
    });
    if (buy !== null) {
      const reason =
        single !== undefined
          ? `Offering cash for ${spaceName(single.pos)} to complete my ${colorName(color)} monopoly.`
          : `Buying the ${missingLots.length.toString()} missing ${colorName(color)} ` +
            `from ${sellers.size === 1 ? "its owner" : `${sellers.size.toString()} owners`} to complete the monopoly.`;
      candidates.push({ terms: buy, delta: 0, reason });
    }
  }

  // Offer C — TRADE-TO-DENY (v5). For each rival one lot short of a set whose
  // last lot sits with a THIRD-PARTY holdout, buy that lot to ME purely to block
  // the completion. It doesn't complete my own set, so its worth is the
  // `DENY_FACTOR` premium on the rival set I'm preventing — the credit
  // `acquisitionValue` applies on a landing/auction denial but construction never
  // did. The rival is NOT a party (only the holdout and I are), so it can't veto
  // its own denial.
  for (const opp of activeOpponents(state, pid)) {
    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      if (ownedInColor(state, opp.id, color) !== positions.length - 1) continue;
      const missing = positions.filter((pos) => state.ownership[pos] !== opp.id);
      if (missing.length !== 1) continue;
      const pos = missing[0];
      const holder = state.ownership[pos];
      // The completer must sit with a third-party holdout (not me, not the rival)
      // and be building-free, or there's nothing for me to buy to deny.
      if (!holder || holder === pid || holder === opp.id) continue;
      if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
      const buy = sweetenFor(state, pid, holder, {
        propertyTo: { [pos]: pid },
        gojfTo: {},
        cashDelta: {},
      });
      if (buy === null) continue;
      const holderName = state.players.find((p) => p.id === holder)?.name ?? "its owner";
      candidates.push({
        terms: buy,
        delta: 0,
        denyBonus: Math.round(monopolyBonus(color) * DENY_FACTOR),
        reason: `Buying ${spaceName(pos)} from ${holderName} to deny ${opp.name} the ${colorName(color)} monopoly.`,
      });
    }
  }

  let best: { cand: Candidate; effective: number } | null = null;
  for (const cand of candidates) {
    if (!isProposable(state, cand.terms)) continue;
    const mine = evaluateTrade(state, pid, cand.terms);
    const denyBonus = cand.denyBonus ?? 0;
    // Denial candidates use the denial-augmented gate (the blocked rival set is
    // worth DENY_FACTOR×bonus to me even though the lot doesn't complete my own
    // set); completion candidates keep v3's standard accept gate. The ranking
    // metric is the same augmented delta for both, so a strong denial can outrank
    // a weak completion and a real completion always outranks an equal denial.
    const effective = mine.delta + denyBonus;
    if (denyBonus > 0 ? effective <= ACCEPT_MIN : !mine.accept) continue;
    // Counterparty model: every other named party must plausibly accept too. The
    // denied rival isn't a party here, so it's never consulted — the asymmetry.
    const others = [...tradeParticipants(state, cand.terms)].filter((id) => id !== pid);
    if (!others.every((id) => evaluateTrade(state, id, cand.terms).accept)) continue;
    if (declinedWithoutImprovement(state, pid, cand.terms)) continue;
    if (best === null || effective > best.effective) {
      best = { cand, effective };
    }
  }
  return best === null ? null : { terms: best.cand.terms, reason: best.cand.reason };
}
