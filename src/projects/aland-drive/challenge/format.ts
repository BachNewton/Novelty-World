import type { ChallengeKind } from "./types";

/** A time as a driver reads a stopwatch: minutes, seconds and tenths, rounded down so a shown time never flatters. */
export function timeText(seconds: number): string {
  const tenths = Math.floor(Math.max(seconds, 0) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** A Route's or a race's time, or a Speed trap's speed. */
export function resultText(kind: ChallengeKind, value: number): string {
  return kind === "speed-trap" ? `${Math.floor(value)} km/h` : timeText(value);
}

/** A finishing place as a racer says it: 1st, 2nd, 3rd, 4th. */
export function placeText(place: number): string {
  const [last, teen] = [place % 10, place % 100 >= 11 && place % 100 <= 13];
  const suffix = teen || last === 0 || last > 3 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : "rd";
  return `${place}${suffix}`;
}
