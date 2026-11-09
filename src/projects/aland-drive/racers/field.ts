import { CAR_IDS, CAR_TIERS, type CarId } from "../sim/cars";
import type { Condition, Tyre } from "../sim/surfaces";

/*
 * The cars that race each race: the cars of its tier (`sim/tiers.ts`), the
 * owner's ruling, so no racer drives a car the event wouldn't let in. The
 * race's own car, which the player is handed, comes first. A tier holds two or
 * three cars and a grid six, so the racers take the field's cars in turn, each
 * repeat in another of its paints.
 */

/** The tyres made for a condition: what a racer fits for the day. */
export const tyresFor = (condition: Condition): Tyre => (condition === "snow" || condition === "ice" ? "winter" : "summer");

/** The race's car first, then the other cars of its tier. */
export function fieldOf(car: CarId): CarId[] {
  const tier = CAR_TIERS[car];
  if (tier === null) throw new Error(`${car} is in no tier, so no race can hand it`);
  return [car, ...CAR_IDS.filter((id) => id !== car && CAR_TIERS[id] === tier)];
}

/** Each place's car on a grid of `count` from the pole, the field's cars in turn, and its paint: how many of that car stand ahead of it. */
export function gridCars(field: readonly CarId[], count: number): { car: CarId; paint: number }[] {
  return Array.from({ length: count }, (_, slot) => ({ car: field[slot % field.length], paint: Math.floor(slot / field.length) }));
}
