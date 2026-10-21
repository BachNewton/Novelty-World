import type { Seat } from "../../contract";
import { ADJ, boardIncome, boardKey, copyBoard, hasEnemyNeighbour, N, opponentsInOrder, type Board } from "../rule-v1/board";
import { Memo, memoFor } from "../memo";
import { expectedIncome, hiddenCards, myNextTrade } from "../rule-v4/worth";
import { killChance } from "./kills";
import { forecast } from "./opponents";
import type { Params } from "./params";

// v4's evaluation (`rule-v4/evaluate.ts`) on v6's opponent model, with one fix of v6's
// switchable: `reinforced`, next turn's kill weighed with the victim's income on its defence.
// With it off this is v4's evaluation, term for term. The breakdown also carries the total
// power, which the planner's `homeward` credit is scaled by, and every seat's power and chance
// of outliving the turns before mine, for a scorer that reads more than the value.

export interface Breakdown {
  value: number;
  share: number;
  killExposure: number;
  borderLoss: number;
  opportunity: number;
  idle: number;
  commonThreat: Seat | null;
  /** Everyone's power, the scale every term of the value is divided by. */
  total: number;
  /** Each seat's power, 0 for a seat out of the game. */
  power: readonly number[];
  /** Each seat's chance of outliving the opponents' turns before mine. */
  spared: readonly number[];
}

/** A board's score from its breakdown, in place of v6's value. */
export type Scorer = (b: Board, me: Seat, bd: Breakdown) => number;

/** The board's score: v6's value, or the settings' own scorer's reading of the same breakdown. */
export function scoreOf(b: Board, me: Seat, params: Params, bd: Breakdown = breakdown(b, me, params)): number {
  return params.score === undefined ? bd.value : params.score(b, me, bd);
}

export function evaluate(b: Board, me: Seat, params: Params): number {
  return scoreOf(b, me, params);
}

const breakdowns = new WeakMap<Params, Memo<Breakdown>>();

export function breakdown(b: Board, me: Seat, params: Params): Breakdown {
  return memoFor(breakdowns, params, 300).get(`${me.toString()}|${boardKey(b)}`, () => computeBreakdown(b, me, params));
}

/** The board as `victim` leaves it for my next turn with `reinforced` on: its income placed on
 *  its territory facing my strongest launch, beside it or a third player's territory away (the
 *  ways in a kill's routes take), where my kill would have to start. v4 weighed next turn's kill
 *  on the board as it stands, as if the victim placed nothing, so a stack starved of income sat
 *  beside a kill that never came nearer (9VFL: v4's 44 to 56 armies on Venezuela for ten turns,
 *  v5's 28 on Egypt). */
function reinforcedFor(b: Board, me: Seat, victim: Seat, income: number): Board {
  let entry = -1;
  let facing = 0;
  const consider = (t: number, attackers: number) => {
    if (attackers > facing) {
      facing = attackers;
      entry = t;
    }
  };
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== victim) continue;
    for (const n of ADJ[t]) {
      if (b.owner[n] === me) consider(t, b.armies[n] - 1);
      else if (b.owner[n] !== victim) for (const s of ADJ[n]) if (b.owner[s] === me) consider(t, b.armies[s] - 1 - (b.armies[n] + 1));
    }
  }
  if (entry < 0) return b;
  const out = copyBoard(b);
  out.armies[entry] += income;
  return out;
}

function computeBreakdown(b: Board, me: Seat, params: Params): Breakdown {
  const prefs = params.prefs;
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  const nobody = new Array<number>(b.players).fill(0);
  const none: Breakdown = { value: 0, share: 0, killExposure: 1, borderLoss: 0, opportunity: 0, idle: 0, commonThreat: null, total: 1, power: nobody, spared: nobody };
  if (!b.alive[me]) return none;
  if (alive.length === 1) return { ...none, value: 1, share: 1, killExposure: 0 };

  const { power, total, ratio, commonThreat, spared, borderLoss } = forecast(b, me, params, alive, params.record);

  const killExposure = 1 - spared[me];

  const fork = params.fixes.fork === 1;
  const income = params.fixes.reinforced === 1 ? expectedIncome(b, me) : null;
  let opportunity = 0;
  const myNext = boardIncome(b, me) + myNextTrade(b, me);
  for (const v of opponentsInOrder(b, me)) {
    if (b.handSize[v] === 0) continue;
    const board = income === null ? b : reinforcedFor(b, me, v, Math.round(income[v]));
    const p = killChance(board, me, v, Math.round(myNext), fork);
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
    let next = 0;
    for (const p of alive) if (p !== commonThreat) next = Math.max(next, power[p]);
    value -= (prefs.commonThreatWeight * (power[commonThreat] - ratio * next)) / total;
  }
  if (commonThreat === me) {
    let second = 0;
    for (const p of alive) if (p !== me) second = Math.max(second, power[p]);
    value -= (prefs.leadPenaltyWeight * (power[me] - ratio * second)) / total;
  }
  return { value, share, killExposure, borderLoss, opportunity, idle, commonThreat, total, power, spared };
}
