import { describe, expect, it } from "vitest";
import { CALENDAR, dateAt, daysPerYear, FESTIVALS, festivalDay, festivalOn, nextFestival, parseDate, realDayOf, secondsPerDay, startTime, timeOf, type CalendarTuning } from "./calendar";

const DAY = secondsPerDay();

describe("the calendar", () => {
  it("turns a day in its minutes per day and a year in four seasons of its days", () => {
    expect(DAY).toBe(CALENDAR.minutesPerDay * 60);
    expect(dateAt(0)).toMatchObject({ day: 0, year: 1, season: "spring", dayOfSeason: 1, hour: 0 });
    expect(dateAt(DAY * 7.5)).toMatchObject({ season: "summer", dayOfSeason: 1, hour: 12 });
    expect(dateAt(DAY * daysPerYear())).toMatchObject({ year: 2, season: "spring", dayOfSeason: 1, dayOfYear: 0 });
    expect(dateAt(DAY * (daysPerYear() - 0.5))).toMatchObject({ year: 1, season: "winter", dayOfSeason: 7 });
  });

  it("begins a new game on a late-May morning", () => {
    const start = dateAt(startTime());
    expect(start).toMatchObject({ season: "spring", dayOfSeason: 7, hour: 9 });
    expect(start.realDayOfYear).toBeGreaterThan(realDayOf(5, 15));
    expect(start.realDayOfYear).toBeLessThan(realDayOf(6, 1));
  });

  it("stands each season for its months of the real year, its days spread evenly over them", () => {
    const at = (season: number) => dateAt(season * CALENDAR.daysPerSeason * DAY).realDayOfYear;
    expect(at(0)).toBeCloseTo(realDayOf(3, 1), 0);
    expect(Math.abs(at(1) - realDayOf(6, 1))).toBeLessThan(2);
    expect(Math.abs(at(2) - realDayOf(9, 1))).toBeLessThan(2);
    expect(Math.abs(at(3) - realDayOf(12, 1))).toBeLessThan(2);
  });

  it("runs the real day of the year forward through the year and round", () => {
    let previous = dateAt(0).realDayOfYear;
    let wraps = 0;
    for (let t = DAY / 10; t <= DAY * daysPerYear(); t += DAY / 10) {
      const now = dateAt(t).realDayOfYear;
      expect(now).toBeGreaterThanOrEqual(0);
      expect(now).toBeLessThan(365);
      if (now < previous) wraps++;
      else expect(now - previous).toBeLessThan(2);
      previous = now;
    }
    expect(wraps).toBe(1);
  });

  it("measures progress through the season and the year", () => {
    const d = dateAt(DAY * (CALENDAR.daysPerSeason + 3.5));
    expect(d.seasonProgress).toBeCloseTo(3.5 / CALENDAR.daysPerSeason);
    expect(d.yearProgress).toBeCloseTo((CALENDAR.daysPerSeason + 3.5) / daysPerYear());
  });

  it("puts the eight festivals on eight days, each in its season", () => {
    const on = Object.fromEntries(FESTIVALS.map((f) => [f.id, dateAt(timeOf(festivalDay(f), 12))]));
    const days = new Set(FESTIVALS.map((f) => festivalDay(f)));
    expect(days.size).toBe(8);
    expect(on.ostara).toMatchObject({ season: "spring", dayOfSeason: 2 });
    expect(on.beltane).toMatchObject({ season: "spring", dayOfSeason: 5 });
    expect(on.litha).toMatchObject({ season: "summer", dayOfSeason: 2 });
    expect(on.lughnasadh).toMatchObject({ season: "summer", dayOfSeason: 5 });
    expect(on.mabon).toMatchObject({ season: "autumn", dayOfSeason: 2 });
    expect(on.samhain).toMatchObject({ season: "autumn", dayOfSeason: 5 });
    expect(on.yule).toMatchObject({ season: "winter", dayOfSeason: 2 });
    expect(on.imbolc).toMatchObject({ season: "winter", dayOfSeason: 5 });
    // A festival's game day holds its real date.
    for (const festival of FESTIVALS) {
      const day = festivalDay(festival);
      const from = dateAt(timeOf(day, 0)).realDayOfYear;
      const to = from + 365 / daysPerYear();
      const real = festival.realDayOfYear < from ? festival.realDayOfYear + 365 : festival.realDayOfYear;
      expect(real).toBeGreaterThanOrEqual(from);
      expect(real).toBeLessThan(to);
    }
  });

  it("knows today's festival and the next, in every year", () => {
    const litha = parseDate("litha");
    expect(festivalOn(litha)?.id).toBe("litha");
    expect(festivalOn(litha + daysPerYear() * 3)?.id).toBe("litha");
    expect(festivalOn(litha + 1)).toBeNull();
    const start = dateAt(startTime()).day;
    expect(nextFestival(start)).toMatchObject({ festival: { id: "litha" }, day: litha, inDays: 2 });
    expect(nextFestival(litha).festival.id).toBe("lughnasadh");
    const imbolc = parseDate("imbolc");
    expect(nextFestival(imbolc)).toMatchObject({ festival: { id: "ostara" }, day: daysPerYear() + parseDate("ostara") });
  });

  it("drifts the moon's phases across the seasons, a cycle every few days", () => {
    const start = dateAt(startTime());
    expect(start.moonAge).toBeCloseTo(CALENDAR.startMoonAge);
    expect(dateAt(startTime() + CALENDAR.daysPerLunarCycle * DAY).moonAge).toBeCloseTo(CALENDAR.startMoonAge);
    const litha = parseDate("litha");
    const ages = [0, 1, 2].map((year) => dateAt(timeOf(litha + year * daysPerYear(), 0)).moonAge);
    expect(Math.abs(ages[1] - ages[0])).toBeGreaterThan(0.1);
    expect(Math.abs(ages[2] - ages[1])).toBeGreaterThan(0.1);
  });

  it("reads a date as a season's day, a festival or a day number", () => {
    expect(parseDate("spring-1")).toBe(0);
    expect(parseDate("Summer-2")).toBe(CALENDAR.daysPerSeason + 1);
    expect(parseDate("winter-7")).toBe(daysPerYear() - 1);
    expect(parseDate("37")).toBe(37);
    expect(parseDate("yule")).toBe(festivalDay(FESTIVALS.find((f) => f.id === "yule") ?? FESTIVALS[0]));
    expect(() => parseDate("summer-8")).toThrow();
    expect(() => parseDate("midsummer")).toThrow();
    expect(() => parseDate("-3")).toThrow();
  });

  it("follows its tuning", () => {
    const longer: CalendarTuning = { ...CALENDAR, minutesPerDay: 20, daysPerSeason: 10 };
    expect(dateAt(20 * 60 * 10.25, longer)).toMatchObject({ season: "summer", dayOfSeason: 1, hour: 6 });
    expect(parseDate("litha", longer)).not.toBe(parseDate("litha"));
    expect(festivalOn(parseDate("litha", longer), longer)?.id).toBe("litha");
  });

});
