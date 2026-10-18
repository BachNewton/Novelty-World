import type { Seat } from "../contract";
import { armiesOf, CONTINENT_BONUS, countOf, holdsContinent, opponentsInOrder, type Board } from "../bots/rule-v1/board";
import { CARD_WORTH, DRAW_CHANCE } from "../bots/rule-v1/cards";
import { bestBlow, expectedIncome, hiddenCards, myCards, sweepLoss } from "../bots/rule-v3/evaluate";
import { V3_PARAMS, type Params, type Preferences } from "../bots/rule-v3/params";
import { killChance } from "../bots/rule-v3/routes";
import { neighboursOf, type OpponentTurn } from "../bots/rule-v4/opponents";

// v3's opponent model, as v3's evaluation holds it inside its breakdown (`bots/rule-v3/evaluate.ts`),
// written out so `risk:opponents` can score it beside v4's: v3 is frozen and seated, so its model
// is the standing reference. A test holds it to v3's own breakdown.

/** v3's preferences at a table: the small table's while three or more are alive. */
export function v3Prefs(players: number, alive: number): Preferences {
  return players <= V3_PARAMS.smallTable.players && alive >= 3 ? V3_PARAMS.smallTable.prefs : V3_PARAMS.prefs;
}

export interface V3Forecast {
  power: number[];
  total: number;
  commonThreat: Seat | null;
  spared: number[];
  borderLoss: number;
  turns: OpponentTurn[];
}

export function v3Forecast(b: Board, me: Seat, alive: readonly Seat[]): V3Forecast {
  const prefs = v3Prefs(b.players, alive.length);
  const om: Params["opponents"] = V3_PARAMS.opponents;
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
    let best = 0;
    let victim = -1;
    let bestTaken = 0;
    for (const v of alive) {
      if (v === q) continue;
      const hand = v === me ? myHand : b.handSize[v];
      if (hand === 0 && v !== me) continue;
      const p = killChance(b, q, v, Math.round(income[q]));
      if (p === 0) continue;
      const pays = hand + b.handSize[q] >= 5 || hand >= 3 || (v === me && myCount <= 2);
      const taken = p * (p >= om.killBar || pays ? 1 : om.unpaidKillChance);
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

  let borderLoss = 0;
  const turns: OpponentTurn[] = [];
  for (const q of opponents) {
    const kill = kills.get(q);
    const turn: OpponentTurn = { seat: q, aimCase: "apart", aim: 0, hit: 0, victim: kill?.victim ?? -1, killTaken: kill?.taken ?? 0 };
    turns.push(turn);
    const seen = neighboursOf(b, q);
    if (!seen.includes(me)) continue;
    const qIncome = Math.round(income[q]);
    let aim: number;
    if (commonThreat === me) {
      turn.aimCase = "leader";
      aim = 1;
    } else if (commonThreat !== null && commonThreat !== q) {
      turn.aimCase = "ally";
      aim = 0.25;
    } else {
      turn.aimCase = "share";
      const hurt = (v: Seat) => Math.max(bestBlow(b, v, q, qIncome, H), sweepLoss(b, v, q, qIncome, H, 1));
      const hurtMe = hurt(me);
      let all = 0;
      for (const v of seen) all += hurt(v);
      aim = all > 0 ? hurtMe / all : 1 / Math.max(1, seen.length);
    }
    const hit = Math.max(bestBlow(b, me, q, qIncome, H * prefs.myContinentWeight), sweepLoss(b, me, q, qIncome, H, prefs.myContinentWeight));
    turn.aim = aim;
    turn.hit = hit;
    borderLoss += aim * hit;
  }
  return { power, total, commonThreat, spared, borderLoss, turns };
}
