import { describe, expect, it } from "vitest";
import { dateOfDayNumber, dayNumberOf, firstAdvent, type CalendarDate } from "./calendar";
import { climateTimeOf } from "./feed";
import { DAYS_A_MONTH, gameDaysOf } from "../time/calendar";
import { gameTimeAt } from "../time/day";
import { leavesAt, seasonAt, type Season } from "./season";
import { weatherAt, type Weather } from "./weather";

/** Where the game's calendar shows a real date starting: its month's start, and that date's share of the month's three game days. */
const dateStarts = ({ year, month, day }: CalendarDate) => gameDaysOf({ year, month, day: 1, hour: 0 }) + ((day - 1) * DAYS_A_MONTH) / new Date(Date.UTC(year, month, 0)).getUTCDate();

const weatherNumbers = ({ condition: _condition, state: _state, ...numbers }: Weather) => numbers;
/** The season's dials; the Advent candles are a count, a candle lit or not. */
const seasonNumbers = ({ lights: { adventCandles: _candles, ...lights }, ...season }: Season) => ({ ...season.leaves, ...season.snow, ...season.seaIce, ...lights, aurora: season.auroraNightChance, ...season.inSeason });

/** Everything the climate says at a moment of the game's calendar, as the game reads it. */
function climateAt(gameDays: number) {
  const time = climateTimeOf(gameTimeAt(gameDays));
  return { ...weatherNumbers(weatherAt(time)), ...seasonNumbers(seasonAt(time.date, time.through)) };
}

describe("the climate over time", () => {
  it("never jumps where a day, a game day, a month, a year or a winter turns over, or where the road's memory takes a new sample", () => {
    const boundaries = [
      ...[{ year: 2027, month: 1, day: 1 }, { year: 2027, month: 2, day: 1 }, { year: 2026, month: 7, day: 1 }, { year: 2026, month: 9, day: 1 }, { year: 2027, month: 1, day: 14 }].map(dateStarts),
      // The town's lights go up through the day a week and a day before the first Advent.
      dateStarts(dateOfDayNumber(firstAdvent(2026) - 8)),
      ...[1, 2].map((day) => gameDaysOf({ year: 2027, month: 1, day: day + 1, hour: 0 })),
      ...[0, 1, 2].map((game) => gameDaysOf({ year: 2026, month: 11, day: 3, hour: 17 + game })),
      ...[0, 1, 2].map((game) => gameDaysOf({ year: 2027, month: 3, day: 2, hour: 7 + game })),
    ];
    for (const at of boundaries) {
      const [before, after] = [climateAt(at - 1e-6), climateAt(at + 1e-6)];
      for (const [name, value] of Object.entries(before)) {
        expect(Math.abs(after[name as keyof typeof after] - value), `${name} at game day ${at}`).toBeLessThan(0.002);
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
});
