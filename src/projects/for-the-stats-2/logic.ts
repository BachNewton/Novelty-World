/** An attack as For The King II shows it: a damage range rolled over a number
 *  of slots, each slot succeeding on its own at the same chance.
 *
 *  The rules follow the game's own code (decompiled from FTK2.dll), mainly
 *  SlotRollHelper, CharacterHelper and InteractableHelper. */
export interface Attack {
  minDamage: number;
  maxDamage: number;
  slots: number;
  /** The per-slot chance the game shows before Focus, in whole percent. */
  slotPercent: number;
  /** Focus spent: each point fills one slot with a guaranteed success. */
  focus: number;
}

export interface Outcome {
  successes: number;
  damage: number;
  probability: number;
}

export const MIN_SLOT_PERCENT = 10;
export const MAX_SLOT_PERCENT = 100;

/** Each Focus point lifts every slot still rolled by a halving bonus, truncated
 *  to whole percent: +10, +5, +2, +1, then nothing. */
export function focusBonus(focus: number): number {
  let bonus = 0;
  for (let i = 0; i < focus; i++) bonus += Math.trunc(10 * 0.5 ** i);
  return bonus;
}

/** The chance a rolled slot succeeds once Focus is spent, clamped as the game
 *  clamps it. */
export function rolledSlotPercent(attack: Attack): number {
  return Math.min(MAX_SLOT_PERCENT, Math.max(MIN_SLOT_PERCENT, attack.slotPercent + focusBonus(attack.focus)));
}

/** A range with a minimum above zero is a basic attack. Its minimum is half the
 *  attack's stat as a fraction of the range, and for a basic attack that stat is
 *  the shown slot chance; the game floors every roll at that same fraction.
 *  With a minimum of zero there is no floor. In thousandths, so the arithmetic
 *  stays exact like the game's decimal arithmetic. */
function floorThousandths(attack: Attack): number {
  return attack.minDamage > 0 ? 5 * attack.slotPercent : 0;
}

/** Whether the range is the one a basic attack at the shown chance would have.
 *  When it isn't, the floor is unknown and the low rolls may be off. */
export function rangeMatchesChance(attack: Attack): boolean {
  if (attack.minDamage === 0) return true;
  return roundHalfEven((attack.slotPercent * attack.maxDamage) / 200) === attack.minDamage;
}

/** The share of successful slots, rounded to two decimals and floored as above;
 *  damage runs that far from min to max and is truncated. No successes with a
 *  minimum of zero is a whiff. */
export function damageForSuccesses(attack: Attack, successes: number): number {
  const { minDamage, maxDamage, slots } = attack;
  const share = Math.max(floorThousandths(attack), 10 * roundHalfEven((100 * successes) / slots));
  return minDamage + Math.trunc(((maxDamage - minDamage) * share) / 1000);
}

/** Every possible success count, with its damage and probability: the focused
 *  slots always succeed, and the rest are binomial. */
export function outcomes(attack: Attack): Outcome[] {
  const { slots, focus } = attack;
  const chance = rolledSlotPercent(attack) / 100;
  const rolled = slots - focus;
  const result: Outcome[] = [];
  let ways = 1;
  for (let hits = 0; hits <= rolled; hits++) {
    result.push({
      successes: focus + hits,
      damage: damageForSuccesses(attack, focus + hits),
      probability: ways * chance ** hits * (1 - chance) ** (rolled - hits),
    });
    ways = (ways * (rolled - hits)) / (hits + 1);
  }
  return result;
}

export function expectedDamage(attack: Attack): number {
  return outcomes(attack).reduce((sum, o) => sum + o.damage * o.probability, 0);
}

export function chanceOfAtLeast(attack: Attack, damage: number): number {
  return outcomes(attack)
    .filter((o) => o.damage >= damage)
    .reduce((sum, o) => sum + o.probability, 0);
}

/** C#'s Math.Round on a decimal: an exact half goes to the even neighbour. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
