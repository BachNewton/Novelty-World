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
import { killChance } from "./kills";
import { expectedIncome, hiddenCards, myCards } from "./worth";
import type { TakenRecord } from "./beliefs";
import type { Params } from "./params";

// The opponent model (`ideas/rule-bot-v4.md`): what I believe each other seat does with its
// turn before my next one: whom it kills, who is the common threat, and how hard its turn
// lands on me. v3's model, with the beliefs measured against how opponents play, and the
// kills and sweeps played out in full.

/** Why an opponent's aim at me is what it is. */
export type AimCase =
  /** I am the common threat. */
  | "leader"
  /** Another seat is the common threat, and q isn't it. */
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
  /** The victim q likeliest goes for, or -1, and the chance it is taken. */
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
  const om = params.opponents;
  const beliefs = om.beliefs;
  const H = prefs.incomeHorizon;
  // The card drawn at the end of this turn (`CARDS-1`) is mine already.
  const myHand = b.handSize[me] + (b.cardEarned ? 1 : 0);
  // Every player draws about a card a turn, worth its share of a set.
  const cardIncome = DRAW_CHANCE * CARD_WORTH;

  const income = expectedIncome(b, me);
  const opponents = opponentsInOrder(b, me);

  const power = new Array<number>(b.players).fill(0);
  for (const p of alive) {
    let territoryIncome = Math.max(3, Math.floor(countOf(b, p) / 3));
    for (let c = 0; c < CONTINENT_BONUS.length; c++) {
      if (holdsContinent(b, p, c)) territoryIncome += CONTINENT_BONUS[c] * (p === me ? prefs.myContinentWeight : 1);
    }
    const cards = p === me ? prefs.myCardWeight * myCards(b, me) : hiddenCards(b.handSize[p]);
    power[p] = armiesOf(b, p) + H * (territoryIncome + cardIncome) + cards;
  }

  // Before my next turn, each opponent takes at most one victim (a player takes one a turn,
  // not every one it could reach). It weighs the kills open to it by what they pay, best
  // first, and goes for each with its measured rate only if it passed over every better one:
  // v3 counted only its best, so a seat that wasn't any opponent's best kill believed itself
  // safe from all of them. Me included: that is my kill exposure. A third player's death moves
  // its cards and its territories' income to the killer; its armies are gone, and the killer's
  // own losses, a favourite's under Balanced Blitz, are left out beside what the kill takes.
  // v3 moved only the cards, so damage that helped a leader finish someone raised my share.
  // `spared[v]`: the chance v outlives every opponent's turn before mine.
  const spared = new Array<number>(b.players).fill(1);
  const myCount = countOf(b, me);
  const kills = new Map<Seat, { victim: Seat; taken: number }>();
  for (const q of opponents) {
    const open: { victim: Seat; taken: number; worth: number }[] = [];
    for (const v of alive) {
      if (v === q) continue;
      const hand = v === me ? myHand : b.handSize[v];
      if (hand === 0 && v !== me) continue;
      const p = killChance(b, q, v, Math.round(income[q]));
      if (p === 0) continue;
      // A kill pays when the cards it takes force a trade at once (`ELIM-3`), or the
      // victim's hand is worth taking.
      const pays = hand + b.handSize[q] >= 5 || hand >= 3 || (v === me && myCount <= 2);
      const taken = p * (p >= om.killBar || pays ? 1 : om.unpaidKillChance) * (v === me ? beliefs.myKillRate : beliefs.killRate);
      open.push({ victim: v, taken, worth: taken * (hand + 1) });
    }
    open.sort((x, y) => y.worth - x.worth || x.victim - y.victim);
    let passed = 1;
    for (const { victim, taken } of open) {
      const chance = passed * taken;
      passed -= chance;
      if (!kills.has(q)) kills.set(q, { victim, taken: chance });
      spared[victim] *= 1 - chance;
      if (victim === me) continue;
      power[q] += chance * (hiddenCards(b.handSize[victim]) + H * incomeGain(b, q, victim));
      power[victim] *= 1 - chance;
    }
  }
  let total = 0;
  for (const p of alive) total += power[p];

  const ratio = om.leaderRatio + om.leaderRatioPerPlayer * (alive.length - 4);
  let commonThreat: Seat | null = null;
  for (const p of alive) {
    if (alive.every((q) => q === p || power[p] > ratio * power[q])) commonThreat = p;
  }

  // Border exposure: each opponent's turn against me, weighted by how likely I am the
  // one they hit: its best single blow, or the sweep it can chain through my territories,
  // whichever costs me more. Summed over opponents: each takes its own turn.
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
    let aim: number;
    if (commonThreat === me) {
      turn.aimCase = "leader";
      aim = beliefs.leaderAim;
    } else if (commonThreat !== null && commonThreat !== q) {
      turn.aimCase = "ally";
      aim = beliefs.allyAim;
    } else {
      // My share of what q's turn could do to each neighbour, each weighed as q sees it,
      // pulled toward an even split.
      turn.aimCase = "share";
      const hurtMe = Math.max(blowCost(blow, H), sweepCost(b, me, sweep, H, 1));
      let all = 0;
      for (const v of seen) {
        all += v === me ? hurtMe : Math.max(bestBlow(b, v, q, qIncome, H), sweepLoss(b, v, q, qIncome, H, 1));
      }
      const share = all > 0 ? hurtMe / all : 1 / seen.length;
      const even = 1 / seen.length;
      aim = even + beliefs.aimSlope * (share - even);
    }
    if (record !== null) {
      // Whom q has been taking territory from this game is evidence of whom it takes it from next.
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

/** What `q`'s income gains by taking every territory `victim` holds: the territory count's,
 *  and every continent that leaves wholly q's. */
function incomeGain(b: Board, q: Seat, victim: Seat): number {
  const after = b.owner.map((o) => (o === victim ? q : o));
  return incomeFrom(after, q, 1) - incomeFrom(b.owner, q, 1);
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
 *  A neighbour on one army is still a threat: q's income lands on it first. */
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

/** The armies a sure capture of `d` by `a` brings in, on average. */
function arriving(a: number, d: number): number {
  const o = battleOutcome(a, d);
  let armies = 0;
  for (let x = 1; x < o.win.length; x++) armies += o.win[x] * x;
  return o.pWin > 0 ? armies / o.pWin : 0;
}

/** A sweep played out: the armies I lose, and who holds what once it is over. */
export interface Sweep {
  lost: number;
  owner: Int8Array;
}

/** `q`'s sweep through my territories, as GD's bots and strong players make one with a stack
 *  beside a spread-out player: from its stacks beside me, its income on the biggest, it takes
 *  the cheapest territory it is sure of, and goes on until no capture is sure. A stack's
 *  attackers go on from any territory it has taken, since the move-in can leave armies at a
 *  fork for the branch it doesn't take first, and each capture leaves one behind. v3 stopped at
 *  8 captures and moved the whole stack along one path, so a dead end stopped it; people took
 *  9 and 13 territories from v3 in a turn, and one stack chained 19. */
export function sweepAgainst(b: Board, me: Seat, q: Seat, qIncome: number): Sweep {
  const owner = b.owner.slice();
  // Which of q's stacks holds each territory, -1 for none; and each stack's attackers.
  const stackAt = new Int8Array(N).fill(-1);
  const ready: number[] = [];
  const mine: number[] = [];
  let biggest = -1;
  for (let t = 0; t < N; t++) {
    if (owner[t] === me) mine.push(t);
    if (owner[t] !== q || !besideSeat(owner, t, me)) continue;
    stackAt[t] = ready.length;
    ready.push(b.armies[t] - 1);
    if (biggest < 0 || b.armies[t] > b.armies[biggest]) biggest = t;
  }
  if (biggest < 0) return { lost: 0, owner };
  ready[stackAt[biggest]] += qIncome;
  let lost = 0;
  for (;;) {
    let bestStack = -1;
    let bestTo = -1;
    for (const t of mine) {
      if (owner[t] !== me) continue;
      let stack = -1;
      for (const n of ADJ[t]) {
        const s = stackAt[n];
        if (s >= 0 && ready[s] > 0 && (stack < 0 || ready[s] > ready[stack])) stack = s;
      }
      if (stack < 0 || winProb(ready[stack], b.armies[t]) < SWEEP_SURE) continue;
      if (bestTo < 0 || b.armies[t] < b.armies[bestTo]) {
        bestStack = stack;
        bestTo = t;
      }
    }
    if (bestTo < 0) return { lost, owner };
    const moved = arriving(ready[bestStack], b.armies[bestTo]);
    lost += b.armies[bestTo];
    owner[bestTo] = q;
    stackAt[bestTo] = bestStack;
    // Rounded, not floored as v3 did: flooring dropped half an army a capture on average.
    ready[bestStack] = Math.max(0, Math.round(moved) - 1);
  }
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
export function sweepCost(b: Board, me: Seat, sweep: Sweep, horizon: number, continentWeight: number): number {
  if (sweep.lost === 0) return 0;
  return sweep.lost + horizon * (incomeFrom(b.owner, me, continentWeight) - incomeFrom(sweep.owner, me, continentWeight));
}

/** What `q`'s sweep through my territories costs me. One blow (`bestBlow`) misses this: once
 *  one territory sits on one army, every other thin one adds nothing to it. */
export function sweepLoss(b: Board, me: Seat, q: Seat, qIncome: number, horizon: number, continentWeight: number): number {
  return sweepCost(b, me, sweepAgainst(b, me, q, qIncome), horizon, continentWeight);
}
