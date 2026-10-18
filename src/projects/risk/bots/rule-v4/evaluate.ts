import type { Seat } from "../../contract";
import { boardIncome, hasEnemyNeighbour, N, boardKey, opponentsInOrder, type Board } from "../rule-v1/board";
import { Memo, memoFor } from "../memo";
import type { Params } from "./params";
import { killChance } from "./kills";
import { forecast } from "./opponents";
import { hiddenCards, myNextTrade } from "./worth";

// The one yardstick (`ideas/rule-bot-v1.md` §3, with v2's changes in `ideas/rule-bot-v2.md`): my equity in a position at the end
// of my turn. Power is armies, income over a horizon, and the armies cards in hand
// will become; equity is my share of everyone's power, cut by the chance I am
// eliminated before my next turn and by my expected border losses, raised by next
// turn's best kill. Every decision (placement, attacks, trades, occupy, fortify) is
// scored by it, so they can't disagree with each other. What the other seats do before
// my next turn is the opponent model's (`opponents.ts`), v3's evaluation otherwise.

export { expectedIncome } from "./worth";

export interface Breakdown {
  value: number;
  share: number;
  killExposure: number;
  borderLoss: number;
  opportunity: number;
  idle: number;
  commonThreat: Seat | null;
}

export function evaluate(b: Board, me: Seat, params: Params): number {
  return breakdown(b, me, params).value;
}

const breakdowns = new WeakMap<Params, Memo<Breakdown>>();

/** The breakdown, remembered: the planner scores the same end of turn under several plans,
 *  and the move-in and the attack after it score the same boards again. */
export function breakdown(b: Board, me: Seat, params: Params): Breakdown {
  return memoFor(breakdowns, params, 300).get(`${me.toString()}|${boardKey(b)}`, () => computeBreakdown(b, me, params));
}

function computeBreakdown(b: Board, me: Seat, params: Params): Breakdown {
  const prefs = params.prefs;
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  const none: Breakdown = { value: 0, share: 0, killExposure: 1, borderLoss: 0, opportunity: 0, idle: 0, commonThreat: null };
  if (!b.alive[me]) return none;
  if (alive.length === 1) return { ...none, value: 1, share: 1, killExposure: 0 };

  const { power, total, ratio, commonThreat, spared, borderLoss } = forecast(b, me, params, alive, params.record);

  // Kill exposure: the chance someone eliminates me before my next turn.
  const killExposure = 1 - spared[me];

  // Next turn's best kill, valued by the cards it would take.
  let opportunity = 0;
  const myNext = boardIncome(b, me) + myNextTrade(b, me);
  for (const v of opponentsInOrder(b, me)) {
    if (b.handSize[v] === 0) continue;
    const p = killChance(b, me, v, Math.round(myNext));
    // A kill someone moving before me can take first is worth only the chance they don't.
    opportunity = Math.max(opportunity, p * spared[v] * prefs.myCardWeight * hiddenCards(b.handSize[v]));
  }

  let idle = 0;
  for (let t = 0; t < N; t++) if (b.owner[t] === me && !hasEnemyNeighbour(b, t)) idle += b.armies[t] - 1;

  const share = power[me] / total;
  let value =
    share * (1 - prefs.vulnerabilityWeight * killExposure) -
    (prefs.borderWeight * borderLoss) / total +
    (prefs.opportunityWeight * opportunity) / total -
    (prefs.idleWeight * idle) / total;
  if (commonThreat !== null && commonThreat !== me) {
    // The leader's power past the point that makes it everyone's target counts against
    // me: hitting it pays, feeding it costs, and nothing jumps as the test flips.
    let next = 0;
    for (const p of alive) if (p !== commonThreat) next = Math.max(next, power[p]);
    value -= (prefs.commonThreatWeight * (power[commonThreat] - ratio * next)) / total;
  }
  if (commonThreat === me) {
    // Only the lead past the point that turns the table on me is penalised.
    let second = 0;
    for (const p of alive) if (p !== me) second = Math.max(second, power[p]);
    value -= (prefs.leadPenaltyWeight * (power[me] - ratio * second)) / total;
  }
  return { value, share, killExposure, borderLoss, opportunity, idle, commonThreat };
}
