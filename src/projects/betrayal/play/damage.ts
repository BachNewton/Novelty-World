import type { FigureId, Trait } from "../types";
import { MENTAL, PHYSICAL } from "../engine/figures";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import { traitTrack, type TraitTrack } from "./tracks";

/*
 * Damage as the status box shows it before it is taken: the two stat tracks
 * the damage lands on, each with its printed values, where its clip is now,
 * and where the choice in focus would leave it. Preview before commit: the
 * tracks move as the player moves the split (or points at a kind to take it
 * as), and nothing is sent until they take it.
 */

export type DamageKind = "physical" | "mental";

/** The traits a kind of damage lands on, in the engine's order. */
export const DAMAGE_TRAITS: Record<DamageKind, readonly Trait[]> = { physical: PHYSICAL, mental: MENTAL };

/** A figure's tracks for a kind of damage, with a split of it previewed (or null). */
export function damageTracks(engine: Engine, view: GameView, figure: FigureId, damage: DamageKind, split: Partial<Record<Trait, number>> | null): TraitTrack[] {
  return DAMAGE_TRAITS[damage].map((trait) => traitTrack(engine, view, figure, trait, split === null ? null : -(split[trait] ?? 0)));
}

/** A split-damage choice: how many points land on each trait. */
export function splitOf(choice: unknown): Partial<Record<Trait, number>> {
  if (typeof choice !== "object" || choice === null || Array.isArray(choice)) throw new Error(`${JSON.stringify(choice)} isn't a split of damage`);
  return choice as Partial<Record<Trait, number>>;
}

/** The kind of damage a damage-kind choice lands as: as it is (null), or as the other kind (a card that converts it). */
export function landsAs(damage: DamageKind, choice: unknown): DamageKind {
  if (choice === null) return damage;
  return damage === "physical" ? "mental" : "physical";
}

/*
 * A split of damage is chosen on one control between the two tracks: a
 * divider over the points, the first trait's share to its left and the
 * second's to its right. It stops only on the engine's legal splits, so a
 * step skips any split the engine doesn't offer (one landing the same way as
 * another, or one more way to die).
 */

/** One stop of the split control: a legal split, by the index of its choice. */
export interface SplitStop {
  choice: number;
  /** The points on the first trait of the kind, left of the divider. */
  first: number;
  second: number;
}

/** A split-damage decision's choices as the control's stops, fewest on the first trait first. */
export function splitStops(damage: DamageKind, choices: readonly unknown[]): SplitStop[] {
  if (choices.length === 0) throw new Error("A split of damage with no way to take it");
  const [first, second] = DAMAGE_TRAITS[damage];
  return choices
    .map((choice, index) => {
      const split = splitOf(choice);
      return { choice: index, first: split[first] ?? 0, second: split[second] ?? 0 };
    })
    .sort((a, b) => a.first - b.first);
}

/** The stop nearest the divider at `first` points from the left; of two as near, the one further left. */
export function nearestStop(stops: readonly SplitStop[], first: number): number {
  let best = 0;
  stops.forEach((stop, index) => {
    if (Math.abs(stop.first - first) < Math.abs(stops[best].first - first)) best = index;
  });
  return best;
}

/** Where the control starts: the legal split nearest an even one. */
export function evenStop(stops: readonly SplitStop[], points: number): number {
  return nearestStop(stops, points / 2);
}

/** One step along the stops (left -1, right 1), staying on the control at its ends. */
export function stepStop(stops: readonly SplitStop[], at: number, step: 1 | -1): number {
  return Math.min(Math.max(at + step, 0), stops.length - 1);
}
