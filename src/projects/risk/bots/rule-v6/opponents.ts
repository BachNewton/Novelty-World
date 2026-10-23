import type { Seat } from "../../contract";
import { ADJ, armiesOf, CONTINENT_BONUS, CONTINENT_MEMBERS, countOf, holdsContinent, N, opponentsInOrder, type Board } from "../rule-v1/board";
import { CARD_WORTH, DRAW_CHANCE } from "../rule-v1/cards";
import { battleOutcome, exchange, pathRun, winProb } from "../rule-v1/odds";
import type { TakenRecord } from "../rule-v4/beliefs";
import { incomeFrom, neighboursOf, sweepAgainst, sweepCost, type Forecast, type OpponentTurn, type Sweep } from "../rule-v4/opponents";
import { expectedIncome, hiddenCards, myCards } from "../rule-v4/worth";
import { killChance } from "./kills";
import type { Params } from "./params";

// v4's opponent model (`rule-v4/opponents.ts`), with two of v6's fixes switchable: `fork`, the
// kill chances on v6's capture planner, and `thirdParty`, an opponent's sweep that reaches me
// through a third player's territories. With both off it is v4's model, sum for sum.

export type { Forecast, OpponentTurn, Sweep };

export function forecast(b: Board, me: Seat, params: Params, alive: readonly Seat[], record: TakenRecord | null): Forecast {
  const prefs = params.prefs;
  const om = params.opponents;
  const beliefs = om.beliefs;
  const fork = params.fixes.fork === 1;
  const thirdParty = params.fixes.thirdParty === 1;
  const H = prefs.incomeHorizon;
  const myHand = b.handSize[me] + (b.cardEarned ? 1 : 0);
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

  const spared = new Array<number>(b.players).fill(1);
  const myCount = countOf(b, me);
  const kills = new Map<Seat, { victim: Seat; taken: number }>();
  for (const q of opponents) {
    const open: { victim: Seat; taken: number; worth: number }[] = [];
    for (const v of alive) {
      if (v === q) continue;
      const hand = v === me ? myHand : b.handSize[v];
      if (hand === 0 && v !== me) continue;
      const p = killChance(b, q, v, Math.round(income[q]), fork);
      if (p === 0) continue;
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

  let borderLoss = 0;
  const turns: OpponentTurn[] = [];
  for (const q of opponents) {
    const kill = kills.get(q);
    const turn: OpponentTurn = { seat: q, aimCase: "apart", aim: 0, hit: 0, victim: kill?.victim ?? -1, killTaken: kill?.taken ?? 0 };
    turns.push(turn);
    const qIncome = Math.round(income[q]);
    const seen = neighboursOf(b, q);
    const sweep = sweepOf(b, me, q, qIncome, thirdParty);
    // A seat q doesn't border is still hit when q's sweep reaches it through a third player.
    if (!seen.includes(me)) {
      if (sweep.lost === 0) continue;
      seen.push(me);
    }
    const blow = blowsAgainst(b, me, q, qIncome);
    let aim: number;
    if (commonThreat === me) {
      turn.aimCase = "leader";
      aim = beliefs.leaderAim;
    } else if (commonThreat !== null && commonThreat !== q) {
      turn.aimCase = "ally";
      aim = beliefs.allyAim;
    } else {
      turn.aimCase = "share";
      const hurtMe = Math.max(blowCost(blow, H), sweepCost(b, me, sweep, H, 1));
      let all = 0;
      for (const v of seen) {
        all += v === me ? hurtMe : Math.max(blowCost(blowsAgainst(b, v, q, qIncome), H), sweepCost(b, v, sweepOf(b, v, q, qIncome, thirdParty), H, 1));
      }
      const share = all > 0 ? hurtMe / all : 1 / seen.length;
      const even = 1 / seen.length;
      aim = even + beliefs.aimSlope * (share - even);
    }
    if (record !== null) {
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

function incomeGain(b: Board, q: Seat, victim: Seat): number {
  const after = b.owner.map((o) => (o === victim ? q : o));
  return incomeFrom(after, q, 1) - incomeFrom(b.owner, q, 1);
}

function strongestBeside(b: Board, q: Seat, t: number): number {
  let a = -1;
  for (const n of ADJ[t]) if (b.owner[n] === q) a = Math.max(a, b.armies[n] - 1);
  return a;
}

interface Blows {
  exchange: number;
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

function blowCost(blows: Blows, horizon: number): number {
  let worst = blows.exchange;
  for (let c = 0; c < CONTINENT_BONUS.length; c++) worst = Math.max(worst, blows.breakChance[c] * (horizon * CONTINENT_BONUS[c]));
  return worst;
}

/** v4's sweep against `me`, or with `thirdParty` the worse of it and a sweep from q's biggest
 *  stack through a third player's territories. */
export function sweepOf(b: Board, me: Seat, q: Seat, qIncome: number, thirdParty: boolean): Sweep {
  const direct = sweepAgainst(b, me, q, qIncome);
  if (!thirdParty) return direct;
  const via = sweepThrough(b, me, q, qIncome);
  return via !== null && via.lost > direct.lost ? via : direct;
}

/** A capture the sweep counts as sure (v4's bar). */
const SURE = 0.9;
/** The most third-party territories a sweep takes on its way to me. */
const WAY_IN = 2;

function arriving(a: number, d: number): number {
  const o = battleOutcome(a, d);
  return o.pWin > 0 ? o.survivors / o.pWin : 0;
}

/** `q`'s sweep from its biggest stack, everything to place on it, when that stack isn't beside
 *  me: it breaks through at most two of a third player's territories, each a sure capture, to
 *  the one beside mine it reaches with the most armies, and sweeps me from there as v4's does.
 *  In 9VFL a person went from Iceland through a bot's Great Britain and Western Europe into
 *  another's Africa and took 5 of its territories; that bot believed his sweep would take none,
 *  since v4's sweeps start only from stacks already beside me. Null when there is no way in. */
function sweepThrough(b: Board, me: Seat, q: Seat, qIncome: number): Sweep | null {
  let biggest = -1;
  for (let t = 0; t < N; t++) if (b.owner[t] === q && (biggest < 0 || b.armies[t] > b.armies[biggest])) biggest = t;
  if (biggest < 0 || besideSeat(b.owner, biggest, me)) return null;
  const ways: { path: number[]; armies: number }[] = [];
  const walk = (at: number, armies: number, path: number[]) => {
    for (const n of ADJ[at]) {
      const o = b.owner[n];
      if (o === q || o === me || path.includes(n) || winProb(armies, b.armies[n]) < SURE) continue;
      const left = Math.round(arriving(armies, b.armies[n])) - 1;
      if (left <= 0) continue;
      const next = [...path, n];
      if (besideSeat(b.owner, n, me)) ways.push({ path: next, armies: left });
      else if (next.length < WAY_IN) walk(n, left, next);
    }
  };
  walk(biggest, b.armies[biggest] - 1 + qIncome, []);
  if (ways.length === 0) return null;
  // The way in that arrives with the most armies, the first found of equals.
  const { path, armies } = ways.reduce((x, y) => (y.armies > x.armies ? y : x));
  const owner = b.owner.slice();
  for (const t of path) owner[t] = q;
  return sweepFrom(b, me, owner, path[path.length - 1], armies);
}

/** v4's sweep loop, from one stack of `armies` on `at`. */
function sweepFrom(b: Board, me: Seat, owner: Int8Array, at: number, armies: number): Sweep {
  const q = owner[at];
  const stackAt = new Int8Array(N).fill(-1);
  const ready: number[] = [armies];
  stackAt[at] = 0;
  const mine: number[] = [];
  for (let t = 0; t < N; t++) if (owner[t] === me) mine.push(t);
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
      if (stack < 0 || winProb(ready[stack], b.armies[t]) < SURE) continue;
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
    ready[bestStack] = Math.max(0, Math.round(moved) - 1);
  }
}

function besideSeat(owner: Int8Array, t: number, seat: Seat): boolean {
  for (const n of ADJ[t]) if (owner[n] === seat) return true;
  return false;
}
