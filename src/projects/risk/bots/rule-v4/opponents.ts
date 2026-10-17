import type { Seat } from "../../contract";
import {
  ADJ,
  armiesOf,
  CONTINENT_BONUS,
  CONTINENT_MEMBERS,
  countOf,
  holdsContinent,
  N,
  opponentsInOrder,
  type Board,
} from "../rule-v1/board";
import { CARD_WORTH, DRAW_CHANCE } from "../rule-v1/cards";
import { battleOutcome, exchange, pathRun, winProb } from "../rule-v1/odds";
import { killChance } from "../rule-v3/routes";
import { expectedIncome, hiddenCards, myCards } from "./worth";
import type { TakenRecord } from "./beliefs";
import type { Params } from "./params";

// The opponent model (`ideas/rule-bot-v4.md`): what I believe each other seat does with its
// turn before my next one. v3's model, moved out of the evaluation whole so it can be
// measured (`eval/opponent-model.ts`) and replaced: whom each opponent kills, who is the
// common threat, and how hard each opponent's turn lands on me.

/** Why an opponent's aim at me is what it is. */
export type AimCase =
  /** I am the common threat: everyone hits me. */
  | "leader"
  /** Another seat is the common threat, and q isn't it: q hits me a quarter as often. */
  | "ally"
  /** No override: my share of what q's turn could do to each of its neighbours. */
  | "share"
  /** q has no territory beside mine. */
  | "apart";

/** One opponent's turn as the model sees it, from my side of the board. */
export interface OpponentTurn {
  seat: Seat;
  aimCase: AimCase;
  /** How likely q's turn goes against me. */
  aim: number;
  /** What q's turn costs me if it does (its best blow or its sweep), my continents at my
   *  continent weight, over my income horizon. */
  hit: number;
  /** The victim q goes for, or -1, and the chance it is taken. */
  victim: Seat | -1;
  killTaken: number;
}

export interface Forecast {
  /** Each player's power, the expected kills moved over. */
  power: number[];
  total: number;
  /** The common-threat bar at this table. */
  ratio: number;
  commonThreat: Seat | null;
  /** The chance each seat outlives every opponent's turn before mine. */
  spared: number[];
  /** My expected border losses: each opponent's aim times its hit, summed. */
  borderLoss: number;
  /** The opponents in turn order. */
  turns: OpponentTurn[];
}

export function forecast(b: Board, me: Seat, params: Params, alive: readonly Seat[], record: TakenRecord | null): Forecast {
  const prefs = params.prefs;
  const beliefs = params.opponents.beliefs;
  const H = prefs.incomeHorizon;
  // The card drawn at the end of this turn (`CARDS-1`) is mine already.
  const myHand = b.handSize[me] + (b.cardEarned ? 1 : 0);
  // Every player draws about a card a turn, worth its share of a set.
  const cardIncome = DRAW_CHANCE * CARD_WORTH;

  const income = expectedIncome(b, me);
  const opponents = opponentsInOrder(b, me);
  const om = params.opponents;

  const power = new Array<number>(b.players).fill(0);
  for (const p of alive) {
    let territoryIncome = Math.max(3, Math.floor(countOf(b, p) / 3));
    for (let c = 0; c < CONTINENT_BONUS.length; c++) {
      if (holdsContinent(b, p, c)) territoryIncome += CONTINENT_BONUS[c] * (p === me ? prefs.myContinentWeight : 1);
    }
    const cards = p === me ? prefs.myCardWeight * myCards(b, me) : hiddenCards(b.handSize[p]);
    power[p] = armiesOf(b, p) + H * (territoryIncome + cardIncome) + cards;
  }

  // Before my next turn, each opponent goes for the one kill that pays it best (a
  // player takes one victim a turn, not every one it could reach): the chance it lands,
  // as the opponent model weighs it, times the cards it would take. Me included: that
  // is my kill exposure. A third player's death moves its power and cards to the
  // killer, so damage I leave on a card-holder counts as a gift to whoever finishes it.
  const spared = new Array<number>(b.players).fill(1);
  const myCount = countOf(b, me);
  const kills = new Map<Seat, { victim: Seat; taken: number }>();
  for (const q of opponents) {
    let best = 0;
    let victim = -1;
    let bestTaken = 0;
    for (const v of alive) {
      if (v === q) continue;
      const hand = v === me ? myHand : b.handSize[v];
      if (hand === 0 && v !== me) continue;
      const p = killChance(b, q, v, Math.round(income[q]));
      if (p === 0) continue;
      // A kill pays when the cards it takes force a trade at once (`ELIM-3`), or the
      // victim's hand is worth taking.
      const pays = hand + b.handSize[q] >= 5 || hand >= 3 || (v === me && myCount <= 2);
      let taken = p * (p >= om.killBar || pays ? 1 : om.unpaidKillChance);
      // v4: opponents take far fewer of the kills open to them than v3 believed.
      if (beliefs) taken *= v === me ? beliefs.myKillRate : beliefs.killRate;
      const worth = taken * (hand + 1);
      if (worth > best) {
        best = worth;
        bestTaken = taken;
        victim = v;
      }
    }
    if (victim < 0) continue;
    kills.set(q, { victim, taken: bestTaken });
    spared[victim] *= 1 - bestTaken;
    if (victim === me) continue;
    power[q] += bestTaken * hiddenCards(b.handSize[victim]);
    power[victim] *= 1 - bestTaken;
  }
  let total = 0;
  for (const p of alive) total += power[p];

  const ratio = om.leaderRatio + om.leaderRatioPerPlayer * (alive.length - 4);
  let commonThreat: Seat | null = null;
  for (const p of alive) {
    if (alive.every((q) => q === p || power[p] > ratio * power[q])) commonThreat = p;
  }

  // Border exposure: each opponent's turn against me, weighted by how likely I am the
  // one they hit: its best single blow, or the sweep of certain captures it can chain
  // through my thin territories, whichever costs me more (v2). Summed over opponents:
  // each takes its own turn.
  let borderLoss = 0;
  const turns: OpponentTurn[] = [];
  for (const q of opponents) {
    const kill = kills.get(q);
    const turn: OpponentTurn = { seat: q, aimCase: "apart", aim: 0, hit: 0, victim: kill?.victim ?? -1, killTaken: kill?.taken ?? 0 };
    turns.push(turn);
    const seen = neighboursOf(b, q);
    if (!seen.includes(me)) continue;
    const qIncome = Math.round(income[q]);
    // One look at q's blows and one sweep against me serve both the aim and the loss: only
    // the horizon and continent weight they are costed at differ.
    const blow = blowsAgainst(b, me, q, qIncome);
    const sweep = sweepAgainst(b, me, q, qIncome);
    // How likely q's turn goes against me: everyone hits the common threat, and its
    // neighbours a quarter as often; otherwise q hits whoever its turn hurts most, so my
    // share of what it could do to each neighbour, each weighed as q sees it (v2).
    let aim: number;
    if (commonThreat === me) {
      turn.aimCase = "leader";
      aim = beliefs ? beliefs.leaderAim : 1;
    } else if (commonThreat !== null && commonThreat !== q) {
      turn.aimCase = "ally";
      aim = beliefs ? beliefs.allyAim : 0.25;
    } else {
      turn.aimCase = "share";
      const hurtMe = Math.max(blowCost(blow, H), sweepCost(b, me, sweep, H, 1));
      let all = 0;
      for (const v of seen) {
        all += v === me ? hurtMe : Math.max(bestBlow(b, v, q, qIncome, H), sweepLoss(b, v, q, qIncome, H, 1));
      }
      aim = all > 0 ? hurtMe / all : 1 / Math.max(1, seen.length);
      if (beliefs) {
        const even = 1 / seen.length;
        aim = even + beliefs.aimSlope * (aim - even);
      }
    }
    if (beliefs && beliefs.historyPrior !== null && record !== null) {
      // v4: whom q has been taking territory from this game is evidence of whom it takes it from next.
      const row = record.taken[q];
      let taken = 0;
      for (const v of seen) taken += row[v];
      aim = (beliefs.historyPrior * aim + row[me]) / (beliefs.historyPrior + taken);
    }
    const horizon = H * prefs.myContinentWeight;
    const hit = Math.max(blowCost(blow, horizon), sweepCost(b, me, sweep, H, prefs.myContinentWeight));
    turn.aim = aim;
    turn.hit = hit;
    borderLoss += aim * hit;
  }
  return { power, total, ratio, commonThreat, spared, borderLoss, turns };
}

/** The seats beside `q`'s territories, in the order its territories first meet them. */
export function neighboursOf(b: Board, q: Seat): Seat[] {
  const seen: Seat[] = [];
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== q) continue;
    for (const n of ADJ[t]) {
      const o = b.owner[n];
      if (o !== q && !seen.includes(o)) seen.push(o);
    }
  }
  return seen;
}

/** The armies q's strongest neighbour of `t` can attack with, or -1 with none beside it.
 *  A neighbour on one army is still a threat (v2): q's income lands on it first. */
function strongestBeside(b: Board, q: Seat, t: number): number {
  let a = -1;
  for (const n of ADJ[t]) if (b.owner[n] === q) a = Math.max(a, b.armies[n] - 1);
  return a;
}

/** What `q`'s blows against `me` can take, before a horizon prices my continents. */
interface Blows {
  /** The most armies one exchange wins. */
  exchange: number;
  /** Per continent: the best chance of breaking it, 0 where I don't hold it or q can't reach it. */
  breakChance: Float64Array;
}

function blowsAgainst(b: Board, me: Seat, q: Seat, qIncome: number): Blows {
  let worst = 0;
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me) continue;
    const a = strongestBeside(b, q, t);
    if (a >= 0 && a + qIncome > 0) worst = Math.max(worst, exchange(a + qIncome, b.armies[t]));
  }
  const breakChance = new Float64Array(CONTINENT_BONUS.length);
  for (let c = 0; c < CONTINENT_BONUS.length; c++) {
    if (!holdsContinent(b, me, c)) continue;
    let p = 0;
    for (const m of CONTINENT_MEMBERS[c]) {
      const direct = strongestBeside(b, q, m);
      if (direct >= 0 && direct + qIncome > 0) p = Math.max(p, winProb(direct + qIncome, b.armies[m]));
      for (const n of ADJ[m]) {
        if (b.owner[n] !== me) continue;
        const via = strongestBeside(b, q, n);
        if (via >= 0 && via + qIncome > 0) p = Math.max(p, pathRun(via + 1 + qIncome, [b.armies[n], b.armies[m]]).pSuccess);
      }
    }
    breakChance[c] = p;
  }
  return { exchange: worst, breakChance };
}

/** The blows' cost, a broken continent's bonus counted over `horizon` turns. The best
 *  chance times the stake is exactly the best of each chance times it: rounding a product
 *  by the same positive stake keeps the order. */
function blowCost(blows: Blows, horizon: number): number {
  let worst = blows.exchange;
  for (let c = 0; c < CONTINENT_BONUS.length; c++) worst = Math.max(worst, blows.breakChance[c] * (horizon * CONTINENT_BONUS[c]));
  return worst;
}

/** What `q`'s best single blow against `me` costs me: the armies it would win from
 *  me in an exchange (big battles favour the attacker), or a held continent of mine
 *  broken, reached through at most one territory of mine on the way, its bonus counted
 *  over `horizon` turns. Armies on a territory are not at stake by themselves: a
 *  failed attack costs the attacker as much. */
export function bestBlow(b: Board, me: Seat, q: Seat, qIncome: number, horizon: number): number {
  return blowCost(blowsAgainst(b, me, q, qIncome), horizon);
}

/** A capture the sweep counts as certain: Balanced Blitz makes the favourite's fight sure,
 *  so an opponent takes every such territory it can reach. */
const SWEEP_SURE = 0.9;
/** The most captures one opponent's sweep counts in a turn. */
const SWEEP_MOST = 8;

/** The armies a sure capture of `d` by `a` brings in, on average. */
function arriving(a: number, d: number): number {
  const o = battleOutcome(a, d);
  let armies = 0;
  for (let x = 1; x < o.win.length; x++) armies += o.win[x] * x;
  return o.pWin > 0 ? armies / o.pWin : 0;
}

/** A sweep played out: the armies I lose, and who holds what once it is over. */
interface Sweep {
  lost: number;
  owner: Int8Array;
}

/** `q`'s sweep through my thin territories (v2): from its stacks beside me, its income on
 *  the biggest, it takes the cheapest territory it is sure of, moves in, and goes on from
 *  there, as GD's bots and strong players do with stacks beside a spread-out player. */
function sweepAgainst(b: Board, me: Seat, q: Seat, qIncome: number): Sweep {
  const owner = b.owner.slice();
  const ready = new Int32Array(N);
  const mine: number[] = [];
  let biggest = -1;
  for (let t = 0; t < N; t++) {
    if (owner[t] === me) mine.push(t);
    if (owner[t] !== q || !besideSeat(owner, t, me)) continue;
    ready[t] = b.armies[t] - 1;
    if (biggest < 0 || b.armies[t] > b.armies[biggest]) biggest = t;
  }
  if (biggest < 0) return { lost: 0, owner };
  ready[biggest] += qIncome;
  let lost = 0;
  for (let k = 0; k < SWEEP_MOST; k++) {
    let bestFrom = -1;
    let bestTo = -1;
    for (const t of mine) {
      if (owner[t] !== me) continue;
      let from = -1;
      for (const n of ADJ[t]) if (owner[n] === q && ready[n] > 0 && (from < 0 || ready[n] > ready[from])) from = n;
      if (from < 0 || winProb(ready[from], b.armies[t]) < SWEEP_SURE) continue;
      if (bestTo < 0 || b.armies[t] < b.armies[bestTo]) {
        bestFrom = from;
        bestTo = t;
      }
    }
    if (bestTo < 0) break;
    const moved = arriving(ready[bestFrom], b.armies[bestTo]);
    lost += b.armies[bestTo];
    owner[bestTo] = q;
    ready[bestFrom] = 0;
    ready[bestTo] = Math.max(0, Math.floor(moved) - 1);
  }
  return { lost, owner };
}

function besideSeat(owner: Int8Array, t: number, seat: Seat): boolean {
  for (const n of ADJ[t]) if (owner[n] === seat) return true;
  return false;
}

/** My income from `own`, my continents weighted by `continentWeight`. */
export function incomeFrom(own: Int8Array, me: Seat, continentWeight: number): number {
  let count = 0;
  for (let t = 0; t < N; t++) if (own[t] === me) count++;
  let income = Math.max(3, Math.floor(count / 3));
  for (let c = 0; c < CONTINENT_BONUS.length; c++) {
    if (CONTINENT_MEMBERS[c].every((t) => own[t] === me)) income += CONTINENT_BONUS[c] * continentWeight;
  }
  return income;
}

/** What a sweep costs me: the armies I lose there, and my income lost over `horizon` turns,
 *  the territory count's and every continent of mine it breaks, mine weighted by my
 *  continent weight. */
function sweepCost(b: Board, me: Seat, sweep: Sweep, horizon: number, continentWeight: number): number {
  if (sweep.lost === 0) return 0;
  return sweep.lost + horizon * (incomeFrom(b.owner, me, continentWeight) - incomeFrom(sweep.owner, me, continentWeight));
}

/** What `q`'s sweep through my thin territories costs me (v2). One blow (`bestBlow`)
 *  misses this: once one territory sits on one army, every other thin one adds nothing to
 *  it, so a sweep on 1s looked free. */
export function sweepLoss(b: Board, me: Seat, q: Seat, qIncome: number, horizon: number, continentWeight: number): number {
  return sweepCost(b, me, sweepAgainst(b, me, q, qIncome), horizon, continentWeight);
}
