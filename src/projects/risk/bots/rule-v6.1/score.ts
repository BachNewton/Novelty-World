import type { Seat } from "../../contract";
import { armiesOf, boardIncome, boardKey, type Board } from "../rule-v1/board";
import { Memo } from "../memo";
import type { Breakdown, Scorer } from "../rule-v6/evaluate";
import { forecast } from "../rule-v6/opponents";
import type { Params as V6Params } from "../rule-v6/params";
import { borderOf } from "./border";
import type { Params } from "./params";

// v6.1's reading of v6's breakdown (`ideas/rule-bot-v6.1.md`). Every board v6's planner, move-in,
// trade and fortify score goes through the settings' scorer, so this is the only place v6.1's
// changes live: the border loss gathered by `border`, the border weight eased by `attrition`, and
// with `power` "armies" the share of power re-priced with hoarded armies at a discount.

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

/** v6's value rebuilt on re-priced power: the share, the scale every term is divided by, and the
 *  common threat and lead terms all read the new power; the border charge is `border` at
 *  `weight`. The kill exposure, opportunity and idle armies are the breakdown's, as v6 found
 *  them; so are the opponent model's aim cases and kill beliefs, which this can't reach. */
function repricedValue(b: Board, me: Seat, bd: Breakdown, params: V6Params, alive: readonly Seat[], power: readonly number[], border: number, weight: number): number {
  const prefs = params.prefs;
  const om = params.opponents;
  let total = 0;
  for (const p of alive) total += power[p];
  const share = power[me] / total;
  let value =
    share * (1 - prefs.vulnerabilityWeight * bd.killExposure) -
    (weight * border) / total +
    (prefs.opportunityWeight * bd.opportunity) / total -
    (prefs.idleWeight * bd.idle) / total;
  const ratio = om.leaderRatio + om.leaderRatioPerPlayer * (alive.length - 4);
  let commonThreat: Seat | null = null;
  for (const p of alive) {
    if (alive.every((q) => q === p || power[p] > ratio * power[q])) commonThreat = p;
  }
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

/** The scorer for `params` (the settings a decision plays by, from the same opponent record the
 *  breakdown was taken with) under v6.1's `settings`. With `power` "face" it is v6's value with
 *  v6's summed charge taken back out and the chosen one put in, so with `border` "sum" and the
 *  attrition scale at 1 it adds exactly 0 to v6's value. */
export function scorerFor(params: V6Params, settings: Pick<Params, "border" | "power" | "armyRounds" | "armyBeyond" | "attrition">): Scorer {
  const borders = new Memo<number>(300);
  return (b: Board, me: Seat, bd: Breakdown): number => {
    const alive: Seat[] = [];
    for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
    // A seat out of the game, or the last one in it: v6's breakdown has no terms to re-read there.
    if (!b.alive[me] || alive.length === 1) return bd.value;
    const border =
      settings.border === "sum" ? bd.borderLoss : borders.get(`${me.toString()}|${boardKey(b)}`, () => borderOf(forecast(b, me, params, alive, params.record).turns, settings.border));
    const w = params.prefs.borderWeight;
    const scale = attritionScale(b, alive, settings.attrition);
    if (settings.power === "armies") {
      return repricedValue(b, me, bd, params, alive, repricedPower(b, me, bd, settings.armyRounds, settings.armyBeyond), border, w * scale);
    }
    // Written so that at a scale of 1 it is the `border` modes' own arithmetic, float for float.
    return bd.value + (w * (bd.borderLoss - scale * border)) / bd.total;
  };
}
