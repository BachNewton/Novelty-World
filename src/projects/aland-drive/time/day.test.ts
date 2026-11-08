import { describe, expect, it } from "vitest";
import { calendarAt, dateAt, GAME_DAYS_A_YEAR, gameDaysOf } from "./calendar";
import { alandDate, alandInstant, alandOffsetHours, DayClock, dayAsked, GAME_DAY_S, gameDaysAtInstant, gameTimeAt, startOfDay } from "./day";
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
  it("runs a whole day in a game day, on from where it started", () => {
    const start = Date.parse("2026-11-05T09:00:00Z") / 1000;
    const clock = new DayClock(gameDaysOf({ year: 2026, month: 11, day: 1, hour: 6 }));
    expect(clock.at(start).hour).toBeCloseTo(6, 9);
    expect(clock.at(start + GAME_DAY_S / 4).hour).toBeCloseTo(12, 6);
    expect(clock.at(start + GAME_DAY_S).calendar).toMatchObject({ month: 11, day: 2 });
  });

  it("shows a held date's real sky at the game's hour", () => {
    const seconds = Date.parse("2026-11-05T09:00:00Z") / 1000;
    const clock = new DayClock(0);
    clock.setDate({ year: 2026, month: 12, day: 21 }, seconds);
    clock.setHour(12.6, seconds);
    const time = clock.at(seconds);
    expect(time.date).toEqual({ year: 2026, month: 12, day: 21 });
    expect(time.calendar).toMatchObject({ month: 12, day: 2 });
    expect(time.sun.elevationDeg).toBeCloseTo(sunPlace(at("2026-12-21", "10:36:00")).elevationDeg, 6);
  });

  it("holds the time, and runs on from it when let go", () => {
    const clock = new DayClock(0);
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

  it("starts where this browser left the world, at the real date and time with no save, and where a link says", () => {
    const now = at("2026-11-05", "19:30:00");
    const saved = gameDaysOf({ year: 2027, month: 3, day: 2, hour: 9 });
    expect(startOfDay("", saved, now)).toEqual({ gameDays: saved, date: null, linked: false });
    const fresh = calendarAt(startOfDay("", null, now).gameDays);
    expect(fresh).toMatchObject({ year: 2026, month: 11, day: 1 });
    expect(fresh.hour).toBeCloseTo(21.5, 6);
    const linked = startOfDay("?hour=22", saved, now);
    expect(linked.linked).toBe(true);
    expect(calendarAt(linked.gameDays)).toMatchObject({ month: 3, day: 2 });
    expect(calendarAt(linked.gameDays).hour).toBeCloseTo(22, 6);
  });
});

describe("the game's calendar", () => {
  it("spreads a month's real days over its three game days", () => {
    const shown = (day: number, hour: number) => dateAt(gameDaysOf({ year: 2026, month: 12, day, hour })).date.day;
    expect([1, 2, 3].map((day) => shown(day, 12))).toEqual([6, 16, 26]);
    expect(shown(1, 0)).toBe(1);
    expect(shown(3, 23.99)).toBe(31);
  });

  it("turns from December's last game day to January's first of the next year", () => {
    const newYear = gameDaysOf({ year: 2026, month: 12, day: 3, hour: 24 });
    expect(calendarAt(newYear)).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0 });
    expect(calendarAt(newYear + GAME_DAYS_A_YEAR)).toMatchObject({ year: 2028, month: 1, day: 1 });
    expect(dateAt(newYear - 1e-6).date).toEqual({ year: 2026, month: 12, day: 31 });
    expect(dateAt(newYear).date).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("moves the sky only a little at any turn of a game day, a month or the year", () => {
    const year = Array.from({ length: GAME_DAYS_A_YEAR + 1 }, (_, day) => gameDaysOf({ year: 2026, month: 1, day: 1, hour: 0 }) + day);
    for (const turn of year) {
      const [before, after] = [gameTimeAt(turn - 1e-7), gameTimeAt(turn + 1e-7)];
      expect(Math.abs(after.sun.elevationDeg - before.sun.elevationDeg), `game day ${turn}`).toBeLessThan(0.01);
      expect(Math.abs(after.moon.elevationDeg - before.moon.elevationDeg), `game day ${turn}`).toBeLessThan(0.05);
    }
  });

  it("finds the game day of a real instant, and its hour", () => {
    const midsummer = calendarAt(gameDaysAtInstant(at("2026-06-21", "10:00:00")));
    expect(midsummer).toMatchObject({ year: 2026, month: 6, day: 3 });
    expect(midsummer.hour).toBeCloseTo(13, 6);
    expect(calendarAt(gameDaysAtInstant(at("2026-02-28", "21:59:00")))).toMatchObject({ month: 2, day: 3 });
  });
});
