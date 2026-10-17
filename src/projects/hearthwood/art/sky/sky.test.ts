import { describe, expect, it } from "vitest";
import { moonAt, sunAt } from "../../engine/astronomy";
import { dateAt, realDayOf, timeOf } from "../../engine/calendar";
import { auroraAt, auroraTonight, nightOf } from "./aurora";
import { noctilucentAt, noctilucentTonight } from "./noctilucent";
import { rainbowAt } from "./rainbow";
import { lightThroughAir, skyRadiance, type Rgb, type Vec } from "./scattering";
import { readSkyInputs, sighted } from "./sky-inputs";
import { rollOff, skyColour, skyLighting, skyScale } from "./sky-light";

const HELSINKI = 60.17;
const EQUINOX = realDayOf(9, 22);

function towards(elevation: number, azimuth: number): Vec {
  const e = (elevation * Math.PI) / 180;
  const a = (azimuth * Math.PI) / 180;
  return { x: Math.cos(e) * Math.sin(a), y: Math.sin(e), z: -Math.cos(e) * Math.cos(a) };
}

const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const white: Rgb = [1, 1, 1];

describe("the air", () => {
  it("is blue overhead by day, and paler towards the horizon", () => {
    const sun = { direction: towards(40, 180), light: white };
    const zenith = skyRadiance(towards(90, 0), 100, [sun]);
    const horizon = skyRadiance(towards(3, 0), 100, [sun]);
    expect(zenith[2]).toBeGreaterThan(zenith[1]);
    expect(zenith[1]).toBeGreaterThan(zenith[0]);
    expect(horizon[2] / horizon[0]).toBeLessThan(zenith[2] / zenith[0]);
    expect(luma(horizon)).toBeGreaterThan(luma(zenith));
  });

  it("reddens the sun's light as it sinks, and lets none through once it has set", () => {
    const high = lightThroughAir(0, Math.sin((60 * Math.PI) / 180));
    const low = lightThroughAir(0, Math.sin((2 * Math.PI) / 180));
    expect(low[0] / low[2]).toBeGreaterThan(3 * (high[0] / high[2]));
    expect(luma(lightThroughAir(0, Math.sin((-3 * Math.PI) / 180)))).toBe(0);
  });

  it("keeps the twilight sky overhead blue after the sun has set, as the ozone does", () => {
    const sun = { direction: towards(-6, 270), light: white };
    const zenith = skyRadiance(towards(90, 0), 100, [sun]);
    expect(zenith[2]).toBeGreaterThan(2 * zenith[1]);
    expect(zenith[2]).toBeGreaterThan(2 * zenith[0]);
  });

  it("glows warm round a low sun and stays cooler on the far side", () => {
    const sun = { direction: towards(1, 270), light: white };
    const near = skyRadiance(towards(2, 270), 100, [sun]);
    const far = skyRadiance(towards(2, 90), 100, [sun]);
    expect(near[0] / near[2]).toBeGreaterThan(far[0] / far[2]);
    expect(luma(near)).toBeGreaterThan(luma(far));
  });
});

describe("the sky as drawn", () => {
  it("is brightened by hand as the sun goes down, ever more steeply", () => {
    let previous = 0;
    for (let elevation = 60; elevation >= -18; elevation -= 3) {
      const scale = skyScale(elevation);
      expect(scale).toBeGreaterThan(previous);
      previous = scale;
    }
  });

  it("rolls off its brightest parts without turning their hue", () => {
    const bright: Rgb = [4, 2, 1];
    const rolled = rollOff(bright);
    expect(luma(rolled)).toBeLessThan(1.3);
    expect(rolled[0] / rolled[1]).toBeCloseTo(2, 9);
    expect(rolled[1] / rolled[2]).toBeCloseTo(2, 9);
  });

  it("is lit by the moon at night by its phase, and the land's sky never runs dark by day", () => {
    const at = (hour: number, age: number) => skyLighting(sunAt(EQUINOX, hour, HELSINKI), moonAt(EQUINOX, hour, age, HELSINKI), white, [0.01, 0.01, 0.03]);
    const up = towards(60, 180);
    const full = luma(skyColour(up, 100, at(0, 0.5)));
    const fresh = luma(skyColour(up, 100, at(0, 0)));
    expect(full).toBeGreaterThan(2 * fresh);
    const noon = luma(skyColour(up, 100, at(12, 0.5)));
    expect(noon).toBeGreaterThan(0.25);
    expect(noon).toBeLessThan(1.3);
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

describe("noctilucent clouds", () => {
  it("are seen only in early summer's nights", () => {
    const shown = Array.from({ length: 28 * 6 }, (_, d) => ({ date: dateOn(d, 23.5), on: noctilucentTonight(dateOn(d, 23.5)) > 0 }));
    expect(shown.some((s) => s.on)).toBe(true);
    for (const { date, on } of shown) if (on) expect(date.season).toBe("summer");
  });

  it("glow only while the sun lights them from below the horizon", () => {
    const date = dateOn(0, 12);
    expect(noctilucentAt(date, { ...sunAt(170, 12, HELSINKI), elevation: 20 }, "on")).toBe(0);
    expect(noctilucentAt(date, { ...sunAt(170, 0, HELSINKI), elevation: -9 }, "on")).toBe(1);
    expect(noctilucentAt(date, { ...sunAt(170, 0, HELSINKI), elevation: -20 }, "on")).toBe(0);
  });
});

describe("the rainbow", () => {
  const sun = (elevation: number) => ({ ...sunAt(EQUINOX, 16, HELSINKI), elevation });
  it("needs rain and the sun out, and a sun low enough to put the bow above the horizon", () => {
    expect(rainbowAt(sun(15), { rain: 0, sunOut: 1, aurora: "seeded", noctilucent: "seeded" })).toBe(0);
    expect(rainbowAt(sun(15), { rain: 1, sunOut: 0, aurora: "seeded", noctilucent: "seeded" })).toBe(0);
    expect(rainbowAt(sun(15), { rain: 1, sunOut: 1, aurora: "seeded", noctilucent: "seeded" })).toBe(1);
    expect(rainbowAt(sun(45), { rain: 1, sunOut: 1, aurora: "seeded", noctilucent: "seeded" })).toBe(0);
  });
});

describe("the sky's inputs", () => {
  it("come from the address, and a mistake in it fails loudly", () => {
    expect(readSkyInputs("?rain=0.5&aurora=on")).toEqual({ rain: 0.5, sunOut: 1, aurora: "on", noctilucent: "seeded" });
    expect(() => readSkyInputs("?rain=2")).toThrow();
    expect(() => readSkyInputs("?aurora=yes")).toThrow();
    expect(sighted("seeded", 0.3)).toBe(0.3);
    expect(sighted("on", 0)).toBe(1);
  });
});
