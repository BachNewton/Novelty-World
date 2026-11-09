import { describe, expect, it } from "vitest";
import { GAME_DAY_S } from "../time/day";
import { conditionOf, conditions, timeOf, tyresOf, type ChallengeWeather } from "./conditions";

describe("a challenge's conditions", () => {
  it.each<[ChallengeWeather, string, string]>([
    ["clear", "dry", "summer"],
    ["cloud", "dry", "summer"],
    ["fog", "dry", "summer"],
    ["overcast-wet", "wet", "summer"],
    ["rain", "wet", "summer"],
    ["snowfall", "snow", "winter"],
    ["ice", "ice", "winter"],
  ])("%s is driven on %s ground, on %s tyres", (weather, ground, tyres) => {
    const held = conditions("2026-07-01", 12, weather);
    expect([conditionOf(held), tyresOf(held)]).toEqual([ground, tyres]);
  });

  it("holds its date and starts its hour at the green light, then runs it on at the game's pace", () => {
    const held = conditions("2026-06-21", 3.5, "clear");
    expect(timeOf(held, -2).hour).toBeCloseTo(3.5, 9);
    const anHourOn = timeOf(held, GAME_DAY_S / 24);
    expect(anHourOn.hour).toBeCloseTo(4.5, 9);
    expect(anHourOn.date).toEqual({ year: 2026, month: 6, day: 21 });
  });
});
