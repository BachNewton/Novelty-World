/*
 * Where a race finishes (`ideas/races.md`, "What winning gets"). The racers
 * bring places: a car that has finished is placed by its time, and one still
 * racing by how far round it is, behind every finisher. A race with no one in
 * it but its players is first for a finish. Every race is scored as Forza
 * Horizon scores a team, solo a team of one, the owner's ruling of one system:
 * each player scores for every racer they beat and for a win, and the team's
 * points per player are its medal. Alone that's first, second and third for
 * gold, silver and bronze, which `medalForPlace` says.
 */

export type Medal = "gold" | "silver" | "bronze";

export const MEDALS: readonly Medal[] = ["gold", "silver", "bronze"];

/** The medal a finishing place earns, none past third. */
export function medalForPlace(place: number): Medal | null {
  return place >= 1 && place <= MEDALS.length ? MEDALS[place - 1] : null;
}

/** Gold beats silver beats bronze beats none. */
export function betterMedal(a: Medal | null, b: Medal | null): boolean {
  const rank = (medal: Medal | null) => (medal === null ? MEDALS.length : MEDALS.indexOf(medal));
  return rank(a) < rank(b);
}

/** A car's standing in a race: its finish time once in, and how far round it is while not. */
export interface Standing {
  finishedS: number | null;
  progress: number;
}

/** Whether `a` is ahead of `b`: a finisher by time, then by progress. */
export function ahead(a: Standing, b: Standing): boolean {
  if (a.finishedS !== null && b.finishedS !== null) return a.finishedS < b.finishedS;
  if (a.finishedS !== null || b.finishedS !== null) return a.finishedS !== null;
  return a.progress > b.progress;
}

/** A car's place among the field, from 1: one more than the cars ahead of it. */
export function placeOf(own: Standing, others: readonly Standing[]): number {
  return 1 + others.filter((other) => ahead(other, own)).length;
}

/** Forza Horizon's team points for one player: 100 for every racer finished ahead of, and 50 more for the win. */
export const POINTS_PER_RACER = 100;
export const POINTS_FOR_WIN = 50;

export function teamPointsOf(own: Standing, racers: readonly Standing[]): number {
  const beaten = racers.filter((racer) => ahead(own, racer)).length;
  return beaten * POINTS_PER_RACER + (beaten === racers.length && racers.length > 0 ? POINTS_FOR_WIN : 0);
}

/**
 * A team's medal from its points per player (`ideas/races.md`): beating every racer on average is gold, all but one
 * silver, all but two bronze, so a strong run carries a weaker one.
 */
export function teamMedal(pointsPerPlayer: number, racers: number): Medal | null {
  if (racers === 0) return "gold";
  if (pointsPerPlayer >= racers * POINTS_PER_RACER) return "gold";
  if (pointsPerPlayer >= (racers - 1) * POINTS_PER_RACER) return "silver";
  if (pointsPerPlayer >= (racers - 2) * POINTS_PER_RACER) return "bronze";
  return null;
}
