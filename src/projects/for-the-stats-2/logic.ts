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
interface WhatIf {
  poisoned: boolean;
  frozen: boolean;
}

/** An attack with everything the damage depends on, hidden numbers included. */
export interface Attack extends Omit<ScreenAttack, keyof WhatIf> {
  /** However few slots succeed, the roll counts as at least this share of the
   *  way from min to max, in ten-thousandths. */
  floorShare: number;
}

/** Who takes the hit: the target, or each neighbour a Splash or Swipe hits
 *  with the same roll. */
export type Area = "target" | "splash";

/** One way the attack can land: how many slots succeeded, whether it crit, and
 *  the damage taken. */
export interface Outcome {
  successes: number;
  crit: boolean;
  damage: number;
  probability: number;
}

const BASE_CRIT_DAMAGE_PERCENT = 15;
const CRIT_CHANCE_PER_FOCUS = 5;
const POISON_STAT_LOSS = 10;
const FROZEN_DAMAGE_PERCENT = 25;
const AREA_PERCENT: Record<Area, number> = { target: 100, splash: 50 };
const GEAR_ACCURACY = [0, 5, 10];

const MIN_SLOT_PERCENT = 10;
export const MAX_SLOT_PERCENT = 100;
export const MAX_SLOTS = 6;

/** Each Focus point lifts every slot still rolled by a halving bonus, truncated
 *  to whole percent: +10, +5, +2, +1, then nothing. */
export function focusBonus(focus: number): number {
  let bonus = 0;
  for (let i = 0; i < focus; i++) bonus += Math.trunc(10 * 0.5 ** i);
  return bonus;
}

/** The chance a rolled slot succeeds once Focus is spent. The game adds Focus
 *  to the unclamped chance and clamps the sum, so `slotPercent` here is the
 *  unclamped chance. */
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
export function floorRaises(attack: Attack, successes: number, area: Area = "target"): boolean {
  const unfloored = damageAtShare(attack, successShare(attack, successes));
  return (
    hitDamage(attack, successes, false, area) >
    landed(attack, struck(attack, unfloored, false, area), successes === attack.slots)
  );
}

/** Only a perfect roll can crit. Each Focus point spent adds to the chance. */
export function critPercent(attack: Pick<Attack, "critChance" | "focus">): number {
  return Math.min(100, Math.max(0, attack.critChance + CRIT_CHANCE_PER_FOCUS * attack.focus));
}

/** The damage before armor from this many successes, with or without a crit.
 *  A crit adds the rolled damage times the crit ratio, rounded, and at least
 *  1. A Splash or Swipe's neighbours share the target's roll and crit, and
 *  take half of it, rounded halves to even. */
export function damageBeforeArmor(attack: Attack, successes: number, crit: boolean, area: Area = "target"): number {
  return struck(attack, damageForSuccesses(attack, successes), crit, area);
}

/** The damage taken from this many successes: armor comes off last, except a
 *  perfect roll of an "Ignore Armor" attack, and damage never goes below zero.
 *  Neighbours are taken to have the target's armor. */
export function hitDamage(attack: Attack, successes: number, crit: boolean, area: Area = "target"): number {
  return landed(attack, damageBeforeArmor(attack, successes, crit, area), successes === attack.slots);
}

function struck(attack: Attack, rolled: number, crit: boolean, area: Area): number {
  const critBonus =
    crit && rolled > 0
      ? Math.max(1, roundHalfEven((rolled * (BASE_CRIT_DAMAGE_PERCENT + attack.critDamage)) / 100))
      : 0;
  return roundHalfEven(((rolled + critBonus) * AREA_PERCENT[area]) / 100);
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
export function outcomes(attack: Attack, area: Area = "target"): Outcome[] {
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
    const damage = (isCrit: boolean) => hitDamage(attack, successes, isCrit, area);
    if (successes === slots && crit > 0) {
      result.push({ successes, crit: false, damage: damage(false), probability: probability * (1 - crit) });
      result.push({ successes, crit: true, damage: damage(true), probability: probability * crit });
    } else {
      result.push({ successes, crit: false, damage: damage(false), probability });
    }
    ways = (ways * (rolled - hits)) / (hits + 1);
  }
  return result;
}

export function expectedDamage(attack: Attack, area: Area = "target"): number {
  return outcomes(attack, area).reduce((sum, o) => sum + o.damage * o.probability, 0);
}

export function chanceOfAtLeast(attack: Attack, damage: number, area: Area = "target"): number {
  return chanceOf(attack, area, (o) => o.damage >= damage);
}

/** The chance of the outcomes that pass, exactly 1 when they all do: the
 *  binomial terms can sum a hair under 1 in floating point. */
function chanceOf(attack: Attack, area: Area, passes: (outcome: Outcome) => boolean): number {
  const all = outcomes(attack, area);
  const passing = all.filter(passes);
  return passing.length === all.length ? 1 : passing.reduce((sum, o) => sum + o.probability, 0);
}

/** The attacks the screen's numbers could be, each with its hidden numbers.
 *
 *  The game builds the range from numbers it never shows: the ability's min
 *  and max shares of the attack value (from its weapon data), the attack
 *  value, and the attack's stat, which the shown chance includes along with
 *  any accuracy from the weapons in hand. The shown
 *  min and max are those rounded, so each shape in the game's data, each
 *  whole attack value and each stat that rounds to them is a candidate. The
 *  caller takes the lowest result wherever candidates disagree.
 *
 *  The what-ifs are applied to each candidate as the game would: poison takes
 *  10 from the stat, and freezing adds a quarter to the damage multiplier,
 *  before the game rounds the range. Bonus damage against a creature type
 *  also raises that multiplier and is taken to be absent; so are attack
 *  tiles. `matched` is false when no candidate fits, and the attack is then
 *  read as cautiously as the screen allows: no floor, and what-ifs that change
 *  the range by the least they could. */
export function resolve(screen: ScreenAttack): { attacks: Attack[]; matched: boolean } {
  const { minDamage, maxDamage, slots, slotPercent: shown } = screen;
  const attacks: Attack[] = [];
  for (const shape of ATTACK_SHAPES) {
    if (shape.rolls !== slots && Math.max(1, Math.floor(shape.rolls / 2)) !== slots) continue;
    for (const value of attackValues(shape.max, maxDamage)) {
      // A min share of 0 makes the min and the floor 0 whatever the stat.
      for (const stat of shape.min === 0 ? [shown] : statsShownAs(shown)) {
        if (roundHalfEven((shape.min * stat * value) / 10000) !== minDamage) continue;
        attacks.push(build(screen, { minShare: shape.min, maxShare: shape.max, value, stat }));
      }
    }
  }
  if (attacks.length > 0) return { attacks, matched: true };
  return { attacks: [unmatched(screen)], matched: false };
}

/** The stats the combat screen could show as this chance. The chance is the
 *  stat plus the accuracy of the gear in hand, clamped. Only a weapon's rare
 *  material gives accuracy (Materials.json), 5 each, and a player holds two
 *  weapons at most. */
function statsShownAs(shown: number): number[] {
  const stats: number[] = [];
  for (let stat = 0; stat <= MAX_SLOT_PERCENT; stat++) {
    const shownAs = (accuracy: number) =>
      Math.min(MAX_SLOT_PERCENT, Math.max(MIN_SLOT_PERCENT, stat + accuracy)) === shown;
    if (GEAR_ACCURACY.some(shownAs)) stats.push(stat);
  }
  return stats;
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

interface Hidden {
  minShare: number;
  maxShare: number;
  value: number;
  stat: number;
}

/** One candidate with the what-ifs applied: the range rebuilt from its hidden
 *  numbers as the game builds it, rounding halves to even. */
function build(screen: ScreenAttack, { minShare, maxShare, value, stat }: Hidden): Attack {
  const { poisoned, frozen, ...rest } = screen;
  const loss = poisoned ? POISON_STAT_LOSS : 0;
  const poisonedStat = Math.max(0, stat - loss);
  const multiplier = 100 + (frozen ? FROZEN_DAMAGE_PERCENT : 0);
  const changed = poisoned || frozen;
  return {
    ...rest,
    slotPercent: unclampedChance(screen.slotPercent) - loss,
    minDamage: changed ? roundHalfEven((minShare * poisonedStat * value * multiplier) / 1_000_000) : screen.minDamage,
    maxDamage: changed ? roundHalfEven((maxShare * value * multiplier) / 10_000) : screen.maxDamage,
    floorShare: minShare * poisonedStat,
  };
}

/** The screen's numbers when no attack in the game fits them. Without the
 *  hidden numbers, there is no floor, and a what-if moves the range by the
 *  least it could: the shown numbers were rounded from anywhere within half
 *  of them, and poison takes an unknown share off the min. */
function unmatched(screen: ScreenAttack): Attack {
  const { poisoned, frozen, ...rest } = screen;
  const loss = poisoned ? POISON_STAT_LOSS : 0;
  const lowest = (shown: number) =>
    frozen ? Math.max(0, Math.ceil(((shown - 0.5) * (100 + FROZEN_DAMAGE_PERCENT)) / 100 - 0.5)) : shown;
  return {
    ...rest,
    slotPercent: unclampedChance(screen.slotPercent) - loss,
    minDamage: poisoned ? 0 : lowest(screen.minDamage),
    maxDamage: lowest(screen.maxDamage),
    floorShare: 0,
  };
}

/** The game shows a chance below 10% as 10%, so a shown 10% could be lower,
 *  even after the most Focus can add. */
function unclampedChance(shown: number): number {
  return shown > MIN_SLOT_PERCENT ? shown : MIN_SLOT_PERCENT - focusBonus(MAX_SLOTS);
}

/** What to show for one success count. */
export interface PredictedRow {
  successes: number;
  /** The damage taken. */
  damage: number;
  /** The damage before armor, which tells a miss from a hit armor blocked. */
  beforeArmor: number;
  /** Whether the floor raised it. */
  floored: boolean;
  /** The chance of dealing at least `damage`. */
  chance: number;
}

/** Everything the screen shows, from every attack the screen's numbers could
 *  be, for the target or for a Splash's neighbours. Where those disagree it
 *  shows the least: a smaller hit, a smaller chance of it, a bigger chance of
 *  dealing nothing. So a row that says the attack kills is never wrong. */
export interface Prediction {
  /** From a perfect roll down to no successes. */
  rows: PredictedRow[];
  /** A perfect roll's crit, if one is possible. */
  crit: { damage: number; beforeArmor: number; chance: number } | null;
  /** The chance of dealing no damage at all. */
  nothing: number;
  expected: number;
  /** The chance the combat screen shows once the Focus is spent, what-ifs
   *  included. */
  focusedPercent: number;
  /** Whether the screen's numbers fit an attack in the game's data. */
  matched: boolean;
}

export function predict(screen: ScreenAttack, area: Area): Prediction {
  const { attacks, matched } = resolve(screen);
  const least = (each: (attack: Attack) => number) => Math.min(...attacks.map(each));
  const [first] = attacks;
  const rows = Array.from({ length: screen.slots + 1 }, (_, index) => screen.slots - index).map((successes) => {
    const damage = least((attack) => hitDamage(attack, successes, false, area));
    return {
      successes,
      damage,
      beforeArmor: least((attack) => damageBeforeArmor(attack, successes, false, area)),
      floored: attacks.every((attack) => floorRaises(attack, successes, area)),
      chance: least((attack) => chanceOfAtLeast(attack, damage, area)),
    };
  });
  const critDamage = least((attack) => hitDamage(attack, attack.slots, true, area));
  return {
    rows,
    crit:
      critPercent(screen) > 0
        ? {
            damage: critDamage,
            beforeArmor: least((attack) => damageBeforeArmor(attack, attack.slots, true, area)),
            chance: least((attack) => chanceOfAtLeast(attack, critDamage, area)),
          }
        : null,
    nothing: Math.max(...attacks.map((attack) => chanceOf(attack, area, (o) => o.damage === 0))),
    expected: least((attack) => expectedDamage(attack, area)),
    focusedPercent: screen.focus >= screen.slots ? MAX_SLOT_PERCENT : rolledSlotPercent(first),
    matched,
  };
}

/** C#'s Math.Round on a decimal: an exact half goes to the even neighbour. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
