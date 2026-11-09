import { getProjectStorage } from "@/shared/lib/storage";
import type { Shifting } from "../sim/gearbox";

/*
 * How the player shifts, kept in this browser: the player's own, the same in
 * every car, automatic until changed on Settings' Gameplay tab.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "shifting";

export function keptShifting(): Shifting {
  return storage.get<unknown>(KEY) === "manual" ? "manual" : "auto";
}

export function keepShifting(shifting: Shifting): void {
  storage.set(KEY, shifting);
}
