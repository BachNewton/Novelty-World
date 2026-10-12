/** An attack as For The King II shows it: a damage range rolled over a number
 *  of slots, each slot succeeding on its own at the same chance. */
export interface Attack {
  minDamage: number;
  maxDamage: number;
  slots: number;
  /** Chance that one slot succeeds, from 0 to 1. */
  slotChance: number;
}

export interface Outcome {
  successes: number;
  damage: number;
  probability: number;
}

/** Damage is spread linearly across the slots: no successes deals the minimum,
 *  a perfect roll the maximum, and partial damage rounds to the nearest whole
 *  number. Measured by players, not documented by the game. */
export function damageForSuccesses(attack: Attack, successes: number): number {
  const { minDamage, maxDamage, slots } = attack;
  return minDamage + Math.round(((maxDamage - minDamage) * successes) / slots);
}

/** Every possible success count, with its damage and binomial probability. */
export function outcomes(attack: Attack): Outcome[] {
  const { slots, slotChance } = attack;
  const result: Outcome[] = [];
  let ways = 1;
  for (let successes = 0; successes <= slots; successes++) {
    result.push({
      successes,
      damage: damageForSuccesses(attack, successes),
      probability: ways * slotChance ** successes * (1 - slotChance) ** (slots - successes),
    });
    ways = (ways * (slots - successes)) / (successes + 1);
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
