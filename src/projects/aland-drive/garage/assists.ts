import { getProjectStorage } from "@/shared/lib/storage";
import { ALL_ASSISTS, type Assists } from "../sim/car";

/*
 * The driver's aids the player drives with, kept in this browser: the player's
 * own, the same in every car, all on until turned off in the game menu.
 */

const storage = getProjectStorage("aland-drive");
const KEY = "assists";

export function keptAssists(): Assists {
  const saved = storage.get<unknown>(KEY);
  if (saved === null || typeof saved !== "object") return ALL_ASSISTS;
  // Another version of the game may have kept an aid this one doesn't know, or not one this one does.
  const kept: Partial<Record<string, unknown>> = saved;
  const pick = (name: keyof Assists) => {
    const value = kept[name];
    return typeof value === "boolean" ? value : ALL_ASSISTS[name];
  };
  return { abs: pick("abs"), traction: pick("traction"), stability: pick("stability") };
}

export function keepAssists(assists: Assists): void {
  storage.set(KEY, assists);
}
