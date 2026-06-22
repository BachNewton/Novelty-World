// ===========================================================================
// trade-v1 TRADE ENGINE — enumerate, score, propose, learn.
//
// Kyle's design: "apply [eval] to many different trade options from the
// perspective of many different players. Then we can propose trades and KEY
// HERE, we learn going forward what trades are approved and rejected."
//
// The engine:
//   1. ENUMERATE all plausible trade rearrangements (property swaps, cash deals)
//   2. SCORE each from OUR perspective (using our default weights) and from the
//      OPPONENT's perspective (using learned weights from the OpponentModel)
//   3. PROPOSE trades where our_delta > 0 AND opponent would accept (their
//      modeled delta ≥ their threshold) — extracting maximum surplus
//   4. ACCEPT incoming trades using the same eval (do I gain?) + learning from
//      the opponent's proposal to refine our model of them
//   5. LEARN from every accept/reject to calibrate opponent weights
//
// This replaces v3's three rigid offer types (swap/buy/deny) with a single
// unified system: enumerate rearrangements, score them, propose the best.
// ===========================================================================
import { projectTrade, tradeParticipants } from "../../../engine";
import { builtLotsInGroup, colorAt, developmentLevel, groupPositions } from "../../../development";
import { hasMonopoly } from "../../../logic";
import type { GameState, TradeTerms } from "../../../types";
import {
  COLORS_BY_WEIGHT,
  activeOpponents,
  colorName,
  evaluate,
  evalDelta,
  monopolyBonus,
  ownedInColor,
  spaceName,
  DEFAULT_WEIGHTS,
  type EvalWeights,
} from "./eval";
import { OpponentModel } from "./opponent-model";

/** The post-trade state projection (ownership + cash deltas). */
function postTradeState(state: GameState, terms: TradeTerms): GameState {
  const proj = projectTrade(state, terms);
  return {
    ...state,
    ownership: proj.ownership,
    jailFreeCards: proj.jailFreeCards,
    players: state.players.map((p) => ({
      ...p,
      cash: proj.cashById[p.id] ?? p.cash,
    })),
  };
}

/** Stable signature of a trade's asset moves (cash excluded). */
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

/** Has `pid` already proposed a trade this turn group? */
function proposedThisTurn(state: GameState, pid: string): boolean {
  const turn = state.turns[state.turns.length - 1];
  if (!turn) return false;
  return turn.events.some(
    (e) => (e.kind === "trade" || e.kind === "trade-declined") && e.proposerId === pid,
  );
}

/** Did `pid` propose this exact asset signature before and get declined without
 *  sweetening? Prevents re-pitching stale offers. */
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
      return newCash <= oldCash;
    }
  }
  return false;
}

interface TradeCandidate {
  terms: TradeTerms;
  myDelta: number;
  opponentId: string;
  opponentDelta: number; // what we PREDICT they value it at
  reason: string;
}

/** The trade engine — stateful (holds the OpponentModel). One instance per game. */
export class TradeEngine {
  private model: OpponentModel;

  constructor(model?: OpponentModel) {
    this.model = model ?? new OpponentModel();
  }

  /** Evaluate an incoming trade offer from `pid`'s seat. Uses OUR default
   *  weights — we always know our own valuation. Returns accept/deny + reason. */
  evaluateIncoming(
    state: GameState,
    pid: string,
    terms: TradeTerms,
  ): { accept: boolean; delta: number; reason: string } {
    const after = postTradeState(state, terms);
    const delta = evalDelta(state, after, pid, DEFAULT_WEIGHTS);

    // Factor in the threat of rival monopolies this trade might create.
    let threatCost = 0;
    for (const opp of activeOpponents(state, pid)) {
      for (const color of COLORS_BY_WEIGHT) {
        if (hasMonopoly(after, color, opp.id) && !hasMonopoly(state, color, opp.id)) {
          threatCost += monopolyBonus(color) * 0.0625;
        }
      }
    }
    const effectiveDelta = delta - threatCost;

    if (effectiveDelta <= 0) {
      return {
        accept: false,
        delta: effectiveDelta,
        reason: threatCost > 0
          ? "the rival monopoly it creates outweighs what I gain"
          : "it doesn't improve my position",
      };
    }

    // Don't go cash-negative unless transformative.
    const postCash = after.players.find((p) => p.id === pid)?.cash ?? 0;
    if (postCash < 0 && effectiveDelta < 250) {
      return { accept: false, delta: effectiveDelta, reason: "it would leave me short of cash" };
    }

    return {
      accept: true,
      delta: effectiveDelta,
      reason: "it improves my position value",
    };
  }

  /** Record an observation when a trade is accepted or rejected. This is the
   *  LEARNING LOOP — each data point calibrates our model of the deciding player. */
  observe(
    playerId: string,
    terms: TradeTerms,
    accepted: boolean,
    state: GameState,
  ): void {
    const after = postTradeState(state, terms);
    const weights = this.model.getWeights(playerId);
    const predictedDelta = evalDelta(state, after, playerId, weights);
    const turn = state.turns.length;
    this.model.observe(playerId, terms, accepted, predictedDelta, turn);
  }

  /** Enumerate plausible trade rearrangements and find the best one to propose.
   *
   *  For each near-monopoly I hold a stake in:
   *    - Generate the "buy missing lots" trade (from 1+ sellers)
   *    - Score it from my perspective AND each seller's perspective
   *    - Sweeten cash until the opponent's modeled eval says they'd accept
   *    - Keep only trades where MY net delta is positive (I'm extracting surplus)
   *
   *  Also considers: mutual swaps, and denial buys (blocking rival monopolies).
   */
  proposeBestTrade(
    state: GameState,
    pid: string,
  ): { terms: TradeTerms; reason: string } | null {
    if (proposedThisTurn(state, pid)) return null;

    const candidates: TradeCandidate[] = [];
    const myCash = state.players.find((p) => p.id === pid)?.cash ?? 0;
    const myWeights = DEFAULT_WEIGHTS; // We always know our own valuation.

    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      const owned = ownedInColor(state, pid, color);
      if (owned === 0 || owned === positions.length) continue;

      // Gather every missing lot.
      const missingLots: { pos: number; owner: string }[] = [];
      let tradable = true;
      for (const pos of positions) {
        if (state.ownership[pos] === pid) continue;
        const owner = state.ownership[pos];
        if (!owner || owner === pid) { tradable = false; break; }
        if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
          tradable = false;
          break;
        }
        missingLots.push({ pos, owner });
      }
      if (!tradable || missingLots.length === 0) continue;

      // --- Offer Type 1: Buy all missing lots from their owners ---
      const propertyTo: Record<number, string> = {};
      for (const m of missingLots) propertyTo[m.pos] = pid;
      const sellers = [...new Set(missingLots.map((m) => m.owner))];

      // Score from each seller's perspective using learned weights.
      // Find the minimum cash needed so the LEAST willing seller accepts.
      const baseTerms: TradeTerms = { propertyTo, gojfTo: {}, cashDelta: {} };
      let totalCashNeeded = 0;
      let feasible = true;

      for (const sId of sellers) {
        const sellerWeights = this.model.getWeights(sId);
        const afterBase = postTradeState(state, baseTerms);
        const sellerBaseDelta = evalDelta(state, afterBase, sId, sellerWeights);
        const sellerThreshold = sellerWeights.acceptThreshold;

        if (sellerBaseDelta >= sellerThreshold) continue; // they'd take it for free

        // Need to sweeten with cash. But what WE think they need and what THEY
        // actually need may differ — that's the whole point. Use their modeled
        // weights to predict their valuation.
        const gap = sellerThreshold - sellerBaseDelta;
        // The cash sweetener's effect on their eval: each $1 of cash = +1 to their
        // cash component (× cashWeight). So cash needed = gap / cashWeight.
        const cashNeeded = Math.ceil(gap / sellerWeights.cashWeight);
        totalCashNeeded += cashNeeded;

        // Can we afford it?
        if (myCash - totalCashNeeded < 0) {
          feasible = false;
          break;
        }
      }

      if (feasible) {
        // Build the full sweetened terms.
        const cashDelta: Record<string, number> = {};
        let remaining = totalCashNeeded;
        for (const m of missingLots) {
          const sId = m.owner;
          const sellerWeights = this.model.getWeights(sId);
          const afterBase = postTradeState(state, baseTerms);
          const sellerBaseDelta = evalDelta(state, afterBase, sId, sellerWeights);
          if (sellerBaseDelta >= sellerWeights.acceptThreshold) continue;
          const gap = sellerWeights.acceptThreshold - sellerBaseDelta;
          const cashNeeded = Math.ceil(gap / sellerWeights.cashWeight);
          cashDelta[sId] = (cashDelta[sId] ?? 0) + cashNeeded;
        }
        cashDelta[pid] = -totalCashNeeded;

        const terms: TradeTerms = { propertyTo, gojfTo: {}, cashDelta };
        if (declinedWithoutImprovement(state, pid, terms)) continue;

        // Score from MY perspective.
        const after = postTradeState(state, terms);
        const myDelta = evalDelta(state, after, pid, myWeights) - totalCashNeeded; // cash already out

        // Score from the primary seller's perspective.
        const primarySeller = sellers[0];
        const oppWeights = this.model.getWeights(primarySeller);
        const oppDelta = evalDelta(state, after, primarySeller, oppWeights);

        // Only propose if WE gain (positive surplus extraction).
        if (myDelta > 0) {
          const reason =
            missingLots.length === 1
              ? `Offering ${spaceName(missingLots[0].pos)} to complete my ${colorName(color)}.`
              : `Acquiring ${missingLots.length} ${colorName(color)} lots to complete the set.`;
          candidates.push({
            terms, myDelta, opponentId: primarySeller,
            opponentDelta: oppDelta, reason,
          });
        }
      }

      // --- Offer Type 2: Mutual swap (1-for-1 when both complete) ---
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

          const swapTerms: TradeTerms = {
            propertyTo: { [single.pos]: pid, [oppMissing]: oppId },
            gojfTo: {},
            cashDelta: {},
          };
          if (declinedWithoutImprovement(state, pid, swapTerms)) continue;

          const after = postTradeState(state, swapTerms);
          const mySwapDelta = evalDelta(state, after, pid, myWeights);
          const oppSwapWeights = this.model.getWeights(oppId);
          const oppSwapDelta = evalDelta(state, after, oppId, oppSwapWeights);

          if (mySwapDelta > 0 && this.model.wouldAccept(oppId, oppSwapDelta)) {
            candidates.push({
              terms: swapTerms,
              myDelta: mySwapDelta,
              opponentId: oppId,
              opponentDelta: oppSwapDelta,
              reason: `Swapping my ${colorName(d)} for ${spaceName(single.pos)} — both sides complete.`,
            });
          }
        }
      }
    }

    if (candidates.length === 0) return null;

    // Pick the trade that maximizes OUR surplus (myDelta).
    candidates.sort((a, b) => b.myDelta - a.myDelta);
    const best = candidates[0];
    return { terms: best.terms, reason: best.reason };
  }
}
