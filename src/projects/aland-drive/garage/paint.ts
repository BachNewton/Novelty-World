import { getProjectStorage } from "@/shared/lib/storage";
import { isCarId, type CarId } from "../sim/cars";

/*
 * The paint the player has chosen for each car, kept in this browser by its index in the car's list of paints
 * (`art/cars/paints.ts`): a car stays in what it was given until it's given something else. The game menu's Paint page
 * chooses it now, a home's garage or a car shop later, and the game draws the car in it and sends it to everyone.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "car-paints";

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

function chosen(): Partial<Record<CarId, number>> {
  const saved = storage.get<unknown>(KEY);
  if (saved === null || typeof saved !== "object") return {};
  // Another version of the game may have kept a car this one doesn't know. An index past a car's list is the art's to judge.
  return Object.fromEntries(Object.entries(saved).filter(([car, paint]) => isCarId(car) && isIndex(paint)));
}

/** The paint a car is in, by its index: its default, the first, until it's given another. */
export function paintOn(car: CarId): number {
  return chosen()[car] ?? 0;
}

/** Paints a car, kept until it's painted again. */
export function keepPaint(car: CarId, paint: number): void {
  if (!isIndex(paint)) throw new Error(`a paint is an index into the car's list, not ${paint}`);
  storage.set(KEY, { ...chosen(), [car]: paint });
}
