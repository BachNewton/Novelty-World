import type { Seat } from "../../contract";
import { armiesOf, boardIncome, boardKey, type Board } from "../rule-v1/board";
import { Memo } from "../memo";
import { neighboursOf } from "../rule-v4/opponents";
import type { Breakdown, Scorer } from "../rule-v6/evaluate";
import { forecast, type OpponentTurn } from "../rule-v6/opponents";
import type { Params as V6Params } from "../rule-v6/params";
import { borderOf } from "./border";
import type { Params } from "./params";

// v6.1's reading of v6's breakdown (`ideas/rule-bot-v6.1.md`). Every board v6's planner, move-in,
// trade and fortify score goes through the settings' scorer, so this is where v6.1's changes
// live, apart from the planner's common threat (`planner.ts`): the border loss gathered by
// `border`, the border weight eased by `attrition`, and with `power` "armies" the share of power
// re-priced with hoarded armies at a discount, reaching the opponent model's aims with `reprice`
// "full".

/** A seat's armies as `power` "armies" counts them: fully up to `rounds` rounds of its income,
 *  at `beyond` each past that. */
export function pricedArmies(armies: number, income: number, rounds: number, beyond: number): number {
  const cap = rounds * income;
  return armies <= cap ? armies : cap + beyond * (armies - cap);
}

/** What `attrition` scales the border weight by: min(1, k × the alive seats' board income ÷ their
 *  armies), so 1 while the board holds up to k rounds of income; 1 always with k at 0. */
export function attritionScale(b: Board, alive: readonly Seat[], k: number): number {
  if (k === 0) return 1;
  let income = 0;
  let armies = 0;
  for (const p of alive) {
    income += boardIncome(b, p);
    armies += armiesOf(b, p);
  }
  return Math.min(1, (k * income) / armies);
}

/** Every seat's power with its armies re-priced: v6's power less the armies' discount. In v6's
 *  forecast a seat's armies enter its power at face value and are then scaled by every kill the
 *  opponents might make of it, the same factors its `spared` chance multiplies (mine aren't: my
 *  power is never scaled by my own death), so the discount is scaled the same way. The result is
 *  exactly the power v6's forecast would give with the discounted armies in its sum. */
export function repricedPower(b: Board, me: Seat, bd: Breakdown, rounds: number, beyond: number): number[] {
  return bd.power.map((p, s) => {
    if (!b.alive[s]) return 0;
    const armies = armiesOf(b, s);
    const discount = armies - pricedArmies(armies, boardIncome(b, s), rounds, beyond);
    return p - discount * (s === me ? 1 : bd.spared[s]);
  });
}

/** The bar a seat's power must clear over every other's to be the common threat: v6's. */
function leaderBar(params: V6Params, alive: number): number {
  return params.opponents.leaderRatio + params.opponents.leaderRatioPerPlayer * (alive - 4);
}

/** The common threat `power` names, as v6's forecast finds it: the seat whose power is over
 *  `bar` times every other's. */
export function commonThreatOf(power: readonly number[], alive: readonly Seat[], bar: number): Seat | null {
  let commonThreat: Seat | null = null;
  for (const p of alive) {
    if (alive.every((q) => q === p || power[p] > bar * power[q])) commonThreat = p;
  }
  return commonThreat;
}

const threatless = new WeakMap<V6Params, V6Params>();

/** `params` with a common-threat bar no seat clears, so v6's forecast reads every opponent's aim
 *  at me by its "share" case. */
function withoutThreat(params: V6Params): V6Params {
  let out = threatless.get(params);
  if (out === undefined) threatless.set(params, (out = { ...params, opponents: { ...params.opponents, leaderRatio: Infinity } }));
  return out;
}

/** The opponents' turns of v6's forecast as they would be with `threat` the common threat: each
 *  aim case picked by the threat as v6 picks it ("leader" when it is me, "ally" when it is a third
 *  seat, otherwise "share"), its aim pulled toward this game's record as v6 pulls it. The hits and
 *  the "share" aims don't depend on the threat, so they are v6's own, read from a forecast that
 *  names none: the "share" aim's arithmetic is private to v6's forecast, so this asks the forecast
 *  rather than copying it. With v6's own threat the border loss these give is v6's, sum for sum. */
export function turnsUnder(b: Board, me: Seat, params: V6Params, alive: readonly Seat[], threat: Seat | null): OpponentTurn[] {
  const beliefs = params.opponents.beliefs;
  const record = params.record;
  return forecast(b, me, withoutThreat(params), alive, record).turns.map((t) => {
    if (t.aimCase === "apart") return t;
    const aimCase = threat === me ? "leader" : threat !== null && threat !== t.seat ? "ally" : "share";
    if (aimCase === "share") return t;
    let aim = aimCase === "leader" ? beliefs.leaderAim : beliefs.allyAim;
    if (record !== null) {
      // The seats the opponent reaches, in v6's order: its neighbours, then me when its sweep
      // reaches me only through a third player.
      const seen = neighboursOf(b, t.seat);
      if (!seen.includes(me)) seen.push(me);
      const row = record.taken[t.seat];
      let taken = 0;
      for (const v of seen) taken += row[v];
      aim = (beliefs.historyPrior * aim + row[me]) / (beliefs.historyPrior + taken);
    }
    return { ...t, aimCase, aim };
  });
}

/** v6's value rebuilt on re-priced power: the share, the scale every term is divided by, and the
 *  common threat and lead terms all read the new power, with `commonThreat` the threat it names;
 *  the border charge is `border` at `weight`. The kill exposure, opportunity and idle armies are
 *  the breakdown's, as v6 found them: they read kill chances, hands and interior armies, never
 *  power. */
function repricedValue(
  me: Seat,
  bd: Breakdown,
  params: V6Params,
  alive: readonly Seat[],
  power: readonly number[],
  commonThreat: Seat | null,
  border: number,
  weight: number,
): number {
  const prefs = params.prefs;
  let total = 0;
  for (const p of alive) total += power[p];
  const share = power[me] / total;
  let value =
    share * (1 - prefs.vulnerabilityWeight * bd.killExposure) -
    (weight * border) / total +
    (prefs.opportunityWeight * bd.opportunity) / total -
    (prefs.idleWeight * bd.idle) / total;
  const ratio = leaderBar(params, alive.length);
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
  return value;
}

export type ScoreSettings = Pick<Params, "border" | "power" | "armyRounds" | "armyBeyond" | "attrition" | "reprice">;

function aliveOn(b: Board): Seat[] {
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  return alive;
}

/** The common threat the planner builds its plans round under `settings`: with `power` "armies"
 *  and `reprice` "full", the one the re-priced power names; otherwise undefined, so the planner
 *  reads v6's off its breakdown. */
export function threatFor(params: V6Params, settings: ScoreSettings): ((b: Board, me: Seat, bd: Breakdown) => Seat | null) | undefined {
  if (settings.power !== "armies" || settings.reprice !== "full") return undefined;
  return (b, me, bd) => {
    const alive = aliveOn(b);
    if (!b.alive[me] || alive.length === 1) return bd.commonThreat;
    return commonThreatOf(repricedPower(b, me, bd, settings.armyRounds, settings.armyBeyond), alive, leaderBar(params, alive.length));
  };
}

/** The scorer for `params` (the settings a decision plays by, from the same opponent record the
 *  breakdown was taken with) under v6.1's `settings`. With `power` "face" it is v6's value with
 *  v6's summed charge taken back out and the chosen one put in, so with `border` "sum" and the
 *  attrition scale at 1 it adds exactly 0 to v6's value. */
export function scorerFor(params: V6Params, settings: ScoreSettings): Scorer {
  const faceBorders = new Memo<number>(300);
  const threatBorders = new Memo<number>(300);
  return (b: Board, me: Seat, bd: Breakdown): number => {
    const alive = aliveOn(b);
    // A seat out of the game, or the last one in it: v6's breakdown has no terms to re-read there.
    if (!b.alive[me] || alive.length === 1) return bd.value;
    const key = `${me.toString()}|${boardKey(b)}`;
    const faceBorder = () =>
      settings.border === "sum" ? bd.borderLoss : faceBorders.get(key, () => borderOf(forecast(b, me, params, alive, params.record).turns, settings.border));
    const w = params.prefs.borderWeight;
    const scale = attritionScale(b, alive, settings.attrition);
    if (settings.power === "armies") {
      const power = repricedPower(b, me, bd, settings.armyRounds, settings.armyBeyond);
      const threat = commonThreatOf(power, alive, leaderBar(params, alive.length));
      // With `reprice` "full" the opponents aim at me by the re-priced threat; where that is v6's
      // own threat the aims are v6's, and so is the border loss.
      const border =
        settings.reprice === "full" && threat !== bd.commonThreat
          ? threatBorders.get(key, () => borderOf(turnsUnder(b, me, params, alive, threat), settings.border))
          : faceBorder();
      return repricedValue(me, bd, params, alive, power, threat, border, w * scale);
    }
    // Written so that at a scale of 1 it is the `border` modes' own arithmetic, float for float.
    return bd.value + (w * (bd.borderLoss - scale * faceBorder())) / bd.total;
  };
}
