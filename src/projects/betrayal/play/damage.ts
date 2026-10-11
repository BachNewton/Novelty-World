import type { FigureId, Trait } from "../types";
import { MENTAL, PHYSICAL } from "../engine/figures";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import { traitTrack, type TraitTrack } from "./tracks";

/*
 * Damage as the status box shows it before it is taken: the two stat tracks
 * the damage lands on, each with its printed values, where its clip is now,
 * and where the choice in focus would leave it. Preview before commit: the
 * tracks move as the player points at a way to take it, and nothing is sent
 * until they choose.
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
