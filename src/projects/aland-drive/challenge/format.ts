import type { ChallengeKind } from "./types";
import { speedText, type Units } from "../units";

/** A time as a driver reads a stopwatch: minutes, seconds and tenths, rounded down so a shown time never flatters. */
export function timeText(seconds: number): string {
  const tenths = Math.floor(Math.max(seconds, 0) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** A Route's time or a Speed trap's speed (kept in km/h), in the player's units. */
export function resultText(kind: ChallengeKind, value: number, units: Units): string {
  return kind === "route" ? timeText(value) : speedText(value, units);
}
