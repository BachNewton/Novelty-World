/*
 * Where a race finishes (`ideas/races.md`, "What winning gets"): first,
 * second and third are gold, silver and bronze. Until the AI racers exist a
 * race has no one in it but its players, who race as a team, so everyone who
 * finishes is first. The racers bring places, and Forza Horizon's team points
 * for co-op, with them.
 */

export type Medal = "gold" | "silver" | "bronze";

export const MEDALS: readonly Medal[] = ["gold", "silver", "bronze"];

/** A player's finishing place. With no racers yet, a finish is first. */
export const FINISHING_PLACE = 1;

/** The medal a finishing place earns, none past third. */
export function medalForPlace(place: number): Medal | null {
  return place >= 1 && place <= MEDALS.length ? MEDALS[place - 1] : null;
}

/** Gold beats silver beats bronze beats none. */
export function betterMedal(a: Medal | null, b: Medal | null): boolean {
  const rank = (medal: Medal | null) => (medal === null ? MEDALS.length : MEDALS.indexOf(medal));
  return rank(a) < rank(b);
}
