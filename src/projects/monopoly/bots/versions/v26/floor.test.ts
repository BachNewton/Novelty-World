import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v14Floor } from "../v14/valuation";
import { liquidityFloor as v26Floor } from "./valuation";

// v26 inherits v17's lower voluntary-spend liquidity reserve VERBATIM (v26's only
// change is dark-blue's GROUP_WEIGHT; the reserve is untouched). This pins that the
// reserve is still v17's: strictly lower than v14's on a developed board, clamped to
// the shared BASE_FLOOR on a quiet board. Oranges = {16,18,19}; a hotelled orange
// rents big. (The dark-blue weight change is pinned in group-weight.test.ts.)

const base = freshGame();

function withHotel(): GameState {
  // p2 owns a hotelled orange monopoly — a big worst-case rent on p1's board.
  return {
    ...base,
    ownership: { 16: "p2", 18: "p2", 19: "p2" },
    houses: { 16: 5, 18: 5, 19: 5 },
  };
}

describe("v26 liquidity floor — inherits v17's lower reserve", () => {
  it("reserves strictly less on a developed board (more cash for offense)", () => {
    const state = withHotel();
    const v14 = v14Floor(state, "p1");
    const v26 = v26Floor(state, "p1");
    expect(v26).toBeLessThan(v14);
    expect(v26).toBeLessThanOrEqual(300); // v17 cap, carried into v26
    expect(v14).toBe(500); // v14 cap (worst rent well over $1000)
  });

  it("matches v14 on a quiet board (both clamp to the shared BASE_FLOOR)", () => {
    // No developed rivals → worst rent is tiny → both hit the $120 base floor.
    const quiet: GameState = { ...base, ownership: { 16: "p2" } };
    expect(v26Floor(quiet, "p1")).toBe(v14Floor(quiet, "p1"));
  });
});
