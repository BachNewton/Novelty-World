import { getProjectStorage } from "@/shared/lib/storage";
import { isCarId, type CarId } from "../sim/cars";

/*
 * The car the player chose on the game menu's Cars page, kept in this browser, so the next drive starts in it. A
 * challenge's car is the challenge's and is never kept.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "car";

/** The car the player last chose, or null before they've chosen one, or when another version kept a car this one doesn't know. */
export function carKept(): CarId | null {
  const saved = storage.get<unknown>(KEY);
  return typeof saved === "string" && isCarId(saved) ? saved : null;
}

export function keepCar(car: CarId): void {
  storage.set(KEY, car);
}
