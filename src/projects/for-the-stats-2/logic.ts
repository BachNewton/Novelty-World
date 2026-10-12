/** An attack as For The King II rolls it: a damage range rolled over a number
 *  of slots, each slot succeeding on its own at the same chance.
 *
 *  The rules follow the game's own code (decompiled from FTK2.dll), mainly
 *  SlotRollHelper, CharacterHelper, CombatHelper and InteractableHelper. */
import { ATTACK_SHAPES } from "./attack-shapes";

/** What the player enters, read off the combat screen and the character
 *  sheet, with the what-ifs they want to try. */
export interface ScreenAttack extends WhatIf {
  minDamage: number;
  maxDamage: number;
  slots: number;
  /** The per-slot chance the game shows before Focus, in whole percent. */
  slotPercent: number;
  /** Focus spent: each point fills one slot with a guaranteed success. */
  focus: number;
  /** The character sheet's Crit Chance, in whole percent. */
  critChance: number;
  /** The character sheet's Crit Damage: bonus on top of the hidden base 15%. */
  critDamage: number;
  /** The target's Armor against a physical attack, or Resistance against a
   *  magical one. */
  armor: number;
  /** An "Ignore Armor" attack: a perfect roll skips the target's armor. */
  ignoresArmor: boolean;
  /** Shocked: unless Focus is spent, the first slot fails. */
  shocked: boolean;
}

/** States the player can try before they happen: being poisoned, or freezing
 *  the target. The combat screen's numbers already include them once they
 *  have. */
export interface WhatIf {
  poisoned: boolean;
  frozen: boolean;
}

/** An attack with everything the damage depends on, hidden numbers included. */
export interface Attack extends Omit<ScreenAttack, keyof WhatIf> {
  /** However few slots succeed, the roll counts as at least this share of the
   *  way from min to max, in ten-thousandths. */
  floorShare: number;
}

/** One way the attack can land: how many slots succeeded, whether it crit, and
 *  the damage the target takes. */
export interface Outcome {
  successes: number;
  crit: boolean;
  damage: number;
  probability: number;
}

const BASE_CRIT_DAMAGE_PERCENT = 15;
const CRIT_CHANCE_PER_FOCUS = 5;
const POISON_STAT_LOSS = 10;
const FROZEN_DAMAGE_PERCENT = 125;

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
export function rolledSlotPercent(attack: Pick<Attack, "slotPercent" | "focus">): number {
  return Math.min(MAX_SLOT_PERCENT, Math.max(MIN_SLOT_PERCENT, attack.slotPercent + focusBonus(attack.focus)));
}

/** A share of the range from the count of successful slots, rounded to two
 *  decimals as the game rounds it, then floored. Damage runs that far from min
 *  to max and is truncated. In ten-thousandths, so the arithmetic is exact like
 *  the game's decimal arithmetic. */
export function damageForSuccesses(attack: Attack, successes: number): number {
  return damageAtShare(attack, Math.max(attack.floorShare, successShare(attack, successes)));
}

/** Whether the floor makes this many successes land harder than they would
 *  without it. */
export function floorRaises(attack: Attack, successes: number): boolean {
  const perfect = successes === attack.slots;
  return (
    hitDamage(attack, successes, false) > landed(attack, damageAtShare(attack, successShare(attack, successes)), perfect)
  );
}

/** Only a perfect roll can crit. Each Focus point spent adds to the chance. */
export function critPercent(attack: Pick<Attack, "critChance" | "focus">): number {
  return Math.min(100, Math.max(0, attack.critChance + CRIT_CHANCE_PER_FOCUS * attack.focus));
}

/** The damage the target takes from this many successes, with or without a
 *  crit. A crit adds the rolled damage times the crit ratio, rounded, and at
 *  least 1. Armor comes off last, except a perfect roll of an "Ignore Armor"
 *  attack, and damage never goes below zero. */
export function hitDamage(attack: Attack, successes: number, crit: boolean): number {
  const rolled = damageForSuccesses(attack, successes);
  const critBonus =
    crit && rolled > 0
      ? Math.max(1, roundHalfEven((rolled * (BASE_CRIT_DAMAGE_PERCENT + attack.critDamage)) / 100))
      : 0;
  return landed(attack, rolled + critBonus, successes === attack.slots);
}

function landed(attack: Attack, damage: number, perfect: boolean): number {
  const blocked = attack.ignoresArmor && perfect ? 0 : attack.armor;
  return Math.max(0, damage - blocked);
}

function successShare(attack: Attack, successes: number): number {
  return 100 * roundHalfEven((100 * successes) / attack.slots);
}

function damageAtShare(attack: Attack, share: number): number {
  return attack.minDamage + Math.trunc(((attack.maxDamage - attack.minDamage) * share) / 10000);
}

/** Every way the attack can land, with its probability: the focused slots
 *  always succeed, a shock with no Focus spent fails the first slot, the rest
 *  are binomial, and a perfect roll splits into a crit and a plain hit. */
export function outcomes(attack: Attack): Outcome[] {
  const { slots, focus } = attack;
  const chance = rolledSlotPercent(attack) / 100;
  const crit = critPercent(attack) / 100;
  const shockedOut = attack.shocked && focus === 0 ? 1 : 0;
  const rolled = slots - focus - shockedOut;
  const result: Outcome[] = [];
  let ways = 1;
  for (let hits = 0; hits <= rolled; hits++) {
    const successes = focus + hits;
    const probability = ways * chance ** hits * (1 - chance) ** (rolled - hits);
    if (successes === slots && crit > 0) {
      result.push({ successes, crit: false, damage: hitDamage(attack, successes, false), probability: probability * (1 - crit) });
      result.push({ successes, crit: true, damage: hitDamage(attack, successes, true), probability: probability * crit });
    } else {
      result.push({ successes, crit: false, damage: hitDamage(attack, successes, false), probability });
    }
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

/** The attacks the screen's numbers could be, each with its hidden numbers.
 *
 *  The game builds the range from numbers it never shows: the ability's min
 *  and max shares of the attack value (from its weapon data), the attack
 *  value, and the attack's stat, which is the shown slot chance. The shown
 *  min and max are those rounded, so each shape in the game's data and each
 *  whole attack value that rounds to them is a candidate. Usually there is
 *  one; the caller takes the lowest result wherever candidates disagree.
 *
 *  The what-ifs are applied to each candidate as the game would: poison takes
 *  10 from the stat, and freezing adds a quarter to the damage multiplier,
 *  before the game rounds the range. Damage bonuses against a creature type
 *  and attack tiles are taken to be absent. `matched` is false when no
 *  candidate fits, and the attack is then read as the most common shape: a
 *  min of half the stat and a max of the attack value. */
export function resolve(screen: ScreenAttack): { attacks: Attack[]; matched: boolean } {
  const { minDamage, maxDamage, slots, slotPercent: stat } = screen;
  const attacks: Attack[] = [];
  for (const shape of ATTACK_SHAPES) {
    if (shape.rolls !== slots && Math.max(1, Math.floor(shape.rolls / 2)) !== slots) continue;
    for (const value of attackValues(shape.max, maxDamage)) {
      if (roundHalfEven((shape.min * stat * value) / 10000) !== minDamage) continue;
      attacks.push(build(screen, shape.min, shape.max, value));
    }
  }
  if (attacks.length > 0) return { attacks, matched: true };
  return { attacks: [build(screen, minDamage > 0 ? 50 : 0, 100, maxDamage)], matched: false };
}

/** The whole attack values that a max share (in hundredths) rounds to the
 *  shown max. */
function attackValues(maxShare: number, maxDamage: number): number[] {
  const values: number[] = [];
  const low = Math.max(1, Math.floor(((maxDamage - 0.5) * 100) / maxShare));
  const high = Math.ceil(((maxDamage + 0.5) * 100) / maxShare);
  for (let value = low; value <= high; value++) {
    if (roundHalfEven((maxShare * value) / 100) === maxDamage) values.push(value);
  }
  return values;
}

/** One candidate with the what-ifs applied: the range rebuilt from its hidden
 *  numbers as the game builds it, rounding halves to even. */
function build(screen: ScreenAttack, minShare: number, maxShare: number, value: number): Attack {
  const { poisoned, frozen, ...rest } = screen;
  const stat = poisoned ? Math.max(0, screen.slotPercent - POISON_STAT_LOSS) : screen.slotPercent;
  const multiplier = frozen ? FROZEN_DAMAGE_PERCENT : 100;
  const changed = poisoned || frozen;
  return {
    ...rest,
    slotPercent: stat,
    minDamage: changed ? roundHalfEven((minShare * stat * value * multiplier) / 1_000_000) : screen.minDamage,
    maxDamage: changed ? roundHalfEven((maxShare * value * multiplier) / 10_000) : screen.maxDamage,
    floorShare: minShare * stat,
  };
}

/** What to show for one success count. */
export interface PredictedRow {
  successes: number;
  /** The damage the target takes. */
  damage: number;
  /** The damage before armor, which tells a miss from a hit armor blocked. */
  rolled: number;
  /** Whether the floor raised it. */
  floored: boolean;
  /** The chance of dealing at least `damage`. */
  chance: number;
}

/** Everything the screen shows, from every attack the screen's numbers could
 *  be. Where those disagree it shows the least: a smaller hit, a smaller
 *  chance of it, a bigger chance of dealing nothing. So a row that says the
 *  attack kills is never wrong. */
export interface Prediction {
  /** From a perfect roll down to no successes. */
  rows: PredictedRow[];
  /** A perfect roll's crit, if one is possible. */
  crit: { damage: number; chance: number } | null;
  /** The chance of dealing no damage at all. */
  nothing: number;
  expected: number;
  /** The floor, in percent of the way from min to max. */
  floorPercent: number;
  /** The chance a rolled slot succeeds, Focus and what-ifs included. */
  rolledPercent: number;
  /** Whether the screen's numbers fit an attack in the game's data. */
  matched: boolean;
}

export function predict(screen: ScreenAttack): Prediction {
  const { attacks, matched } = resolve(screen);
  const least = (each: (attack: Attack) => number) => Math.min(...attacks.map(each));
  const [first] = attacks;
  const rows = Array.from({ length: screen.slots + 1 }, (_, index) => screen.slots - index).map((successes) => {
    const damage = least((attack) => hitDamage(attack, successes, false));
    return {
      successes,
      damage,
      rolled: least((attack) => damageForSuccesses(attack, successes)),
      floored: attacks.every((attack) => floorRaises(attack, successes)),
      chance: least((attack) => chanceOfAtLeast(attack, damage)),
    };
  });
  const critDamage = least((attack) => hitDamage(attack, attack.slots, true));
  return {
    rows,
    crit:
      critPercent(screen) > 0 ? { damage: critDamage, chance: least((attack) => chanceOfAtLeast(attack, critDamage)) } : null,
    nothing: Math.max(
      ...attacks.map((attack) =>
        outcomes(attack)
          .filter((o) => o.damage === 0)
          .reduce((sum, o) => sum + o.probability, 0),
      ),
    ),
    expected: least(expectedDamage),
    floorPercent: least((attack) => attack.floorShare) / 100,
    rolledPercent: rolledSlotPercent(first),
    matched,
  };
}

/** C#'s Math.Round on a decimal: an exact half goes to the even neighbour. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
