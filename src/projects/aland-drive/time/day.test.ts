import { describe, expect, it } from "vitest";
import { alandDate, alandInstant, alandOffsetHours, DayClock, dayAsked, GAME_DAY_S } from "./day";
import { moonPlace, sunPlace, SUNRISE_ELEVATION_DEG, TRUE_NORTH_GRID_DEG } from "./sky-places";

// Mariehamn (60.0973 N, 19.9348 E), from sunrise-sunset.org's API, in UTC.
const KNOWN = [
  { date: "2026-03-20", sunrise: "04:41:20", sunset: "16:54:07", noon: "10:47:43" },
  { date: "2026-06-21", sunrise: "01:14:48", sunset: "20:09:20", noon: "10:42:04" },
  { date: "2026-11-05", sunrise: "06:13:13", sunset: "14:34:28", noon: "10:23:50" },
  { date: "2026-12-21", sunrise: "07:42:53", sunset: "13:33:42", noon: "10:38:17" },
];
const at = (date: string, time: string) => Date.parse(`${date}T${time}Z`);
/** True bearing, -180 to 180 about north. */
const trueAzimuth = (gridDeg: number) => ((gridDeg - TRUE_NORTH_GRID_DEG + 540) % 360) - 180;
const MINUTE_MS = 60_000;

/** When the sun's centre crosses the sunrise height within an hour either side of `near`. */
function crossing(near: number) {
  const above = (ms: number) => sunPlace(ms).elevationDeg > SUNRISE_ELEVATION_DEG;
  let [from, to] = [near - 60 * MINUTE_MS, near + 60 * MINUTE_MS];
  const rising = !above(from);
  while (to - from > 1000) {
    const middle = (from + to) / 2;
    if (above(middle) === rising) to = middle;
    else from = middle;
  }
  return from;
}

describe("the sun over Åland", () => {
  it.each(KNOWN)("rises and sets on $date when Mariehamn's tables say", ({ date, sunrise, sunset }) => {
    for (const time of [sunrise, sunset]) expect(Math.abs(crossing(at(date, time)) - at(date, time))).toBeLessThan(MINUTE_MS);
  });

  it.each(KNOWN)("stands due south at solar noon on $date, as high as the latitude and season put it", ({ date, noon }) => {
    const place = sunPlace(at(date, noon));
    expect(Math.abs(trueAzimuth(place.azimuthDeg))).toBeCloseTo(180, 0);
    expect(place.azimuthDeg).toBeCloseTo(180 + TRUE_NORTH_GRID_DEG, 0);
    const declination = { "2026-03-20": 0, "2026-06-21": 23.44, "2026-11-05": -15.6, "2026-12-21": -23.44 }[date] ?? Number.NaN;
    expect(place.elevationDeg).toBeCloseTo(90 - 60.0973 + declination, 0);
  });

  it("never goes far under the northern horizon at midsummer: the night stays a blue dusk", () => {
    const midnight = sunPlace(at("2026-06-21", "22:42:00"));
    expect(midnight.elevationDeg).toBeGreaterThan(-7);
    expect(midnight.elevationDeg).toBeLessThan(-5.5);
    expect(trueAzimuth(midnight.azimuthDeg)).toBeCloseTo(0, -1);
  });
});

describe("the moon over Åland", () => {
  it("is full at the eclipse of 3 March 2026 and new at the eclipse of 17 February", () => {
    expect(moonPlace(at("2026-03-03", "11:33:00")).lit).toBeGreaterThan(0.99);
    const newMoon = moonPlace(at("2026-02-17", "12:01:00"));
    expect(newMoon.lit).toBeLessThan(0.01);
  });

  it("waxes after new and wanes after full", () => {
    expect(moonPlace(at("2026-02-24", "12:00:00")).waxing).toBe(true);
    expect(moonPlace(at("2026-03-10", "12:00:00")).waxing).toBe(false);
  });

  it("stands opposite the sun when full", () => {
    const instant = at("2026-03-03", "23:00:00");
    const [sun, moon] = [sunPlace(instant), moonPlace(instant)];
    expect(Math.abs(((moon.azimuthDeg - sun.azimuthDeg + 360) % 360) - 180)).toBeLessThan(15);
    expect(moon.elevationDeg).toBeGreaterThan(20);
  });
});

describe("Åland's calendar", () => {
  it("keeps summer time between the last Sundays of March and October, changing at 01:00 UTC", () => {
    expect(alandOffsetHours(at("2026-03-29", "00:59:59"))).toBe(2);
    expect(alandOffsetHours(at("2026-03-29", "01:00:00"))).toBe(3);
    expect(alandOffsetHours(at("2026-10-25", "00:59:59"))).toBe(3);
    expect(alandOffsetHours(at("2026-10-25", "01:00:00"))).toBe(2);
  });

  it("turns the date at Åland's midnight, not UTC's", () => {
    expect(alandDate(at("2026-11-04", "22:30:00"))).toEqual({ year: 2026, month: 11, day: 5 });
    expect(alandDate(at("2026-06-20", "21:30:00"))).toEqual({ year: 2026, month: 6, day: 21 });
  });

  it("finds the instant Åland's clocks show an hour, in winter and in summer", () => {
    expect(alandInstant({ year: 2026, month: 12, day: 21 }, 12)).toBe(at("2026-12-21", "10:00:00"));
    expect(alandInstant({ year: 2026, month: 6, day: 21 }, 0.5)).toBe(at("2026-06-20", "21:30:00"));
  });
});

describe("the game's day", () => {
  it("runs a whole day in a game day, the same for every player", () => {
    const start = Date.parse("2026-11-05T09:00:00Z") / 1000;
    const clock = new DayClock();
    const startHour = clock.at(start).hour;
    expect(clock.at(start + GAME_DAY_S / 4).hour).toBeCloseTo((startHour + 6) % 24, 6);
    expect(new DayClock().at(start + 17).hour).toBe(clock.at(start + 17).hour);
  });

  it("shows the date's real sky at the game's hour", () => {
    const seconds = Date.parse("2026-11-05T09:00:00Z") / 1000;
    const clock = new DayClock();
    clock.setDate({ year: 2026, month: 12, day: 21 });
    clock.setHour(12.6, seconds);
    const time = clock.at(seconds);
    expect(time.date).toEqual({ year: 2026, month: 12, day: 21 });
    expect(time.sun.elevationDeg).toBeCloseTo(sunPlace(at("2026-12-21", "10:36:00")).elevationDeg, 6);
  });

  it("holds an hour, and runs on from it when let go", () => {
    const clock = new DayClock();
    clock.setHour(20, 1000);
    clock.hold(true, 1000);
    expect(clock.at(5000).hour).toBe(20);
    clock.hold(false, 5000);
    expect(clock.at(5000).hour).toBeCloseTo(20, 9);
    expect(clock.at(5000 + GAME_DAY_S / 24).hour).toBeCloseTo(21, 9);
  });

  it("reads a date and an hour from a link, and refuses what isn't one", () => {
    expect(dayAsked("?date=2026-06-21&hour=23.5")).toEqual({ date: { year: 2026, month: 6, day: 21 }, hour: 23.5 });
    expect(dayAsked("")).toEqual({ date: null, hour: null });
    expect(() => dayAsked("?date=2026-02-30")).toThrow();
    expect(() => dayAsked("?hour=24")).toThrow();
  });
});
