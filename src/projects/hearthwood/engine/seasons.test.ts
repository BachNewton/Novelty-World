import { describe, expect, it } from "vitest";
import { CALENDAR, dateAt, parseDate, realDayOf, secondsPerDay, timeOf } from "./calendar";
import { ALTITUDE } from "./land";
import { REGIONS } from "./regions";
import {
  broadleafMix,
  broadleafShare,
  curveAt,
  groundSeason,
  PHENOLOGY,
  plantSeason,
  plantSeasonAt,
  plantVariation,
  SEASON_GROUPS,
  seasonGroupOf,
  seasonWeights,
  standHash,
  TIMING_SPREAD,
} from "./seasons";

/** The real day of the year at noon of a game date such as `autumn-3`. */
const on = (date: string) => dateAt(timeOf(parseDate(date), 12)).realDayOfYear;

describe("the plants' year", () => {
  it("leafs the birches out in spring, holds them green all summer, turns them in autumn and leaves them bare all winter", () => {
    expect(plantSeason("birch", realDayOf(1, 15)).leaf).toBe(0);
    expect(plantSeason("birch", realDayOf(4, 1)).leaf).toBe(0);
    const leafing = plantSeason("birch", realDayOf(5, 5));
    expect(leafing.leaf).toBeGreaterThan(0.2);
    expect(leafing.leaf).toBeLessThan(0.9);
    expect(leafing.fresh).toBeGreaterThan(0.9);
    expect(plantSeason("birch", realDayOf(7, 15))).toMatchObject({ leaf: 1, fresh: 0, turn: 0 });
    const autumn = plantSeason("birch", realDayOf(10, 1));
    expect(autumn.leaf).toBe(1);
    expect(autumn.turn).toBeGreaterThan(0.95);
    expect(plantSeason("birch", realDayOf(11, 10)).leaf).toBe(0);
  });

  it("shows each season unmistakably on the days the screenshots are taken", () => {
    expect(plantSeason("birch", on("spring-6")).fresh).toBeGreaterThan(0.85);
    expect(plantSeason("maple", on("summer-4"))).toMatchObject({ leaf: 1, turn: 0 });
    expect(plantSeason("maple", on("autumn-3")).turn).toBeGreaterThan(0.9);
    expect(plantSeason("maple", on("winter-4")).leaf).toBe(0);
    expect(groundSeason(on("winter-4")).snowLine).toBeLessThan(-100);
  });

  it("keeps an oak's dead leaves on through the winter, and conifers green all year, darker in winter", () => {
    expect(plantSeason("oak", realDayOf(1, 15)).leaf).toBeCloseTo(0.15);
    for (const group of ["conifer", "pine"] as const) {
      expect(plantSeason(group, realDayOf(1, 15))).toMatchObject({ leaf: 1, turn: 1 });
      expect(plantSeason(group, realDayOf(7, 15))).toMatchObject({ leaf: 1, turn: 0 });
    }
  });

  it("blooms the meadow flowers from spring through summer and takes them away in winter, and the heather late in summer", () => {
    expect(plantSeason("flowers", realDayOf(5, 20)).bloom).toBe(1);
    expect(plantSeason("flowers", realDayOf(7, 20)).bloom).toBe(1);
    expect(plantSeason("flowers", realDayOf(1, 15))).toMatchObject({ leaf: 0, bloom: 0 });
    expect(plantSeason("heather", realDayOf(6, 15)).bloom).toBe(0);
    expect(plantSeason("heather", realDayOf(8, 20)).bloom).toBe(1);
    expect(plantSeason("heather", realDayOf(11, 1)).bloom).toBe(0);
  });

  it("browns the undergrowth in autumn", () => {
    for (const group of ["fern", "bracken", "bush"] as const) {
      expect(plantSeason(group, realDayOf(7, 15)).turn).toBe(0);
      expect(plantSeason(group, realDayOf(10, 20)).turn).toBe(1);
    }
  });

  it("never jumps: a plant's state moves on only a little in an hour of the game's day", () => {
    const hour = secondsPerDay() / 24;
    for (let t = 0; t < secondsPerDay() * 28; t += hour) {
      const a = dateAt(t).realDayOfYear;
      const b = dateAt(t + hour).realDayOfYear;
      for (const group of SEASON_GROUPS) {
        const before = plantSeason(group, a);
        const after = plantSeason(group, b);
        for (const channel of ["leaf", "fresh", "turn", "bloom"] as const) expect(Math.abs(after[channel] - before[channel])).toBeLessThan(0.15);
      }
    }
  });

  it("keeps every value between 0 and 1, and every curve's stops in order round the year", () => {
    for (const group of SEASON_GROUPS) {
      for (const curve of Object.values(PHENOLOGY[group])) {
        for (let day = 0; day < 365; day += 0.5) {
          const value = curveAt(curve, day);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        const total = curve.reduce((sum, [day], i) => sum + ((((curve[(i + 1) % curve.length][0] - day) % 365) + 365) % 365), 0);
        expect(curve.length === 1 || total === 365).toBe(true);
      }
    }
  });
});

describe("each plant's own timing", () => {
  it("spreads the trees of a wood across a few days either side of their kind's dates, and their autumn colours with them", () => {
    const offsets: number[] = [];
    const hues: number[] = [];
    for (let i = 0; i < 400; i++) {
      const { offset, hue } = plantVariation("maple", i * 7.3 - 900, i * 3.1 + 40);
      offsets.push(offset);
      hues.push(hue);
    }
    expect(Math.max(...offsets)).toBeLessThanOrEqual(TIMING_SPREAD.maple);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-TIMING_SPREAD.maple);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(TIMING_SPREAD.maple);
    expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(0.8);
  });

  it("is the same tree on every visit: its variation comes from where it stands", () => {
    expect(standHash(123.4, -56.7)).toBe(standHash(123.4, -56.7));
    expect(standHash(123.4, -56.7)).not.toBe(standHash(124.4, -56.7));
  });

  it("turns one tree ahead of another in the same autumn", () => {
    const day = realDayOf(9, 22);
    const turns = Array.from({ length: 50 }, (_, i) => plantSeasonAt("birch", day, i * 11.7, i * -5.3).turn);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(0.3);
  });

  it("treats each kind of plant by how it lives", () => {
    expect(seasonGroupOf("broadleaf", 0)).toBe("oak");
    expect(seasonGroupOf("fern", 2)).toBe("bracken");
    expect(seasonGroupOf("fern", 0)).toBe("fern");
    expect(seasonGroupOf("maple", 1)).toBe("maple");
  });
});

describe("the ground's year", () => {
  it("lays snow over the whole land in winter, melts it up the mountains in spring and brings it down again in autumn", () => {
    expect(groundSeason(realDayOf(1, 15)).snowLine).toBeLessThan(-100);
    const melt = [realDayOf(3, 10), realDayOf(4, 1), realDayOf(4, 20), realDayOf(5, 15)].map((day) => groundSeason(day).snowLine);
    for (let i = 1; i < melt.length; i++) expect(melt[i]).toBeGreaterThan(melt[i - 1]);
    const fall = [realDayOf(10, 1), realDayOf(10, 20), realDayOf(11, 10), realDayOf(11, 28)].map((day) => groundSeason(day).snowLine);
    for (let i = 1; i < fall.length; i++) expect(fall[i]).toBeLessThan(fall[i - 1]);
  });

  it("leaves the high snowfields as they are all summer, with no seasonal snow below them", () => {
    expect(groundSeason(realDayOf(7, 15)).snowLine).toBeGreaterThan(ALTITUDE.snow);
    expect(groundSeason(realDayOf(8, 15)).snowLine).toBeGreaterThan(ALTITUDE.snow);
  });

  it("goes from dormant grass through new green and autumn gold, with leaves fallen under the broadleaves", () => {
    expect(groundSeason(realDayOf(4, 5)).dormant).toBe(1);
    expect(groundSeason(realDayOf(5, 20)).fresh).toBe(1);
    expect(groundSeason(realDayOf(7, 20))).toMatchObject({ fresh: 0, gold: 0, dormant: 0, litter: 0 });
    expect(groundSeason(realDayOf(10, 5)).gold).toBe(1);
    expect(groundSeason(realDayOf(10, 18)).litter).toBe(1);
  });

  it("freezes the water's edges in winter and frees them in spring", () => {
    expect(groundSeason(realDayOf(1, 15)).ice).toBe(1);
    expect(groundSeason(realDayOf(7, 15)).ice).toBe(0);
    expect(groundSeason(realDayOf(4, 1)).ice).toBeGreaterThan(0);
  });
});

describe("the seasons' weights", () => {
  it("sums to 1 every day, and is wholly one season in the middle of each", () => {
    for (let day = 0; day < 365; day += 0.25) {
      const w = seasonWeights(day);
      expect(w.spring + w.summer + w.autumn + w.winter).toBeCloseTo(1);
    }
    expect(seasonWeights(realDayOf(4, 15)).spring).toBe(1);
    expect(seasonWeights(realDayOf(1, 15)).winter).toBe(1);
  });

  it("hands over evenly on a season's first day", () => {
    const w = seasonWeights(realDayOf(9, 1));
    expect(w.summer).toBeCloseTo(0.5);
    expect(w.autumn).toBeCloseTo(0.5);
  });

  it("starts the game's seasons on the calendar's own", () => {
    const first = dateAt(0).realDayOfYear;
    expect(first).toBeCloseTo(realDayOf(3, 1));
    expect(CALENDAR.daysPerSeason).toBeGreaterThan(0);
  });
});

describe("the regions' woods", () => {
  it("knows how much of each region's woods are broadleaves, and which", () => {
    expect(broadleafShare("maplewood")).toBe(1);
    expect(broadleafShare("highlands")).toBeLessThan(0.15);
    for (const region of REGIONS) {
      const mix = Object.values(broadleafMix(region));
      if (mix.length > 0) expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    expect(broadleafMix("maplewood").maple).toBeGreaterThan(0.5);
  });
});
