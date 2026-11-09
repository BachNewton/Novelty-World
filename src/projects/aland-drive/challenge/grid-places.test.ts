import { describe, expect, it } from "vitest";
import { gridPlaces, racersOn, startPlaceOf } from "./grid-places";
import { CHALLENGES, RACES } from "./list";
import { MOST_PLAYERS, type RaceChallenge, type StartPlace } from "./types";

/* Every seat of a co-op team needs a place of its own, on every challenge and race as measured. */

const place = (x: number): StartPlace => ({ x, z: 0, heading: 0 });
const race = (shape: RaceChallenge["shape"], grid: number): RaceChallenge => ({
  id: "race",
  kind: "race",
  tier: "A5",
  number: "A5.0",
  title: "",
  car: "skerry-gt",
  where: "",
  waypoints: [],
  shape,
  ground: "road",
  laps: 1,
  gates: [],
  // Pole first, each 10 m further back; a sprint's reserve stands ahead of the pole, a circuit's behind the back.
  grid: Array.from({ length: grid }, (_, index) => place(-10 * index)),
  reserve: grid === 4 ? (shape === "sprint" ? [place(10), place(20)] : [place(-40), place(-50)]) : [],
  starts: [place(0), place(-10)],
  lapM: 1000,
  lineM: 0,
  lengthM: 1000,
});
const apart = (places: readonly StartPlace[]) => new Set(places.map(({ x, z }) => `${x},${z}`)).size === places.length;

describe("a race's grid", () => {
  it("gives the racers the places the players don't take, from the pole, down to two", () => {
    const six = race("sprint", 6);
    expect([1, 2, 3, 4].map((players) => racersOn(six, players, Infinity))).toEqual([5, 4, 3, 2]);
    const four = race("sprint", 4);
    expect([1, 2, 3, 4].map((players) => racersOn(four, players, Infinity))).toEqual([3, 2, 2, 2]);
    // A test asks for fewer, or none.
    expect(racersOn(six, 2, 1)).toBe(1);
    expect(racersOn(four, 4, 0)).toBe(0);
  });

  it("takes a single-file grid's reserve behind a circuit's back and ahead of a sprint's pole", () => {
    expect(gridPlaces(race("circuit", 4), 6).map(({ x }) => x)).toEqual([0, -10, -20, -30, -40, -50]);
    expect(gridPlaces(race("sprint", 4), 5).map(({ x }) => x)).toEqual([10, 0, -10, -20, -30]);
    // Four players behind two racers on a sprint: the racers ahead of the usual pole.
    const sprint = race("sprint", 4);
    expect([0, 1, 2, 3].map((seat) => startPlaceOf(sprint, seat, 4, Infinity).x)).toEqual([0, -10, -20, -30]);
  });

  it("seats up to four players behind at least two racers on every race, each on a place of its own", () => {
    for (const each of RACES) {
      for (let players = 1; players <= MOST_PLAYERS; players++) {
        const racers = racersOn(each, players, Infinity);
        expect(racers, each.id).toBeGreaterThanOrEqual(2);
        const places = gridPlaces(each, racers + players);
        expect(places, each.id).toHaveLength(racers + players);
        expect(apart(places), each.id).toBe(true);
      }
    }
  });
});

describe("a bucket list challenge's starts", () => {
  it("have a place for each of four players, none on another's", () => {
    for (const challenge of CHALLENGES) {
      expect(challenge.starts, challenge.id).toHaveLength(MOST_PLAYERS);
      expect(apart(challenge.starts), challenge.id).toBe(true);
    }
  });
});
