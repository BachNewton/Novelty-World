import { describe, expect, it } from "vitest";
import type { RowSummary } from "../engine/outcomes";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { choose, pendingDecision, testGame } from "../testing";
import { cardTable, optionRolls, percentText, printedOrder, rowOdds, waysToRoll } from "./roll-table";

const passFail = (target: number): RowSummary[] => [
  { min: target, max: null, outcome: [{ kind: "pass" }] },
  { min: 0, max: target - 1, outcome: [{ kind: "fail" }] },
];

describe("a roll's odds", () => {
  it("counts the ways each total comes up, exactly", () => {
    expect(waysToRoll(0)).toEqual([1]);
    expect(waysToRoll(1)).toEqual([1, 1, 1]);
    expect(waysToRoll(2)).toEqual([1, 2, 3, 2, 1]);
    // (1 + x + x²)⁴, out of 81.
    expect(waysToRoll(4)).toEqual([1, 4, 10, 16, 19, 16, 10, 4, 1]);
    expect(waysToRoll(8).reduce((sum, ways) => sum + ways, 0)).toBe(3 ** 8);
  });

  it("gives each row its chance: 4 dice make 4+ 50 times in 81", () => {
    const [pass, fail] = rowOdds(passFail(4), 4);
    expect(pass).toBeCloseTo(50 / 81, 12);
    expect(fail).toBeCloseTo(31 / 81, 12);
  });

  it("adds a bonus to every total, and puts a total past a closed top row on it", () => {
    const rows: RowSummary[] = [
      { min: 4, max: 4, outcome: [] },
      { min: 1, max: 3, outcome: [] },
      { min: 0, max: 0, outcome: [] },
    ];
    // Two dice and +2: 2 to 6, so nothing lands on 0, and 5 or 6 take the top row.
    const odds = rowOdds(rows, 2, 2);
    expect(odds[2]).toBe(0);
    expect(odds[0]).toBeCloseTo((3 + 2 + 1) / 9, 12);
    expect(odds[1]).toBeCloseTo((1 + 2) / 9, 12);
  });

  it("rolls no dice as a total of 0", () => {
    expect(rowOdds(passFail(1), 0)).toEqual([0, 1]);
  });

  it("words a chance as a whole percent, never rounding what can happen to 0% or 100%", () => {
    expect(percentText(50 / 81)).toBe("62%");
    expect(percentText(1 / 6561)).toBe("<1%");
    expect(percentText(6560 / 6561)).toBe(">99%");
    expect(percentText(0)).toBe("0%");
    expect(percentText(1)).toBe("100%");
  });

  it("keeps a table's rows in the order the card prints them, highest first", () => {
    const rows: RowSummary[] = [
      { min: 0, max: 1, outcome: [] },
      { min: 4, max: null, outcome: [] },
      { min: 2, max: 3, outcome: [] },
    ];
    expect(printedOrder(rows).map(({ index }) => index)).toEqual([1, 2, 0]);
  });
});

describe("tables read off the game", () => {
  it("gives each trait to choose before a roll its odds, at the roller's trait value now", () => {
    // Possession: choose a trait, then roll it, 4+ or 0–3.
    let state = testGame({ stack: ["game-room"], decks: { event: ["possession"] } });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    const decision = pendingDecision(state);
    expect(decision.kind).toBe("choose-one");
    const view = viewFor(ENGINE, state, 0);
    const rolls = optionRolls(view, decision.params);
    expect(rolls).toHaveLength(4);
    const zoe = view.figures["zoe-ingstrom"].traits;
    for (const roll of rolls) {
      expect(roll?.rows.map((row) => row.min)).toEqual([4, 0]);
      expect(roll?.odds.reduce((sum, odds) => sum + odds, 0)).toBeCloseTo(1, 12);
    }
    const might = zoe.might ?? 0;
    const mightRoll = rolls.find((_roll, i) => (decision.params as { options: { label: string }[] }).options[i].label.includes("Might"));
    expect(mightRoll?.odds).toEqual(rowOdds(mightRoll?.rows ?? [], might));
  });

  it("finds the table a drawn card rolls by, from its roll made at once or its decision", () => {
    let state = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] } });
    state = choose(choose(state, "Explore through the north door"), "turned 0°");
    const view = viewFor(ENGINE, state, 0);
    expect(cardTable("creepy-crawlies", view.events, view.pending)?.map((row) => row.min)).toEqual([5, 1, 0]);
    expect(cardTable("bloody-vision", view.events, view.pending)).toBeNull();
    let deciding = testGame({ stack: ["game-room"], decks: { event: ["creepy-crawlies"] }, explorers: [{ seat: 0, cards: ["angel-feather"] }] });
    deciding = choose(choose(deciding, "Explore through the north door"), "turned 0°");
    const waiting = viewFor(ENGINE, deciding, 0);
    expect(cardTable("creepy-crawlies", [], waiting.pending)?.map((row) => row.min)).toEqual([5, 1, 0]);
  });
});
