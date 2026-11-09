import { getProjectStorage } from "@/shared/lib/storage";
import { isTyre, type Tyre } from "../sim/surfaces";

/*
 * The tyres the player drives on, kept in this browser: one choice for every
 * car, as the driver's aids are, summer until changed. While tyres are a
 * setting in the game menu and cars are swapped from it freely, a car keeping
 * tyres of its own only read as the game forgetting the choice; once homes and
 * car shops fit tyres to a car, they become each car's again.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "tyres";

/** The tyres every car starts on. */
const NEW_TYRES: Tyre = "summer";

/** The tyres the player chose. */
export function keptTyres(): Tyre {
  const saved = storage.get<unknown>(KEY);
  // Another version of the game may have kept a tyre this one doesn't know.
  return typeof saved === "string" && isTyre(saved) ? saved : NEW_TYRES;
}

/** Keeps the tyres chosen, for every car, until they're changed again. */
export function keepTyres(tyres: Tyre): void {
  storage.set(KEY, tyres);
}
