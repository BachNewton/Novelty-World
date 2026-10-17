import { describe, expect, it } from "vitest";
import { CALENDAR, dateAt, secondsPerDay, timeOf } from "./calendar";
import { REGIONS } from "./regions";
import { dailySwing, holdWeather, makeLightning, makeWeather, mistHour, parseWeather, seasonalTemperature, WEATHER_KINDS, type Weather } from "./weather";

const DAY = secondsPerDay();
const sky = makeWeather("first-valley");

/** The weather every game hour through a whole year. */
function year(seed = "first-valley"): { seconds: number; weather: Weather }[] {
  const at = makeWeather(seed);
  const out: { seconds: number; weather: Weather }[] = [];
  for (let h = 0; h < 28 * 24; h++) out.push({ seconds: (h / 24) * DAY, weather: at.at((h / 24) * DAY) });
  return out;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe("the weather", () => {
  const all = year();

  it("is the same at the same moment of the same world, and differs between worlds", () => {
    const t = timeOf(10, 8.5);
    expect(sky.at(t)).toEqual(makeWeather("first-valley").at(t));
    expect(sky.at(t)).not.toEqual(makeWeather("another").at(t));
  });

  it("keeps every reading in its range", () => {
    for (const { weather: w } of all) {
      for (const share of [w.humidity, w.cloudCover, w.heaped, w.precipitation, w.snow, w.storm, w.mist, w.wetness, w.puddles]) {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
      expect(w.temperature).toBeGreaterThan(-25);
      expect(w.temperature).toBeLessThan(35);
      expect(Math.hypot(w.wind.x, w.wind.z)).toBeCloseTo(1, 5);
      expect(w.wind.speed).toBeGreaterThan(0);
      expect(w.haze).toBeGreaterThan(0.2);
    }
  });

  it("is cold in winter and warm in summer", () => {
    const bySeason = (season: string) => mean(all.filter((s) => dateAt(s.seconds).season === season).map((s) => s.weather.temperature));
    expect(bySeason("summer")).toBeGreaterThan(bySeason("spring"));
    expect(bySeason("spring")).toBeGreaterThan(bySeason("winter"));
    expect(bySeason("winter")).toBeLessThan(2);
    expect(seasonalTemperature(22)).toBeCloseTo(-4, 5);
    expect(seasonalTemperature(22 + 182.5)).toBeCloseTo(18, 5);
  });

  it("is coldest about dawn and warmest in the afternoon", () => {
    expect(dailySwing(4.8, 1)).toBeCloseTo(-1, 1);
    expect(dailySwing(15, 1)).toBeCloseTo(1, 5);
    const at = (hour: number) => mean(all.filter((s) => Math.abs(dateAt(s.seconds).hour - hour) < 0.5).map((s) => s.weather.temperature));
    expect(at(15)).toBeGreaterThan(at(5) + 2);
  });

  it("rains some of the time and is dry most of it, and snows only when it is cold", () => {
    const wet = all.filter((s) => s.weather.precipitation > 0.1).length / all.length;
    expect(wet).toBeGreaterThan(0.04);
    expect(wet).toBeLessThan(0.45);
    for (const { weather: w } of all) {
      if (w.precipitation * w.snow > 0.05) expect(w.temperature).toBeLessThan(2);
      if (w.precipitation > 0) expect(w.cloudCover).toBeGreaterThan(0.5);
    }
  });

  it("brings mist in the morning, not the afternoon", () => {
    const morning = mean(all.filter((s) => Math.abs(dateAt(s.seconds).hour - 6.5) < 1.5).map((s) => s.weather.mist));
    const afternoon = mean(all.filter((s) => Math.abs(dateAt(s.seconds).hour - 15) < 1.5).map((s) => s.weather.mist));
    expect(morning).toBeGreaterThan(afternoon * 2);
  });

  it("gathers its mist through the night and burns it off after sunrise", () => {
    const equinox = dateAt(timeOf(15, 12));
    expect(mistHour(20, equinox, CALENDAR)).toBeLessThan(0.05);
    expect(mistHour(6.2, equinox, CALENDAR)).toBeGreaterThan(0.9);
    expect(mistHour(13, equinox, CALENDAR)).toBe(0);
  });

  it("soaks the ground in rain (not snow) and dries it after", () => {
    // The first dry hour after a few hours that held real rain.
    const rain = (w: Weather) => w.precipitation * (1 - w.snow);
    let soaked: number | null = null;
    for (let i = 6; i < all.length && soaked === null; i++) {
      if (all[i].weather.precipitation === 0 && all.slice(i - 6, i).some((s) => rain(s.weather) > 0.3)) soaked = i;
    }
    expect(soaked).not.toBeNull();
    const after = all[soaked ?? 0].weather;
    expect(after.wetness).toBeGreaterThan(0.3);
    expect(after.puddles).toBeGreaterThan(0.1);
    const later = all.slice(soaked ?? 0).find((s) => s.weather.precipitation === 0 && s.weather.wetness < after.wetness * 0.5);
    expect(later).toBeDefined();
    const dry = all.filter((s) => s.weather.wetness === 0).length;
    expect(dry).toBeGreaterThan(all.length * 0.2);
  });

  it("is damper over the pine highlands than over the heath", () => {
    const only = (region: string) => Float32Array.from(REGIONS, (r) => (r === region ? 1 : 0));
    const t = timeOf(4, 10);
    expect(sky.at(t, only("highlands")).humidity).toBeGreaterThan(sky.at(t, only("heath")).humidity);
  });
});

describe("holding the weather", () => {
  const base = sky.at(timeOf(3, 12));

  it("makes each kind what it says", () => {
    expect(holdWeather("clear", base)).toMatchObject({ cloudCover: 0, precipitation: 0, mist: 0 });
    expect(holdWeather("rain", base).precipitation).toBeGreaterThan(0.5);
    expect(holdWeather("rain", base).snow).toBe(0);
    expect(holdWeather("snow", base).snow).toBe(1);
    expect(holdWeather("storm", base).storm).toBe(1);
    expect(holdWeather("mist", base).mist).toBe(1);
    expect(holdWeather("after-rain", base)).toMatchObject({ precipitation: 0 });
    expect(holdWeather("after-rain", base).puddles).toBeGreaterThan(0.5);
  });

  it("reads a kind from the address, and refuses one that doesn't exist", () => {
    for (const kind of WEATHER_KINDS) expect(parseWeather(kind)).toBe(kind);
    expect(parseWeather(null)).toBeNull();
    expect(() => parseWeather("hail")).toThrow(/hail/);
  });
});

describe("lightning", () => {
  const flash = makeLightning("first-valley");

  it("never flashes without a storm", () => {
    for (let t = 0; t < 600; t += 0.05) expect(flash(t, 0)).toBe(0);
  });

  it("flashes now and then in a storm, briefly, the same each time", () => {
    const readings: number[] = [];
    for (let t = 0; t < 600; t += 0.05) readings.push(flash(t, 1));
    const lit = readings.filter((f) => f > 0.3).length / readings.length;
    expect(lit).toBeGreaterThan(0.002);
    expect(lit).toBeLessThan(0.08);
    expect(Math.max(...readings)).toBeLessThanOrEqual(1);
    expect(flash(123.4, 1)).toBe(makeLightning("first-valley")(123.4, 1));
  });
});
