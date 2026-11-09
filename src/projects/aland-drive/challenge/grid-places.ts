import type { RaceChallenge, StartPlace } from "./types";

/*
 * Who stands where on a race's grid: the racers from the pole, and the players
 * behind them, seat by seat. A co-op team takes places the racers would have,
 * but a race always keeps two racers while there's room, so a team has a field
 * to beat: a single-file grid of four has two places in reserve for that.
 */

/** The fewest racers a co-op race keeps, so a team always has a field to beat: a single-file grid's reserve makes room. */
export const FEWEST_RACERS = 2;

/**
 * How many racers a race gets: as many as asked, of the grid places the players don't take, but never fewer than two
 * while the reserve has room. The racers take the grid from the pole and the players start at the back, the owner's
 * call: a lead held from the pole was no race, and taking it through the pack is.
 */
export const racersOn = (race: RaceChallenge, players: number, asked: number): number =>
  Math.max(0, Math.min(asked, Math.max(race.grid.length - players, FEWEST_RACERS), race.grid.length + race.reserve.length - players));

/**
 * A race's places for a field of this many cars, pole first: its grid's, then as many of its reserve's as the field
 * needs past them, behind the back of a circuit's grid or ahead of a sprint's pole.
 */
export function gridPlaces(race: RaceChallenge, cars: number): StartPlace[] {
  const extra = race.reserve.slice(0, Math.max(0, cars - race.grid.length));
  if (cars > race.grid.length + extra.length) throw new Error(`${race.id} has no room for ${cars} cars`);
  return race.shape === "circuit" ? [...race.grid, ...extra].slice(0, cars) : [...[...extra].reverse(), ...race.grid].slice(0, cars);
}

/** A player's place on the grid: the first behind the racers, seat by seat. */
export function startPlaceOf(race: RaceChallenge, seat: number, players: number, asked: number): StartPlace {
  const racers = racersOn(race, players, asked);
  return gridPlaces(race, racers + players)[racers + seat];
}
