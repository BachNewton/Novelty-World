import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v17Floor } from "./valuation";

// v17 pins the AGGRESSIVE end of the liquidity axis: FLOOR_RENT_FRACTION 0.3 and
// FLOOR_CAP 300, so the voluntary-spend reserve never exceeds $300 and more cash
// stays deployable for offense. Oranges = {16,18,19}; a hotelled orange rents big
// enough to drive the rent-fraction term past the cap, so the cap is what binds.

const base = freshGame();

describe("v17 liquidity floor", () => {
  it("clamps to the $300 cap on a developed board", () => {
    // p2 owns a hotelled orange monopoly — worst-case rent well over $1000.
    const state: GameState = {
      ...base,
      ownership: { 16: "p2", 18: "p2", 19: "p2" },
      houses: { 16: 5, 18: 5, 19: 5 },
    };
    expect(v17Floor(state, "p1")).toBe(300);
  });

  it("clamps to the $120 BASE_FLOOR on a quiet board", () => {
    // No developed rivals → worst rent is tiny → the base floor is what binds.
    const quiet: GameState = { ...base, ownership: { 16: "p2" } };
    expect(v17Floor(quiet, "p1")).toBe(120);
  });
});
