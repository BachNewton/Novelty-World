import { describe, expect, it } from "vitest";
import { sunAt } from "../../engine/astronomy";
import { dateAt, realDayOf, timeOf } from "../../engine/calendar";
import { auroraAt, auroraTonight, nightOf } from "./aurora";
import { rainbowAt } from "./rainbow";
import { lightThroughAir, type Rgb } from "../light/through-air";
import { readSkyInputs, sighted } from "./sky-inputs";

const HELSINKI = 60.17;
const EQUINOX = realDayOf(9, 22);

const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("the air the light crosses", () => {
  it("reddens a body's light as it sinks, and lets none through once it has set", () => {
    const high = lightThroughAir(60);
    const low = lightThroughAir(2);
    expect(low[0] / low[2]).toBeGreaterThan(3 * (high[0] / high[2]));
    expect(luma(lightThroughAir(-3))).toBe(0);
  });

  it("dims steadily as a body sinks to the horizon", () => {
    let previous = Infinity;
    for (let elevation = 90; elevation >= 0; elevation -= 1) {
      const now = luma(lightThroughAir(elevation));
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });
});

/** A date at an hour of a game day. */
const dateOn = (day: number, hour: number) => dateAt(timeOf(day, hour));

describe("the northern lights", () => {
  it("are the same show however often a night is asked about, and belong to the evening's day after midnight", () => {
    const evening = dateOn(30, 22);
    const small = dateOn(31, 2);
    expect(nightOf(small)).toBe(nightOf(evening));
    expect(auroraTonight(small)).toBe(auroraTonight(evening));
  });

  it("come mostly in autumn and winter, rarely in summer", () => {
    const nights = (season: number) => Array.from({ length: 280 }, (_, i) => auroraTonight(dateOn(season * 7 + (i % 7) + 28 * Math.floor(i / 7), 23))).filter((s) => s > 0).length;
    const [spring, summer, autumn, winter] = [0, 1, 2, 3].map(nights);
    expect(summer).toBeLessThan(spring);
    expect(spring).toBeLessThan(autumn);
    expect(summer).toBeLessThan(winter / 3);
  });

  it("never show in daylight or twilight, even when held on", () => {
    const date = dateOn(20, 12);
    expect(auroraAt(date, sunAt(date.realDayOfYear, 12, HELSINKI), "on")).toBe(0);
    const night = dateOn(20, 0);
    expect(auroraAt(night, sunAt(night.realDayOfYear, 0, HELSINKI), "on")).toBeGreaterThan(0);
    expect(auroraAt(night, sunAt(night.realDayOfYear, 0, HELSINKI), "off")).toBe(0);
  });
});

describe("the rainbow", () => {
  const sun = (elevation: number) => ({ ...sunAt(EQUINOX, 16, HELSINKI), elevation });
  it("needs rain and the sun out, and a sun low enough to put the bow above the horizon", () => {
    expect(rainbowAt(sun(15), { rain: 0, sunOut: 1, aurora: "seeded" })).toBe(0);
    expect(rainbowAt(sun(15), { rain: 1, sunOut: 0, aurora: "seeded" })).toBe(0);
    expect(rainbowAt(sun(15), { rain: 1, sunOut: 1, aurora: "seeded" })).toBe(1);
    expect(rainbowAt(sun(45), { rain: 1, sunOut: 1, aurora: "seeded" })).toBe(0);
  });
});

describe("the sky's inputs", () => {
  it("come from the address, and a mistake in it fails loudly", () => {
    expect(readSkyInputs("?rain=0.5&aurora=on")).toEqual({ rain: 0.5, sunOut: 1, aurora: "on" });
    expect(() => readSkyInputs("?rain=2")).toThrow();
    expect(() => readSkyInputs("?aurora=yes")).toThrow();
    expect(sighted("seeded", 0.3)).toBe(0.3);
    expect(sighted("on", 0)).toBe(1);
  });
});
