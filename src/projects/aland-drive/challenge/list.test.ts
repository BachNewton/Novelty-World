import { describe, expect, it } from "vitest";
import { CARS } from "../sim/cars";
import { tuningPrint } from "../sim/car-limits";
import { CHALLENGES, PLACES, TARGETS } from "./list";
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
