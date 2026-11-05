import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dateOfDayNumber, dayNumberOf } from "./calendar";
import { seasonAt } from "./season";
import { weatherAt } from "./weather";

/*
 * Its own file, so the weather's calibration and the winters' snow are first worked out here, under the stubs: every
 * player's weather must come out the same to the last bit, and the functions engines may round each their own way
 * (and anything that reads the machine's clock or a random number) would let it drift apart between two players.
 */

const INEXACT = ["sin", "cos", "tan", "exp", "expm1", "log", "log2", "log10", "log1p", "pow", "atan", "atan2", "asin", "acos", "sinh", "cosh", "tanh", "cbrt", "hypot", "random"] as const;

describe("the shared weather", () => {
  beforeAll(() => {
    for (const name of INEXACT) {
      vi.spyOn(Math, name).mockImplementation(() => {
        throw new Error(`the weather called Math.${name}, which two machines may not round alike`);
      });
    }
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("the weather read the machine's clock rather than the time it was given");
    });
  });
  afterAll(() => vi.restoreAllMocks());

  it("is worked out with exact arithmetic only, from the time it's given", () => {
    const start = dayNumberOf({ year: 2026, month: 7, day: 1 });
    for (let day = start; day < start + 365; day += 5) {
      const date = dateOfDayNumber(day);
      for (const hour of [3, 9, 15, 21]) {
        expect(() => weatherAt({ date, through: hour / 24, hour, gameDays: day * 24 + hour / 24 })).not.toThrow();
      }
      expect(() => seasonAt(date, 0.5)).not.toThrow();
    }
  });
});
