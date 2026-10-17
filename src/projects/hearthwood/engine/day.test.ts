import { describe, expect, it } from "vitest";
import { dateAt, daysPerYear, parseDate, secondsPerDay, timeOf } from "./calendar";
import { MOMENTS, skyAt, type DaySky, type Moment } from "./day";

function skyOn(date: string, hour: number): DaySky {
  return skyAt(dateAt(timeOf(parseDate(date), hour)));
}

function strongest(sky: DaySky): Moment {
  return MOMENTS.reduce((best, m) => (sky.mix[m] > sky.mix[best] ? m : best), MOMENTS[0]);
}

describe("the day's light", () => {
  it("mixes its moments to a whole, without a jump anywhere through the year", () => {
    const step = secondsPerDay() / 1000;
    let previous = skyAt(dateAt(0));
    for (let t = step; t <= secondsPerDay() * daysPerYear(); t += step) {
      const now = skyAt(dateAt(t));
      expect(MOMENTS.reduce((sum, m) => sum + now.mix[m], 0)).toBeCloseTo(1);
      for (const m of MOMENTS) expect(Math.abs(now.mix[m] - previous.mix[m])).toBeLessThan(0.03);
      expect(Math.abs(now.light.sun - previous.light.sun)).toBeLessThan(0.04);
      expect(Math.abs(now.key.strength - previous.key.strength)).toBeLessThan(0.07);
      previous = now;
    }
  });

  it("follows the sun's height: dawn and morning as it climbs, golden hour and dusk as it sinks", () => {
    expect(strongest(skyOn("mabon", 6.3))).toBe("dawn");
    expect(strongest(skyOn("mabon", 8.5))).toBe("morning");
    expect(strongest(skyOn("mabon", 12))).toBe("noon");
    expect(strongest(skyOn("mabon", 16.5))).toBe("golden");
    expect(strongest(skyOn("mabon", 18.4))).toBe("dusk");
    expect(skyOn("mabon", 23).mix.night).toBeCloseTo(1);
  });

  it("lingers on a midsummer evening: golden at eight, twilight at half past ten, never full night", () => {
    expect(strongest(skyOn("litha", 20))).toBe("golden");
    const late = skyOn("litha", 22.5);
    expect(late.sun.twilight).toBe("civil");
    expect(strongest(late)).toBe("dusk");
    for (let hour = 0; hour < 24; hour += 0.25) expect(skyOn("litha", hour).light.night).toBeLessThan(0.75);
  });

  it("keeps a midwinter noon low and warm, between morning and golden hour, and dark by mid-afternoon", () => {
    const noon = skyOn("yule", 12);
    expect(noon.sun.elevation).toBeGreaterThan(4);
    expect(noon.sun.elevation).toBeLessThan(9);
    expect(noon.mix.noon).toBe(0);
    expect(noon.mix.morning + noon.mix.golden).toBeGreaterThan(0.6);
    expect(skyOn("yule", 17).mix.night).toBeGreaterThan(0.6);
  });

  it("lights the day by the sun, the night by the moon by its phase, and hands over in the dark", () => {
    expect(skyOn("mabon", 12).key.body).toBe("sun");
    const night = skyOn("mabon", 0);
    expect(night.key.body).toBe("moon");
    for (let t = 0; t < secondsPerDay() * 3; t += secondsPerDay() / 2000) {
      const now = skyAt(dateAt(t));
      const next = skyAt(dateAt(t + secondsPerDay() / 2000));
      if (now.key.body !== next.key.body) expect(now.key.strength + next.key.strength).toBeLessThan(0.05);
    }
  });

  it("is the same every time", () => {
    expect(skyOn("samhain", 21.3)).toEqual(skyOn("samhain", 21.3));
  });
});
