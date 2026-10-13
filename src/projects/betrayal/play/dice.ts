import type { FigureId, Json, Trait } from "../types";
import { rollName } from "../engine/describe";
import type { RollSpec } from "../engine/sources";
import type { Choice } from "../engine/step-loop";
import type { GameView, RuleView } from "../engine/view";
import type { RuleNotes } from "../data/rule-notes";
import { ownLines, rollOutcome, rollTarget } from "./status";

/*
 * A roll as the status box shows it while its roller decides something about
 * it: before it (a card that adds dice or names the result) or after it (a
 * card that rerolls some of the dice). Each die's value (0, 1 or 2), the
 * total, and what the total means: a pass or fail against the target, a
 * damage amount, the haunt roll against the omens, an attack's comparison,
 * as icons where it can, in a short note where only words say it.
 * There are no physical dice: the engine rolls them.
 */

/** A roll in progress, as the engine's roll decisions carry it. */
export interface RollParams {
  figure: FigureId;
  spec: RollSpec;
  rule: RuleView;
  /** The step the roll's result continues into. */
  then: { kind: string; params: Json };
  pool: number;
  bonus: number;
  named: number | null;
  dice: number[];
}

/** What a roll's total means, as little in words as it can be: a pass or a
 *  fail against a target, damage dealt, and a short note only where an icon
 *  can't say it (a roll table's row, the haunt beginning). */
export interface RollMeaning {
  /** The total it needs, or that it is against, or null for none. */
  target: number | null;
  verdict: "pass" | "fail" | null;
  /** The damage the total deals: its kind, and (after the roll) how much. */
  damage: { kind: "physical" | "mental"; amount: number | null } | null;
  note: string | null;
}

export interface RollShown extends RollMeaning {
  figure: FigureId;
  /** "Knowledge roll". */
  name: string;
  /** The trait a trait or attack roll rolls, with its value now, shown in the prompt. */
  trait: { trait: Trait; value: number } | null;
  /** How many dice it rolls. */
  pool: number;
  /** The dice rolled, or null before the roll. */
  dice: number[] | null;
  bonus: number;
  /** A result named in place of rolling, or null. */
  named: number | null;
  /** The total, or null before the roll. */
  total: number | null;
}

/** A roll's trait, for a trait or attack roll. */
function rolledTrait(spec: RollSpec): Trait | null {
  return spec.kind === "trait" || (spec.kind === "attack" && spec.dice === null) ? spec.trait : null;
}

const verdictOf = (total: number | null, target: number) => (total === null ? null : total >= target ? "pass" : "fail");
const NOTHING: RollMeaning = { target: null, verdict: null, damage: null, note: null };

/** What a roll's total means, or (total null) what the roll is for before it is made. */
export function rollMeaning(view: GameView, notes: RuleNotes | null, roll: Pick<RollParams, "spec" | "rule" | "then">, total: number | null): RollMeaning {
  const { spec, then } = roll;
  if (spec.kind === "haunt") {
    const omens = view.omensDrawn;
    const verdict = verdictOf(total, omens);
    return { ...NOTHING, target: omens, verdict, note: verdict === null ? `under ${omens}, the omens drawn, starts the haunt` : verdict === "pass" ? "the haunt holds off" : "the haunt begins" };
  }
  if (then.kind === "damage-rolled") {
    const kind = (then.params as { damage: "physical" | "mental" }).damage;
    return { ...NOTHING, damage: { kind, amount: total } };
  }
  if (then.kind === "attack-compare") {
    const attack = (then.params as { attackResult: number }).attackResult;
    const tie = total === attack;
    return { ...NOTHING, target: attack, verdict: total === null || tie ? null : total > attack ? "pass" : "fail", note: tie ? "a tie: no one is hurt" : null };
  }
  if (spec.kind === "attack") return NOTHING;
  const lines = notes === null ? [] : ownLines(notes, roll.rule);
  const target = rollTarget(lines, spec);
  if (target !== null) return { ...NOTHING, target, verdict: verdictOf(total, target) };
  if (total === null) return NOTHING;
  const outcome = rollOutcome(lines, spec, total);
  return { ...NOTHING, note: outcome === null ? null : outcome.replace(/^[,.] /, "") };
}

/** A roll in progress as the box shows it. */
export function rollShown(view: GameView, notes: RuleNotes | null, roll: RollParams, rolled: boolean): RollShown {
  const figure = view.figures[roll.figure];
  const trait = rolledTrait(roll.spec);
  const value = trait === null ? undefined : figure.traits[trait];
  const total = rolled ? (roll.named ?? roll.dice.reduce((sum, die) => sum + die, 0)) + roll.bonus : null;
  return {
    figure: roll.figure,
    name: rollName(roll.spec),
    trait: trait !== null && typeof value === "number" ? { trait, value } : null,
    pool: roll.pool,
    dice: rolled && roll.named === null ? roll.dice : null,
    bonus: roll.bonus,
    named: roll.named,
    total,
    ...rollMeaning(view, notes, roll, total),
  };
}

/** A reroll choice: which card, and the faces of the dice it rerolls. */
interface Reroll {
  card: string;
  faces: number[];
}

const isReroll = (choice: Json): choice is Json & Reroll =>
  typeof choice === "object" && choice !== null && !Array.isArray(choice) && typeof choice.card === "string" && Array.isArray(choice.faces);

/** The cards a roll-after decision offers to reroll with, each once, in the order offered. */
export function rerollCards(choices: readonly Choice[]): string[] {
  return [...new Set(choices.flatMap((choice) => (isReroll(choice.choice) ? [choice.choice.card] : [])))];
}

/** The choice that rerolls the dice picked (by their faces) with a card, or
 *  null when the card can't reroll that many. The dice shown are the choice:
 *  a reroll card picks from them like any other. */
export function rerollChoice<C extends Choice>(choices: readonly C[], card: string, picked: readonly number[]): C | null {
  const want = [...picked].sort((a, b) => a - b).join(",");
  return choices.find((choice) => isReroll(choice.choice) && choice.choice.card === card && [...choice.choice.faces].sort((a, b) => a - b).join(",") === want) ?? null;
}

/** A card offered before a roll: the choice that uses it, or, for a card
 *  whose options differ only by the number they name (the Angel Feather's
 *  result, 0 to 8), each number and its choice, picked on one row. */
export type RollOffer<C extends Choice> = { card: string; choice: C; picks: null } | { card: string; choice: null; picks: { value: number; choice: C }[] };

const valueOf = (choice: Json): { card: string; value: number | null } | null =>
  typeof choice === "object" && choice !== null && !Array.isArray(choice) && typeof choice.card === "string" ? { card: choice.card, value: typeof choice.value === "number" ? choice.value : null } : null;

/** The cards a roll-before decision offers, each once, in the order offered:
 *  a card offered more than once with a number each is one picker. */
export function rollOffers<C extends Choice>(choices: readonly C[]): RollOffer<C>[] {
  const offers: RollOffer<C>[] = [];
  for (const choice of choices) {
    const used = valueOf(choice.choice);
    if (used === null) continue;
    const many = choices.filter((other) => valueOf(other.choice)?.card === used.card);
    if (many.length === 1 || used.value === null) {
      offers.push({ card: used.card, choice, picks: null });
      continue;
    }
    if (offers.some((offer) => offer.card === used.card)) continue;
    offers.push({ card: used.card, choice: null, picks: many.flatMap((other) => {
      const value = valueOf(other.choice)?.value;
      return typeof value === "number" ? [{ value, choice: other }] : [];
    }) });
  }
  return offers;
}
