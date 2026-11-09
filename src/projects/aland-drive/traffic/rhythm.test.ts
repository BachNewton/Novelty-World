import { describe, expect, it } from "vitest";
import { carHourShare, pathShare } from "./rhythm";

const MIDSUMMER = 172;
const MIDWINTER = 15;

describe("traffic through the day and year", () => {
  it("keeps a road's real count: its hours over a year add up to its average day", () => {
    let day = 0;
    for (let yearDay = 0; yearDay < 365; yearDay++) for (let hour = 0; hour < 24; hour += 0.25) day += carHourShare({ hour, yearDay }) * 0.25;
    expect(day / 365).toBeCloseTo(1, 1);
  });

  it("peaks morning and evening and is quiet at night", () => {
    const at = (hour: number) => carHourShare({ hour, yearDay: 100 });
    expect(at(7.5)).toBeGreaterThan(at(10.5));
    expect(at(16.5)).toBeGreaterThan(at(12.5));
    expect(at(3)).toBeLessThan(at(12.5) / 10);
  });

  it("has more cars on a summer day, and fewest cyclists in winter, fewer than walkers lose", () => {
    expect(carHourShare({ hour: 13, yearDay: MIDSUMMER })).toBeGreaterThan(carHourShare({ hour: 13, yearDay: MIDWINTER }) * 1.3);
    const winterOverSummer = (kind: "bike" | "walker") => pathShare(kind, { hour: 13, yearDay: MIDWINTER }) / pathShare(kind, { hour: 13, yearDay: MIDSUMMER });
    expect(winterOverSummer("bike")).toBeLessThan(0.15);
    expect(winterOverSummer("bike")).toBeLessThan(winterOverSummer("walker"));
  });

  it("runs on without a jump through midnight and the turn of the year", () => {
    expect(carHourShare({ hour: 23.999, yearDay: 364.999 })).toBeCloseTo(carHourShare({ hour: 0, yearDay: 0 }), 4);
    expect(pathShare("bike", { hour: 23.999, yearDay: 200 })).toBeCloseTo(pathShare("bike", { hour: 0, yearDay: 200 }), 3);
  });
});
