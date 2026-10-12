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

/** An attack whose range starts above zero is floored: however few slots
 *  succeed, the roll counts as at least this share of the way from min to max.
 *  The share is half the attack's stat, which is what the slot chance shows
 *  before Focus. The game builds the shown minimum from that same share, so in
 *  effect it counts twice. A range starting at zero has no floor. */
export function floorPercent(attack: Attack): number {
  return attack.minDamage > 0 ? attack.slotPercent / 2 : 0;
}

/** The share of successful slots, rounded to two decimals and floored as above;
 *  damage runs that far from min to max and is truncated. No successes with a
 *  minimum of zero is a whiff. Shares are in thousandths, so the arithmetic is
 *  exact like the game's decimal arithmetic. */
export function damageForSuccesses(attack: Attack, successes: number): number {
  return damageAtShare(attack, Math.max(10 * floorPercent(attack), successShare(attack, successes)));
}

/** Whether the floor makes this many successes deal more than they would
 *  without it. */
export function floorRaises(attack: Attack, successes: number): boolean {
  return damageForSuccesses(attack, successes) > damageAtShare(attack, successShare(attack, successes));
}

/** The share of slots that succeeded, in thousandths, rounded as the game
 *  rounds it: to two decimals. */
function successShare(attack: Attack, successes: number): number {
  return 10 * roundHalfEven((100 * successes) / attack.slots);
}

function damageAtShare(attack: Attack, thousandths: number): number {
  return attack.minDamage + Math.trunc(((attack.maxDamage - attack.minDamage) * thousandths) / 1000);
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
