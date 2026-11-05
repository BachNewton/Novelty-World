import { describe, expect, it } from "vitest";
import { dateOfDayNumber, dayNumberOf } from "./calendar";
import { MONTHLY } from "./climate";
import { seaIceAt, snowAt } from "./season";
import { SAMPLES_PER_GAME_DAY, skyAt, wetGameDay } from "./weather";

/*
 * The weather's rates against the climate it's drawn from, over simulated years: a change to how the fronts wander or
 * how they're read against the climate would shift how often it rains or clouds over without anything else noticing.
 */

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];
/** Game days read per real day, each a different stretch of the fronts. */
const GAME_DAYS_A_DAY = 2;

describe("the weather's rates", () => {
  it("rains or snows on the month's share of game days, and clouds over the month's share of the time", () => {
    const wet = Array<number>(12).fill(0);
    const cloudy = Array<number>(12).fill(0);
    const days = Array<number>(12).fill(0);
    for (const year of YEARS) {
      const start = dayNumberOf({ year, month: 1, day: 1 });
      for (let day = start; day < dayNumberOf({ year: year + 1, month: 1, day: 1 }); day++) {
        const month = dateOfDayNumber(day).month - 1;
        for (let read = 0; read < GAME_DAYS_A_DAY; read++) {
          const gameDay = day * 24 + read * 11;
          days[month]++;
          if (wetGameDay(day + 0.5, gameDay)) wet[month]++;
          for (let sample = 0; sample < SAMPLES_PER_GAME_DAY; sample++) {
            if (skyAt(day + 0.5, (sample / SAMPLES_PER_GAME_DAY) * 24, gameDay + sample / SAMPLES_PER_GAME_DAY).cloudCover >= 0.6) cloudy[month] += 1 / SAMPLES_PER_GAME_DAY;
          }
        }
      }
    }
    for (let month = 0; month < 12; month++) {
      expect(wet[month] / days[month], `wet days in month ${month + 1}`).toBeCloseTo(MONTHLY.WET_DAY[month], 1);
      expect(cloudy[month] / days[month], `cloudy share in month ${month + 1}`).toBeCloseTo(MONTHLY.CLOUDIER[month], 1);
    }
  });

  it("brings fog on a few mornings a month at most, light, and gone by the afternoon", () => {
    const start = dayNumberOf({ year: 2027, month: 1, day: 1 });
    let foggy = 0;
    let gameDays = 0;
    for (let day = start; day < start + 365; day++) {
      for (let read = 0; read < GAME_DAYS_A_DAY; read++) {
        const gameDay = day * 24 + read * 11;
        gameDays++;
        let seen = false;
        for (let hour = 0; hour < 24; hour += 0.5) {
          const { fog } = skyAt(day + 0.5, hour, gameDay + hour / 24);
          expect(fog).toBeLessThan(0.6);
          if (hour >= 13 && hour < 18) expect(fog).toBe(0);
          if (fog > 0.2) seen = true;
        }
        if (seen) foggy++;
      }
    }
    expect((foggy / gameDays) * 30).toBeGreaterThan(1);
    expect((foggy / gameDays) * 30).toBeLessThan(5);
  });

  it("gives every winter some white weeks, and freezes the bays most winters but the open sea only in hard ones", () => {
    let baysFrozen = 0;
    let openSeaFrozen = 0;
    const winters = 30;
    for (let winter = 2020; winter < 2020 + winters; winter++) {
      const start = dayNumberOf({ year: winter, month: 10, day: 1 });
      let white = 0;
      let bays = false;
      let openSea = false;
      for (let day = start; day < start + 240; day++) {
        if (snowAt(day + 0.5).depthCm >= 3) white++;
        const ice = seaIceAt(day + 0.5);
        if (ice.drivable > 0) bays = true;
        if (ice.reach >= 0.9) openSea = true;
      }
      expect(white, `white days in the winter of ${winter}`).toBeGreaterThanOrEqual(21);
      if (bays) baysFrozen++;
      if (openSea) openSeaFrozen++;
    }
    expect(baysFrozen / winters).toBeGreaterThan(2 / 3);
    expect(openSeaFrozen / winters).toBeGreaterThan(0.1);
    expect(openSeaFrozen / winters).toBeLessThan(0.5);
  });

  it("lays no snow and no sea ice in summer", () => {
    for (const year of YEARS) {
      for (let day = dayNumberOf({ year, month: 6, day: 1 }); day < dayNumberOf({ year, month: 10, day: 1 }); day++) {
        expect(snowAt(day).depthCm).toBe(0);
        expect(seaIceAt(day).reach).toBe(0);
      }
    }
  });
});
