import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v14Floor } from "../v14/valuation";
import { liquidityFloor as v17Floor } from "./valuation";

// v17's one change: a LOWER voluntary-spend liquidity reserve (FLOOR_RENT_FRACTION
// 0.5→0.3, FLOOR_CAP 500→300) — the aggressive direction on the liquidity axis. On a
// developed board the reserve is strictly lower than v14's; on a quiet board both
// clamp to the shared BASE_FLOOR. Oranges = {16,18,19}; a hotelled orange rents big.

const base = freshGame();

function withHotel(): GameState {
  // p2 owns a hotelled orange monopoly — a big worst-case rent on p1's board.
  return {
    ...base,
    ownership: { 16: "p2", 18: "p2", 19: "p2" },
    houses: { 16: 5, 18: 5, 19: 5 },
  };
}

describe("v17 liquidity floor — lower reserve than v14", () => {
  it("reserves strictly less on a developed board (more cash for offense)", () => {
    const state = withHotel();
    const v14 = v14Floor(state, "p1");
    const v17 = v17Floor(state, "p1");
    expect(v17).toBeLessThan(v14);
    expect(v17).toBeLessThanOrEqual(300); // v17 cap
    expect(v14).toBe(500); // v14 cap (worst rent well over $1000)
  });

  it("matches v14 on a quiet board (both clamp to the shared BASE_FLOOR)", () => {
    // No developed rivals → worst rent is tiny → both hit the $120 base floor.
    const quiet: GameState = { ...base, ownership: { 16: "p2" } };
    expect(v17Floor(quiet, "p1")).toBe(v14Floor(quiet, "p1"));
  });
});
