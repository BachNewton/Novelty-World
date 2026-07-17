import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v35Floor } from "./valuation";

// v35 inherits the v17 liquidity reserve unchanged (FLOOR_CAP 300, BASE_FLOOR 120)
// — its own change is symmetric denial PRICING (`denialPositionCost`, covered by
// denial-position.test.ts), not the floor. This pins that the reserve came through
// the fork untouched. Oranges = {16,18,19}; a hotelled orange saturates the cap.

const base = freshGame();

describe("v35 liquidity floor", () => {
  it("clamps to the $300 cap on a developed board", () => {
    const state: GameState = {
      ...base,
      ownership: { 16: "p2", 18: "p2", 19: "p2" },
      houses: { 16: 5, 18: 5, 19: 5 },
    };
    expect(v35Floor(state, "p1")).toBe(300);
  });

  it("clamps to the $120 BASE_FLOOR on a quiet board", () => {
    const quiet: GameState = { ...base, ownership: { 16: "p2" } };
    expect(v35Floor(quiet, "p1")).toBe(120);
  });
});
