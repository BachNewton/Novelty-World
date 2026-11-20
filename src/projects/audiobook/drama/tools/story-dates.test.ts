import { describe, expect, it } from "vitest";
import { ageOn, formatInterval, instantAt, interval, parseDay, wallClock } from "./story-dates";

const day = (text: string) => parseDay(text);

describe("story dates", () => {
  it("counts calendar months before days", () => {
    expect(formatInterval(interval(day("2026-11-08"), day("2027-03-18")))).toBe("4 months and 10 days (130 days)");
    expect(interval(day("2027-01-31"), day("2027-03-01"))).toMatchObject({ months: 1, days: 1 });
  });

  it("turns a year older on the birthday, not before", () => {
    expect(ageOn(day("1978-04-09"), day("2027-04-08"))).toBe(48);
    expect(ageOn(day("1978-04-09"), day("2027-04-09"))).toBe(49);
  });

  it("follows each side's daylight-saving change", () => {
    const daytonAt = (date: string, hour: number) =>
      wallClock(instantAt(day(date), hour, 0, "Europe/Helsinki"), "America/New_York").hour;
    expect(daytonAt("2027-03-12", 15)).toBe(8);
    expect(daytonAt("2027-03-18", 15)).toBe(9);
    expect(daytonAt("2027-03-29", 15)).toBe(8);
  });

  it("refuses arithmetic on a date known only to the month", () => {
    expect(() => parseDay("2029-11")).toThrow(/not a full date/);
    expect(() => parseDay("2027-02-29")).toThrow(/not a real date/);
  });
});
