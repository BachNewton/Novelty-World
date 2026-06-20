import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState, Player } from "../../../types";
import { desiredLevel } from "./valuation";

// v19's one change: ENDGAME ELIMINATION PRESSURE. When an active rival is on the ropes
// — their raisable cash (cash + mortgageable lots) can't cover my deadliest developed
// rent, so one landing on my board would bankrupt them — `desiredLevel` returns MAX
// rent (hotels, level 5) even when I'm NOT flush, deploying my cushion into the kill.
// With no rival on the ropes it returns the v17 baseline (level 3 when not flush), so
// the lever fires ONLY on a genuine kill opportunity. Oranges = {16,18,19}; a 3-house
// orange is a big rent (~hundreds) that a near-broke rival can't pay.

const base = freshGame();

/** p1 owns a 3-house orange monopoly (a deadly board) and holds 400 cash — above the
 *  reserve floor but below "flush" (floor 120 + cushion 600 = 720), the window where
 *  v17 would conserve at 3 houses. Rival cashes are set per scenario. */
function withDevelopedOrange(cashByRopes: Record<string, number>): GameState {
  return {
    ...base,
    players: base.players.map((p): Player => ({
      ...p,
      cash: p.id === "p1" ? 400 : (cashByRopes[p.id] ?? 1500),
    })),
    ownership: { 16: "p1", 18: "p1", 19: "p1" },
    houses: { 16: 3, 18: 3, 19: 3 },
  };
}

describe("v19 elimination pressure — max-rent development against a rival on the ropes", () => {
  it("pushes to hotels (level 5) when a rival can't cover my deadliest rent, though I'm not flush", () => {
    // p2 holds only 50 cash and owns nothing → raisable 50, far below a 3-house orange.
    const state = withDevelopedOrange({ p2: 50 });
    expect(desiredLevel(state, "p1").level).toBe(5);
  });

  it("stays at the conservative level 3 (the v17 baseline) when no rival is on the ropes", () => {
    // Every opponent is flush → no kill on offer → v19 plays exactly like v17 here.
    const state = withDevelopedOrange({});
    expect(desiredLevel(state, "p1").level).toBe(3);
  });

  it("does not fire before I hold a lethal square (no developed rent to finish anyone)", () => {
    // A near-broke p2 but p1 owns nothing developed → myDeadliestRent is 0, so the
    // trigger is a no-op and the judgment is the plain not-flush baseline.
    const noBoard: GameState = {
      ...base,
      players: base.players.map((p): Player => ({
        ...p,
        cash: p.id === "p1" ? 400 : p.id === "p2" ? 50 : 1500,
      })),
    };
    expect(desiredLevel(noBoard, "p1").level).toBe(3);
  });
});
