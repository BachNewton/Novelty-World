import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import {
  acquisitionValue as v17Acq,
  monopolyBonus as v17Bonus,
} from "../v17/valuation";
import {
  acquisitionValue as v26Acq,
  monopolyBonus as v26Bonus,
} from "./valuation";

// v26's one change: dark-blue's GROUP_WEIGHT 0.55→0.73, lifting its monopolyBonus
// from 413 (round(750*0.55)=412.5→413) to 548 (round(750*0.73)=547.5→548) so it ranks
// #2 (just above red 544), matching the published "desirability per roll" table. Every
// other set's bonus is v17 verbatim. Dark-blue lots are Park Place (37) and Boardwalk
// (39); printed set price 350+400 = 750.

const base = freshGame();

describe("v26 dark-blue set weight — raised to land at #2", () => {
  it("lifts ONLY dark-blue's monopolyBonus 413→548; other sets unchanged", () => {
    expect(v17Bonus("dark-blue")).toBe(413); // round(750 * 0.55) = round(412.5)
    expect(v26Bonus("dark-blue")).toBe(548); // round(750 * 0.73) = round(547.5)
    // Sanity: 548 sits just above red (544) and below orange (560) → rank #2.
    expect(v26Bonus("dark-blue")).toBeGreaterThan(v26Bonus("red"));
    expect(v26Bonus("dark-blue")).toBeLessThan(v26Bonus("orange"));
    // Untouched sets identical between v17 and v26.
    for (const color of ["orange", "red", "yellow", "green", "pink", "light-blue", "brown"] as const) {
      expect(v26Bonus(color)).toBe(v17Bonus(color));
    }
  });

  it("values completing a dark-blue monopoly higher (the bonus flows through acquisitionValue)", () => {
    // p1 owns Park Place (37); Boardwalk (39) is unowned. Buying Boardwalk completes
    // the dark-blue set, so its acquisitionValue carries the full monopolyBonus delta.
    const oneShort: GameState = { ...base, ownership: { 37: "p1" } };
    const gain = v26Acq(oneShort, "p1", 39) - v17Acq(oneShort, "p1", 39);
    expect(gain).toBe(548 - 413); // exactly the bonus increase
  });

  it("raises the denial premium for blocking a rival's dark-blue (DENY_FACTOR 0.6)", () => {
    // p2 owns Park Place (37) and is one short; Boardwalk (39) is the open completer.
    // Taking it denies p2 the dark-blue monopoly → acquisitionValue books
    // round(monopolyBonus * 0.6) more in v26 than v17.
    const rivalOneShort: GameState = { ...base, ownership: { 37: "p2" } };
    const v17Deny = v17Acq(rivalOneShort, "p1", 39);
    const v26Deny = v26Acq(rivalOneShort, "p1", 39);
    expect(v26Deny - v17Deny).toBe(Math.round(548 * 0.6) - Math.round(413 * 0.6));
  });
});
