import { describe, expect, it } from "vitest";
import { HELD_WEATHER } from "./held";
import { WEATHER_STATES } from "./weather";

describe("a held weather", () => {
  it("reads as the state it is named for, so the dev menu shows what it says", () => {
    for (const state of WEATHER_STATES) expect(HELD_WEATHER[state].state).toBe(state);
  });

  it("holds black ice as an icy road", () => {
    expect(HELD_WEATHER.ice.condition).toBe("ice");
  });
});
