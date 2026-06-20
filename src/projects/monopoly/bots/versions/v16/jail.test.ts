import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { jailChoice as v14Jail } from "../v14/valuation";
import { jailChoice as v16Jail } from "./valuation";

// v16's one change: jail-staying is reframed from a DEFENSIVE cower (v5/v14: stay
// whenever any RIVAL board is developed) into a HAVEN keyed off the bot's OWN board
// (stay only when *I* hold the developed board rivals must traverse). The two flip
// in opposite directions. Oranges = {16,18,19}; a 3-house orange rents ≥ $350.

const base = freshGame();

/** Bot p1 always has ≥ $50 (so "leave" resolves to pay-to-leave, a non-null intent;
 *  "stay" is a null intent / roll). */
function board(ownership: Record<number, string>, houses: Record<number, number>): GameState {
  return {
    ...base,
    ownership,
    houses,
    players: base.players.map((p) => (p.id === "p1" ? { ...p, cash: 500 } : p)),
  };
}

const ORANGE_TO = (id: string) => ({ 16: id, 18: id, 19: id });
const ORANGE_3H = { 16: 3, 18: 3, 19: 3 };

describe("v16 jail — haven keyed off the bot's OWN board", () => {
  it("STAYS when the bot holds a developed board (v14 would leave — no rival danger)", () => {
    // p1 owns a developed orange monopoly; no rival is developed. v14 only stays for
    // RIVAL danger, so it leaves; v16 sees its own haven and sits to collect.
    const state = board(ORANGE_TO("p1"), ORANGE_3H);
    expect(v16Jail(state, "p1", null).intent).toBeNull(); // v16: stay (haven)
    expect(v14Jail(state, "p1", null).intent).not.toBeNull(); // v14: leave
    expect(v16Jail(state, "p1", null).reason).toContain("collects rent risk-free");
  });

  it("LEAVES when only a RIVAL holds a developed board (v14 would cower)", () => {
    // p2 owns the developed orange; p1 owns nothing developed. v14 cowers (rival
    // danger); v16 has no haven of its own, so it gets out and keeps moving.
    const state = board(ORANGE_TO("p2"), ORANGE_3H);
    expect(v14Jail(state, "p1", null).intent).toBeNull(); // v14: stay (cower)
    expect(v16Jail(state, "p1", null).intent).not.toBeNull(); // v16: leave
  });

  it("both leave when nobody is developed (early/safe board)", () => {
    const state = board(ORANGE_TO("p2"), {});
    expect(v16Jail(state, "p1", null).intent).not.toBeNull();
    expect(v14Jail(state, "p1", null).intent).not.toBeNull();
  });
});
