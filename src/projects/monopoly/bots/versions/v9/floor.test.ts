import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { liquidityFloor as v5Floor } from "../v5/valuation";
import { liquidityFloor as v9Floor } from "./valuation";

// v9's one change: a graduated SURVIVAL guard in `liquidityFloor`. On top of v5's
// moderate reserve (half the worst rent, capped at $500), when a DEVELOPED rival
// board threatens v9 reserves a larger, graduated share (0.8) of the worst
// DEVELOPED rent — bounded by SURVIVAL_CAP = $900, deliberately below a full hotel
// hit so the bot never goes fully passive. On an UNDEVELOPED board the term is
// zero, so v9's floor is EXACTLY v5's. Oranges = {16, 18, 19}: New York Ave (19)
// rent is base 16, houses [80,220,600,800], hotel 1000. Dark-blues = {37, 39}:
// Boardwalk (39) hotel 2000. freshGame seats p1..p4; p1 is the bot, p2 the rival.

const base = freshGame();

function board(ownership: GameState["ownership"], houses: GameState["houses"]): GameState {
  return { ...base, ownership, houses };
}

describe("v9 liquidityFloor — graduated survival guard", () => {
  it("reserves more than v5 when a rival's set is DEVELOPED (3 houses)", () => {
    // p2 holds a developed orange monopoly at 3 houses. Worst developed rent =
    // New York Ave's $600. v5 reserves half the worst rent capped at $500 →
    // round(600 * 0.5) = $300. v9 layers the survival term: min(900, 600 * 0.8) =
    // $480, so it holds $480 — a real buffer toward absorbing the hit.
    const state = board({ 16: "p2", 18: "p2", 19: "p2" }, { 16: 3, 18: 3, 19: 3 });
    expect(v5Floor(state, "p1")).toBe(300);
    expect(v9Floor(state, "p1")).toBe(480);
    expect(v9Floor(state, "p1")).toBeGreaterThan(v5Floor(state, "p1"));
  });

  it("scales the reserve with the developed rent (hotel → larger buffer than houses)", () => {
    // Same set, now hotels (New York Ave rent $1000). Survival = min(900, 1000 *
    // 0.8 = 800) = $800 — larger than the 3-house buffer, the 'graduated' part.
    const state = board({ 16: "p2", 18: "p2", 19: "p2" }, { 16: 5, 18: 5, 19: 5 });
    expect(v9Floor(state, "p1")).toBe(800);
    expect(v9Floor(state, "p1")).toBeGreaterThan(v9Floor(
      board({ 16: "p2", 18: "p2", 19: "p2" }, { 16: 3, 18: 3, 19: 3 }),
      "p1",
    ));
  });

  it("bounds the reserve at SURVIVAL_CAP — never reserves a full hotel hit (stays in the fight)", () => {
    // p2 hotels the dark-blues (Boardwalk rent $2000). Survival would be 2000 *
    // 0.8 = $1600, but the cap clamps it to $900 — far below the $2000 hit, so the
    // bot keeps developing rather than hoarding (the passivity guard).
    const state = board({ 37: "p2", 39: "p2" }, { 37: 5, 39: 5 });
    expect(v9Floor(state, "p1")).toBe(900);
    expect(v9Floor(state, "p1")).toBeLessThan(2000);
  });

  it("is EXACTLY v5 on an UNDEVELOPED board (no developed rent → survival term is zero)", () => {
    // p2 owns the orange monopoly but has built nothing. No developed rent exists,
    // so v9's survival term is zero and its floor equals v5's to the dollar.
    const state = board({ 16: "p2", 18: "p2", 19: "p2" }, {});
    expect(v9Floor(state, "p1")).toBe(v5Floor(state, "p1"));
  });

  it("is EXACTLY v5 on a bare board (no rival property at all)", () => {
    const state = board({}, {});
    expect(v9Floor(state, "p1")).toBe(v5Floor(state, "p1"));
  });
});
