import { describe, expect, it } from "vitest";
import { moonAt, sunAt, type Moon, type Sun } from "../../engine/astronomy";
import { realDayOf } from "../../engine/calendar";
import { seasonWeights } from "../../engine/seasons";
import type { Rgb } from "../sky/scattering";
import { gradeFor, SEASON_GRADES, whiteBalance } from "./grade";
import { handoverAt, keyBody, LOWEST_LIGHT, raised } from "./handover";
import { FULL_MOON, moonlight } from "./moonlight";
import { irradianceAt, projectLight } from "./sky-ambient";
import { sunBrightness, sunlight } from "./sun";

const HELSINKI = 60.17;
const EQUINOX = realDayOf(9, 22);
const white: Rgb = [1, 1, 1];
const rose: Rgb = [1.4, 0.85, 0.8];

const sunAtElevation = (elevation: number, azimuth = 270): Sun => ({ ...sunAt(EQUINOX, 18, HELSINKI), elevation, azimuth, direction: { x: 0, y: Math.sin((elevation * Math.PI) / 180), z: -Math.cos((elevation * Math.PI) / 180) } });
const moonOf = (illuminated: number, elevation: number): Moon => ({ ...moonAt(EQUINOX, 0, 0.5, HELSINKI), illuminated, elevation, direction: { x: 0, y: Math.sin((elevation * Math.PI) / 180), z: Math.cos((elevation * Math.PI) / 180) } });

describe("the sunlight", () => {
  it("is white overhead and warms as the sun sinks", () => {
    const high = sunlight(sunAtElevation(60), white, white).colour;
    const low = sunlight(sunAtElevation(3), white, white).colour;
    expect(Math.abs(high[0] - high[2])).toBeLessThan(0.15);
    expect(low[0]).toBeGreaterThan(low[2] * 1.5);
  });

  it("takes the storybook's tint only low in the sky", () => {
    expect(sunlight(sunAtElevation(50), rose, white).colour).toEqual(sunlight(sunAtElevation(50), white, white).colour);
    const tinted = sunlight(sunAtElevation(4, 90), rose, white).colour;
    const plain = sunlight(sunAtElevation(4, 90), white, white).colour;
    expect(tinted[0] / tinted[1]).toBeGreaterThan(plain[0] / plain[1]);
  });

  it("is gone once the sun's disc has gone, and rises steadily with it", () => {
    expect(sunBrightness(-2)).toBe(0);
    let previous = 0;
    for (let elevation = -0.5; elevation <= 90; elevation += 0.5) {
      expect(sunBrightness(elevation)).toBeGreaterThanOrEqual(previous);
      previous = sunBrightness(elevation);
    }
  });
});

describe("the handover from sun to moon", () => {
  const moon = moonOf(1, 30);
  it("fades the sun out as it crosses the horizon, and the moon in only once it is gone", () => {
    expect(handoverAt(sunAtElevation(5), moon).sun).toBe(1);
    expect(handoverAt(sunAtElevation(-1), moon).sun).toBe(0);
    expect(handoverAt(sunAtElevation(-1), moon).moon).toBe(0);
    expect(handoverAt(sunAtElevation(-8), moon).moon).toBe(1);
  });

  it("changes nothing suddenly: every step of the sun's height changes the light a little", () => {
    let last = handoverAt(sunAtElevation(10), moon);
    for (let elevation = 10; elevation >= -20; elevation -= 0.1) {
      const now = handoverAt(sunAtElevation(elevation), moon);
      expect(Math.abs(now.sun - last.sun)).toBeLessThan(0.06);
      expect(Math.abs(now.moon - last.moon)).toBeLessThan(0.06);
      expect(Math.abs(now.skyLift - last.skyLift)).toBeLessThan(0.02);
      last = now;
    }
  });

  it("switches body only while neither gives any light", () => {
    for (let elevation = -3; elevation <= 3; elevation += 0.05) {
      const h = handoverAt(sunAtElevation(elevation), moon);
      if (keyBody(sunAtElevation(elevation)) === "sun") expect(h.moon).toBe(0);
      else expect(h.sun).toBe(0);
    }
  });

  it("lights from no lower than a little above the horizon, keeping the bearing", () => {
    const low = raised({ x: 1, y: 0.01, z: 0 });
    expect((Math.asin(low.y) * 180) / Math.PI).toBeCloseTo(LOWEST_LIGHT, 6);
    expect(low.z).toBeCloseTo(0, 9);
    expect(Math.hypot(low.x, low.y, low.z)).toBeCloseTo(1, 9);
    const high = { x: 0, y: 1, z: 0 };
    expect(raised(high)).toBe(high);
  });
});

describe("the moonlight", () => {
  it("is as bright as the phase and the height allow: a new moon none, a set moon none", () => {
    expect(moonlight(moonOf(0, 40), white).intensity).toBe(0);
    expect(moonlight(moonOf(1, -5), white).intensity).toBe(0);
    const full = moonlight(moonOf(1, 50), white).intensity;
    expect(full).toBeGreaterThan(0.8 * FULL_MOON);
    expect(moonlight(moonOf(0.5, 50), white).intensity).toBeLessThan(full / 3);
    expect(moonlight(moonOf(1, 8), white).intensity).toBeLessThan(full);
  });
});

describe("the light from the sky all round", () => {
  it("gives a surface under an even sky that sky's light from every side", () => {
    const sh = projectLight(() => [0.5, 0.5, 0.5]);
    for (const normal of [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }]) expect(irradianceAt(sh, normal)[1]).toBeCloseTo(0.5 * Math.PI, 1);
  });

  it("lights what faces a bright side more than what faces away", () => {
    const sh = projectLight((d) => (d.y > 0 ? [0.2, 0.4, 0.9] : [0.05, 0.05, 0.03]));
    const up = irradianceAt(sh, { x: 0, y: 1, z: 0 });
    const down = irradianceAt(sh, { x: 0, y: -1, z: 0 });
    expect(up[2]).toBeGreaterThan(4 * down[2]);
    expect(up[2]).toBeGreaterThan(up[0]);
  });
});

describe("the colour grade", () => {
  it("is each season's own in the middle of it, and moves gently between them", () => {
    expect(gradeFor(seasonWeights(realDayOf(7, 15)))).toEqual(SEASON_GRADES.summer);
    expect(gradeFor(seasonWeights(realDayOf(1, 15)))).toEqual(SEASON_GRADES.winter);
    let last = gradeFor(seasonWeights(0));
    for (let day = 0.5; day < 365; day += 0.5) {
      const now = gradeFor(seasonWeights(day));
      expect(Math.abs(now.temperature - last.temperature)).toBeLessThan(0.02);
      expect(Math.abs(now.saturation - last.saturation)).toBeLessThan(0.02);
      last = now;
    }
  });

  it("balances white without changing how bright things are", () => {
    for (const [temperature, tint] of [[0.3, 0], [-0.3, 0.1], [0, -0.2]]) {
      const [r, g, b] = whiteBalance(temperature, tint);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 9);
    }
    const [r, , b] = whiteBalance(0.3, 0);
    expect(r).toBeGreaterThan(b);
  });
});
