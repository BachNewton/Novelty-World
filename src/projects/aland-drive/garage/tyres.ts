import { getProjectStorage } from "@/shared/lib/storage";
import { isCarId, type CarId } from "../sim/cars";
import { isTyre, type Tyre } from "../sim/surfaces";

/*
 * The tyres the player has fitted to each car, kept in this browser: a car
 * stays on what it was given until it's given something else. Whatever lets
 * the player change tyres calls this (the game menu now, a home's garage or a
 * car shop later), and the game fits them to the car it drives.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "fitted-tyres";

/** Every car starts on summer tyres. */
const NEW_TYRES: Tyre = "summer";

function fitted(): Partial<Record<CarId, Tyre>> {
  const saved = storage.get<unknown>(KEY);
  if (saved === null || typeof saved !== "object") return {};
  // Another version of the game may have kept a car or a tyre this one doesn't know.
  return Object.fromEntries(Object.entries(saved).filter(([car, tyres]) => isCarId(car) && typeof tyres === "string" && isTyre(tyres)));
}

/** The tyres on a car. */
export function tyresOn(car: CarId): Tyre {
  return fitted()[car] ?? NEW_TYRES;
}

/** Fits a car with tyres, kept until they're changed again. */
export function fitTyres(car: CarId, tyres: Tyre): void {
  storage.set(KEY, { ...fitted(), [car]: tyres });
}
