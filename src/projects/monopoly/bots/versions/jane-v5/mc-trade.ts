// ===========================================================================
// MC Trade Proposal enumeration: enumerate all valid trade proposals the
// player could make, simulate each via MC rollouts, pick the best.
//
// The trade proposal space is finite:
//   - For each property I own: give it to any other player (or keep)
//   - For each property opponents own: receive it (or not)
//   - Cash adjustments between players
//   - Get Out of Jail Free card transfers
//
// In practice jane-v3's proposeBestTrade already generates candidate trades.
// We enumerate: proposeBestTrade's best offer, a sweetened version (more cash),
// and no-trade. For each, MC rollouts determine the expected outcome.
//
// This could be expanded to enumerate ALL valid trades, but the space is
// much larger than building. For now we use jane-v3's candidate generation
// + MC selection, which is a practical middle ground.
// ===========================================================================

import { apply, autoStep, netWorth } from "../../../engine";
import { driveOp, type BotResolver } from "../../../pacing";
import { janeV3Bot } from "../jane-v3";
import { proposeBestTrade } from "../jane-v3/trades";
import type { BotDecision } from "../../decision";
import type { GameState, Intent, TradeTerms } from "../../../types";

const ROLLOUTS_PER_ACTION = 10;
const MAX_ROLLOUT_TURNS = 80;

/** One candidate trade for MC evaluation. */
interface TradeCandidate {
  intent: Intent;
  label: string;
}

// -----------------------------------------------------------------------
// Rollout (shared logic)
// -----------------------------------------------------------------------

function rollout(state: GameState, myId: string, maxTurns: number): number {
  let s = state;
  const botFor: BotResolver = () => janeV3Bot;
  const startTurn = s.turns[s.turns.length - 1].turn;
  let steps = 0;
  const maxSteps = maxTurns * 10;

  while (s.status === "active" && steps < maxSteps) {
    const turnNo = s.turns[s.turns.length - 1].turn;
    if (turnNo - startTurn > maxTurns) break;

    const op = driveOp(s, true, null, botFor);
    if (op === null) break;

    if (op.kind === "step") {
      const result = autoStep(s);
      if (result.state === s) break;
      s = result.state;
    } else {
      const result = apply(s, op.intent);
      if (!result.ok) break;
      s = result.state;
    }
    steps++;
  }

  if (s.status === "finished") {
    for (let i = s.turns.length - 1; i >= 0; i--) {
      const events = s.turns[i].events;
      for (let j = events.length - 1; j >= 0; j--) {
        const e = events[j];
        if (e.kind === "winner" && "winnerId" in e) {
          return e.winnerId === myId ? 1.0 : 0.0;
        }
      }
    }
    return 0.5;
  }

  const me = s.players.find((p) => p.id === myId);
  if (me?.bankrupt) return 0.0;

  const myWorth = netWorth(s, myId);
  let maxOpp = -Infinity;
  let oppAlive = false;
  for (const p of s.players) {
    if (p.id === myId || p.bankrupt) continue;
    oppAlive = true;
    const w = netWorth(s, p.id);
    if (w > maxOpp) maxOpp = w;
  }
  if (!oppAlive) return 1.0;
  if (myWorth > maxOpp * 1.15) return 0.85;
  if (myWorth > maxOpp) return 0.65;
  if (myWorth < maxOpp * 0.85) return 0.15;
  return 0.4;
}

/** Monte Carlo trade proposal: evaluate jane-v3's best trade vs not trading
 *  vs a sweetened version, simulate each via rollouts, pick the best.
 *
 *  NOTE: The full enumeration of ALL valid trades is computationally
 *  expensive (the trade space is much larger than building). This version
 *  uses jane-v3's candidate generation + MC selection. A future version
 *  could enumerate more trade candidates if the engine is fast enough.
 *
 *  Returns null to fall back to jane-v3's heuristic. */
export function monteCarloTradeProposal(
  state: GameState,
  pid: string,
): BotDecision | null {
  if (state.turn.phase !== "trade-building") return null;

  const draft = state.turn.tradeDraft;
  if (!draft || draft.proposerId !== pid) return null;

  // Get jane-v3's best trade proposal
  const proposal = proposeBestTrade(state, pid);

  // Build candidate actions
  const candidates: TradeCandidate[] = [];

  // Option 0: No trade (pass / cancel the trade draft)
  candidates.push({
    intent: { kind: "bot-note", playerId: pid, text: "MC trade: no trade" },
    label: "no-trade",
  });

  if (proposal) {
    const terms = proposal.terms;

    // Option 1: Propose jane-v3's best trade
    if (JSON.stringify(draft.terms) === JSON.stringify(terms)) {
      candidates.push({
        intent: { kind: "propose-trade", playerId: pid },
        label: "v3-trade",
      });
    } else {
      candidates.push({
        intent: { kind: "update-trade-draft", playerId: pid, terms },
        label: "v3-trade",
      });
    }

    // Option 2: Sweetened version (add more cash from me to increase
    // acceptance odds). Clone terms and increase my cash contribution.
    const sweetened: TradeTerms = JSON.parse(JSON.stringify(terms));
    const myContribution = sweetened.cashDelta[pid] ?? 0;
    // Find the trade partner (someone receiving cash)
    for (const [otherId, delta] of Object.entries(sweetened.cashDelta)) {
      if (delta > 0) {
        // This player is receiving cash — offer them 10% more
        const extra = Math.ceil(Math.abs(myContribution) * 0.1);
        sweetened.cashDelta[pid] = myContribution - extra;
        sweetened.cashDelta[otherId] = delta + extra;
        break;
      }
    }
    candidates.push({
      intent: { kind: "update-trade-draft", playerId: pid, terms: sweetened },
      label: "sweetened",
    });
  }

  if (candidates.length <= 1) return null; // Nothing to decide between

  // Evaluate each candidate via MC rollouts
  let best = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    let total = 0;
    let valid = 0;

    for (let i = 0; i < ROLLOUTS_PER_ACTION; i++) {
      const cloned: GameState = structuredClone(state);
      cloned.rngState = (cloned.rngState ^ ((i + 1) * 0x9e3779b9)) >>> 0;

      // Apply the candidate
      if (candidate.intent.kind === "bot-note") {
        // No trade — just simulate forward from current state
        const score = rollout(cloned, pid, MAX_ROLLOUT_TURNS);
        total += score;
        valid++;
        continue;
      }

      const result = apply(cloned, candidate.intent);
      if (!result.ok) continue;

      // For trade proposals, the trade goes through the pending phase.
      // In rollouts, jane-v3 bots will accept/decline. The rollout handles
      // the full game continuation including trade resolution.
      const score = rollout(result.state, pid, MAX_ROLLOUT_TURNS);
      total += score;
      valid++;
    }

    if (valid === 0) continue;
    const avg = total / valid;

    if (avg > bestScore) {
      bestScore = avg;
      best = candidate;
    }
  }

  // If the best is "no-trade", return null to let jane-v3's logic decide
  if (best.label === "no-trade") {
    return null;
  }

  return {
    intent: best.intent,
    note: `MC trade: ${best.label} (${(bestScore * 100).toFixed(0)}% over ${ROLLOUTS_PER_ACTION} rollouts, ${candidates.length} candidates)`,
  };
}
