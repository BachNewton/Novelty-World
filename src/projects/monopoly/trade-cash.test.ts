import { describe, expect, it } from "vitest";
import { cashEntryValue, openCashEntry, pressCashKey, withCash } from "./trade-cash";
import type { CashEntry, CashKey } from "./trade-cash";

const NEGATE: CashKey = { kind: "negate" };

function press(entry: CashEntry, ...keys: (number | CashKey)[]): CashEntry {
  return keys.reduce<CashEntry>(
    (e, key) =>
      pressCashKey(e, typeof key === "number" ? { kind: "digit", digit: key } : key),
    entry,
  );
}

function typed(entry: CashEntry, ...keys: (number | CashKey)[]): number {
  return cashEntryValue(press(entry, ...keys));
}

describe("pressCashKey", () => {
  it("builds the amount in whole dollars", () => {
    expect(typed(openCashEntry(0), 3, 4, 0)).toBe(340);
    expect(typed(openCashEntry(0), 3, 4)).toBe(34);
    expect(typed(openCashEntry(0), 1, 5, 0, 0)).toBe(1_500);
  });

  it("replaces the loaded amount on the first digit, then extends it", () => {
    expect(typed(openCashEntry(200), 7)).toBe(7);
    expect(typed(openCashEntry(200), 7, 5)).toBe(75);
  });

  it("edits the loaded amount on backspace instead of replacing it", () => {
    expect(typed(openCashEntry(340), { kind: "back" })).toBe(34);
    expect(typed(openCashEntry(340), { kind: "back" }, 5)).toBe(345);
    expect(typed(openCashEntry(3), { kind: "back" }, { kind: "back" })).toBe(0);
  });

  it("clears to zero and keeps typing from there", () => {
    expect(typed(openCashEntry(340), { kind: "clear" })).toBe(0);
    expect(typed(openCashEntry(340), { kind: "clear" }, 2)).toBe(2);
  });

  it("ignores a digit that would overflow the entry", () => {
    const full = press(openCashEntry(0), 9, 9, 9, 9, 9);
    expect(full.amount).toBe(99_999);
    expect(press(full, 9)).toEqual(full);
  });

  it("takes a minus typed before the digits", () => {
    expect(typed(openCashEntry(0), NEGATE, 3, 4, 0)).toBe(-340);
    expect(typed(openCashEntry(200), NEGATE, 5, 0)).toBe(-50);
  });

  it("toggles the sign on a second minus, before or after the digits", () => {
    expect(typed(openCashEntry(0), NEGATE, 3, NEGATE)).toBe(3);
    expect(typed(openCashEntry(-200), NEGATE)).toBe(200);
    expect(typed(openCashEntry(0), 3, 4, 0, NEGATE)).toBe(-340);
  });

  it("keeps a loaded negative amount's sign through edits", () => {
    expect(typed(openCashEntry(-200), 4)).toBe(-4);
  });

  it("holds a minus typed at zero, but reads it as zero", () => {
    const pending = press(openCashEntry(0), NEGATE);
    expect(pending.negative).toBe(true);
    expect(Object.is(cashEntryValue(pending), 0)).toBe(true);
  });
});

describe("withCash", () => {
  it("sets one player's amount, drops a zero, and leaves the others alone", () => {
    expect(withCash({ p1: -50, p3: 20 }, "p1", 200)).toEqual({ p1: 200, p3: 20 });
    expect(withCash({ p1: -50, p3: 20 }, "p1", 0)).toEqual({ p3: 20 });
    expect(withCash({}, "p2", -35)).toEqual({ p2: -35 });
  });
});
