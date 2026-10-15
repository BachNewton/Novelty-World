import type { Seat } from "../../contract";
import {
  ADJ,
  armiesOf,
  boardIncome,
  CONTINENT_BONUS,
  CONTINENT_MEMBERS,
  countOf,
  hasEnemyNeighbour,
  holdsContinent,
  N,
  opponentsInOrder,
  type Board,
} from "./board";
import { setChance, setValue } from "./cards";
import { exchange, pathRun, winProb } from "./odds";
import { incomeHorizon, leaderRatio, type Params } from "./params";
import { killChance } from "./routes";

// The one yardstick (`ideas/rule-bot-v1.md` §3): my equity in a position at the end
// of my turn. Power is armies, income over a horizon, and card equity; equity is my
// share of everyone's power, cut by the chance I am eliminated before my next turn
// and by my expected border losses, raised by next turn's best kill. Every decision
// (placement, attacks, trades, occupy, fortify) is scored by it, so they can't
// disagree with each other.

/** Each other player's expected armies next turn, in turn order after `me`: territory
 *  and continent income, and a set at the printed value times the chance they hold one.
 *  Objective: it models them, so no preference of mine enters it. */
export function expectedIncome(b: Board, me: Seat): number[] {
  const income = new Array<number>(b.players).fill(0);
  let trades = 0;
  for (const q of opponentsInOrder(b, me)) {
    const p = setChance(b.handSize[q]);
    income[q] = boardIncome(b, q) + p * setValue(b.setsTraded + 1 + Math.round(trades));
    trades += p;
  }
  income[me] = boardIncome(b, me);
  return income;
}

/** The set value I expect to trade at on my next turn: the others' likely trades
 *  come first. */
export function myFutureSetValue(b: Board, me: Seat): number {
  let trades = 0;
  for (const q of opponentsInOrder(b, me)) trades += setChance(b.handSize[q]);
  return setValue(b.setsTraded + 1 + Math.round(trades));
}

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

export function breakdown(b: Board, me: Seat, params: Params): Breakdown {
  const prefs = params.prefs;
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  const none: Breakdown = { value: 0, share: 0, killExposure: 1, borderLoss: 0, opportunity: 0, idle: 0, commonThreat: null };
  if (!b.alive[me]) return none;
  if (alive.length === 1) return { ...none, value: 1, share: 1, killExposure: 0 };

  const nextSet = setValue(b.setsTraded + 1);
  const H = incomeHorizon(prefs, nextSet);
  const future = myFutureSetValue(b, me);
  // The card drawn at the end of this turn (`CARDS-1`) is mine already.
  const myHand = b.handSize[me] + (b.cardEarned ? 1 : 0);

  const income = expectedIncome(b, me);
  const opponents = opponentsInOrder(b, me);
  const om = params.opponents;

  const power = new Array<number>(b.players).fill(0);
  for (const p of alive) {
    let territoryIncome = Math.max(3, Math.floor(countOf(b, p) / 3));
    for (let c = 0; c < CONTINENT_BONUS.length; c++) {
      if (holdsContinent(b, p, c)) territoryIncome += CONTINENT_BONUS[c] * (p === me ? prefs.myContinentWeight : 1);
    }
    // Others' cards: the hand they hold and the cards they will draw over the horizon,
    // at the next set's value, so my trade, which raises it, raises their worth.
    const cards =
      p === me ? prefs.myCardWeight * (myHand / 3) * future : ((b.handSize[p] + om.drawsPerTurn * H) / 3) * nextSet;
    power[p] = armiesOf(b, p) + H * territoryIncome + cards;
  }

  // Before my next turn, each opponent takes the best kill of a third player it can
  // reach, as the opponent model would: the victim's power goes, its cards go to the
  // killer. So damage I leave on a card-holder counts as a gift to whoever can finish it.
  // `spared[v]`: the chance v outlives every opponent's turn before mine.
  const spared = new Array<number>(b.players).fill(1);
  for (const q of opponents) {
    let best = 0;
    let victim = -1;
    for (const v of opponents) {
      if (v === q || b.handSize[v] === 0) continue;
      const p = killChance(b, q, v, Math.round(income[q]));
      const taken = p * (p >= om.killBar || b.handSize[v] + b.handSize[q] >= 6 ? 1 : om.unpaidKillChance);
      spared[v] *= 1 - taken;
      if (taken > best) {
        best = taken;
        victim = v;
      }
    }
    if (victim < 0) continue;
    power[q] += best * (b.handSize[victim] / 3) * nextSet;
    power[victim] *= 1 - best;
  }
  let total = 0;
  for (const p of alive) total += power[p];

  const ratio = leaderRatio(om, nextSet);
  let commonThreat: Seat | null = null;
  for (const p of alive) {
    if (alive.every((q) => q === p || power[p] > ratio * power[q])) commonThreat = p;
  }

  const myCount = countOf(b, me);

  // Border exposure: each opponent's best single blow against me, weighted by how
  // likely I am the one they hit.
  let borderLoss = 0;
  for (const q of opponents) {
    let neighbours = 0;
    const seen = new Set<Seat>();
    for (let t = 0; t < N; t++) {
      if (b.owner[t] !== q) continue;
      for (const n of ADJ[t]) {
        const o = b.owner[n];
        if (o !== q && !seen.has(o)) {
          seen.add(o);
          neighbours++;
        }
      }
    }
    if (!seen.has(me)) continue;
    const aim =
      commonThreat === me ? 1 : commonThreat !== null && commonThreat !== q ? 0.25 : 1 / Math.max(1, neighbours);
    borderLoss += aim * bestBlow(b, me, q, Math.round(income[q]), H * prefs.myContinentWeight);
  }

  // Kill exposure: the chance someone eliminates me before my next turn.
  let survive = 1;
  for (const q of opponents) {
    const p = killChance(b, q, me, Math.round(income[q]));
    if (p === 0) continue;
    const pays = myHand + b.handSize[q] >= 6 || myHand >= 3 || myCount <= 2;
    survive *= 1 - p * (p >= om.killBar || pays ? 1 : om.unpaidKillChance);
  }
  const killExposure = 1 - survive;

  // Next turn's best kill, valued by the cards it would take.
  let opportunity = 0;
  const myNext = boardIncome(b, me) + (myHand >= 3 ? setChance(myHand) * future : 0);
  for (const v of opponents) {
    if (b.handSize[v] === 0) continue;
    const p = killChance(b, me, v, Math.round(myNext));
    // A kill someone moving before me can take first is worth only the chance they don't.
    opportunity = Math.max(opportunity, p * spared[v] * prefs.myCardWeight * (b.handSize[v] / 3) * future);
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

/** What `q`'s best single blow against `me` costs me: the armies it would win from
 *  me in an exchange (big battles favour the attacker), or a held continent of mine
 *  broken, reached through at most one territory of mine on the way, its bonus counted
 *  over `horizon` turns. Armies on a territory are not at stake by themselves: a
 *  failed attack costs the attacker as much. */
export function bestBlow(b: Board, me: Seat, q: Seat, qIncome: number, horizon: number): number {
  let worst = 0;
  const strongest = (t: number) => {
    let a = 0;
    for (const n of ADJ[t]) if (b.owner[n] === q) a = Math.max(a, b.armies[n] - 1);
    return a;
  };
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me) continue;
    const a = strongest(t);
    if (a > 0) worst = Math.max(worst, exchange(a + qIncome, b.armies[t]));
  }
  for (let c = 0; c < CONTINENT_BONUS.length; c++) {
    if (!holdsContinent(b, me, c)) continue;
    const stake = horizon * CONTINENT_BONUS[c];
    for (const m of CONTINENT_MEMBERS[c]) {
      const direct = strongest(m);
      if (direct > 0) worst = Math.max(worst, winProb(direct + qIncome, b.armies[m]) * stake);
      for (const n of ADJ[m]) {
        if (b.owner[n] !== me) continue;
        const via = strongest(n);
        if (via > 0) worst = Math.max(worst, pathRun(via + 1 + qIncome, [b.armies[n], b.armies[m]]).pSuccess * stake);
      }
    }
  }
  return worst;
}

/** Members of continent `c` not held by `seat`. */
export function missingFrom(b: Board, seat: Seat, c: number): number[] {
  return CONTINENT_MEMBERS[c].filter((t) => b.owner[t] !== seat);
}
