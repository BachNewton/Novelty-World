import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { planBuild as v3PlanBuild } from "../v3/valuation";
import { planBuild as v8PlanBuild } from "./valuation";

// v8 carries v8's TEMPO `planBuild` verbatim (the coupling with v5 denial lives in
// trades.ts / policy.ts). These tests pin the tempo MECHANISM is intact in v8: when
// cash above the liquidity floor can't reach a prize set's desired level, it
// mortgages idle, NON-monopoly back-burner lots to develop the set a level sooner —
// never dipping the reserve, never cannibalizing a monopoly. v3 (cash-funded only)
// stalls a level lower on the same board. Oranges = {16, 18, 19} ($100/house);
// Boardwalk (39) is a lone dark-blue; Reading Railroad (5). All start bare/unmortgaged.

const base = freshGame();

function withState(over: Partial<GameState>, id: string, cash: number): GameState {
  return {
    ...base,
    ...over,
    players: base.players.map((p) => (p.id === id ? { ...p, cash } : p)),
  };
}

describe("v8 planBuild (v8 tempo, carried) — tempo via mortgage-funded development", () => {
  it("mortgages idle back-burner lots to develop a prize set a level sooner than v3", () => {
    // p1 owns the orange monopoly plus two idle, non-monopoly lots (a lone
    // Boardwalk and a railroad). Cash ($720, floor $120) funds only 2 houses
    // across the set; the 3rd ($900 total) needs $300 more.
    const state = withState(
      { ownership: { 16: "p1", 18: "p1", 19: "p1", 39: "p1", 5: "p1" } },
      "p1",
      720,
    );

    // v3 funds from cash only → stalls at 2 houses, mortgages nothing.
    const v3 = v3PlanBuild(state, "p1");
    expect(v3).not.toBeNull();
    if (!v3) return;
    expect(v3.build[16]).toBe(2);
    expect(Object.values(v3.mortgage)).not.toContain(true);

    // v8 mortgages the idle lots (least-essential first: Boardwalk then the
    // railroad) and reaches 3 houses — a level sooner.
    const v8 = v8PlanBuild(state, "p1");
    expect(v8).not.toBeNull();
    if (!v8) return;
    expect(v8.build[16]).toBe(3);
    expect(v8.build[18]).toBe(3);
    expect(v8.build[19]).toBe(3);
    expect(v8.mortgage[39]).toBe(true);
    expect(v8.mortgage[5]).toBe(true);
    expect(v8.build[16]).toBeGreaterThan(v3.build[16]);
  });

  it("never mortgages a monopoly lot to fund another set", () => {
    // p1 holds TWO monopolies (oranges + light-blues {6,8,9}) and no idle
    // non-monopoly lot. Cash-thin, so funding the 3rd orange house would help —
    // but every owned lot is part of an earning set, so v8 must refuse and play
    // exactly v3's cash-only build.
    const state = withState(
      { ownership: { 16: "p1", 18: "p1", 19: "p1", 6: "p1", 8: "p1", 9: "p1" } },
      "p1",
      720,
    );

    const v3 = v3PlanBuild(state, "p1");
    const v8 = v8PlanBuild(state, "p1");
    expect(v8).not.toBeNull();
    if (!v8 || !v3) return;
    expect(Object.values(v8.mortgage)).not.toContain(true);
    expect(v8.build[16]).toBe(v3.build[16]);
  });

  it("doesn't mortgage when cash already funds the desired level", () => {
    // Flush ($2000): hotels on the oranges are affordable from cash, so the idle
    // lots stay untouched — leverage fires only when cash falls short.
    const state = withState(
      { ownership: { 16: "p1", 18: "p1", 19: "p1", 39: "p1", 5: "p1" } },
      "p1",
      2000,
    );

    const v8 = v8PlanBuild(state, "p1");
    expect(v8).not.toBeNull();
    if (!v8) return;
    expect(v8.build[16]).toBe(5);
    expect(Object.values(v8.mortgage)).not.toContain(true);
  });
});
