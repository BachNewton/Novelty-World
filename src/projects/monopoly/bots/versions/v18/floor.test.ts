import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v17Floor } from "../v17/valuation";
import { liquidityFloor as v18Floor } from "./valuation";

// v18 pushes v17's liquidity reduction further (FLOOR_RENT_FRACTION 0.3→0.15, cap
// 300→200, BASE_FLOOR 120→80) — an even thinner reserve. On a developed board v18
// reserves strictly less than v17; on a quiet board v18's lower BASE_FLOOR ($80 vs
// $120) also shows. Oranges = {16,18,19}; a hotelled orange rents big.

const base = freshGame();

function withHotel(): GameState {
  return {
    ...base,
    ownership: { 16: "p2", 18: "p2", 19: "p2" },
    houses: { 16: 5, 18: 5, 19: 5 },
  };
}

describe("v18 liquidity floor — thinner reserve than v17", () => {
  it("reserves strictly less than v17 on a developed board", () => {
    const state = withHotel();
    const v17 = v17Floor(state, "p1");
    const v18 = v18Floor(state, "p1");
    expect(v18).toBeLessThan(v17);
    expect(v18).toBeLessThanOrEqual(200); // v18 cap
    expect(v17).toBe(300); // v17 cap
  });

  it("drops to the lower BASE_FLOOR on a quiet board ($80 vs v17's $120)", () => {
    const quiet: GameState = { ...base, ownership: { 16: "p2" } };
    expect(v18Floor(quiet, "p1")).toBe(80);
    expect(v17Floor(quiet, "p1")).toBe(120);
  });
});
