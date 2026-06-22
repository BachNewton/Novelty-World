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

// Import jane-v3's ACTUAL trade evaluation — this is what opponents use to
// decide. By predicting acceptance with THEIR function instead of our own,
// we see the asymmetric surplus: they undervalue the threat of our monopoly
// completion (only 6.25% charge vs our full strategic valuation).
import { evaluateTrade as v3EvaluateTrade } from "./base-trades";
import { sellerDistress, acquisitionValue, DENY_FACTOR } from "./base-valuation";

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
  denyBonus?: number; // value of blocking a rival monopoly
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

      // Predict seller acceptance using jane-v3's ACTUAL evaluateTrade.
      // jane-v3 uses positionValue (no near-monopoly valuation) + only 6.25%
      // rival threat charge. This means jane-v3 opponents will sell properties
      // CHEAPER than our own eval predicts — that gap is the surplus.
      for (const sId of sellers) {
        const v3Verdict = v3EvaluateTrade(state, sId, baseTerms);
        if (v3Verdict.accept) continue; // They'd accept for free!

        // jane-v3's delta is what THEY see. Cash `c` increases their delta by
        // c * (1 + distress * SURVIVAL_FACTOR). Solve for minimum c to clear
        // their ACCEPT_MIN threshold + ACCEPT_MARGIN cushion.
        // v3's constants: ACCEPT_MIN=1, ACCEPT_MARGIN=30, SURVIVAL_FACTOR=2.0
        const distress = sellerDistress(state, sId);
        const relief = 1 + distress * 2.0;
        const gap = 2 - v3Verdict.delta; // ACCEPT_MIN+1 (just above accept threshold)
        const cashNeeded = Math.max(0, Math.ceil(gap / relief));
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
        for (const sId of sellers) {
          const v3Verdict = v3EvaluateTrade(state, sId, baseTerms);
          if (v3Verdict.accept) continue;
          const distress = sellerDistress(state, sId);
          const relief = 1 + distress * 2.0;
          const gap = 2 - v3Verdict.delta;
          const cashNeeded = Math.max(0, Math.ceil(gap / relief));
          cashDelta[sId] = (cashDelta[sId] ?? 0) + cashNeeded;
        }
        cashDelta[pid] = -totalCashNeeded;

        const terms: TradeTerms = { propertyTo, gojfTo: {}, cashDelta };
        if (declinedWithoutImprovement(state, pid, terms)) continue;

        // Score from MY perspective.
        const after = postTradeState(state, terms);
        const myDelta = evalDelta(state, after, pid, myWeights); // after state already includes cash spent

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


    // --- Offer Type 3: Denial Buy (block rival monopoly) ---
    // When a rival is one lot from completing a set, and that lot sits with a
    // THIRD-PARTY holder, we can buy it to block them. The asymmetric surplus:
    // jane-v3's evaluateTrade from the holder's perspective doesn't charge for
    // the rival threat (property goes to US, not the rival), so the holder
    // underprices it. We gain the full DENY_FACTOR value of blocking.
    for (const opp of activeOpponents(state, pid)) {
      for (const color of COLORS_BY_WEIGHT) {
        const positions = groupPositions(color);
        if (ownedInColor(state, opp.id, color) !== positions.length - 1) continue;
        const missing = positions.filter((pos) => state.ownership[pos] !== opp.id);
        if (missing.length !== 1) continue;
        const denyPos = missing[0];
        const holder = state.ownership[denyPos];
        if (!holder || holder === pid || holder === opp.id) continue;
        if (builtLotsInGroup(denyPos, (p) => developmentLevel(state, p)).length > 0) continue;

        // Phantom-denial gate: only deny if the rival could realistically acquire
        // this lot from the holder. Otherwise the rival is already blocked.
        const giveToRival: TradeTerms = { propertyTo: { [denyPos]: opp.id }, gojfTo: {}, cashDelta: {} };
        const holderV3Delta = v3EvaluateTrade(state, holder, giveToRival).delta;
        const rivalNeed = Math.max(0, Math.ceil(31 - holderV3Delta));
        const rival = state.players.find((p) => p.id === opp.id);
        if ((rival?.cash ?? 0) < rivalNeed) continue; // rival can't afford it
        if (acquisitionValue(state, opp.id, denyPos) - rivalNeed < 1) continue; // not worth it to rival

        // We buy the lot from the holder. Use jane-v3's evaluateTrade to predict
        // what the holder will accept.
        const giveToMe: TradeTerms = { propertyTo: { [denyPos]: pid }, gojfTo: {}, cashDelta: {} };
        const holderAcceptMe = v3EvaluateTrade(state, holder, giveToMe);
        if (holderAcceptMe.accept) {
          // Holder would give it for free — pure surplus!
          if (declinedWithoutImprovement(state, pid, giveToMe)) continue;
          candidates.push({
            terms: giveToMe, myDelta: 0, opponentId: holder, opponentDelta: 0,
            denyBonus: Math.round(monopolyBonus(color) * DENY_FACTOR),
            reason: `Buying ${spaceName(denyPos)} to deny ${opp.name ?? "rival"} the ${colorName(color)} monopoly.`,
          });
          continue;
        }
        // Sweeten with cash — holder needs (ACCEPT_MIN + ACCEPT_MARGIN - delta) / relief
        const distress = sellerDistress(state, holder);
        const relief = 1 + distress * 2.0;
        const gap = 2 - holderAcceptMe.delta; // just above ACCEPT_MIN
        const cashNeeded = Math.max(0, Math.ceil(gap / relief));
        if (myCash - cashNeeded < 0) continue;
        const denyTerms: TradeTerms = {
          propertyTo: { [denyPos]: pid },
          gojfTo: {},
          cashDelta: { [pid]: -cashNeeded, [holder]: cashNeeded },
        };
        if (declinedWithoutImprovement(state, pid, denyTerms)) continue;

        // Score from our perspective — the denyBonus is the value of blocking.
        const denyMyDelta = evalDelta(state, postTradeState(state, denyTerms), pid, DEFAULT_WEIGHTS);
        candidates.push({
          terms: denyTerms, myDelta: denyMyDelta, opponentId: holder, opponentDelta: 0,
          denyBonus: Math.round(monopolyBonus(color) * DENY_FACTOR),
          reason: `Buying ${spaceName(denyPos)} from holder to deny ${opp.name ?? "rival"} the ${colorName(color)} monopoly.`,
        });
      }
    }

    if (candidates.length === 0) return null;

    // Pick the trade that maximizes OUR effective surplus (myDelta + denyBonus).
    candidates.sort((a, b) => (b.myDelta + (b.denyBonus ?? 0)) - (a.myDelta + (a.denyBonus ?? 0)));
    const best = candidates[0];
    return { terms: best.terms, reason: best.reason };
  }
}
