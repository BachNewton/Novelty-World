import { describe, expect, it } from "vitest";
import { CALENDAR, parseDate, secondsPerDay } from "../../engine/calendar";
import { advanceClock, holdDay, holdHour, makeClock, setDay, setHour } from "./clock";

describe("the valley's clock", () => {
  it("starts a new game on the calendar's first morning, and turns on through the days", () => {
    const clock = makeClock(null);
    expect(clock.date).toMatchObject({ season: CALENDAR.start.season, dayOfSeason: CALENDAR.start.day, hour: CALENDAR.start.hour });
    advanceClock(clock, secondsPerDay() * 1.25);
    expect(clock.hours).toBeCloseTo(CALENDAR.start.hour + 6);
    expect(clock.date.dayOfSeason).toBe(1);
    expect(clock.date.season).toBe("summer");
  });

  it("holds the hour and the date with it", () => {
    const clock = makeClock(22.5, parseDate("litha"));
    advanceClock(clock, secondsPerDay());
    expect(clock.date).toMatchObject({ season: "summer", dayOfSeason: 2 });
    expect(clock.hours).toBeCloseTo(22.5);
    expect(clock.sky.sun.twilight).toBe("civil");
    holdHour(clock, null);
    advanceClock(clock, secondsPerDay() / 24);
    expect(clock.hours).toBeCloseTo(23.5);
  });

  it("starts on a date at the morning's hour, and moves between dates and hours", () => {
    const clock = makeClock(null, parseDate("yule"));
    expect(clock.date).toMatchObject({ season: "winter", dayOfSeason: 2, hour: CALENDAR.start.hour });
    expect(clock.today.dayLength).toBeLessThan(7);
    setHour(clock, 12);
    expect(clock.date).toMatchObject({ season: "winter", dayOfSeason: 2, hour: 12 });
    setDay(clock, parseDate("litha"));
    expect(clock.date).toMatchObject({ season: "summer", dayOfSeason: 2, hour: 12 });
    expect(clock.today.dayLength).toBeGreaterThan(18);
    expect(clock.light).toBe(clock.sky.light);
  });

  it("holds the date while the hours turn, coming round to the same day past midnight", () => {
    const clock = makeClock(null, parseDate("samhain"));
    setHour(clock, 22);
    holdDay(clock, true);
    advanceClock(clock, (secondsPerDay() / 24) * 4);
    expect(clock.date).toMatchObject({ season: "autumn", dayOfSeason: 5 });
    expect(clock.hours).toBeCloseTo(2);
    setDay(clock, parseDate("yule"));
    advanceClock(clock, secondsPerDay());
    expect(clock.date).toMatchObject({ season: "winter", dayOfSeason: 2 });
    holdDay(clock, false);
    advanceClock(clock, secondsPerDay());
    expect(clock.date).toMatchObject({ season: "winter", dayOfSeason: 3 });
  });
});
