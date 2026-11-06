import type { RaceChallenge } from "./types";

/*
 * Where a race finishes: places, points and medals (`ideas/races.md`, "What
 * winning gets"). Until the AI racers exist, the rivals are timed: each is the
 * scripted driver's pace through the race's lines (`splitsS`), slowed by its
 * own share, so the fastest is a little behind par and the rest spread out
 * behind it. The grid's other places are theirs, one rival each, so a solo
 * player races the same field in every attempt and a co-op team the same.
 *
 * First, second and third are gold, silver and bronze. A co-op team is scored
 * as Forza Horizon scores one: each player scores 100 for every rival they
 * finish ahead of and 50 for winning, teammates never scoring off each other,
 * and the team's points per player are its medal: beating every rival on
 * average is gold, all but one silver, all but two bronze. Solo, the same
 * rule is the place.
 */

export type Medal = "gold" | "silver" | "bronze";

export const MEDALS: readonly Medal[] = ["gold", "silver", "bronze"];

/** Each rival's time as a share of the scripted driver's, fastest first. */
const RIVAL_PACE = [1.03, 1.07, 1.11, 1.15, 1.19, 1.23] as const;
const BEATEN_POINTS = 100;
const WIN_POINTS = 50;

/** One rival for each place on the grid but the pole's. */
export function rivalCount(race: RaceChallenge): number {
  return Math.min(race.grid.length - 1, RIVAL_PACE.length);
}

/** When each rival crosses a line, counted over every lap from the first, fastest first. */
export function rivalTimesAt(race: RaceChallenge, gate: number): number[] {
  const split = race.splitsS[gate];
  return RIVAL_PACE.slice(0, rivalCount(race)).map((pace) => pace * split);
}

/** Each rival's finishing time, fastest first. */
export function rivalTimes(race: RaceChallenge): number[] {
  return rivalTimesAt(race, race.splitsS.length - 1);
}

/** A player's place among the rivals at a line, crossed at this time: a tie goes to the player. */
export function placeAt(race: RaceChallenge, gate: number, time: number): number {
  return 1 + rivalTimesAt(race, gate).filter((rival) => rival < time).length;
}

/** The points one player scores for a finish: 100 for each rival behind them, 50 more for winning. */
export function pointsFor(race: RaceChallenge, time: number): number {
  const beaten = rivalTimes(race).filter((rival) => rival >= time).length;
  return beaten * BEATEN_POINTS + (beaten === rivalCount(race) ? WIN_POINTS : 0);
}

/** The medal the players' times earn together: solo, by place; in co-op, by the team's points per player. */
export function medalFor(race: RaceChallenge, times: readonly number[]): Medal | null {
  const perPlayer = times.reduce((sum, time) => sum + pointsFor(race, time), 0) / times.length;
  const rivals = rivalCount(race);
  const index = MEDALS.findIndex((_, short) => short < rivals && perPlayer >= (rivals - short) * BEATEN_POINTS);
  return index < 0 ? null : MEDALS[index];
}

/** Gold beats silver beats bronze beats none. */
export function betterMedal(a: Medal | null, b: Medal | null): boolean {
  const rank = (medal: Medal | null) => (medal === null ? MEDALS.length : MEDALS.indexOf(medal));
  return rank(a) < rank(b);
}

/** A finisher in the table of places: a player by seat, or a rival by its place in the field. */
export type Finisher = { seat: number; time: number } | { rival: number; time: number };

/** Everyone in finishing order, players ahead of rivals on a tie. */
export function finishingOrder(race: RaceChallenge, times: readonly number[]): Finisher[] {
  const players: Finisher[] = times.map((time, seat) => ({ seat, time }));
  const rivals: Finisher[] = rivalTimes(race).map((time, rival) => ({ rival, time }));
  return [...players, ...rivals].sort((a, b) => a.time - b.time || Number("rival" in a) - Number("rival" in b));
}
