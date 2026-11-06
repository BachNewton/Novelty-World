import { describe, expect, it } from "vitest";
import { dateOfDayNumber, dayNumberOf, firstAdvent, seasonDayOf, type CalendarDate } from "./calendar";
import { climateTimeAt } from "./feed";
import { leavesAt, seasonAt, type Season } from "./season";
import { weatherAt, type Weather } from "./weather";

const DAY_S = 86_400;
/** The real second Åland's clocks (as the climate reads them, UTC+2) show the start of a date. */
const midnightOf = (date: CalendarDate) => (dayNumberOf(date) - 2 / 24) * DAY_S;

const weatherNumbers = ({ condition: _condition, state: _state, ...numbers }: Weather) => numbers;
/** The season's dials; the Advent candles are a count, a candle lit or not. */
const seasonNumbers = ({ lights: { adventCandles: _candles, ...lights }, ...season }: Season) => ({ ...season.leaves, ...season.snow, ...season.seaIce, ...lights, aurora: season.auroraNightChance, ...season.inSeason });

/** Everything the climate says at a second of the world's clock, as the game reads it. */
function climateAt(seconds: number) {
  const time = climateTimeAt(seconds);
  return { ...weatherNumbers(weatherAt(time)), ...seasonNumbers(seasonAt(time.date, time.through)) };
}

describe("the climate over time", () => {
  it("never jumps where a day, a game day, a month, a year or a winter turns over, or where the road's memory takes a new sample", () => {
    const boundaries = [
      ...[{ year: 2027, month: 1, day: 1 }, { year: 2027, month: 2, day: 1 }, { year: 2026, month: 7, day: 1 }, { year: 2026, month: 9, day: 1 }, { year: 2027, month: 1, day: 14 }].map(midnightOf),
      // The town's lights go up through the day a week and a day before the first Advent.
      (firstAdvent(2026) - 8 - 2 / 24) * DAY_S,
      ...[0, 1, 2].map((game) => (dayNumberOf({ year: 2027, month: 1, day: 20 }) * 24 + game) * 3600),
      ...[0, 1, 2].map((game) => (dayNumberOf({ year: 2026, month: 11, day: 20 }) * 24 + game) * 3600 + 75 * 17),
      ...[0, 1, 2].map((game) => (dayNumberOf({ year: 2027, month: 3, day: 15 }) * 24 + game) * 3600 + 75 * 31),
    ];
    for (const at of boundaries) {
      const [before, after] = [climateAt(at - 0.001), climateAt(at + 0.001)];
      for (const [name, value] of Object.entries(before)) {
        expect(Math.abs(after[name as keyof typeof after] - value), `${name} at ${new Date(at * 1000).toISOString()}`).toBeLessThan(0.002);
      }
    }
  });

  it("turns a broadleaf tree before it drops its leaves, and leafs it out green", () => {
    const start = dayNumberOf({ year: 2026, month: 1, day: 1 });
    for (let day = start; day < start + 365; day += 0.25) {
      const { leafed, turned } = leavesAt(day);
      const autumn = dateOfDayNumber(day).month >= 7;
      // A tree with threshold t has turned while `turned` passes t and is bare once `leafed` falls below 1 − t... its own threshold is the same for both, so every tree bare in autumn has turned first.
      if (autumn) expect(turned + 1e-9).toBeGreaterThanOrEqual(1 - leafed);
      // In spring every tree has lost its colour before any comes into leaf.
      else if (leafed > 0) expect(turned).toBe(0);
    }
  });

  it("finds the first Sunday of Advent", () => {
    const first = (year: number) => dateOfDayNumber(firstAdvent(year));
    expect(first(2022)).toEqual({ year: 2022, month: 11, day: 27 });
    expect(first(2023)).toEqual({ year: 2023, month: 12, day: 3 });
    expect(first(2025)).toEqual({ year: 2025, month: 11, day: 30 });
    expect(first(2026)).toEqual({ year: 2026, month: 11, day: 29 });
  });

  it("reads the date and the fast hour from the world's clock together, so a game day's end is the next one's start", () => {
    const time = climateTimeAt(midnightOf({ year: 2026, month: 11, day: 5 }) + 3 * 3600);
    expect(time.date).toEqual({ year: 2026, month: 11, day: 5 });
    expect(time.hour).toBeCloseTo(0, 9);
    expect(seasonDayOf(time.date, time.through)).toBeCloseTo(dayNumberOf(time.date) + 3 / 24, 9);
  });
});
