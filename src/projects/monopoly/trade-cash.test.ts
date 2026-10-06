import { describe, expect, it } from "vitest";
import { freshGame } from "./mocks";
import {
  cashEntryValue,
  cashPair,
  nudgeFigure,
  openCashEntry,
  pairAmounts,
  pairFigure,
  pressCashKey,
  withCash,
} from "./trade-cash";
import type { CashEntry, CashKey } from "./trade-cash";
import type { GameState, TradeTerms } from "./types";

function press(entry: CashEntry, ...keys: (number | CashKey)[]): CashEntry {
  return keys.reduce<CashEntry>(
    (e, key) =>
      pressCashKey(e, typeof key === "number" ? { kind: "digit", digit: key } : key),
    entry,
  );
}

describe("pressCashKey", () => {
  it("builds the amount in $10 units, the last digit typed being the tens", () => {
    expect(press(openCashEntry(0), 3, 4).amount).toBe(340);
    expect(press(openCashEntry(0), 5, 0).amount).toBe(500);
    expect(press(openCashEntry(0), 1, 5, 0, 0).amount).toBe(15_000);
  });

  it("replaces the loaded amount on the first digit, then extends it", () => {
    expect(press(openCashEntry(200), 7).amount).toBe(70);
    expect(press(openCashEntry(200), 7, 5).amount).toBe(750);
  });

  it("edits the loaded amount on backspace instead of replacing it", () => {
    expect(press(openCashEntry(340), { kind: "back" }).amount).toBe(30);
    expect(press(openCashEntry(340), { kind: "back" }, 5).amount).toBe(350);
    expect(press(openCashEntry(30), { kind: "back" }, { kind: "back" }).amount).toBe(0);
  });

  it("clears to zero and keeps typing from there", () => {
    expect(press(openCashEntry(340), { kind: "clear" }).amount).toBe(0);
    expect(press(openCashEntry(340), { kind: "clear" }, 2).amount).toBe(20);
  });

  it("ignores a digit that would overflow the entry", () => {
    const full = press(openCashEntry(0), 9, 9, 9, 9);
    expect(full.amount).toBe(99_990);
    expect(press(full, 9)).toEqual(full);
  });

  it("flips the sign without touching the amount", () => {
    const flipped = press(openCashEntry(340), { kind: "flip" });
    expect(cashEntryValue(flipped)).toBe(-340);
    expect(cashEntryValue(press(flipped, { kind: "flip" }))).toBe(340);
  });

  it("keeps a loaded negative amount's sign through edits", () => {
    expect(cashEntryValue(press(openCashEntry(-200), 4))).toBe(-40);
  });

  it("reads a flipped zero as zero", () => {
    expect(Object.is(cashEntryValue(press(openCashEntry(0), { kind: "flip" })), 0)).toBe(
      true,
    );
  });
});

function draft(
  partial: Partial<TradeTerms>,
  proposerId = "p1",
): TradeTerms & { proposerId: string } {
  return { proposerId, propertyTo: {}, gojfTo: {}, cashDelta: {}, ...partial };
}

describe("cashPair", () => {
  // Baltic (3) belongs to p2, Oriental (6) to p3.
  const state: GameState = { ...freshGame("trade-cash"), ownership: { 3: "p2", 6: "p3" } };

  it("is null until two parties are named", () => {
    expect(cashPair(state, draft({}))).toBeNull();
    expect(cashPair(state, draft({ cashDelta: { p2: 100 } }))).toBeNull();
  });

  it("puts the proposer first when they are a party", () => {
    expect(cashPair(state, draft({ propertyTo: { 3: "p1" } }, "p1"))).toEqual(["p1", "p2"]);
    expect(cashPair(state, draft({ propertyTo: { 3: "p3" } }, "p3"))).toEqual(["p3", "p2"]);
  });

  it("falls back to seat order when the proposer is not a party", () => {
    expect(cashPair(state, draft({ propertyTo: { 6: "p2" } }, "p1"))).toEqual(["p2", "p3"]);
  });

  it("counts a player named only by cash as a party", () => {
    expect(cashPair(state, draft({ propertyTo: { 3: "p1" }, cashDelta: { p3: 50 } }))).toBeNull();
    expect(cashPair(state, draft({ cashDelta: { p1: -50, p4: 50 } }))).toEqual(["p1", "p4"]);
  });

  it("is null with three or more parties", () => {
    expect(cashPair(state, draft({ propertyTo: { 3: "p1", 6: "p1" } }))).toBeNull();
  });
});

describe("pair figure", () => {
  const pair = ["p1", "p2"] as const;

  it("reads what the first pays the second, negative when the second pays", () => {
    expect(pairFigure({}, pair)).toBe(0);
    expect(pairFigure({ p1: -300, p2: 300 }, pair)).toBe(300);
    expect(pairFigure({ p1: 300, p2: -300 }, pair)).toBe(-300);
  });

  it("reads an unbalanced draft from whichever side was set", () => {
    expect(pairFigure({ p1: -100 }, pair)).toBe(100);
    expect(pairFigure({ p2: -100 }, pair)).toBe(-100);
  });

  it("writes balanced amounts, so the trade can't be off", () => {
    const amounts = pairAmounts(pair, 340);
    expect(amounts).toEqual({ p1: -340, p2: 340 });
    expect(withCash({ p1: -100 }, amounts)).toEqual({ p1: -340, p2: 340 });
    expect(withCash({ p1: -340, p2: 340 }, pairAmounts(pair, 0))).toEqual({});
  });

  it("nudges in the direction the figure runs, stopping at zero", () => {
    expect(nudgeFigure(100, 50)).toBe(150);
    expect(nudgeFigure(-100, 50)).toBe(-150);
    expect(nudgeFigure(-50, -50)).toBe(0);
    expect(nudgeFigure(0, -50)).toBe(0);
    expect(nudgeFigure(0, 50)).toBe(50);
  });
});

describe("withCash", () => {
  it("sets absolute amounts, drops zeros, and leaves other players alone", () => {
    expect(withCash({ p1: -50, p3: 20 }, { p1: 200, p2: 0 })).toEqual({ p1: 200, p3: 20 });
    expect(withCash({ p1: -50 }, { p1: 0 })).toEqual({});
  });
});
