import { describe, expect, it } from "vitest";
import { CARS } from "../sim/cars";
import { tuningPrint } from "../sim/car-limits";
import { CHALLENGES, PLACES, RACE_LAPS, RACE_PLACES, RACES, TARGETS } from "./list";
import { RACE_SPECS } from "./race-specs";
import { placesPrint } from "./measured";
import { CHALLENGE_SPECS } from "./specs";
import { reachableByPar } from "./targets";

describe("the list of challenges", () => {
  it.each(CHALLENGE_SPECS.map((spec) => [spec.id, spec] as const))("%s's places were laid from it as it is now: if not, run tools/challenge-places.ts", (id, spec) => {
    expect(PLACES[id].madeFrom).toEqual({ car: spec.car, waypoints: spec.waypoints, lengthM: spec.lengthM ?? null });
  });

  it.each(CHALLENGE_SPECS.map((spec) => [spec.id, spec] as const))("%s's par was measured on those places, in its car as tuned now: if not, run tools/challenge-par.ts", (id, spec) => {
    expect(TARGETS[id]).toMatchObject({ tuning: tuningPrint(CARS[spec.car]), places: placesPrint(PLACES[id]) });
  });

  it.each(CHALLENGES.map((challenge) => [challenge.id, challenge] as const))("%s can be passed: par, scaled by the most a player can beat it by, makes the target", (_, challenge) => {
    expect(reachableByPar(challenge)).toBe(true);
  });
});

describe("the list of races", () => {
  it.each(RACE_SPECS.map((spec) => [spec.id, spec] as const))("%s's places were laid from it as it is now: if not, run tools/race-places.ts", (id, spec) => {
    expect(RACE_PLACES[id].madeFrom).toEqual({ car: spec.car, waypoints: spec.waypoints });
  });

  it.each(RACE_SPECS.map((spec) => [spec.id, spec] as const))("%s's laps were measured on those places, in its car as tuned now: if not, run tools/race-laps.ts", (id, spec) => {
    expect(RACE_LAPS[id]).toMatchObject({ tuning: tuningPrint(CARS[spec.car]), places: placesPrint(RACE_PLACES[id]) });
  });

  it("has every id once, and a circuit ends where it starts", () => {
    expect(new Set(RACES.map(({ id }) => id)).size).toBe(RACES.length);
    for (const { id, shape, waypoints } of RACES) if (shape === "circuit") expect([id, waypoints[waypoints.length - 1]]).toEqual([id, waypoints[0]]);
  });

  it("has six on a two-lane grid or four in single file", () => {
    for (const { id, grid } of RACES) expect([id, grid.length === 6 || grid.length === 4]).toEqual([id, true]);
  });
});
