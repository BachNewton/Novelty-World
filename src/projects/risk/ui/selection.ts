import type { Move, Options } from "../contract";
import type { TerritoryId } from "../map";

/*
 * What the player is choosing, read from the engine's `Options` alone (the UI never works out
 * legality for itself), and what picking a territory does. Pure, and the same on every input:
 * a tap, a click, Enter on the focused territory and A on a controller all call `pick`.
 */

/** Territories picked so far towards a move: a source (or where to place), then a target. */
export interface Selection {
  from: TerritoryId | null;
  to: TerritoryId | null;
}

export const NO_SELECTION: Selection = { from: null, to: null };

export type Purpose = "place" | "attack-from" | "attack-to" | "fortify-from" | "fortify-to";

export type Step =
  /** Nothing to do: another seat's turn, or the game is over. */
  | { kind: "wait" }
  /** A territory to pick on the map. */
  | { kind: "pick"; purpose: Purpose; choices: readonly TerritoryId[] }
  /** A set must be traded before anything else (`CARDS-5`, `ELIM-3`). */
  | { kind: "must-trade" }
  | { kind: "place"; territory: TerritoryId; max: number }
  | { kind: "battle"; from: TerritoryId; to: TerritoryId; maxDice: 1 | 2 | 3 }
  | { kind: "occupy"; from: TerritoryId; to: TerritoryId; min: number; max: number }
  | { kind: "fortify-amount"; from: TerritoryId; to: TerritoryId; max: number };

const unique = (ids: readonly TerritoryId[]) => [...new Set(ids)];

export function stepOf(options: Options | null, selection: Selection): Step {
  if (options === null) return { kind: "wait" };
  const { from, to } = selection;
  switch (options.kind) {
    case "reinforce":
      if (options.mustTrade || !options.mayPlace) return { kind: "must-trade" };
      if (from !== null && options.ownTerritories.includes(from)) return { kind: "place", territory: from, max: options.armiesToPlace };
      return { kind: "pick", purpose: "place", choices: options.ownTerritories };
    case "attack": {
      const attack = options.attacks.find((a) => a.from === from && a.to === to);
      if (attack) return { kind: "battle", from: attack.from, to: attack.to, maxDice: attack.maxDice };
      if (from !== null && options.attacks.some((a) => a.from === from)) return { kind: "pick", purpose: "attack-to", choices: options.attacks.filter((a) => a.from === from).map((a) => a.to) };
      return { kind: "pick", purpose: "attack-from", choices: unique(options.attacks.map((a) => a.from)) };
    }
    case "occupy":
      return { kind: "occupy", from: options.from, to: options.to, min: options.min, max: options.max };
    case "fortify": {
      const move = options.moves.find((m) => m.from === from && m.to === to);
      if (move) return { kind: "fortify-amount", from: move.from, to: move.to, max: move.maxArmies };
      if (from !== null && options.moves.some((m) => m.from === from)) return { kind: "pick", purpose: "fortify-to", choices: options.moves.filter((m) => m.from === from).map((m) => m.to) };
      return { kind: "pick", purpose: "fortify-from", choices: unique(options.moves.map((m) => m.from)) };
    }
  }
}

/** Territories a pick would change the selection to, beyond the step's own choices: another
 *  source while a target is being chosen, another place while an amount is. They show fainter. */
export function alsoPickable(options: Options | null, selection: Selection): readonly TerritoryId[] {
  if (options === null || selection.from === null) return [];
  switch (options.kind) {
    case "reinforce":
      return options.mayPlace && !options.mustTrade ? options.ownTerritories.filter((id) => id !== selection.from) : [];
    case "attack":
      return unique(options.attacks.map((a) => a.from)).filter((id) => id !== selection.from);
    case "fortify":
      return unique(options.moves.map((m) => m.from)).filter((id) => id !== selection.from && !options.moves.some((m) => m.from === selection.from && m.to === id));
    default:
      return [];
  }
}

export type PickResult = { selection: Selection } | { move: Move } | null;

/** What picking a territory does: sends a move, changes the selection, or nothing (null). */
export function pick(options: Options | null, selection: Selection, territory: TerritoryId): PickResult {
  if (options === null) return null;
  const { from } = selection;
  switch (options.kind) {
    case "reinforce":
      if (options.mustTrade || !options.mayPlace || !options.ownTerritories.includes(territory)) return null;
      return { selection: { from: territory, to: null } };
    case "attack":
      if (options.attacks.some((a) => a.from === territory)) return { selection: territory === from ? NO_SELECTION : { from: territory, to: null } };
      if (options.attacks.some((a) => a.from === from && a.to === territory)) return { selection: { from, to: territory } };
      return null;
    case "fortify":
      if (options.moves.some((m) => m.from === from && m.to === territory)) return { selection: { from, to: territory } };
      if (options.moves.some((m) => m.from === territory)) return { selection: territory === from ? NO_SELECTION : { from: territory, to: null } };
      return null;
    case "occupy":
      return null;
  }
}

/** Backing out of a selection a step at a time; null when there is nothing to back out of. */
export function back(selection: Selection): Selection | null {
  if (selection.to !== null) return { from: selection.from, to: null };
  if (selection.from !== null) return NO_SELECTION;
  return null;
}

/** The move that ends the phase, where the player may end it: no more attacks, or no fortifying. */
export function phaseEnd(options: Options | null): Move | null {
  if (options?.kind === "attack") return { kind: "end-attack" };
  if (options?.kind === "fortify") return { kind: "end-turn" };
  return null;
}

const attacksFrom = (options: Options | null, territory: TerritoryId | null): territory is TerritoryId =>
  options?.kind === "attack" && options.attacks.some((a) => a.from === territory);

/** The selection once the options change from `before` to `after` (a move was made). Within a
 *  phase, a source that can still act stays picked, so attacking again from it is one tap. Into
 *  an attack, the next one starts where the armies just went: the territory last placed on, or a
 *  capture just moved into (falling back to the source it was taken from). Back steps out of it. */
export function nextSelection(before: Options | null, after: Options | null, selection: Selection): Selection {
  if (after?.kind === "attack") {
    // A capture: a target became a source, its move-in made by the player or forced by the rules.
    const captured = before?.kind === "occupy" ? before.to : before?.kind === "attack" ? selection.to : null;
    const source = before?.kind === "occupy" ? before.from : selection.from;
    if (attacksFrom(after, captured)) return { from: captured, to: null };
    if (before?.kind === "reinforce" || before?.kind === "occupy") return attacksFrom(after, source) ? { from: source, to: null } : NO_SELECTION;
  }
  if (before?.kind !== after?.kind) return NO_SELECTION;
  const step = stepOf(after, selection);
  if (step.kind === "battle" || step.kind === "fortify-amount" || step.kind === "place") return selection;
  if (step.kind === "pick" && (step.purpose === "attack-to" || step.purpose === "fortify-to")) return { from: selection.from, to: null };
  return NO_SELECTION;
}
