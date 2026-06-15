import { describe, expect, it } from "vitest";
import {
  hasStagedChanges,
  manageActorId,
  manageSummary,
  withStagedMortgage,
} from "./manage";
import { unmortgageCostAt } from "./logic";
import { freshGame } from "./mocks";
import type { ManageStaged } from "./manage";
import type { GameState } from "./types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  const fresh = freshGame("manage-test");
  return {
    ...fresh,
    ownership: { 16: "p1", 18: "p1", 19: "p1", 1: "p1", 3: "p1", ...(overrides.ownership ?? {}) },
    houses: overrides.houses ?? {},
    mortgaged: overrides.mortgaged ?? {},
    turn: overrides.turn ?? {
      playerId: "p2",
      phase: "managing",
      doublesStreak: 0,
      managerId: "p1",
    },
    ...overrides,
  };
}

describe("manageActorId", () => {
  it("is the managerId during managing", () => {
    expect(manageActorId(baseState())).toBe("p1");
  });

  it("is the first negative player during must-raise-cash", () => {
    const state = baseState({
      players: freshGame("x").players.map((p) =>
        p.id === "p2" ? { ...p, cash: -100 } : p,
      ),
      turn: { playerId: "p1", phase: "must-raise-cash", doublesStreak: 0, raiseCash: "after-landing" },
    });
    expect(manageActorId(state)).toBe("p2");
  });

  it("is null outside both phases", () => {
    expect(manageActorId(baseState({ turn: { playerId: "p1", phase: "pre-roll", doublesStreak: 0 } }))).toBeNull();
  });
});

describe("withStagedMortgage", () => {
  it("applies staged flips onto a copy without touching the original", () => {
    const state = baseState({ mortgaged: { 1: true } });
    const next = withStagedMortgage(state, { 1: false, 3: true });
    expect(next.mortgaged).toEqual({ 3: true });
    expect(state.mortgaged).toEqual({ 1: true }); // unchanged
  });

  it("returns the same reference when nothing is staged", () => {
    const state = baseState();
    expect(withStagedMortgage(state, {})).toBe(state);
  });
});

describe("manageSummary — combined net cash", () => {
  it("sums build spend and mortgage proceeds", () => {
    const state = baseState();
    // Build one house on each orange ($100 each = −$300), and mortgage Baltic
    // (pos 3, price $60 → +$30 value).
    const staged: ManageStaged = {
      build: { 16: 1, 18: 1, 19: 1 },
      mortgage: { 3: true },
    };
    const summary = manageSummary(state, "p1", staged);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.netCash).toBe(-300 + 30);
  });

  it("previews unmortgage-then-build by applying staged mortgages first", () => {
    // The orange set has one mortgaged lot; building is illegal until it's
    // unmortgaged. Staging the unmortgage in the same commit must make the plan
    // legal, and the net cash must include the unmortgage cost.
    const state = baseState({ mortgaged: { 16: true } });
    const staged: ManageStaged = {
      build: { 16: 1, 18: 1, 19: 1 },
      mortgage: { 16: false },
    };
    const summary = manageSummary(state, "p1", staged);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    const unmortgage = unmortgageCostAt(16) ?? 0;
    expect(summary.netCash).toBe(-300 - unmortgage);
  });

  it("reports the planner failure reason for an illegal build", () => {
    // Uneven build (one orange jumped two tiers above its mates).
    const state = baseState();
    const summary = manageSummary(state, "p1", { build: { 16: 2 }, mortgage: {} });
    expect(summary.ok).toBe(false);
  });

  it("rejects mortgaging a bare lot while a set-mate is built", () => {
    // 16 is bare but its orange set-mate 18 has a house — official rule blocks
    // mortgaging any member until the whole set is sold down.
    const state = baseState({ houses: { 18: 1 } });
    const summary = manageSummary(state, "p1", { build: {}, mortgage: { 16: true } });
    expect(summary.ok).toBe(false);
  });

  it("allows mortgaging once the set's buildings are sold in the same commit", () => {
    const state = baseState({ houses: { 18: 1 } });
    const summary = manageSummary(state, "p1", {
      build: { 18: 0 },
      mortgage: { 16: true },
    });
    expect(summary.ok).toBe(true);
  });
});

describe("hasStagedChanges", () => {
  it("is false when staged values match the live state", () => {
    const state = baseState({ houses: { 16: 2 }, mortgaged: { 1: true } });
    expect(hasStagedChanges(state, { build: { 16: 2 }, mortgage: { 1: true } })).toBe(false);
  });

  it("is true when a build or mortgage differs", () => {
    const state = baseState({ houses: { 16: 2 } });
    expect(hasStagedChanges(state, { build: { 16: 3 }, mortgage: {} })).toBe(true);
    expect(hasStagedChanges(state, { build: {}, mortgage: { 1: true } })).toBe(true);
  });
});
